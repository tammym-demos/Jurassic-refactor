targetScope = 'subscription'

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Resource group name')
param resourceGroupName string = 'rg-jurassic-eastus2'

// --- OpenAI / Foundry ---
@description('Azure OpenAI account name')
param openAIAccountName string = 'jurassic-openai'

@description('GPT-4o deployment name')
param gpt4oDeploymentName string = 'gpt-4o'

@description('GPT-4o model version')
param gpt4oModelVersion string = '2024-11-20'

@description('Tokens-per-minute capacity (in thousands) for GPT-4o')
param gpt4oCapacity int = 10

// --- Application Insights ---
@description('Application Insights name')
param appInsightsName string = 'jurassic-appinsights'

@description('Log Analytics workspace name')
param logAnalyticsName string = 'jurassic-logs'

// --- Container Registry ---
@description('Azure Container Registry name (alphanumeric only)')
param acrName string = 'jurassicacr'

// --- Container App ---
@description('Container App name')
param containerAppName string = 'jurassic-agent'

@description('Container App Environment name')
param containerEnvName string = 'jurassic-env'

// ============================================================
// Resource Group
// ============================================================

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// ============================================================
// Modules
// ============================================================

module openai 'modules/openai.bicep' = {
  name: 'openai-deployment'
  scope: rg
  params: {
    location: location
    accountName: openAIAccountName
    gpt4oDeploymentName: gpt4oDeploymentName
    gpt4oModelVersion: gpt4oModelVersion
    gpt4oCapacity: gpt4oCapacity
  }
}

module monitoring'modules/app-insights.bicep' = {
  name: 'monitoring-deployment'
  scope: rg
  params: {
    location: location
    appInsightsName: appInsightsName
    logAnalyticsName: logAnalyticsName
  }
}

module acr 'modules/container-registry.bicep' = {
  name: 'acr-deployment'
  scope: rg
  params: {
    location: location
    registryName: acrName
  }
}

module containerApp 'modules/container-app.bicep' = {
  name: 'container-app-deployment'
  scope: rg
  params:{
    location: location
    appName: containerAppName
    environmentName: containerEnvName
    acrLoginServer: acr.outputs.loginServer
    logAnalyticsId: monitoring.outputs.logAnalyticsId
    appInsightsConnectionString: monitoring.outputs.connectionString
    openAIEndpoint: openai.outputs.endpoint
  }
}

// ============================================================
// Outputs
// ============================================================

output resourceGroupName string = rg.name
output openAIEndpoint string = openai.outputs.endpoint
output openAIAccountName string = openai.outputs.accountName
output gpt4oDeploymentName string = openai.outputs.gpt4oDeploymentName
output appInsightsConnectionString string = monitoring.outputs.connectionString
output acrLoginServer string = acr.outputs.loginServer
output containerAppUrl string = containerApp.outputs.appUrl
