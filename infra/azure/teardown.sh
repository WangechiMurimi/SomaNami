#!/usr/bin/env bash
# Deletes the SomaNami Ollama resource group and everything in it (#150):
# the VM, its disk, public IP, NSG, virtual network and auto-shutdown schedule.
#
# Usage: ./infra/azure/teardown.sh            (RG defaults to somanami-llm-rg)
#        RG=my-rg ./infra/azure/teardown.sh
set -euo pipefail

RG="${RG:-somanami-llm-rg}"

die() {
  echo "error: $*" >&2
  exit 1
}

command -v az >/dev/null 2>&1 || die "az CLI not found"
az account show --output none 2>/dev/null || die "not logged in. Run: az login"

if [[ "$(az group exists --name "$RG" | tr -d '\r')" != "true" ]]; then
  echo "Resource group $RG does not exist; nothing to delete."
  exit 0
fi

subscription="$(az account show --query name -o tsv | tr -d '\r')"
echo "This permanently deletes resource group '$RG' in subscription '$subscription':"
az resource list --resource-group "$RG" --query "[].{type:type, name:name}" -o table | tr -d '\r'
echo
echo "The models and the gateway token go with it. OLLAMA_API_KEY in Netlify and"
echo "your local .env stop working and should be removed, as should AZURE_*."
read -r -p "Type the resource group name to confirm: " reply
[[ "$reply" == "$RG" ]] || die "aborted; nothing was deleted"

az group delete --name "$RG" --yes --no-wait
echo "Deletion started. It finishes in a few minutes; check with:"
echo "  az group exists --name $RG    # prints false when done"

# The waker app and the custom role definitions (#201) live in the tenant, not
# in the resource group, so they outlive it. Listed, not deleted: the app may
# be reused if the VM is provisioned again.
cat <<'EOF'

These live outside the resource group and stay until you remove them:
  az ad app delete --id "$(az ad app list --display-name somanami-vm-waker --query '[0].appId' -o tsv)"
  az role definition list --custom-role-only true --query "[?starts_with(roleName, 'SomaNami VM')].roleName" -o tsv
  az role definition delete --name "<each name listed above>"
EOF
