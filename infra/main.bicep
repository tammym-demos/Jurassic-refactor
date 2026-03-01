targetScope = 'subscription'

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Resource group name')
param resourceGroupName string = 'rg-jurassic-eastus2'

@description('Azure OpenAI account name')
param openAIAccountName string = 'jurassic-openai'

@description('GPT-4o deployment name')
param gpt4oDeploymentName string = 'gpt-4o'

@description('GPT-4o model version')
param gpt4oModelVersion string = '2024-11-20'

@description('Tokens-per-minute capacity (in thousands) for GPT-4o')
param gpt4oCapacity int = 10

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

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

output resourceGroupName string = rg.name
output openAIEndpoint string = openai.outputs.endpoint
output openAIAccountName string = openai.outputs.accountName
output gpt4oDeploymentName string = openai.outputs.gpt4oDeploymentName
