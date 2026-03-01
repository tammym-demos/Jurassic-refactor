# Bring Your Own Model (BYOM)

**TL;DR:** The agent connects to Azure OpenAI through Azure AI Foundry using `DefaultAzureCredential` — no API keys. Model configuration is loaded from environment variables and `infra/foundry.config.json`, with support for fallback deployments.

## Overview

BYOM (Bring Your Own Model) allows the jurassic-refactor agent to use any model deployed to the Azure AI Foundry project. The default deployment is **GPT-4o** on the `jurassic-ai-zsaoi` Azure OpenAI resource.

## Authentication Flow

```
┌──────────────┐     DefaultAzureCredential      ┌─────────────────────┐
│  Agent       │ ──────────────────────────────▶  │  Azure OpenAI       │
│  (Container  │   Token scope:                   │  jurassic-ai-zsaoi  │
│   App)       │   cognitiveservices.azure.com     │  (gpt-4o)           │
└──────────────┘                                  └─────────────────────┘
```

1. The agent uses `DefaultAzureCredential` from `@azure/identity` to acquire a token.
2. The token scope is `https://cognitiveservices.azure.com/.default`.
3. In Azure, the Container App's **system-assigned managed identity** is used.
4. Locally, the developer's Azure CLI / VS Code credential is used.
5. **No API keys are ever stored, transmitted, or accepted** (`disableLocalAuth: true`).

## Environment Variables

| Variable                    | Required | Description                                          |
| --------------------------- | -------- | ---------------------------------------------------- |
| `AZURE_AI_PROJECT_ENDPOINT` | Yes      | Foundry project endpoint (e.g., `https://jurassic-ai-zsaoi.openai.azure.com/`) |
| `AZURE_OPENAI_ENDPOINT`    | No       | Override for the OpenAI resource endpoint            |
| `AZURE_OPENAI_DEPLOYMENT`  | No       | Override for the deployment name (default: `gpt-4o`) |

## Model Configuration

Model config is managed by `packages/foundry/src/model-config.ts`:

```typescript
interface ModelConfig {
  projectEndpoint: string;       // Azure AI Foundry project endpoint
  deploymentName: string;        // Model deployment (default: "gpt-4o")
  fallbackDeploymentName?: string; // Optional fallback deployment
  apiVersion: string;            // API version (default: "2024-12-01-preview")
}
```

Configuration is resolved in this order:

1. **Explicit overrides** passed to `getModelConfig(overrides)`.
2. **Environment variables** (`AZURE_AI_PROJECT_ENDPOINT`).
3. **Foundry config** (`infra/foundry.config.json`).

## Fallback Strategy

If the primary model deployment is unavailable (e.g., throttled or down), the agent falls back:

1. **Primary:** Use `deploymentName` (default: `gpt-4o`).
2. **Fallback:** If `fallbackDeploymentName` is set, retry with the fallback deployment.
3. **Error:** If both fail, the agent reports a failure in the `Manifest.json` status.

No automatic model substitution occurs — the fallback must be explicitly configured.

## Foundry Config

The infrastructure-level model configuration lives in `infra/foundry.config.json`:

```json
{
  "projectEndpoint": "https://jurassic-ai-zsaoi.openai.azure.com/",
  "modelDeployment": "gpt-4o",
  "apiVersion": "2024-12-01-preview",
  "authMethod": "DefaultAzureCredential"
}
```

## Credential Resolution

The `getFoundryCredential()` function (re-exported from `@jurassic/auth`) returns a `DefaultAzureCredential` instance. The credential chain tries, in order:

1. **EnvironmentCredential** — service principal via env vars (CI).
2. **WorkloadIdentityCredential** — Kubernetes/Container Apps workload identity.
3. **ManagedIdentityCredential** — system-assigned managed identity (production).
4. **AzureCliCredential** — `az login` session (local development).
5. **VisualStudioCodeCredential** — VS Code Azure extension (local development).

## Model Selection

To use a different model deployment:

```bash
# Override via environment
export AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini

# Or pass explicitly in code
const config = getModelConfig({ deploymentName: "gpt-4o-mini" });
```

Supported models are any chat-completion models deployed to the Azure OpenAI resource. The agent does not validate model capabilities — it is the operator's responsibility to deploy a model that supports the required features (function calling, JSON mode).

## Security

- **`disableLocalAuth: true`** on the Azure OpenAI resource prevents API key authentication.
- Managed identity is the only accepted auth method in production.
- Token refresh is handled automatically by `DefaultAzureCredential`.
- No secrets are stored in environment variables, config files, or source code.
