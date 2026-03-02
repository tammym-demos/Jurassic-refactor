# Jurassic Modernization Agent

**Modernization Intelligence Layer** — A 2-agent system that automates legacy codebase modernization using GitHub Copilot SDK and Microsoft Azure AI Foundry.

## Overview

Jurassic Refactor targets complex, aging repositories (C/C++ firmware, Python tooling, Vue.js GUIs) and produces a structured migration plan followed by automated code changes — all validated through JSON schemas and gated by human approval.

### Two-Agent Architecture

| Agent | Mode | Responsibility |
|-------|------|---------------|
| **Planning Agent** | Read-only | Analyzes the codebase, builds dependency graphs, detects include cycles (Tarjan's SCC), scores risk per file, fingerprints the tech stack, and generates a phased modernization plan |
| **Implementation Agent** | Read-write (after approval) | Executes the approved plan — refactoring code, upgrading dependencies, writing tests, and creating incremental PRs on the user's fork |

### Key Design Principles

- **Artifact-driven**: Agents never communicate directly. They exchange 12 schema-validated JSON artifacts (DependencyGraph, RiskAssessment, ModernizationPlan, TestScaffold, etc.)
- **Human-in-the-loop**: Planning artifacts must be explicitly approved before the Implementation Agent can proceed
- **Fork-aware**: All changes target the user's fork — the upstream repository is never modified
- **Deterministic**: Given the same inputs, the Planning Agent produces identical artifacts (cacheable, diffable, auditable)
- **Passwordless**: All Azure services use `DefaultAzureCredential` with `disableLocalAuth: true` — zero API keys stored anywhere

### Workflow

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│  Planning Agent  │         │   Human Review   │         │ Implementation Agent │
│   (read-only)    │────────▶│   & Approval     │────────▶│  (write after appr.) │
└──────────────────┘         └──────────────────┘         └──────────────────────┘
  Produces 9 artifacts:        Reviews plan,                Consumes approved plan,
  DependencyGraph,             approves via APPROVED        produces incremental PRs
  RiskAssessment,              marker file                  with ImplementationLog
  ModernizationPlan, ...                                    and TestScaffold
```

## User Workflow

The human is always in control. The software performs heavy analysis autonomously, but the user approves every plan before any code is changed and reviews each PR before merging.

### Step 1 — Fork the legacy repo

Fork the target codebase (e.g., an aging C/C++ firmware project) to your own GitHub account. Jurassic never touches the upstream repository.

### Step 2 — Run the Planning Agent

```bash
npx jurassic plan --fork-owner alice --interactive
```

The agent clones your fork and silently analyzes it — building dependency graphs, detecting circular includes (Tarjan's SCC), scoring risk per file, and fingerprinting the tech stack. In `--interactive` mode it asks clarifying questions:

> *"The firmware uses bare-metal C with no RTOS. Should we target FreeRTOS or Zephyr for the migration?"*

Your answers are captured in the `UserDecisions` artifact and feed directly into the plan.

### Step 3 — Review the artifacts

The Planning Agent writes 9 JSON artifacts to `artifacts/<runId>/planning/`:

| Artifact | What to look for |
|----------|-----------------|
| `ModernizationPlan.json` | Phased migration roadmap — check task order and scope |
| `RiskAssessment.json` | Per-file risk scores — verify high-risk files get extra tests |
| `DependencyGraph.json` | Include/import graph — confirm no missed dependencies |
| `MigrationOptions.json` | Candidate approaches — review trade-offs |

All artifacts are schema-validated JSON, so they can be diffed, versioned, or fed into downstream tooling.

### Step 4 — Approve the plan

```bash
# Option A: explicit approval marker
touch artifacts/<runId>/planning/APPROVED

# Option B: pass the flag directly
npx jurassic implement --plan-approved ...
```

Without approval, the Implementation Agent refuses to start.

### Step 5 — Run the Implementation Agent

```bash
npx jurassic implement --fork-owner alice --plan-approved
```

The agent reads the approved plan and executes it — refactoring code, upgrading dependencies, generating test scaffolds, and creating incremental PRs on your fork.

### Step 6 — Review and merge PRs

Each migration task produces a small, focused PR on your fork. Review the diff, run CI, and merge at your own pace. The `ImplementationLog` artifact tracks which plan tasks mapped to which PRs.

### Single-command alternative

```bash
npx jurassic full-pipeline --fork-owner alice --interactive
```

Runs plan → pauses for approval → then implements, all in one session.

## Technology Stack

### GitHub Copilot SDK

The [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) (`^0.1.29`) provides the **agent runtime** that hosts both agents. Its role:

| Capability | How Jurassic uses it |
|------------|---------------------|
| **Agent orchestration** | The SDK's agent runtime manages agent lifecycle, context windows, and tool dispatch |
| **Tool registration** | Each skill (repo_snapshot, fw_include_graph, etc.) is registered as a tool the LLM can invoke |
| **Interactive Q&A** | The SDK's conversational loop enables the Planning Agent to ask clarifying questions mid-analysis |
| **Structured output** | Enforces schema-validated artifact generation via the 12 JSON schemas in `packages/schemas` |

> **Current status**: The SDK is installed and the skill/schema infrastructure is built. Agents support both deterministic skill sequencing (default) and LLM-driven tool selection (opt-in via `JURASSIC_TOOL_SELECTION=llm` env var). The `ToolSelector` in `packages/agents/src/tool-selector.ts` is wired into both agent workflows with automatic deterministic fallback.

### Azure AI Foundry

[Azure AI Foundry](https://learn.microsoft.com/azure/ai-studio/) provides **model hosting and agent evaluation** in production:

| Capability | How Jurassic uses it |
|------------|---------------------|
| **BYOM model deployment** | GPT-4o (or user-supplied models) deployed with enterprise quotas and RBAC — configured in `packages/foundry/src/model-config.ts` |
| **Container hosting** | Agents run as containerized services on Azure Container Apps, deployed via the `infra/Dockerfile` and Foundry hosting workflows |
| **Evaluation pipelines** | `EvaluationReport` artifacts track agent quality metrics and regression detection across runs — spec'd in `specs/functional/foundry-evaluation.md` |
| **Passwordless auth** | All Foundry endpoints use `DefaultAzureCredential` with `disableLocalAuth: true` — zero API keys |

### Microsoft Fabric & OneLake

[Microsoft Fabric](https://learn.microsoft.com/fabric/) provides **analytics-ready artifact persistence** as an optional storage backend:

| Capability | How Jurassic uses it |
|------------|---------------------|
| **Artifact storage** | JSON artifacts (dependency graphs, plans, implementation logs) can be stored in OneLake for cross-run analytics and auditing |
| **Dual-mode storage** | `packages/data/src/artifact-store.ts` supports local filesystem (default) or Fabric OneLake — controlled by `JURASSIC_STORAGE_PROVIDER` env var |
| **OneLake DFS endpoint** | Configured in `packages/data/src/fabric-config.ts` via `FABRIC_WORKSPACE_ID` and `FABRIC_LAKEHOUSE_ID` |
| **RBAC access** | Requires `Storage Blob Data Contributor` on the OneLake endpoint and `Contributor` on the Fabric workspace |

> **Note**: Fabric is optional. By default, all data is stored locally as JSON files. Enable Fabric when you need persistent cross-run analytics or team-wide artifact sharing.

## Monorepo Structure

```
packages/
├── agents/    — 2-agent system (Planning + Implementation) with orchestrator
├── skills/    — 25+ analysis & implementation skills (DSL parsers, graph builders, risk scoring, refactoring)
├── schemas/   — 12 JSON schemas + Ajv validation (artifact contract)
├── foundry/   — Azure AI Foundry integration (model config, evaluation, prompt registry)
├── auth/      — Azure authentication (DefaultAzureCredential, environment detection)
├── data/      — Data services (artifact store, telemetry, PII sanitization, RAG pipeline, Fabric config)
apps/
└── cli/       — CLI wrapper (plan, implement, full-pipeline commands)
```

### Skills

#### Planning Skills (Analysis)

| Skill | Description |
|-------|-------------|
| `repo_snapshot` | Fork-aware file indexing with language detection |
| `fw_include_graph` | C/C++ include graph with Tarjan SCC cycle detection |
| `py_import_graph` | Python import graph with external dependency tracking |
| `gui_import_graph` | JS/Vue import graph with component detection |
| `git_churn` | Git history hotspot analysis with churn scoring |
| `dsl_parser_registry` | Extensible registry for C/C++, Python, JS/Vue parsers |
| `complexity_metrics` | Code complexity analysis per file |
| `risk_scoring` | Per-file risk scoring (churn × complexity × safety) |
| `safety_path_analysis` | Identifies safety-critical code patterns and zones |
| `stack_fingerprint` | Technology stack identification (languages, frameworks, build tools) |
| `stack_recommendation` | Recommends target stack improvements |
| `doc_coverage_analysis` | Documentation gap analysis with coverage metrics |
| `plan_synthesis` | Synthesizes phased modernization plans from analysis artifacts |
| `user_dialog` | Interactive Q&A for capturing user decisions mid-analysis |
| `policy` | Policy enforcement (safety, governance, compliance rules) |

#### Implementation Skills (Code Changes)

| Skill | Description |
|-------|-------------|
| `code_refactor` | Language-aware code transformations (rename, extract, replace) |
| `migration_executor` | Executes migration phases from the approved plan |
| `migration_evaluator` | Evaluates migration feasibility with multi-dimensional scoring |
| `dependency_upgrader` | npm/pip version upgrades with pinning support |
| `test_writer` | Generates test code (vitest, pytest, C assert) |
| `test_scaffold` | Identifies testable entry points and generates starter templates |
| `pr_writer` | Generates PR descriptions from plan tasks |
| `incremental_pr` | Fork-aware PR creation for each migration task |
| `doc_ingest` | Azure Document Intelligence PDF/document ingestion |
| `report_generator` | HTML visualization for dependency graphs and risk heatmaps |

## Prerequisites

### GitHub Setup (Fork the target repo first!)

1. **Fork the target repo** to your GitHub account on GitHub.com
2. The agent will prompt you for your fork location at startup:
   ```
   Enter your forked repository (owner/repo): myusername/ODrive
   ```
3. Or set `GITHUB_FORK_OWNER` env var / pass `--fork-owner <your-username>` to skip prompt

> **Important:** All analysis happens on YOUR FORK, not the upstream repo.
> You must have push access to the fork for the agent to create branches/PRs.

### Azure AI Setup

4. Create Azure AI Foundry project and deploy GPT-4o model
5. Set `AZURE_AI_PROJECT_ENDPOINT` env var
6. For Document Intelligence: set `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
7. For RAG pipeline: set `AZURE_SEARCH_ENDPOINT` and `AZURE_OPENAI_ENDPOINT`

### Azure Data Services Setup

9. Application Insights is provisioned via Bicep (see Infrastructure below)
10. Set `APPLICATIONINSIGHTS_CONNECTION_STRING` env var

### Data Storage

By default, the agent uses **local storage** (JSON files / SQLite) for run metadata — no cloud database required.

To use **Microsoft Fabric** for persistent storage instead, set:
```bash
JURASSIC_STORAGE_PROVIDER=fabric   # Options: local (default), fabric
FABRIC_WORKSPACE_ID=<your-workspace-id>
FABRIC_LAKEHOUSE_ID=<your-lakehouse-id>
```

> **Note:** Cosmos DB support has been removed. Run metadata is stored locally or in Fabric.

### Authentication

13. Authenticate with `az login` (for DefaultAzureCredential)
14. Ensure you have required RBAC roles (see below)
15. Grant Fabric workspace access to your identity

### Quick Start (recommended)

```bash
azd up  # Provisions Azure resources (OpenAI, App Insights, ACR, Container Apps)
# Fabric workspace must be created manually in the Fabric portal (optional)
```

## Usage

```bash
# Planning Agent: analyze and evaluate with interactive Q&A
npx jurassic plan --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive

# Implementation Agent: execute approved plan with code changes
npx jurassic implement --fork-owner alice --repo specs/repos/odrive.fixture.json --plan-approved --enable-writes

# Full pipeline: plan → user review → implement
npx jurassic full-pipeline --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive --enable-writes
```

## Required RBAC Roles

| Resource | Role |
|----------|------|
| AI Foundry Project | `Cognitive Services User` |
| Microsoft Fabric Workspace | `Contributor` (only if using Fabric storage) |
| OneLake (Fabric) | `Storage Blob Data Contributor` (only if using Fabric storage) |
| Application Insights | `Monitoring Metrics Publisher` |
| Container Registry | `AcrPush` |

## Infrastructure

All Azure resources are defined as Bicep IaC under `infra/`:

| Module | Resource | Notes |
|--------|----------|-------|
| `modules/openai.bicep` | Azure OpenAI + GPT-4o | `disableLocalAuth=true` |
| `modules/app-insights.bicep` | App Insights + Log Analytics | `DisableLocalAuth=true` |
| `modules/container-registry.bicep` | ACR (Basic) | Managed identity, no admin |
| `modules/container-app.bicep` | Container App Environment + App | SystemAssigned identity |
| `modules/cosmos-db.bicep` | Cosmos DB (template only) | Not deployed — deferred |

Deploy with:
```bash
az deployment sub create --location eastus2 \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json
```

## Architecture

### Artifact Contract

All 12 artifact schemas live in `specs/schemas/` and are validated with Ajv before storage:

| Artifact | Producer | Description |
|----------|----------|-------------|
| `Manifest` | Both | Run metadata: agent, status, repo URL, artifact paths |
| `RunLogEvent` | Planning | Skill invocation log with inputs, outputs, timing |
| `DependencyGraph` | Planning | Directed graph of source file dependencies |
| `StackAnalysis` | Planning | Technology inventory: languages, frameworks, build tools |
| `RiskAssessment` | Planning | Per-file risk scores (churn, complexity, safety) |
| `MigrationOptions` | Planning | Candidate migration paths with multi-dimensional scoring |
| `UserDecisions` | Planning | Captured user responses to planning questions |
| `DocCoverage` | Planning | Documentation gap analysis with remediation stubs |
| `ModernizationPlan` | Planning | Phased migration plan with tasks and dependencies |
| `ImplementationLog` | Implementation | Log of code changes linked to plan tasks |
| `TestScaffold` | Implementation | Test files with entry points and starter templates |
| `EvaluationReport` | Foundry | Agent quality metrics and regression detection |

For full details, see [`specs/functional/artifacts.md`](specs/functional/artifacts.md) and [`specs/functional/agents.md`](specs/functional/agents.md).

## Integration Status

Current implementation status of each integration point specified in [`specs/functional/plan-copilot-legacy-intell-agent.md`](specs/functional/plan-copilot-legacy-intell-agent.md):

| Integration | Status | Notes |
|-------------|--------|-------|
| GitHub Copilot SDK (agent runtime) | ✅ Complete | 2-agent orchestration, tool registration, interactive Q&A |
| GitHub Actions (CI/CD) | ✅ Complete | `ci.yml` (lint, test, schema validation, determinism check) + `deploy.yml` |
| Azure AI Foundry (BYOM + evaluation) | ✅ Complete | Model config, container hosting, evaluation pipeline with 7 IQ metrics |
| Azure AD / RBAC | ✅ Complete | `DefaultAzureCredential`, `disableLocalAuth`, RBAC role assignments |
| Containerized deployment | ✅ Complete | Multi-stage Dockerfile, Container Apps Bicep, health checks |
| Deterministic JSON outputs | ✅ Complete | CI hash verification + evaluation determinism metrics |
| Infrastructure as Code (Bicep) | ✅ Complete | 4 modules: OpenAI, App Insights, ACR, Container Apps |
| Human-in-the-loop gating | ✅ Complete | Approval-gate marker file + GitHub environment approvals |
| Azure Monitor / App Insights | ✅ Complete | `applicationinsights` SDK wired in `telemetry.ts` — trackEvent, trackDependency, trackMetric |
| Microsoft Fabric / OneLake | ✅ Complete | OneLake DFS reads/writes via `@azure/storage-file-datalake` in `artifact-store.ts` |
| PII redaction filters | ✅ Complete | `sanitize()` in `packages/data/src/sanitize.ts` — masks emails, SSNs, phones, IPs before persistence |
| Confidence scoring | ✅ Complete | All 20+ skills emit `confidence: number` (0–1) with dynamic computation |
| PR creation (GitHub integration) | ✅ Complete | Octokit integration: `createBranch`, `pushFiles`, `createPullRequest` in `pr_writer.ts` |
| Foundry IQ evaluation metrics | ✅ Complete | 7 metrics: prompt comparison, model comparison, groundedness, hallucination detection, confidence distribution, determinism, accuracy |
| Azure Document Intelligence | ✅ Complete | `DocIngestSkill` in `doc_ingest.ts` via `@azure/ai-form-recognizer` (prebuilt-layout model) |
| Prompt version governance | ✅ Complete | `PromptRegistry` with hash+semver, audit trail, A/B testing, promote/deprecate |
| Dependency graph visualization | ✅ Complete | Self-contained HTML report with inline force-directed SVG graph in `report_generator.ts` |
| Risk heatmap visualization | ✅ Complete | Self-contained HTML report with color-coded file tree (green/yellow/red) |
| RAG pipeline | ✅ Complete | `RAGPipelineService` with document chunking, Azure AI Search indexing, and retrieval |
| LLM-driven tool selection | ✅ Complete | `ToolSelector` with opt-in LLM mode (`JURASSIC_TOOL_SELECTION=llm`), deterministic fallback |

> **Infrastructure note:** Code is complete for all integrations. Azure services (Foundry project, Fabric workspace, Document Intelligence endpoint, AI Search) must be provisioned and configured by their respective leads before end-to-end testing. See issues #84–#88.

## Remaining Setup (Human-Led)

The following require manual Azure portal configuration — code is already implemented:

| Task | Owner | Issue |
|------|-------|-------|
| Deploy AI Foundry project + models (GPT-4o, GPT-4o-mini) | Foundry Lead | #84 |
| Configure Foundry IQ evaluation dashboards | Foundry Lead | #85 |
| Create Fabric workspace + Lakehouse + tables | Fabric Lead | #86 |
| Validate OneLake data pipeline + build governance dashboards | Fabric Lead | #87 |
| Cross-team integration testing | All | #88 |

## License

See [LICENSE](LICENSE).
