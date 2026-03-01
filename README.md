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

## Monorepo Structure

```
packages/
├── agents/    — 2-agent system (Planning + Implementation) with orchestrator
├── skills/    — 10 analysis & implementation skills (DSL parsers, graph builders, refactoring)
├── schemas/   — 12 JSON schemas + Ajv validation (artifact contract)
├── foundry/   — Azure AI Foundry integration (BYOM model config)
├── auth/      — Azure authentication (DefaultAzureCredential, environment detection)
├── data/      — Data services (artifact store, telemetry, run metadata)
apps/
└── cli/       — CLI wrapper (plan, implement, full-pipeline commands)
```

### Skills

| Skill | Agent | Description |
|-------|-------|-------------|
| `repo_snapshot` | Planning | Fork-aware file indexing with language detection |
| `fw_include_graph` | Planning | C/C++ include graph with Tarjan SCC cycle detection |
| `py_import_graph` | Planning | Python import graph with external dependency tracking |
| `gui_import_graph` | Planning | JS/Vue import graph with component detection |
| `git_churn` | Planning | Git history hotspot analysis with churn scoring |
| `dsl_parser_registry` | Planning | Extensible registry for C/C++, Python, JS/Vue parsers |
| `code_refactor` | Implementation | Language-aware code transformations (rename, extract, replace) |
| `migration_executor` | Implementation | Executes migration phases from the approved plan |
| `dependency_upgrader` | Implementation | npm/pip version upgrades with pinning support |
| `test_writer` | Implementation | Generates test scaffolds (vitest, pytest, C assert) |
| `incremental_pr` | Implementation | Fork-aware PR creation for each migration task |

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

## License

See [LICENSE](LICENSE).
