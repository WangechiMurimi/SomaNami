# Ollama on Azure

These scripts provision the private, self-hosted model that answers SomaNami chat in production (#149, #150, #151). The reasons for this design are in [Design decisions](#design-decisions).

In short: one Ubuntu 24.04 CPU VM runs Ollama (`qwen2.5:3b` for chat, `nomic-embed-text` for embeddings) on `127.0.0.1:11434`. Caddy sits in front of it on port 443. Caddy gets a TLS certificate automatically for the Azure DNS name, requires a bearer token, and forwards only `/api/chat`, `/api/embed` and `/api/tags`. The VM shuts itself down every night to save credits.

| File                  | What it does                                                                     |
| --------------------- | -------------------------------------------------------------------------------- |
| `provision.sh`        | Creates the resource group, NSG, VM and auto-shutdown, then prints the token once. |
| `cloud-init.yaml`     | A template the VM runs on first boot: installs Ollama and Caddy, pulls the models, turns on unattended upgrades. |
| `measure-latency.mjs` | Times grounded-chat requests (cold, p50, p95) to settle the hosting question (see [Design decisions](#open-question-where-the-chat-api-runs)). |
| `teardown.sh`         | Deletes the whole resource group after you confirm.                             |

**No secrets live in this folder.** The token is generated when you run `provision.sh`, sent to the VM, and printed once. Keep it in a password manager, in Netlify's environment variables, and in your untracked `.env`.

## Prerequisites (Windows)

1. **Git Bash.** It comes with Git for Windows. Run every command below in Git Bash from the repository root.
2. **Azure CLI.** Install it in PowerShell, then open a new Git Bash window:
   ```powershell
   winget install Microsoft.AzureCLI
   ```
3. **Sign in** and check that the right subscription is active:
   ```bash
   az login
   az account show -o table
   # If you have more than one: az account set --subscription "<name or id>"
   ```
4. **Check your quota.** Student subscriptions often allow only a few vCPUs per region:
   ```bash
   az vm list-usage --location eastus2 -o table | grep -Ei "total regional vcpus|DSv5"
   ```
   The default size, `Standard_D4s_v5`, needs **4** free vCPUs in both rows. If you don't have them, try another `LOCATION`, or a size such as `Standard_D4as_v5` or `Standard_F4s_v2`.
5. **Check allowed regions.** Azure for Students may restrict which regions you can use. If `eastus2` is refused, list the ones you can use with `az account list-locations -o table` and pick one.
6. **Find your public IP**, which is the only address allowed to SSH in:
   ```bash
   curl -s https://api.ipify.org
   ```
7. **An SSH key** (optional). The script uses `~/.ssh/id_ed25519.pub` if it exists. If not, the Azure CLI generates `~/.ssh/id_rsa`.

## Parameters

Set these as environment variables. Only `ADMIN_IP` is required.

| Variable         | Default                                    | Notes                                                          |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------- |
| `ADMIN_IP`       | (required)                                 | Your IPv4 address. SSH (port 22) is open to this address only. |
| `RG`             | `somanami-llm-rg`                          | Resource group. `teardown.sh` deletes this.                   |
| `LOCATION`       | `eastus2`                                  | Close to Netlify Functions' default region (Ohio).                    |
| `VM_NAME`        | `somanami-ollama`                          |                                                                |
| `VM_SIZE`        | `Standard_D4s_v5`                          | Use `Standard_D8s_v5` if you measure and need it, and your quota allows. |
| `DNS_LABEL`      | `somanami-ollama`                          | Must be unique in the region. You get `https://<label>.<region>.cloudapp.azure.com`. |
| `SHUTDOWN_UTC`   | `2000`                                     | Daily auto-shutdown time, HHMM in UTC. 2000 UTC is 23:00 in Nairobi.     |
| `SHUTDOWN_EMAIL` | (none)                                     | Optional. Azure emails you 30 minutes before each shutdown.                  |
| `ADMIN_USER`     | `azureuser`                                |                                                                |
| `SSH_PUBLIC_KEY` | `~/.ssh/id_ed25519.pub` if present         | Path to a public key file.                                     |
| `IMAGE`          | `Canonical:ubuntu-24_04-lts:server:latest` | Ubuntu 24.04 LTS (Gen2).                                       |
| `OS_DISK_GB`     | `64`                                       | Standard SSD.                                                  |
| `WAIT_MINUTES`   | `25`                                       | How long the script waits for the gateway to answer.                   |
| `ASSUME_YES`     | `0`                                        | Set to `1` to skip the confirmation prompt.                    |

## Design decisions

This section records why the setup looks the way it does, for reviewers and for whoever operates the VM next.

### Why a CPU VM with small models

Learners' documents may go only to SomaNami's own infrastructure, and answers must come from our own model (#149, #143). So the model runs on a VM we control, not on a hosted model API.

| Option                                    | Verdict                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CPU VM + small quantised models** (chosen) | `qwen2.5:3b` (about 2 GB) and `nomic-embed-text` (about 0.3 GB) fit in 16 GiB and run acceptably on AVX-512 cores. Cheap enough for student credit when deallocated between sessions.                 |
| GPU VM (NC/NV series)                     | Much faster, but student subscriptions have no GPU quota by default, and the cheapest sizes cost about USD 0.5–1+/hour, which would use up the credit in days.                                          |
| Azure Container Apps (serverless)         | No GPU on consumption plans. Scale-to-zero means loading a multi-GB model on a cold start (tens of seconds), far over Netlify's ~10 s function limit; an always-on replica costs about as much as the VM. |
| Azure OpenAI / AI Foundry                 | A third party runs the model under its own terms, which breaks the "our own self-hosted model" promise.                                                                                                 |
| Ollama exposed directly, IP allowlist     | Netlify Functions have no fixed egress IPs, and Ollama has no authentication or TLS of its own.                                                                                                         |

A 3B model answers less well than a frontier model, so grounding is enforced in code (retrieval-score gate, citation check, output schema), not trusted to the model (#149).

### Why `Standard_D4s_v5` by default

Issue #150 asked for the D8s_v5 class. The size is the `VM_SIZE` parameter, and the default is the 4-vCPU `Standard_D4s_v5`:

- 8 vCPUs is often over a student subscription's regional quota.
- It costs half as much (see [Cost](#cost-approximate)).
- On a CPU, token generation is bound mostly by memory bandwidth, so going from 4 to 8 vCPUs is expected to be roughly 1.3–1.6× faster, not 2×.

Use `VM_SIZE=Standard_D8s_v5` if the latency measurement says it's needed and the quota allows it.

### Why ports 80 and 22 are open as well as 443

See [Network rules](#network-rules). In short: 80 makes certificate issuance and renewal more robust and serves only redirects; 22 is open to one admin address only. Neither carries API traffic.

### Open question: where the chat API runs

CPU inference may not fit inside a synchronous Netlify Function (about 10 s, of which `OLLAMA_TIMEOUT_MS` = 8.5 s is the model's share).

- **Option A (default): Netlify Function → VM.** Keep it if warm p95 is under ~8 s.
- **Option B: run the Express chat API on the VM.** No 10 s limit, but the VM then holds Supabase credentials, verifies sessions, needs a CSP `connect-src` entry, and its uptime becomes chat's uptime.

Decide after running [Measure latency](#measure-latency). Before switching to B, try fewer or shorter passages, a `num_predict` cap, and `VM_SIZE=Standard_D8s_v5`.

### Data handling on the VM

Documents pass through the VM only inside requests. Nothing stores them: no database, no file writes, and Ollama keeps prompts only in memory while the model is loaded. Ollama's log has one line per request (method, path, status, latency); `OLLAMA_DEBUG` must stay unset because debug mode can log prompts. Caddy has no access log configured and never logs bodies.

## Network rules

`provision.sh` creates one NSG with three inbound allow rules. Everything else is denied by Azure's default rules.

| Rule              | Port | Source            | Why                                                                                   |
| ----------------- | ---- | ----------------- | ------------------------------------------------------------------------------------- |
| `allow-https`     | 443  | Internet          | The API, behind Caddy's TLS and bearer-token check.                                   |
| `allow-http-acme` | 80   | Internet          | Let's Encrypt HTTP-01 challenge and Caddy's redirect to HTTPS. No API traffic is served. |
| `allow-ssh-admin` | 22   | `ADMIN_IP` only   | Operator access: check cloud-init, re-pull models, rotate the token.                  |

Issue #150 asked for an NSG that allows only 443. Ports 80 and 22 are a deliberate deviation:

- **80**: Caddy uses it for the Let's Encrypt HTTP-01 challenge (its first choice) and to redirect plain HTTP to HTTPS. Every request on it gets a redirect, so no API traffic is served. Keeping it makes the first certificate and unattended renewals less likely to fail.
- **22**: open to `ADMIN_IP/32` only, for checking cloud-init, re-pulling models and rotating the token. The alternative is to close it and use `az vm run-command invoke`, which needs no inbound port but is awkward for troubleshooting.

Caddy can also renew its certificate with the TLS-ALPN-01 challenge on 443 alone, so you can delete the `allow-http-acme` rule if you want 443 and SSH only. Ollama's port 11434 is never opened, and Ollama listens on `127.0.0.1` regardless.

## Run order

1. **Provision.** This takes about 10–20 minutes. Most of that is the first boot pulling about 2.5 GB of models:
   ```bash
   ADMIN_IP=$(curl -s https://api.ipify.org) DNS_LABEL=somanami-ollama-<something-unique> \
     ./infra/azure/provision.sh
   ```
   At the end, the script prints `OLLAMA_BASE_URL`, `OLLAMA_API_KEY` and `OLLAMA_MODEL`. **The token is shown only this once.** Copy it straight into a password manager.
2. **Configure the app:**
   - **Netlify:** go to Site configuration, then Environment variables. Add `OLLAMA_BASE_URL` and `OLLAMA_API_KEY`, and optionally `OLLAMA_MODEL` and `OLLAMA_TIMEOUT_MS`. Scope them to Functions, then redeploy.
   - **Local:** add the same lines to your untracked `.env`. Never put them in `.env.example`.
3. **Verify the gateway** (see [Verification](#verification)).
4. **Measure latency** and record the result in the pull request or issue #149 (see [Measure latency](#measure-latency)).
5. **Deallocate when you finish** (see [Day to day](#day-to-day)).

If the script stops after it created the VM, it still prints the token. Re-running it is safe: existing resources are kept, and the NSG rules and shutdown schedule are re-applied. A re-run doesn't create a new token. To get a new one, see [Rotate the token](#rotate-the-token).

## The gateway

Caddy is the only way in. Its rules live in `cloud-init.yaml` (`/etc/somanami/Caddyfile`):

- A request without `Authorization: Bearer <token>` gets **401**. This check runs before routing, so callers without the token can't tell which routes exist.
- Only three calls get through: `GET /api/tags`, `POST /api/chat` and `POST /api/embed`. Everything else gets **404**, including the admin routes (`/api/pull`, `/api/delete`, `/api/create`, ...), `/api/generate` and Ollama's OpenAI-compatible `/v1/*` routes.
- Bodies over 4 MB get **413**.
- The token is removed before the request reaches Ollama.
- There is no access log. Request and response bodies are never logged, because learners' passages travel in them.

### Test the config offline

`npm run test:gateway` runs the real Caddyfile, taken straight from `cloud-init.yaml`, against a mock Ollama on your machine. It checks every rule above and confirms that neither the token nor a request body ever appears in Caddy's output. It needs `caddy` 2.x and `node` on your PATH, or `CADDY=/path/to/caddy`. CI runs it on every pull request with a pinned, checksum-verified Caddy.

## Verification

Against the live VM:

```bash
OLLAMA_BASE_URL=https://<label>.<region>.cloudapp.azure.com OLLAMA_API_KEY=<token> \
  ./infra/azure/verify-gateway.sh
```

It checks the following:

- with the token, `/api/tags` answers 200 and lists both models
- without the token, or with a wrong one, the answer is 401
- admin and `/v1/*` routes give 404 even with the token
- port 11434 can't be reached from your machine
- plain HTTP redirects to HTTPS

The script passes the token to curl on stdin, so it never appears in the process list.

On the VM itself (`ssh azureuser@<host>`):

```bash
cloud-init status --wait                 # status: done
tail -n 30 /var/log/somanami-setup.log   # ends with "somanami-setup done"
sudo ss -ltnp | grep -E ':11434|:443'    # 11434 on 127.0.0.1 only; 443 on *
systemctl status ollama caddy --no-pager
```

## Measure latency

This needs Node 22.18 or later, because it imports the production prompt from `server/llm/prompt.ts`:

```bash
OLLAMA_BASE_URL=... OLLAMA_API_KEY=... node infra/azure/measure-latency.mjs
# Options: RUNS=20 (default), COLD=0 to skip the cold-start unload, OLLAMA_MODEL, OLLAMA_TIMEOUT_MS
```

The script reports:

- the cold-start time
- warm p50, p95 and max
- tokens per second
- how many requests went over the 8.5 s budget
- the network baseline

Keep **Option A (Netlify Function → VM) if warm p95 is under ~8 s** (see [Design decisions](#open-question-where-the-chat-api-runs)). Record the numbers on issue #149.

## Day to day

```bash
az vm start      -g somanami-llm-rg -n somanami-ollama   # before a work or demo session
az vm deallocate -g somanami-llm-rg -n somanami-ollama   # afterwards; stops compute billing
az vm get-instance-view -g somanami-llm-rg -n somanami-ollama --query "instanceView.statuses[1].displayStatus" -o tsv
```

Auto-shutdown runs every night as a safety net, but nothing starts the VM again automatically. While the VM is deallocated, chat fails cleanly with "model unavailable". The first request after a start loads the model, which takes a few extra seconds.

The public IP is static, so the DNS name and certificate survive deallocation.

### Rotate the token

```bash
NEW=$(openssl rand -hex 32)
ssh azureuser@$HOST "echo SOMANAMI_API_KEY=$NEW | sudo tee /etc/caddy/somanami.env >/dev/null && sudo systemctl restart caddy"
echo "$NEW"   # update Netlify and .env, then redeploy
```

## Cost (approximate)

These are pay-as-you-go prices for Linux in East US 2, **quoted from memory, so treat them as rough**. Check the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) for current figures in your region and currency.

| Item                                    | While running | While deallocated |
| --------------------------------------- | ------------- | ----------------- |
| VM `Standard_D4s_v5` (4 vCPU, 16 GiB)   | ~USD 0.19/h   | 0                 |
| VM `Standard_D8s_v5` (8 vCPU, 32 GiB)   | ~USD 0.38/h   | 0                 |
| 64 GiB Standard SSD OS disk             | ~USD 5/month  | ~USD 5/month      |
| Static Standard public IP               | ~USD 3.65/month | ~USD 3.65/month |
| Bandwidth out (text responses)          | negligible    | 0                 |

| Usage pattern (D4s_v5)                       | ≈ per month |
| -------------------------------------------- | ----------- |
| 2 h/day (dev sessions, deallocated after)    | ~USD 20     |
| 8 h/day (start in the morning, auto-shutdown at night) | ~USD 55 |
| 24/7 (no shutdown)                           | ~USD 150    |

Azure for Students gives about USD 100 of credit a year. Run the VM only when you're working or demoing, and deallocate it afterwards. To check what you've spent so far, open Cost Management in the portal.

## Teardown

```bash
RG=somanami-llm-rg ./infra/azure/teardown.sh
```

The script lists what's in the resource group, asks you to type its name, and then deletes everything: the VM, disk, IP, NSG, VNet and shutdown schedule. Afterwards:

- Remove `OLLAMA_*` from Netlify and your `.env`.
- Azure may have created a `NetworkWatcherRG` group automatically. It costs nothing, and you can delete it in the portal if you like.
