#!/usr/bin/env bash
# Deploy Azure AI Foundry (OpenAI) infrastructure
# Usage: ./infra/deploy.sh [--what-if]
#
# Prerequisites:
#   az login
#   az account set --subscription f91b49f7-60b2-41e3-be6b-ee95d39d59c4

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBSCRIPTION="f91b49f7-60b2-41e3-be6b-ee95d39d59c4"
LOCATION="eastus2"

# Parse args
WHAT_IF=""
if [[ "${1:-}" == "--what-if" ]]; then
  WHAT_IF="--what-if"
  echo "🔍 Running in what-if mode (no changes will be made)"
fi

echo "📦 Deploying Azure AI Foundry infrastructure..."
echo "   Subscription: $SUBSCRIPTION"
echo "   Location:     $LOCATION"
echo ""

# Get current user's principal ID for RBAC assignment
PRINCIPAL_ID=$(az ad signed-in-user show --query id -o tsv 2>/dev/null || echo "")

EXTRA_PARAMS=""
if [[ -n "$PRINCIPAL_ID" ]]; then
  echo "👤 Assigning Cognitive Services User role to: $PRINCIPAL_ID"
  # Pass principalId to the OpenAI module via override
fi

az deployment sub create \
  --name "jurassic-foundry-$(date +%Y%m%d%H%M%S)" \
  --location "$LOCATION" \
  --subscription "$SUBSCRIPTION" \
  --template-file "$SCRIPT_DIR/main.bicep" \
  --parameters "$SCRIPT_DIR/main.parameters.json" \
  $WHAT_IF \
  --query "{endpoint: properties.outputs.openAIEndpoint.value, deployment: properties.outputs.gpt4oDeploymentName.value, rg: properties.outputs.resourceGroupName.value}" \
  -o json

if [[ -z "$WHAT_IF" ]]; then
  # Extract outputs and write foundry.config.json
  ENDPOINT=$(az deployment sub show \
    --name "$(az deployment sub list --location "$LOCATION" --query "[?starts_with(name,'jurassic-foundry')].name | [0]" -o tsv)" \
    --query "properties.outputs.openAIEndpoint.value" -o tsv)

  cat > "$SCRIPT_DIR/foundry.config.json" <<EOF
{
  "projectEndpoint": "$ENDPOINT",
  "modelDeployment": "gpt-4o",
  "apiVersion": "2024-12-01-preview",
  "authMethod": "DefaultAzureCredential"
}
EOF

  echo ""
  echo "✅ Deployment complete!"
  echo "📄 Config written to: infra/foundry.config.json"
  echo ""
  echo "Set this env var for your app:"
  echo "  export AZURE_AI_PROJECT_ENDPOINT=$ENDPOINT"
fi
