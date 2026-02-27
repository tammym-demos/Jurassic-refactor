# Constitution – Modernization Intelligence Layer

## Core Rules

1. **READ-ONLY by default** – No repository modifications without explicit gate
2. **Fork-first required** – All operations target user's fork, never upstream
3. **Writes require explicit gate** – `--enable-writes` + `--plan-approved` + approved artifacts
4. **Artifacts must validate schemas** – CI fails if any artifact is invalid
5. **Artifacts must be deterministic** – Same SHA + profile = identical artifacts
6. **Tool execution logged** – Every skill invocation logged with inputs/outputs (RunLog.jsonl)
7. **Foundry model usage required** – No direct OpenAI API calls; use Azure AI Foundry deployments
8. **BYOM via DefaultAzureCredential** – No API keys in code
9. **Passwordless auth required** – No secrets in code; use DefaultAzureCredential chain
10. **Two-agent isolation** – Planning Agent and Implementation Agent have separate contexts
11. **Planning Agent is read-only** – Cannot modify repository; analysis + interactive Q&A only
12. **Implementation Agent requires approval** – Cannot execute without approved Planning artifacts
13. **Incremental PRs** – Code changes delivered as small, reviewable PRs
14. **Audit-first** – Every action logged for enterprise governance compliance

## Agent Rules

### Planning Agent
- Mode: Read-only + Interactive
- Can: Analyze, evaluate stack, ask questions, produce artifacts
- Cannot: Modify code, create branches, push commits

### Implementation Agent
- Mode: Full code changes (after approval)
- Can: Refactor code, upgrade dependencies, create PRs
- Cannot: Execute without approved Planning artifacts
- Must: Create incremental PRs for human review

## Data Persistence
- Artifacts → Microsoft Fabric Lakehouse
- Run metadata → Cosmos DB
- Telemetry → Application Insights
- All access via DefaultAzureCredential (passwordless)
