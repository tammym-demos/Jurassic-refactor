# Foundry Hosting

**TL;DR:** Agents run as containerized services on Azure Container Apps, deployed via Azure Container Registry, and authenticated using system-assigned managed identity. No API keys are stored or used.

## Overview

The jurassic-refactor agent is hosted on **Azure Container Apps** under the Azure AI Foundry project. The Container App (`jurassic-agent`) runs on a managed environment (`jurassic-env`) in East US 2, pulling images from Azure Container Registry.

## Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   ACR        │      │  Container App   │      │  Azure OpenAI       │
│  jurassic-   │─────▶│  jurassic-agent  │─────▶│  jurassic-ai-zsaoi  │
│  acrzsaoi    │      │  (jurassic-env)  │      │  (gpt-4o)           │
└──────────────┘      └──────────────────┘      └─────────────────────┘
                             │
                             ▼
                      ┌──────────────────┐
                      │ App Insights     │
                      │ (telemetry)      │
                      └──────────────────┘
```

## Container App Configuration

| Property              | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **App Name**          | `jurassic-agent`                                                                          |
| **Environment**       | `jurassic-env`                                                                            |
| **Region**            | East US 2                                                                                 |
| **URL**               | `https://jurassic-agent.internal.calmdesert-8ba752d1.eastus2.azurecontainerapps.io`       |
| **ACR Login Server**  | `jurassicacrzsaoi.azurecr.io`                                                             |
| **Auth**              | System-assigned managed identity (`disableLocalAuth: true`)                               |

## Authentication

All authentication uses **DefaultAzureCredential** — no API keys are stored or transmitted.

- **ACR pull:** The Container App's managed identity is granted `AcrPull` on the registry.
- **Azure OpenAI:** The managed identity is granted `Cognitive Services OpenAI User` on the OpenAI resource.
- **App Insights:** Connection string is injected as an environment variable; telemetry uses managed identity where supported.
- **Local auth is disabled** (`disableLocalAuth: true`) on all backing services.

## Environment Variables

| Variable                         | Description                                      | Source                   |
| -------------------------------- | ------------------------------------------------ | ------------------------ |
| `AZURE_AI_PROJECT_ENDPOINT`      | Azure AI Foundry project endpoint                | Foundry config           |
| `AZURE_OPENAI_ENDPOINT`         | Azure OpenAI resource endpoint                   | Bicep output             |
| `AZURE_OPENAI_DEPLOYMENT`       | Model deployment name (e.g., `gpt-4o`)           | Foundry config           |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights connection string             | Bicep output             |

## Health Checks

The Container App exposes health probes for the orchestrator:

- **Liveness probe:** `GET /healthz` — confirms the process is alive.
- **Readiness probe:** `GET /readyz` — confirms the agent can accept work (model endpoint reachable).

## Scaling

| Setting          | Development | Production     |
| ---------------- | ----------- | -------------- |
| **Min replicas** | 0           | 1              |
| **Max replicas** | 1           | Configurable   |
| **Scale rule**   | HTTP        | HTTP / KEDA    |

- In development, the app scales to zero when idle to minimize cost.
- In production, at least one replica is kept warm to avoid cold-start latency.

## Deployment Flow

```
1. Build container image
   pnpm build && docker build -t jurassicacrzsaoi.azurecr.io/jurassic-agent:latest .

2. Push to ACR
   az acr login --name jurassicacrzsaoi
   docker push jurassicacrzsaoi.azurecr.io/jurassic-agent:latest

3. Update Container App
   az containerapp update \
     --name jurassic-agent \
     --resource-group jurassic-rg \
     --image jurassicacrzsaoi.azurecr.io/jurassic-agent:latest
```

The deployment can also be triggered via CI using `infra/deploy.sh` or `infra/deploy.ps1`.

## Infrastructure as Code

All resources are defined in Bicep at `infra/main.bicep` with module composition in `infra/modules/`. The Foundry-specific configuration lives in `infra/foundry.config.json`.
