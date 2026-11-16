# Least-privilege role helpers shared by provision.sh and create-waker.sh (#201).
# Source this file; it expects azq() and native_path() from the caller.
# shellcheck shell=bash
#
# Azure accepts a resource group, subscription or management group as a custom
# role's assignable scope, not a single resource. So each role is defined on
# the VM's resource group but only ever assigned on the VM itself, which is
# where its permissions apply.

# Git Bash rewrites arguments that start with "/" into Windows paths before
# they reach the Windows az CLI. ARM ids start with "/", so pass them through
# untouched.
azp() { MSYS_NO_PATHCONV=1 az "$@"; }
# azp with the CRLF the Windows az CLI prints stripped, for captured values.
azpq() { MSYS_NO_PATHCONV=1 az "$@" | tr -d '\r'; }

# ensure_custom_role NAME DESCRIPTION ASSIGNABLE_SCOPE ACTION...
# Creates the role if no custom role of that name exists. An existing role is
# left as it is; delete it first to change its actions.
ensure_custom_role() {
  local name="$1" description="$2" scope="$3"
  shift 3
  local existing
  existing="$(azq role definition list --custom-role-only true --name "$name" --query "[0].id" -o tsv 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "==> Custom role '$name' already exists; leaving it unchanged"
    return 0
  fi

  local actions="" action
  for action in "$@"; do
    actions+="${actions:+, }\"$action\""
  done
  local file
  file="$(mktemp)"
  cat >"$file" <<EOF
{
  "Name": "$name",
  "IsCustom": true,
  "Description": "$description",
  "Actions": [$actions],
  "NotActions": [],
  "DataActions": [],
  "NotDataActions": [],
  "AssignableScopes": ["$scope"]
}
EOF
  echo "==> Creating custom role '$name'"
  azp role definition create --role-definition "@$(native_path "$file")" --output none
  rm -f "$file"
}

# ensure_role_assignment PRINCIPAL_OBJECT_ID PRINCIPAL_TYPE ROLE_NAME SCOPE
# A new role or identity can take a minute to replicate, so creation retries.
ensure_role_assignment() {
  local principal="$1" type="$2" role="$3" scope="$4"
  local existing
  existing="$(azpq role assignment list --assignee "$principal" --role "$role" --scope "$scope" --query "[0].id" -o tsv 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "==> '$role' already assigned on ${scope##*/}"
    return 0
  fi
  echo "==> Assigning '$role' on ${scope##*/} only"
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if azp role assignment create --assignee-object-id "$principal" \
      --assignee-principal-type "$type" --role "$role" --scope "$scope" \
      --output none 2>/dev/null; then
      return 0
    fi
    echo "    not replicated yet; retrying in 15 s ($attempt/6)"
    sleep 15
  done
  azp role assignment create --assignee-object-id "$principal" \
    --assignee-principal-type "$type" --role "$role" --scope "$scope" --output none
}
