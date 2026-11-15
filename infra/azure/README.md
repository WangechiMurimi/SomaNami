# Ollama on Azure

These scripts provision the private, self-hosted model that answers SomaNami chat in production (#149, #150, #151). The design and its trade-offs are in [ADR 0003](../../docs/architecture/0003-ollama-on-azure.md).

In short: one Ubuntu 24.04 CPU VM runs Ollama (`qwen2.5:3b` for chat, `nomic-embed-text` for embeddings) on `127.0.0.1:11434`. Caddy sits in front of it on port 443. Caddy gets a TLS certificate automatically for the Azure DNS name, requires a bearer token, and forwards only `/api/chat`, `/api/embed` and `/api/tags`. The VM shuts itself down every night to save credits.

| File                  | What it does                                                                     |
| --------------------- | -------------------------------------------------------------------------------- |
| `provision.sh`        | Creates the resource group, NSG, VM and auto-shutdown, then prints the token once. |
| `cloud-init.yaml`     | A template the VM runs on first boot: installs Ollama and Caddy, pulls the models, turns on unattended upgrades. |
| `measure-latency.mjs` | Times grounded-chat requests (cold, p50, p95) to settle the hosting question in the ADR. |
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
4. **Measure latency** and record the result in ADR 0003 (see [Measure latency](#measure-latency)).
5. **Deallocate when you finish** (see [Day to day](#day-to-day)).

If the script stops after it created the VM, it still prints the token. Re-running it is safe: existing resources are kept, and the NSG rules and shutdown schedule are re-applied. A re-run doesn't create a new token. To get a new one, see [Rotate the token](#rotate-the-token).

## Verification

```bash
export OLLAMA_BASE_URL=https://<label>.<region>.cloudapp.azure.com
export OLLAMA_API_KEY=<token>   # or read it from your password manager
HOST=${OLLAMA_BASE_URL#https://}

# 1. With the token: 200 and a JSON list that includes qwen2.5:3b and nomic-embed-text.
curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $OLLAMA_API_KEY" "$OLLAMA_BASE_URL/api/tags"

# 2. Without the token, or with a wrong one: 401.
curl -s -o /dev/null -w '%{http_code}\n' "$OLLAMA_BASE_URL/api/tags"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer wrong" "$OLLAMA_BASE_URL/api/tags"

# 3. Admin routes are blocked even with the token: 404.
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -X POST "$OLLAMA_BASE_URL/api/pull" -d '{"model":"llama3"}'

# 4. Ollama's own port is unreachable from outside: this must time out or be refused.
curl -s -m 5 -o /dev/null -w '%{http_code}\n' "http://$HOST:11434/api/tags" || echo "unreachable (good)"

# 5. Plain HTTP redirects to HTTPS: 308.
curl -s -o /dev/null -w '%{http_code}\n' "http://$HOST/api/tags"
```

On the VM itself (`ssh azureuser@$HOST`):

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

ADR 0003 keeps **Option A (Netlify Function → VM) if warm p95 is under ~8 s**. Add the numbers to the ADR.

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
