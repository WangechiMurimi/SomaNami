# Ollama on Azure

These scripts provision the private, self-hosted model that answers SomaNami chat in production (#149, #150, #151). The reasons for this design are in [Design decisions](#design-decisions).

In short: one Ubuntu 24.04 CPU VM runs Ollama (`qwen2.5:3b` for chat, `nomic-embed-text` for embeddings) on `127.0.0.1:11434`. Caddy sits in front of it on port 443. Caddy gets a TLS certificate automatically for the Azure DNS name, requires a bearer token, and forwards only `/api/chat`, `/api/embed` and `/api/tags`. The VM sleeps (deallocated) until a chat needs it: the app starts it on request and the VM deallocates itself after 30 idle minutes (see [Wake on request, sleep when idle](#wake-on-request-sleep-when-idle)). A nightly auto-shutdown stays on as a backstop.

| File                  | What it does                                                                     |
| --------------------- | -------------------------------------------------------------------------------- |
| `provision.sh`        | Creates the resource group, NSG, VM, auto-shutdown and the VM's idle-deallocate identity, then prints the token once. |
| `create-waker.sh`     | Creates the service principal the app uses to start the VM, then prints its secret once. |
| `custom-role.sh`      | Least-privilege role helpers that both scripts above source.                    |
| `cloud-init.yaml`     | A template the VM runs on first boot: installs Ollama and Caddy, pulls the models, turns on unattended upgrades, the model warm-up and the idle timer. |
| `measure-latency.mjs` | Times grounded-chat requests (cold, p50, p95) to settle the hosting question (see [Design decisions](#open-question-where-the-chat-api-runs)). |
| `test-gateway.sh`     | Tests the gateway's Caddyfile offline (`npm run test:gateway`).                 |
| `test-idle-check.sh`  | Tests the idle-deallocate script offline (`npm run test:idle`).                 |
| `teardown.sh`         | Deletes the whole resource group after you confirm.                             |

**No secrets live in this folder.** The gateway token is generated when you run `provision.sh`, sent to the VM, and printed once. The waker's client secret is issued when you run `create-waker.sh` and printed once. Keep both in a password manager, in Netlify's environment variables, and (optionally) in your untracked `.env`. Run both scripts yourself, in your own terminal.

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
   az vm list-usage --location northcentralus -o table | grep -Ei "total regional vcpus|basv2"
   ```
   The default size, `Standard_B4as_v2`, needs **4** free vCPUs in both rows. If you don't have them, try another allowed `LOCATION`.
5. **Check allowed regions.** Azure for Students restricts regions by policy. On this subscription the allowed ones are `francecentral`, `canadacentral`, `northcentralus`, `norwayeast` and `westus2`; the default is `northcentralus`, the closest to Netlify Functions' default region (Ohio).
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
| `LOCATION`       | `northcentralus`                           | Allowed by the subscription's policy and close to Netlify Functions' default region (Ohio). |
| `VM_NAME`        | `somanami-ollama`                          |                                                                |
| `VM_SIZE`        | `Standard_B4as_v2`                         | 4 vCPU, 16 GiB, burstable AMD (x64). See [Why `Standard_B4as_v2`](#why-standard_b4as_v2-by-default). |
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

### Why `Standard_B4as_v2` by default

Issue #150 asked for the D8s_v5 class. The size is the `VM_SIZE` parameter, and the default is the 4-vCPU, 16 GiB `Standard_B4as_v2`:

- The subscription has no usable D-series quota in its allowed regions; B-series v2 quota was available.
- 16 GiB fits both models with room to spare, and it is x64, which Ollama's Linux build and the install script expect.
- It costs about USD 0.15/h in `northcentralus` (see [Cost](#cost-approximate)), and nothing while deallocated.
- On a CPU, token generation is bound mostly by memory bandwidth, so 8 vCPUs would be expected to be roughly 1.3–1.6× faster, not 2×.

**Burstable CPU credits.** B-series VMs run at a baseline share of their vCPUs and bank credits while below it; above it, they spend credits, and when credits run out the CPU is held to the baseline. Inference uses every core flat out, so a long burst of questions can drain the credits and make answers noticeably slower, possibly past the 7 s deadline. Short sessions with idle gaps suit the credit model well. Credits are tied to the running VM, so don't count on a credit balance surviving deallocation; check the current B-series v2 documentation for the exact baseline and banking rules. If `measure-latency.mjs` shows throttled runs, use a non-burstable size where you have quota (`VM_SIZE=...`).

### Why ports 80 and 22 are open as well as 443

See [Network rules](#network-rules). In short: 80 makes certificate issuance and renewal more robust and serves only redirects; 22 is open to one admin address only. Neither carries API traffic.

### Open question: where the chat API runs

CPU inference may not fit inside a synchronous Netlify Function (about 10 s, of which `OLLAMA_TIMEOUT_MS` = 8.5 s is the model's share).

- **Option A (default): Netlify Function → VM.** Keep it if warm p95 is under ~8 s.
- **Option B: run the Express chat API on the VM.** No 10 s limit, but the VM then holds Supabase credentials, verifies sessions, needs a CSP `connect-src` entry, and its uptime becomes chat's uptime.

Decide after running [Measure latency](#measure-latency). Before switching to B, try fewer or shorter passages, a `num_predict` cap, and a larger, non-burstable `VM_SIZE` where quota allows.

### Wake on request, sleep when idle

Usage is irregular: a reviewer may open the app at any time over several weeks. Running the VM all the time would use up about half the student credit in two weeks, and a nightly shutdown with nobody to start it again would break chat (#201). So the VM sleeps (deallocated, no compute charge) until a request needs it.

**Waking (Netlify side).** When the chat Function can't reach the gateway, it asks Azure Resource Manager for the VM's power state:

| Power state                                 | What the Function does                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `deallocated`, `stopped` (or on their way)  | Starts the VM and answers `503 { "error": "model-waking", "retryAfterSeconds": 30 }`. |
| `starting`                                  | Answers `model-waking` (20 s) without starting it again.          |
| `running`, started in the last 5 minutes    | Answers `model-waking` (10 s): Ollama and Caddy are still booting. |
| `running` for longer, or ARM fails          | Reports the original failure (`upstream-unreachable`).           |

The chat screen shows "Starting up the tutor" and resends the learner's question by itself, backing off from the server's hint, for up to about four minutes. The learner never retypes anything.

- The Function calls ARM with `fetch` and the OAuth client-credentials flow; there is no Azure SDK in the bundle. The token is cached per Function instance.
- To spot a sleeping VM quickly, a cheap `GET /api/tags` probe (1.5 s cap) runs before the model call, only if this Function instance hasn't reached the gateway in the last 5 minutes. A deallocated VM's address drops packets, so without the cap the whole 7 s model deadline would pass before the wake could start. The probe's time comes out of the model's budget.
- The waker identity can only read the VM, read its power state and start it, on that one VM. It can't stop, change or delete anything.
- Waking is off unless all four `AZURE_*` variables are set; then a sleeping VM is just `upstream-unreachable`, as before.

**Sleeping (VM side).** `somanami-idle.timer` runs `/usr/local/sbin/somanami-idle-check.sh` every 5 minutes:

1. It finds the newest `POST /api/chat` or `POST /api/embed` line in Ollama's journal. Each line holds only the time, status, latency, client address and path; prompts are never logged, and `OLLAMA_DEBUG` must stay unset. Health probes (`GET /api/tags`) don't count.
2. The boot time counts as activity too, so a freshly woken VM always gets a full window.
3. If `IDLE_MINUTES` (default 30) have passed since the last activity, first-boot setup has finished, and uptime is past `GRACE_MINUTES` (default 15), it deallocates the VM: a token from the instance metadata service for the VM's system-assigned identity, then ARM's `deallocate` action on its own resource id. The VM stores no credential, and the token never appears in arguments or logs.

That identity's custom role allows only `virtualMachines/read` and `virtualMachines/deallocate/action`, assigned on the VM itself. `somanami-warmup.service` loads the chat model on every boot, so a woken VM answers the learner's retry warm.

On the VM:

```bash
journalctl -u somanami-idle --since today           # one line per decision
sudo DRY_RUN=1 /usr/local/sbin/somanami-idle-check.sh   # decide, don't act
echo IDLE_MINUTES=45 | sudo tee /etc/somanami/idle.env  # change the window
```

`npm run test:idle` runs the exact script from `cloud-init.yaml` against fixture logs and a mock metadata service and ARM: dry-run decisions, overrides, the deallocate call and its token handling, and that no log content is printed.

**A VM created before #201** has neither the timer nor the warm-up, because cloud-init runs only on first boot. Re-running `provision.sh` adds the identity and role, but not the timer. The simplest fix is `teardown.sh` followed by `provision.sh` (which prints a new gateway token).

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
2. **Create the waker** so the app can start the VM on request:
   ```bash
   ./infra/azure/create-waker.sh
   ```
   It prints `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and `AZURE_VM_RESOURCE_ID`. **The secret is shown only this once.** Re-running the script issues a new secret and invalidates the old one.
3. **Configure the app:**
   - **Netlify:** go to Site configuration, then Environment variables. Add `OLLAMA_BASE_URL` and `OLLAMA_API_KEY`, optionally `OLLAMA_MODEL` and `OLLAMA_TIMEOUT_MS`, and the four `AZURE_*` values. Scope them to Functions, mark the key and the client secret as secret, then redeploy.
   - **Local:** add the same lines to your untracked `.env` (the `AZURE_*` ones only if you want to test waking). Never put them in `.env.example`.
4. **Verify the gateway** (see [Verification](#verification)).
5. **Measure latency** and record the result in the pull request or issue #149 (see [Measure latency](#measure-latency)).
6. **Let it sleep.** The VM deallocates itself after 30 idle minutes; the next chat wakes it.

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

Nothing to do: the first chat wakes the VM (about a minute), and it deallocates itself after 30 idle minutes. Auto-shutdown still runs every night as a backstop. By hand, if you need to:

```bash
az vm start      -g somanami-llm-rg -n somanami-ollama   # e.g. before a demo, to skip the wake-up wait
az vm deallocate -g somanami-llm-rg -n somanami-ollama   # stops compute billing now
az vm get-instance-view -g somanami-llm-rg -n somanami-ollama --query "instanceView.statuses[1].displayStatus" -o tsv
```

Without the `AZURE_*` variables, nothing wakes the VM, and chat answers `upstream-unreachable` while it is deallocated.

### Rotate the waker secret

Re-run `./infra/azure/create-waker.sh`. It replaces the app's secret, so update `AZURE_CLIENT_SECRET` in Netlify and redeploy straight away. The secret expires after `SECRET_YEARS` (default 1); rotate before then.

The public IP is static, so the DNS name and certificate survive deallocation.

### Rotate the token

```bash
NEW=$(openssl rand -hex 32)
ssh azureuser@$HOST "echo SOMANAMI_API_KEY=$NEW | sudo tee /etc/caddy/somanami.env >/dev/null && sudo systemctl restart caddy"
echo "$NEW"   # update Netlify and .env, then redeploy
```

## Cost (approximate)

Pay-as-you-go prices for Linux in North Central US, in USD. Check the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) for current figures in your region and currency.

| Item                                      | While running   | While deallocated |
| ----------------------------------------- | --------------- | ----------------- |
| VM `Standard_B4as_v2` (4 vCPU, 16 GiB)    | ~0.15/h         | 0                 |
| 64 GiB Standard SSD OS disk (E6)          | ~4.80/month     | ~4.80/month       |
| Static Standard public IP                 | ~3.65/month     | ~3.65/month       |
| ARM calls, bandwidth out (text responses) | negligible      | 0                 |

The disk and IP cost about **8.45/month** whatever the VM does. Each wake costs at least the 30-minute idle tail (~0.08) on top of the time in use.

| Usage pattern (B4as_v2)                                         | Running h/month | ≈ per month |
| --------------------------------------------------------------- | --------------- | ----------- |
| Reviewer visits: 10 sessions of 30 min, each + 30 min idle tail | 10              | ~10         |
| Dev: 2 h/day on 22 days, + 30 min idle tail each                | 55              | ~17         |
| Demo week: 8 h/day for 5 days, otherwise asleep                 | 42              | ~15         |
| Always on (no idle deallocate, no nightly shutdown)             | 730             | ~118        |

Azure for Students gives about USD 100 of credit a year, so leave the idle timer on. To check what you've spent so far, open Cost Management in the portal.

## Teardown

```bash
RG=somanami-llm-rg ./infra/azure/teardown.sh
```

The script lists what's in the resource group, asks you to type its name, and then deletes everything: the VM, disk, IP, NSG, VNet and shutdown schedule. Afterwards:

- Remove `OLLAMA_*` and `AZURE_*` from Netlify and your `.env`.
- The waker app registration and the two custom role definitions live in the tenant, not the resource group. `teardown.sh` prints the commands to remove them.
- Azure may have created a `NetworkWatcherRG` group automatically. It costs nothing, and you can delete it in the portal if you like.
