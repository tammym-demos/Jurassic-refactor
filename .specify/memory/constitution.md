# Constitution – Modernization Intelligence Layer

> Source of truth: `specs/functional/plan-copilot-legacy-intell-agent.md`

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

## Required Azure Integrations

All integrations listed below are mandated by the spec. Status reflects current codebase reality.

### ✅ Implemented
| Integration | Package | Notes |
|---|---|---|
| GitHub Copilot SDK (agent runtime) | `packages/agents/` | 2-agent orchestration, tool registration, interactive Q&A |
| GitHub Actions CI/CD | `.github/workflows/` | `ci.yml` (4-job pipeline) + `deploy.yml` (staged deployment) |
| Azure AI Foundry (BYOM + hosting) | `packages/foundry/` | Model config, container hosting, basic evaluation |
| Azure AD / RBAC | `packages/auth/` | `DefaultAzureCredential`, `disableLocalAuth: true` on all resources |
| Containerized deployment | `infra/` | Dockerfile, Container Apps Bicep, health checks |
| Deterministic JSON outputs | CI + `evaluation.ts` | Hash verification in CI; determinism metrics in evaluation |
| Infrastructure as Code (Bicep) | `infra/` | Modules: OpenAI, App Insights, ACR, Container Apps |

### ⚠️ Partially Implemented
| Integration | Package | What's missing |
|---|---|---|
| Azure Monitor / App Insights | `packages/data/src/telemetry.ts` | Interface complete; currently logs to `console.log`. Wire `@azure/monitor-opentelemetry` SDK. |
| Microsoft Fabric / OneLake | `packages/data/src/artifact-store.ts` | Config + env vars ready; `writeLakehouseTable()` throws "not yet configured". Implement OneLake DFS REST calls. |
| PII redaction filters | `packages/foundry/src/evaluation.ts` | Regex detection (emails, SSNs) exists; no active redaction/masking before artifact persistence. Add `sanitize()`. |
| Confidence scoring on all outputs | `migration_evaluator.ts`, `risk_scoring.ts` | Present in 2 skills; must be added to all skill output interfaces. |
| Human-in-the-loop PR gating | `approval-gate.ts`, `deploy.yml` | Marker file + GitHub environment approvals; lacks inline review, multi-reviewer consensus. |
| PR creation (GitHub API) | `packages/skills/src/pr_writer.ts` | Description generation works; `createBranch()`, `pushFiles()`, `createPullRequest()` are empty stubs. Wire Octokit or GitHub MCP. |
| Foundry IQ evaluation metrics | `packages/foundry/src/evaluation.ts` | Basic accuracy/safety/relevance/determinism. Missing: prompt comparison, model comparison, groundedness, hallucination detection, confidence distribution. |

### ❌ Not Started
| Integration | Spec reference | What to build |
|---|---|---|
| Azure Document Intelligence | Spec §2 line 57 | `packages/skills/src/doc_ingest.ts` — PDF/document ingestion using `@azure/ai-form-recognizer` |
| Prompt version governance | Spec §4 line 80 | `packages/foundry/src/prompt-registry.ts` — hash + semver tracking, comparison, audit trail |
| Dependency graph visualization | Spec §5 demo step 2 | HTML/D3.js rendering of `DependencyGraph.json` |
| Risk heatmap visualization | Spec §5 demo step 3 | HTML color-coded rendering of `RiskAssessment.json` |
| RAG pipeline | Spec §2 line 56 | Embeddings + Azure AI Search index for legacy documentation |

## Data Persistence

- Artifacts → Local filesystem (default) or Microsoft Fabric OneLake (when `JURASSIC_STORAGE_PROVIDER=fabric`)
- Run metadata → Local storage (Cosmos DB support removed)
- Telemetry → Application Insights (pending SDK wiring; currently console.log)
- All access via DefaultAzureCredential (passwordless)

## Security & Governance Requirements

All of the following are required by the spec (§4):

1. **No code exfiltration outside tenant** – All analysis tenant-contained
2. **Confidence scoring on all outputs** – Every skill must emit a confidence value
3. **Human-in-the-loop PR gating** – No code merged without human review
4. **Full audit trail in Fabric** – Every run, skill invocation, and decision logged to OneLake
5. **Role-based access (Azure AD)** – RBAC enforced on all Azure resources
6. **PII redaction filters** – Mask PII before artifact persistence and PR descriptions
7. **Foundry evaluation tracking** – Quality metrics tracked across runs for regression detection
8. **Prompt version governance** – Prompt versions tracked with hash, compared across evaluations

## Demo Path (7 Steps)

The spec defines this exact demo sequence. All steps must work end-to-end:

1. ✅ Analyze legacy repo → Planning Agent with 15+ analysis skills
2. ⚠️ View dependency graph → JSON data exists; needs visual rendering
3. ⚠️ View risk heatmap → JSON risk scores exist; needs visual rendering
4. ⚠️ Generate test PR → Description generation works; GitHub API stubs empty
5. ✅ View modernization roadmap → `ModernizationPlan.json` artifact
6. ❌ Show audit logs in Fabric → Fabric writes not implemented
7. ⚠️ Show Foundry IQ evaluation dashboard → Basic metrics only; advanced IQ metrics missing

## Coding Standards

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 20
- **Package manager:** pnpm (monorepo workspace)
- **Build:** `pnpm build`
- **Test:** `pnpm test` (vitest)
- **Lint:** `npx eslint "packages/*/src/**/*.ts"`
- **Format:** `pnpm format`
- **Imports:** Use `.js` extensions in TypeScript imports
- **Auth:** `DefaultAzureCredential` only — never API keys
- **Azure subscription:** `f91b49f7` — region: `eastus2`
- **GitHub repo:** `tmcclell_microsoft/jurassic-refactor`
