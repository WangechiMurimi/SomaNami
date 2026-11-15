#!/usr/bin/env bash
# Provisions the SomaNami Ollama VM on Azure (ADR 0003, #150).
#
# Usage (Git Bash, macOS or Linux, after `az login`):
#   ADMIN_IP=203.0.113.7 ./infra/azure/provision.sh
#
# Re-running is safe: existing resources are kept and their NSG rules and
# auto-shutdown schedule re-applied. The bearer token is generated only when the
# VM is created, printed once at the end, and never written inside the repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/cloud-init.yaml"

# --- Parameters (environment variables) ---------------------------------------
RG="${RG:-somanami-llm-rg}"
LOCATION="${LOCATION:-eastus2}"
VM_NAME="${VM_NAME:-somanami-ollama}"
VM_SIZE="${VM_SIZE:-Standard_D4s_v5}"
DNS_LABEL="${DNS_LABEL:-somanami-ollama}"
ADMIN_IP="${ADMIN_IP:-}"
ADMIN_USER="${ADMIN_USER:-azureuser}"
IMAGE="${IMAGE:-Canonical:ubuntu-24_04-lts:server:latest}"
OS_DISK_GB="${OS_DISK_GB:-64}"
SHUTDOWN_UTC="${SHUTDOWN_UTC:-2000}"
SHUTDOWN_EMAIL="${SHUTDOWN_EMAIL:-}"
SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY:-}"
WAIT_MINUTES="${WAIT_MINUTES:-25}"
ASSUME_YES="${ASSUME_YES:-0}"

NSG_NAME="${VM_NAME}-nsg"
PIP_NAME="${VM_NAME}-ip"
FQDN="${DNS_LABEL}.${LOCATION}.cloudapp.azure.com"

TOKEN=""
TOKEN_PRINTED=0
CUSTOM_DATA_FILE=""

die() {
  echo "error: $*" >&2
  exit 1
}
info() { echo "==> $*"; }

# The Windows az CLI prints CRLF line endings into Git Bash; strip them so
# captured values compare cleanly.
azq() { az "$@" | tr -d '\r'; }

# az treats a --custom-data or --ssh-key-values argument it cannot open as a
# literal string, so hand it an explicit native path on Windows.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

print_token() {
  [[ -n "$TOKEN" && "$TOKEN_PRINTED" == 0 ]] || return 0
  TOKEN_PRINTED=1
  cat <<EOF

============================================================================
 Ollama gateway credentials. This is the ONLY time the token is shown.
 Store it in a password manager now. It is not saved anywhere on this machine.

   OLLAMA_BASE_URL=https://${FQDN}
   OLLAMA_API_KEY=${TOKEN}
   OLLAMA_MODEL=qwen2.5:3b

 Netlify: Site configuration > Environment variables > add each of the above
          (scope: Functions). Redeploy afterwards.
 Local:   add the same lines to your untracked .env (never .env.example).
 Lost it? Rotate: ssh in, edit /etc/caddy/somanami.env, systemctl restart caddy.
============================================================================
EOF
}

cleanup() {
  [[ -n "$CUSTOM_DATA_FILE" ]] && rm -f "$CUSTOM_DATA_FILE"
  # If anything failed after the VM was created, the token must still reach
  # the operator; it cannot be recovered from Azure afterwards.
  print_token
}
trap cleanup EXIT

# Calls curl with the bearer token supplied on stdin, keeping it out of argv.
curl_authed() {
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl --config - "$@"
}

# Creates an inbound allow rule, or updates it in place if it already exists.
upsert_rule() {
  local name="$1" priority="$2" port="$3" source="$4"
  local args=(
    --resource-group "$RG" --nsg-name "$NSG_NAME" --name "$name"
    --priority "$priority" --direction Inbound --access Allow --protocol Tcp
    --source-address-prefixes "$source" --source-port-ranges '*'
    --destination-address-prefixes '*' --destination-port-ranges "$port"
    --output none
  )
  if az network nsg rule show -g "$RG" --nsg-name "$NSG_NAME" -n "$name" --output none 2>/dev/null; then
    az network nsg rule update "${args[@]}"
  else
    az network nsg rule create "${args[@]}"
  fi
}

