@description('Azure region')
param location string

@description('Container App name')
param appName string

@description('Container App Environment name')
param environmentName string

@description('ACR login server (e.g., myregistry.azurecr.io)')
param acrLoginServer string

@description('Container image (e.g., myregistry.azurecr.io/jurassic:latest)')
param containerImage string = ''

@description('Log Analytics workspace ID for the environment')
param logAnalyticsId string

@description('Application Insights connection string')
param appInsightsConnectionString string = ''

@description('Azure OpenAI endpoint')
param openAIEndpoint string = ''

// Managed environment for Container Apps
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsId, '2023-09-01').primarySharedKey
      }
    }
  }
}

var useCustomImage = containerImage != ''

// The Container App itself — initially deployed with a placeholder image
// Real image is pushed after `pnpm build && docker build && az acr build`
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      registries: useCustomImage ? [
        {
          server: acrLoginServer
          identity: 'system'
        }
      ] : []
      ingress: {
        external: false // Internal only — agents don't need public endpoints
        targetPort: 3000
      }
    }
    template: {
      containers: [
        {
          name: 'jurassic-agent'
          image: useCustomImage ? containerImage : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'AZURE_AI_PROJECT_ENDPOINT'
              value: openAIEndpoint
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output appName string = containerApp.name
output principalId string = containerApp.identity.principalId
