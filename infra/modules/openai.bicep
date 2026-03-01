@description('Azure region')
param location string

@description('Azure OpenAI account name')
param accountName string

@description('GPT-4o deployment name')
param gpt4oDeploymentName string

@description('GPT-4o model version')
param gpt4oModelVersion string

@description('Tokens-per-minute capacity (in thousands)')
param gpt4oCapacity int

resource openAIAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true // Force DefaultAzureCredential — no API keys
  }
}

resource gpt4o 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAIAccount
  name: gpt4oDeploymentName
  sku: {
    name: 'Standard'
    capacity: gpt4oCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: gpt4oModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// Assign Cognitive Services User role to the deploying identity
// This enables DefaultAzureCredential access without API keys
@description('Principal ID to grant Cognitive Services User role (leave empty to skip)')
param principalId string = ''

var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (principalId != '') {
  name: guid(openAIAccount.id, principalId, cognitiveServicesUserRoleId)
  scope: openAIAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: principalId
    principalType: 'User'
  }
}

output endpoint string = openAIAccount.properties.endpoint
output accountName string = openAIAccount.name
output gpt4oDeploymentName string = gpt4o.name
output accountId string = openAIAccount.id