# --- Validation ---------------------------------------------------------------
command -v az >/dev/null 2>&1 || die "az CLI not found. Install it: winget install Microsoft.AzureCLI"
command -v openssl >/dev/null 2>&1 || die "openssl not found (it ships with Git Bash)."
command -v curl >/dev/null 2>&1 || die "curl not found."
[[ -f "$TEMPLATE" ]] || die "missing $TEMPLATE"

[[ -n "$ADMIN_IP" ]] || die "ADMIN_IP is required (your public IPv4, e.g. from: curl -s https://api.ipify.org)"
[[ "$ADMIN_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$ ]] || die "ADMIN_IP must be IPv4, optionally with /prefix: $ADMIN_IP"
[[ "$ADMIN_IP" == */* ]] || ADMIN_IP="$ADMIN_IP/32"
[[ "$DNS_LABEL" =~ ^[a-z][a-z0-9-]{1,61}[a-z0-9]$ ]] || die "DNS_LABEL must be 3-63 chars of lowercase letters, digits and hyphens, starting with a letter"
[[ "$SHUTDOWN_UTC" =~ ^([01][0-9]|2[0-3])[0-5][0-9]$ ]] || die "SHUTDOWN_UTC must be HHMM in UTC, e.g. 2000"

az account show --output none 2>/dev/null || die "not logged in. Run: az login"
SUBSCRIPTION="$(azq account show --query name -o tsv)"

cat <<EOF
About to provision (approximate cost is in infra/azure/README.md):
  subscription   $SUBSCRIPTION
  resource group $RG ($LOCATION)
  VM             $VM_NAME, $VM_SIZE, $IMAGE
  DNS name       https://$FQDN
  SSH allowed    from $ADMIN_IP as $ADMIN_USER
  auto-shutdown  daily at $SHUTDOWN_UTC UTC
EOF
if [[ "$ASSUME_YES" != 1 ]]; then
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "aborted"
fi

# --- Providers and quota --------------------------------------------------------
info "Registering resource providers (no-op if already registered)"
for ns in Microsoft.Compute Microsoft.Network Microsoft.DevTestLab; do
  az provider register --namespace "$ns" --wait --output none
done

info "Checking regional vCPU quota in $LOCATION"
vcpus="$(azq vm list-skus --location "$LOCATION" --size "$VM_SIZE" --resource-type virtualMachines \
  --query "[?name=='$VM_SIZE'] | [0].capabilities[?name=='vCPUs'].value | [0]" -o tsv 2>/dev/null || true)"
used="" limit=""
read -r used limit < <(azq vm list-usage --location "$LOCATION" \
  --query "[?name.value=='cores'] | [0].[currentValue, limit]" -o tsv 2>/dev/null || true) || true
if [[ -z "$vcpus" ]]; then
  echo "warning: $VM_SIZE is not offered to this subscription in $LOCATION; az vm create will likely fail." >&2
elif [[ "$vcpus" =~ ^[0-9]+$ && "$used" =~ ^[0-9]+$ && "$limit" =~ ^[0-9]+$ ]] && ((used + vcpus > limit)); then
  echo "warning: $VM_SIZE needs $vcpus vCPUs but only $((limit - used)) of $limit regional vCPUs are free." >&2
  echo "         Try a smaller VM_SIZE, another LOCATION, or request a quota increase." >&2
fi

# --- Resource group and network security group ----------------------------------
info "Resource group $RG"
az group create --name "$RG" --location "$LOCATION" --output none

info "Network security group $NSG_NAME"
az network nsg create -g "$RG" -n "$NSG_NAME" -l "$LOCATION" --output none
upsert_rule allow-https 100 443 Internet
# Port 80 serves only the ACME HTTP-01 challenge and Caddy's redirect to HTTPS.
upsert_rule allow-http-acme 110 80 Internet
upsert_rule allow-ssh-admin 120 22 "$ADMIN_IP"

# --- VM -------------------------------------------------------------------------
if az vm show -g "$RG" -n "$VM_NAME" --output none 2>/dev/null; then
  info "VM $VM_NAME already exists; leaving it and its token unchanged"
else
  TOKEN="$(openssl rand -hex 32)"

  # Render cloud-init in a private temp file outside the repo; the trap deletes it.
  umask 077
  CUSTOM_DATA_FILE="$(mktemp)"
  template="$(<"$TEMPLATE")"
  template="${template//__OLLAMA_API_KEY__/$TOKEN}"
  template="${template//__DOMAIN__/$FQDN}"
  printf '%s\n' "$template" >"$CUSTOM_DATA_FILE"
  unset template

  ssh_args=()
  if [[ -n "$SSH_PUBLIC_KEY" ]]; then
    [[ -f "$SSH_PUBLIC_KEY" ]] || die "SSH_PUBLIC_KEY file not found: $SSH_PUBLIC_KEY"
    ssh_args=(--ssh-key-values "$(native_path "$SSH_PUBLIC_KEY")")
  elif [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
    ssh_args=(--ssh-key-values "$(native_path "$HOME/.ssh/id_ed25519.pub")")
  else
    ssh_args=(--generate-ssh-keys)
  fi

  info "Creating VM $VM_NAME ($VM_SIZE); this takes a few minutes"
  az vm create \
    --resource-group "$RG" --name "$VM_NAME" --location "$LOCATION" \
    --image "$IMAGE" --size "$VM_SIZE" \
    --admin-username "$ADMIN_USER" "${ssh_args[@]}" \
    --public-ip-address "$PIP_NAME" --public-ip-sku Standard \
    --public-ip-address-allocation static \
    --public-ip-address-dns-name "$DNS_LABEL" \
    --nsg "$NSG_NAME" \
    --os-disk-size-gb "$OS_DISK_GB" --storage-sku StandardSSD_LRS \
    --custom-data "$(native_path "$CUSTOM_DATA_FILE")" \
    --output none

  rm -f "$CUSTOM_DATA_FILE"
  CUSTOM_DATA_FILE=""
fi

actual_fqdn="$(azq network public-ip show -g "$RG" -n "$PIP_NAME" --query dnsSettings.fqdn -o tsv 2>/dev/null || true)"
if [[ -n "$actual_fqdn" && "$actual_fqdn" != "$FQDN" ]]; then
  echo "warning: public IP FQDN is $actual_fqdn, but Caddy was configured for $FQDN." >&2
fi

# --- Auto-shutdown ------------------------------------------------------------------
info "Auto-shutdown daily at $SHUTDOWN_UTC UTC"
shutdown_args=(--resource-group "$RG" --name "$VM_NAME" --time "$SHUTDOWN_UTC" --output none)
[[ -n "$SHUTDOWN_EMAIL" ]] && shutdown_args+=(--email "$SHUTDOWN_EMAIL")
az vm auto-shutdown "${shutdown_args[@]}"

# --- Wait for cloud-init (model pulls and certificate) --------------------------------
if [[ -n "$TOKEN" ]]; then
  info "Waiting up to $WAIT_MINUTES min for https://$FQDN/api/tags (Ollama install, model pulls, TLS certificate)"
  deadline=$((SECONDS + WAIT_MINUTES * 60))
  status=""
  while ((SECONDS < deadline)); do
    status="$(curl_authed -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$FQDN/api/tags" || true)"
    [[ "$status" == 200 ]] && break
    sleep 20
  done
  if [[ "$status" == 200 ]]; then
    unauth="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$FQDN/api/tags" || true)"
    info "Gateway is up: with token 200, without token $unauth (expected 401)"
  else
    echo "warning: gateway not ready yet (last status: ${status:-none}). cloud-init may still be running." >&2
    echo "         Check with: ssh $ADMIN_USER@$FQDN 'cloud-init status --wait; tail -n 50 /var/log/somanami-setup.log'" >&2
  fi
fi

info "Done. Stop paying for compute when idle: az vm deallocate -g $RG -n $VM_NAME"
