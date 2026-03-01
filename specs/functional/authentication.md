# Authentication

**TL;DR:** All Azure service authentication uses `DefaultAzureCredential` — no API keys, no secrets in code or environment. The `@jurassic/auth` package (`packages/auth/`) provides credential acquisition and per-service token helpers. Every Azure resource is deployed with `disableLocalAuth: true`, enforcing identity-based access exclusively.

## Credential Chain

The `getCredential()` function (`packages/auth/src/credential.ts`) returns the appropriate `TokenCredential` for the current environment:

```
DefaultAzureCredential chain:
  Environment Credential          ← service principal env vars (CI)
  → Managed Identity Credential   ← Container Apps system-assigned identity
  → Azure CLI Credential          ← local dev via `az login`
  → VS Code Credential            ← local dev via VS Code Azure extension
```

### Environment Detection

The `detectEnvironment()` function identifies three runtime contexts:

| Environment        | Detection                              | Credential Used                       |
| ------------------ | -------------------------------------- | ------------------------------------- |
| `local`            | Default (no CI/container signals)      | `DefaultAzureCredential` (full chain) |
| `github-actions`   | `GITHUB_ACTIONS === "true"`            | `DefaultAzureCredential` (full chain) |
| `container-apps`   | `CONTAINER_APP_NAME` is set            | `ManagedIdentityCredential` (direct)  |

In Container Apps with `AZURE_CLIENT_ID` set, the code skips the chain and uses `ManagedIdentityCredential` directly for faster token acquisition.

## Token Scopes

Each Azure service requires a specific OAuth2 scope. Token helpers live in `packages/auth/src/token.ts`:

| Service              | Scope                                          | Helper Function      | Status       |
| -------------------- | ---------------------------------------------- | -------------------- | ------------ |
| Cognitive Services   | `https://cognitiveservices.azure.com/.default`  | `getModelToken()`    | ✅ Active    |
| Azure Storage        | `https://storage.azure.com/.default`            | `getStorageToken()`  | 🔮 Future    |
| Cosmos DB            | `https://cosmos.azure.com/.default`             | `getCosmosToken()`   | 🔮 Deferred  |

Scopes are exported as the `Scopes` constant:

```typescript
import { Scopes } from "@jurassic/auth";

Scopes.cognitiveServices  // "https://cognitiveservices.azure.com/.default"
Scopes.storage            // "https://storage.azure.com/.default"
Scopes.cosmosDb           // "https://cosmos.azure.com/.default"
```

All token helpers accept an optional `TokenCredential` parameter for testing and override scenarios.

## disableLocalAuth Enforcement

Every Azure resource is provisioned with local authentication disabled. This means API keys, shared access keys, and admin credentials are rejected — only `DefaultAzureCredential` (RBAC) works.

| Resource                | Bicep Property                  | Effect                                  |
| ----------------------- | ------------------------------- | --------------------------------------- |
| Azure OpenAI            | `disableLocalAuth: true`        | API key header rejected; use AAD tokens |
| Application Insights    | `DisableLocalAuth: true`        | Instrumentation key alone insufficient  |
| Container Registry      | `adminUserEnabled: false`       | No admin credentials; use managed identity |
| Cosmos DB               | `disableLocalAuth: true`        | Connection string keys rejected         |

> This is a security-by-default posture. There are no API keys to leak.

## RBAC Roles Required

Each service requires specific Azure RBAC role assignments for the executing identity:

| Role                            | Resource                | Purpose                                   | Role Definition ID                           |
| ------------------------------- | ----------------------- | ----------------------------------------- | -------------------------------------------- |
| Cognitive Services User         | Azure OpenAI            | Call GPT-4o model endpoints               | `a97b65f3-24c7-4388-baec-2e87135dc908`       |
| Monitoring Metrics Publisher    | Application Insights    | Publish telemetry events and metrics      | —                                            |
| AcrPush                        | Container Registry      | Push container images from CI             | `8311e382-0749-4cb8-b61a-304f252e45ec`       |
| Cosmos DB Data Contributor      | Cosmos DB (deferred)    | Read/write run metadata                   | `00000000-0000-0000-0000-000000000002`       |

Role assignments are provisioned in the Bicep modules:
- `infra/modules/openai.bicep` — Cognitive Services User
- `infra/modules/container-registry.bicep` — AcrPush
- `infra/modules/cosmos-db.bicep` — Cosmos DB Data Contributor (deferred)

## Environment-Specific Behavior

### Local Development

```bash
az login                          # Authenticate once
# No env vars needed — DefaultAzureCredential uses Azure CLI credential
pnpm dev
```

The credential chain automatically picks up the Azure CLI session. No secrets, no `.env` files required for Azure access.

### GitHub Actions

```yaml
- uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

Uses federated identity (OIDC) — no client secrets stored in GitHub. `DefaultAzureCredential` picks up the environment credential automatically.

### Container Apps

The Container App is deployed with a system-assigned managed identity:

```bicep
identity: {
  type: 'SystemAssigned'
}
```

When `AZURE_CLIENT_ID` and `CONTAINER_APP_NAME` are set, `getCredential()` returns `ManagedIdentityCredential` directly, skipping the full chain for faster cold starts.

## Security Principles

1. **No secrets in code** — Zero API keys, connection strings with keys, or passwords in source.
2. **No secrets in environment** — The credential chain handles authentication from ambient identity.
3. **Least privilege** — Each role assignment is scoped to the specific resource, not the resource group.
4. **Defense in depth** — `disableLocalAuth: true` ensures that even if a key were somehow generated, it would be rejected by the service.

## Package Exports

The `@jurassic/auth` package (`packages/auth/src/index.ts`) exports:

```typescript
export { getCredential, detectEnvironment, type Environment } from "./credential.js";
export { getModelToken, getCosmosToken, getStorageToken, Scopes } from "./token.js";
```

## Environment Variables

| Variable                      | Required | Default | Description                                           |
| ----------------------------- | -------- | ------- | ----------------------------------------------------- |
| `AZURE_CLIENT_ID`             | No       | —       | Managed identity client ID (Container Apps)           |
| `CONTAINER_APP_NAME`          | No       | —       | Set by Container Apps runtime; triggers MI path       |
| `GITHUB_ACTIONS`              | No       | —       | Set by GitHub Actions runner; triggers CI detection    |
