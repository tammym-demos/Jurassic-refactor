# Copilot Instructions — Jurassic Modernization Agent

## Project Overview

This is a **pnpm monorepo** implementing a 2-agent Modernization Intelligence Layer for legacy codebases, built with GitHub Copilot SDK and Azure AI Foundry.

> **Required reading:** Before starting any task, read [`.specify/memory/constitution.md`](.specify/memory/constitution.md). It contains the project constitution — security rules, required Azure integrations, coding standards, and spec compliance status. These rules are mandatory and override any conflicting assumptions.

## Architecture

- **Planning Agent** (read-only): Analyzes legacy repos, builds dependency graphs, scores risk, produces phased modernization plans
- **Implementation Agent** (write, after approval): Executes approved plans — refactors code, upgrades deps, writes tests, creates incremental PRs
- Agents communicate only through **schema-validated JSON artifacts** (12 schemas in `specs/schemas/`)
- All artifacts validated with **Ajv** (`packages/schemas/src/validator.ts`)

## Packages

| Package | Purpose |
|---------|---------|
| `packages/agents/` | 2-agent orchestration (planning + implementation workflows, approval gate) |
| `packages/skills/` | 25+ reusable skills (analysis, refactoring, test generation, PR writing) |
| `packages/schemas/` | JSON schema registry + Ajv validation |
| `packages/foundry/` | Azure AI Foundry integration (BYOM model config, hosting, evaluation) |
| `packages/auth/` | Azure authentication (`DefaultAzureCredential`, environment detection) |
| `packages/data/` | Data services (artifact store, telemetry, Fabric config, run metadata) |
| `apps/cli/` | CLI entry point (`plan`, `implement`, `full-pipeline` commands) |

## Commands

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests (vitest)
pnpm format         # Format code
npx eslint "packages/*/src/**/*.ts"  # Lint
```

## Coding Conventions

- **TypeScript strict mode** — all packages
- **Node.js 20** runtime
- Use `.js` extensions in TypeScript import paths (ESM)
- **DefaultAzureCredential only** — never API keys or secrets in code
- All Azure resources use `disableLocalAuth: true`
- All skill outputs must be **deterministic** — same inputs produce identical JSON
- All artifacts must pass **Ajv schema validation** before storage
- Tests use **vitest** with imports from `"vitest"`

## Key Constraints

1. **Fork-first**: All operations target the user's fork, never upstream
2. **Read-only by default**: No writes without `--enable-writes` + `--plan-approved`
3. **Audit-first**: Every skill invocation logged with inputs/outputs
4. **No code exfiltration**: All analysis stays within tenant boundaries
5. **Human-in-the-loop**: Planning artifacts must be approved before implementation

## Current Status

All spec-required integrations are code-complete. The following Azure services require manual provisioning before end-to-end testing:

- **Azure AI Foundry**: Deploy project + models (GPT-4o, GPT-4o-mini) — see issue #84
- **Microsoft Fabric**: Create workspace + Lakehouse — see issue #86
- **Azure Document Intelligence**: Provision endpoint, set `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- **Azure AI Search**: Provision endpoint for RAG pipeline, set `AZURE_SEARCH_ENDPOINT`

## README Maintenance Rule

**When pushing changes that add, remove, or modify any capability, integration, skill, or configuration, the README.md Integration Status table must be updated in the same commit.** This ensures the README always reflects the current state of the codebase. Specifically:

- Adding a new skill → update the Skills table in README
- Changing an integration status → update the Integration Status table
- Adding/removing environment variables → update Prerequisites section
- Changing CLI commands or flags → update Usage section
- Modifying artifact schemas → update Architecture / Artifact Contract table

## Spec & Schema References

- Functional spec: `specs/functional/plan-copilot-legacy-intell-agent.md`
- All skill specs: `specs/functional/*.md`
- Artifact schemas: `specs/schemas/*.schema.json`
- Constitution: `.specify/memory/constitution.md`
