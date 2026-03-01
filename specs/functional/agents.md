# 2-Agent Architecture

**TL;DR:** Two specialized agents — Planning (read-only) and Implementation (read-write) — analyze and modernize legacy codebases. They never communicate directly; artifacts are the sole interface between them. A human approval gate separates planning from implementation.

## Agents Overview

| Property            | Planning Agent                        | Implementation Agent                     |
| ------------------- | ------------------------------------- | ---------------------------------------- |
| **Name**            | `planning`                            | `implementation`                         |
| **Mode**            | `read-only`                           | `read-write`                             |
| **Source**          | `packages/agents/src/planning/index.ts` | *(issue #20)*                          |
| **Base class**      | `BaseAgent` (`packages/agents/src/base.ts`) | `BaseAgent`                         |
| **Orchestrator**    | `packages/agents/src/orchestrator.ts` | same                                     |
| **System prompt**   | Analyze only; never modify code       | Execute approved plans; make code changes |
| **Artifacts dir**   | `artifacts/<runId>/planning/`         | `artifacts/<runId>/implementation/`      |

## Agent Responsibilities

### Planning Agent

The Planning Agent performs **read-only analysis** of a legacy codebase. It never modifies source files.

**Responsibilities:**
- Analyze repository structure, dependencies, and technology stack
- Score risk factors per file (churn, complexity, safety, coverage)
- Evaluate migration options with multi-dimensional scoring
- Conduct optional interactive Q&A to gather user requirements
- Produce all planning artifacts for handoff to Implementation Agent

**Produced artifacts (9):**

| Artifact              | Schema                           | Purpose                                    |
| --------------------- | -------------------------------- | ------------------------------------------ |
| `Manifest`            | `Manifest.schema.json`           | Run metadata: agent, status, artifact paths |
| `RunLogEvent`         | `RunLogEvent.schema.json`        | Skill invocation log with timing            |
| `DependencyGraph`     | `DependencyGraph.schema.json`    | Directed graph of source file dependencies  |
| `RiskAssessment`      | `RiskAssessment.schema.json`     | Per-file risk scores                        |
| `DocCoverage`         | `DocCoverage.schema.json`        | Documentation gap analysis                  |
| `StackAnalysis`       | `StackAnalysis.schema.json`      | Technology inventory (languages, frameworks) |
| `MigrationOptions`    | `MigrationOptions.schema.json`   | Scored candidate migration paths            |
| `UserDecisions`       | `UserDecisions.schema.json`      | Captured user responses to planning questions |
| `ModernizationPlan`   | `ModernizationPlan.schema.json`  | Phased migration plan with tasks            |

### Implementation Agent

The Implementation Agent is **read-write after approval**. It consumes approved planning artifacts and executes code changes.

**Responsibilities:**
- Read approved planning artifacts from the planning directory
- Execute the phased migration plan
- Make code changes, create pull requests
- Scaffold tests for migrated code
- Log all implementation actions

**Consumed artifacts:** `ModernizationPlan`, `DependencyGraph`, `StackAnalysis`, `RiskAssessment`

**Produced artifacts (3):**

| Artifact              | Schema                            | Purpose                                 |
| --------------------- | --------------------------------- | --------------------------------------- |
| `ImplementationLog`   | `ImplementationLog.schema.json`   | Log of code changes linked to plan tasks |
| `TestScaffold`        | `TestScaffold.schema.json`        | Test files with entry points/templates   |
| `Manifest`            | `Manifest.schema.json`            | Run metadata for the implementation phase |

> For full artifact details and lifecycle, see [`artifacts.md`](./artifacts.md).

## Context Isolation

Each agent operates in an isolated `AgentContext` — there is no shared mutable state between agents.

### AgentContext

Defined in `packages/agents/src/base.ts`:

```typescript
interface AgentContext {
  runId: string;        // Unique run identifier
  repoPath: string;     // Path to the target repository
  fixturePath: string;  // Path to the fixture JSON
  profilePath: string;  // Path to the profile JSON
  artifactsDir: string; // Root directory for artifact output
}
```

### Isolation Rules

1. **Separate artifact directories** — Each agent writes to its own subdirectory:
   - Planning: `artifacts/<runId>/planning/`
   - Implementation: `artifacts/<runId>/implementation/`
2. **No shared in-memory state** — Agents do not share object references or global variables.
3. **Initialization guard** — `BaseAgent.assertInitialized()` throws if an agent method is called before `initialize()`. This prevents accidental use of an unconfigured agent.
4. **Directory auto-creation** — `BaseAgent.initialize()` creates the agent's artifacts directory if it does not exist.

```
artifacts/
└── <runId>/
    ├── planning/          ← Planning Agent writes here
    │   ├── Manifest.json
    │   ├── DependencyGraph.json
    │   ├── ...
    │   └── APPROVED       ← Human creates this marker
    └── implementation/    ← Implementation Agent writes here
        ├── ImplementationLog.json
        ├── TestScaffold.json
        └── Manifest.json
```

## Artifact Communication Protocol

Agents communicate **exclusively** through validated JSON artifacts. The full contract is defined in [`artifacts.md`](./artifacts.md).

```
┌─────────────────┐    artifacts/   ┌──────────────┐   artifacts/    ┌──────────────────────┐
│ Planning Agent  │───────────────▶│ Human Review │──────────────▶│ Implementation Agent │
│  (read-only)    │   <runId>/      │  & Approval  │  <runId>/       │  (read-write)        │
└─────────────────┘   planning/     └──────────────┘  planning/      └──────────────────────┘
                                                      + APPROVED
       writes ──▶                     reviews ──▶        reads ──▶
```

**Protocol rules:**

1. Planning Agent **writes** artifacts via `BaseAgent.writeArtifact()`, which validates against the JSON schema before persisting.
2. Human **reviews** the planning artifacts (especially `ModernizationPlan.json` and `RiskAssessment.json`).
3. Human **approves** by creating the `APPROVED` marker file in `artifacts/<runId>/planning/`.
4. Implementation Agent **reads** approved planning artifacts from the planning directory via `BaseAgent.readArtifact()`, which re-validates on read.
5. Implementation Agent **writes** its own artifacts to `artifacts/<runId>/implementation/`.

> All artifacts are validated with [Ajv](https://ajv.js.org/) strict mode. Schemas live in `specs/schemas/`.

## Approval Workflow

The approval gate ensures a human reviews and approves the modernization plan before any code is modified.

```
   Planning Agent          Human              Orchestrator         Implementation Agent
        │                    │                      │                       │
        │── run() ──────────▶│                      │                       │
        │   (produces        │                      │                       │
        │    artifacts)      │                      │                       │
        │                    │── review artifacts ─▶│                       │
        │                    │   create APPROVED    │                       │
        │                    │   marker file        │                       │
        │                    │                      │── checkApproval() ───▶│
        │                    │                      │   (returns true)      │
        │                    │                      │                       │── run()
        │                    │                      │                       │   (consumes
        │                    │                      │                       │    approved
        │                    │                      │                       │    artifacts)
```

### Orchestrator Commands

The `Orchestrator` class (`packages/agents/src/orchestrator.ts`) dispatches three commands:

| Command          | Behavior                                                               |
| ---------------- | ---------------------------------------------------------------------- |
| `plan`           | Run Planning Agent only. Returns artifact paths.                       |
| `implement`      | Check approval gate → run Implementation Agent.                        |
| `full-pipeline`  | Run `plan` → check approval gate → run `implement`.                    |

### Approval Gate

The `Orchestrator.checkApproval()` method checks for:

```
artifacts/<runId>/planning/APPROVED
```

If the file exists, the gate passes and the Implementation Agent may proceed.

### Bypassing Approval

For automated pipelines and testing, the approval gate can be skipped:

- **CLI flag:** `--plan-approved` (sets `planApproved: true` in `OrchestratorOptions`)
- **Options:** `skipApproval: true` in `OrchestratorOptions`

Both skip the `checkApproval()` file-system check entirely.

## Agent System Prompts

System prompts define each agent's behavioral constraints.

### Planning Agent System Prompt

> You are the **Planning Agent**. Your role is read-only analysis.
>
> - **Never** modify source files, create branches, or make commits.
> - Focus on understanding the codebase: structure, dependencies, risks, and migration paths.
> - Produce all planning artifacts faithfully and completely.
> - Score risks and migration options using quantitative metrics.
> - When interactive mode is enabled, ask clear questions with bounded choices.

### Implementation Agent System Prompt

> You are the **Implementation Agent**. Your role is to execute an approved modernization plan.
>
> - Only act on **approved** planning artifacts.
> - Make code changes following the phased migration plan.
> - Create pull requests with clear descriptions linking back to plan tasks.
> - Scaffold tests before modifying code.
> - Log every change to `ImplementationLog.json`.

## Skill Registration

Skills are discrete, composable units of work registered on each agent via `registerSkill()`.

### Planning Skills

Registered on `PlanningAgent` via `registerSkill(name, skill)`:

| Skill                  | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `repo_snapshot`        | Snapshot repository structure and doc coverage        |
| `include_graph`        | Build dependency graph from source imports/includes   |
| `risk_scoring`         | Score per-file risk (churn, complexity, safety)       |
| `stack_fingerprint`    | Identify languages, frameworks, build tools, runtimes |
| `migration_evaluator`  | Generate and score candidate migration paths          |
| `user_dialog`          | Interactive Q&A to capture user decisions             |

### Implementation Skills

Registered on the Implementation Agent:

| Skill                  | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `code_refactor`        | Apply code transformations per migration plan         |
| `migration_executor`   | Execute migration steps (dependency swaps, rewrites)  |
| `test_writer`          | Generate test scaffolds and boilerplate               |
| `pr_writer`            | Create pull requests with descriptions and metadata   |
| `dependency_upgrader`  | Upgrade or swap dependencies per migration options    |

### Registration Pattern

```typescript
const agent = new PlanningAgent();
agent.registerSkill("risk_scoring", new RiskScoringSkill());
agent.registerSkill("include_graph", new IncludeGraphSkill());
// ... remaining skills
```

Skills implement the `Skill` interface from `@jurassic/skills` and are invoked by the agent during its `run()` workflow. If a skill is not registered, the agent falls back to stub data.

## Planning Agent Workflow

The `PlanningAgent.run()` method executes an 8-step sequential workflow:

```
 1. Analyze dependencies         → DependencyGraph.json
 2. Analyze technology stack      → StackAnalysis.json
 3. Score risks                   → RiskAssessment.json
 4. Analyze doc coverage          → DocCoverage.json
 5. Generate migration options    → MigrationOptions.json
 6. Interactive Q&A (optional)    → UserDecisions.json
 7. Generate modernization plan   → ModernizationPlan.json
 8. Write Manifest + RunLogEvent  → Manifest.json, RunLogEvent.json
```

Each step delegates to the corresponding registered skill. If a skill is not registered, the step produces a valid stub artifact.

## Error Handling

- If any step in the Planning Agent fails, a `Manifest` with `status: "failed"` is written before the error is re-thrown.
- The Orchestrator catches agent errors and returns an `OrchestratorResult` with `status: "failed"` and the error message.
- If the approval gate is not met, the Orchestrator returns `status: "awaiting-approval"` without running the Implementation Agent.
