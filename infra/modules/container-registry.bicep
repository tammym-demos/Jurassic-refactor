@description('Azure region')
param location string

@description('Azure Container Registry name (must be globally unique, alphanumeric only)')
param registryName string

@description('SKU tier')
@allowed(['Basic', 'Standard', 'Premium'])
param sku string = 'Basic'

@description('Principal ID to grant AcrPush role (leave empty to skip)')
param principalId string = ''

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: registryName
  location: location
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: false // Force managed identity / DefaultAzureCredential
  }
}

// AcrPush role
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'

resource acrPushRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (principalId != '') {
  name: guid(acr.id, principalId, acrPushRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
    principalId: principalId
    principalType: 'User'
  }
}

output loginServer string = acr.properties.loginServer
output registryName string = acr.name
output registryId string = acr.id
