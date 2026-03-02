# Copilot Instructions — Jurassic Modernization Agent

## Project Overview

This is a **pnpm monorepo** implementing a 2-agent Modernization Intelligence Layer for legacy codebases, built with GitHub Copilot SDK and Azure AI Foundry.

See `.specify/memory/constitution.md` for the full constitution and spec compliance status.

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

## Current Gaps (from spec)

When working on this codebase, be aware of these unfinished integrations:

- `packages/skills/src/pr_writer.ts` — `createBranch()`, `pushFiles()`, `createPullRequest()` are **empty stubs**
- `packages/data/src/artifact-store.ts` — Fabric OneLake writes throw "not yet configured"
- `packages/data/src/telemetry.ts` — logs to `console.log` instead of Application Insights SDK
- `packages/foundry/src/evaluation.ts` — missing 5 Foundry IQ metrics (groundedness, hallucination, model comparison, prompt comparison, confidence distribution)
- No Azure Document Intelligence (PDF ingestion) skill exists
- No prompt version governance system exists
- No visualization rendering for dependency graphs or risk heatmaps
- Confidence scoring not emitted by all skills — only `migration_evaluator` and `risk_scoring`

## Spec & Schema References

- Functional spec: `specs/functional/plan-copilot-legacy-intell-agent.md`
- All skill specs: `specs/functional/*.md`
- Artifact schemas: `specs/schemas/*.schema.json`
- Constitution: `.specify/memory/constitution.md`
