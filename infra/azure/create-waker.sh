#!/usr/bin/env bash
# Creates the identity the app uses to start the Ollama VM on request (#201):
# an Entra app registration and service principal, with a custom role that can
# only read the VM, read its power state and start it. It can't stop, change
# or delete anything, and it is assigned on the one VM only.
#
# Usage (Git Bash, macOS or Linux, after `az login` and provision.sh):
#   ./infra/azure/create-waker.sh
#
# The client secret is printed ONCE at the end and never written to disk.
# Re-running is safe and rotates the secret: it replaces every existing secret
# of the app, so the old value stops working. Update Netlify afterwards.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/azure/custom-role.sh
source "$SCRIPT_DIR/custom-role.sh"

# --- Parameters (environment variables) ---------------------------------------
RG="${RG:-somanami-llm-rg}"
VM_NAME="${VM_NAME:-somanami-ollama}"
WAKER_NAME="${WAKER_NAME:-somanami-vm-waker}"
SECRET_YEARS="${SECRET_YEARS:-1}"
ASSUME_YES="${ASSUME_YES:-0}"

SECRET=""
SECRET_PRINTED=0
TENANT_ID=""
APP_ID=""
VM_ID=""

die() {
  echo "error: $*" >&2
  exit 1
}
info() { echo "==> $*"; }

# The Windows az CLI prints CRLF line endings into Git Bash; strip them so
# captured values compare cleanly.
azq() { az "$@" | tr -d '\r'; }

native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

print_secret() {
  [[ -n "$SECRET" && "$SECRET_PRINTED" == 0 ]] || return 0
  SECRET_PRINTED=1
  cat <<EOF

============================================================================
 VM waker credentials. This is the ONLY time the secret is shown.
 Store it in a password manager now. It is not saved anywhere on this machine.

   AZURE_TENANT_ID=${TENANT_ID}
   AZURE_CLIENT_ID=${APP_ID}
   AZURE_CLIENT_SECRET=${SECRET}
   AZURE_VM_RESOURCE_ID=${VM_ID}

 Netlify: Site configuration > Environment variables > add each of the above
          (scope: Functions; mark AZURE_CLIENT_SECRET as secret). Redeploy.
 Local:   optional; add the same lines to your untracked .env to test waking
          from the dev server (never .env.example).
 Expires: in ${SECRET_YEARS} year(s). Re-run this script to rotate it.
============================================================================
EOF
}
# If anything fails after the secret was issued, it must still reach the
# operator; Entra never shows it again.
trap print_secret EXIT

# --- Validation ---------------------------------------------------------------
command -v az >/dev/null 2>&1 || die "az CLI not found. Install it: winget install Microsoft.AzureCLI"
[[ "$SECRET_YEARS" =~ ^[1-2]$ ]] || die "SECRET_YEARS must be 1 or 2"
az account show --output none 2>/dev/null || die "not logged in. Run: az login"

SUBSCRIPTION="$(azq account show --query name -o tsv)"
TENANT_ID="$(azq account show --query tenantId -o tsv)"
VM_ID="$(azq vm show -g "$RG" -n "$VM_NAME" --query id -o tsv 2>/dev/null || true)"
[[ -n "$VM_ID" ]] || die "VM $VM_NAME not found in $RG. Run provision.sh first."
RG_ID="$(azq group show -n "$RG" --query id -o tsv)"

cat <<EOF
About to create or update the VM waker:
  subscription   $SUBSCRIPTION
  app            $WAKER_NAME (Entra app registration + service principal)
  permissions    read, read power state and start $VM_NAME, nothing else
  secret         new, valid ${SECRET_YEARS} year(s); replaces any existing one
EOF
if [[ "$ASSUME_YES" != 1 ]]; then
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "aborted"
fi

# --- App registration and service principal -----------------------------------
APP_ID="$(azq ad app list --display-name "$WAKER_NAME" --query "[0].appId" -o tsv)"
if [[ -z "$APP_ID" ]]; then
  info "Creating app registration $WAKER_NAME"
  APP_ID="$(azq ad app create --display-name "$WAKER_NAME" \
    --sign-in-audience AzureADMyOrg --query appId -o tsv)"
else
  info "App registration $WAKER_NAME exists ($APP_ID)"
fi

SP_ID="$(azq ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)"
if [[ -z "$SP_ID" ]]; then
  info "Creating its service principal"
  SP_ID="$(azq ad sp create --id "$APP_ID" --query id -o tsv)"
fi

# --- Least-privilege role on the VM only ----------------------------------------
WAKER_ROLE="SomaNami VM waker ($RG/$VM_NAME)"
ensure_custom_role "$WAKER_ROLE" \
  "Lets the SomaNami app read the Ollama VM's power state and start it (#201)." \
  "$RG_ID" \
  Microsoft.Compute/virtualMachines/read \
  Microsoft.Compute/virtualMachines/instanceView/read \
  Microsoft.Compute/virtualMachines/start/action
ensure_role_assignment "$SP_ID" ServicePrincipal "$WAKER_ROLE" "$VM_ID"

# --- Secret, last, so a failure above never leaves an unused secret -------------
info "Issuing a new client secret (replaces any existing one)"
# Captured straight into a variable: never echoed, logged or written to a file.
# az's stderr (its "protect these credentials" warning) carries no secret.
SECRET="$(azq ad app credential reset --id "$APP_ID" \
  --display-name somanami-netlify --years "$SECRET_YEARS" \
  --query password -o tsv)"
[[ -n "$SECRET" ]] || die "Entra issued no secret; re-run the script"

info "Done. Role assignments can take a few minutes to apply."
