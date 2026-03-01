# Deploy Azure AI Foundry (OpenAI) infrastructure
# Usage: .\infra\deploy.ps1 [-WhatIf]
#
# Prerequisites:
#   az login
#   az account set --subscription f91b49f7-60b2-41e3-be6b-ee95d39d59c4

param(
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$Subscription = "f91b49f7-60b2-41e3-be6b-ee95d39d59c4"
$Location = "eastus2"
$DeploymentName = "jurassic-foundry-$(Get-Date -Format 'yyyyMMddHHmmss')"

if ($WhatIf) {
    Write-Host "🔍 Running in what-if mode (no changes will be made)" -ForegroundColor Yellow
}

Write-Host "📦 Deploying Azure AI Foundry infrastructure..."
Write-Host "   Subscription: $Subscription"
Write-Host "   Location:     $Location"
Write-Host ""

$WhatIfParam = if ($WhatIf) { "--what-if" } else { "" }

az deployment sub create `
    --name $DeploymentName `
    --location $Location `
    --subscription $Subscription `
    --template-file "$ScriptDir\main.bicep" `
    --parameters "$ScriptDir\main.parameters.json" `
    $WhatIfParam

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed"
    exit 1
}

if (-not $WhatIf) {
    # Extract endpoint from deployment outputs
    $Endpoint = az deployment sub show `
        --name $DeploymentName `
        --query "properties.outputs.openAIEndpoint.value" `
        -o tsv

    # Write foundry.config.json
    $Config = @{
        projectEndpoint = $Endpoint
        modelDeployment = "gpt-4o"
        apiVersion = "2024-12-01-preview"
        authMethod = "DefaultAzureCredential"
    } | ConvertTo-Json -Depth 3

    $Config | Set-Content -Path "$ScriptDir\foundry.config.json" -Encoding UTF8

    Write-Host ""
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
    Write-Host "📄 Config written to: infra\foundry.config.json"
    Write-Host ""
    Write-Host "Set this env var for your app:"
    Write-Host "  `$env:AZURE_AI_PROJECT_ENDPOINT = `"$Endpoint`""
}
