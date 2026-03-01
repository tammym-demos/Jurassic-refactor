# Plan Synthesis Skill

## Overview

Synthesizes risk scoring, stack fingerprint, migration option, and dependency graph data into a structured modernization plan (`ModernizationPlan.json`). Produces phased improvement steps with tasks that reference risk item file paths.

## Interfaces

### PlanSynthesisInput

```typescript
interface PlanSynthesisInput {
  riskItems: Array<{ filePath: string; overallScore: number; severity: string; evidence: string[] }>;
  stackData: { languages: Array<{ name: string }>; frameworks: Array<{ name: string }>; buildTools: Array<{ name: string }> };
  migrationOption: { id: string; name: string; targetStack: string; effort: string };
  dependencyGraph?: { nodes: Array<{ id: string; path: string }>; edges: Array<{ from: string; to: string }> };
  userDecisions?: { decisions: Array<{ questionId: string; answer: string | number }> };
}
```

### PlanSynthesisOutput

```typescript
interface PlanSynthesisOutput {
  planId: string;                      // "plan-{migrationOption.id}"
  selectedOption: string;              // migrationOption.id
  phases: PlanPhase[];                 // 4 phases
  totalTasks: number;
  estimatedFileCount: number;
  summary: string;                     // Human-readable stats
}
```

### PlanTask

```typescript
interface PlanTask {
  id: string;                          // "task-001", "task-002", ...
  title: string;
  description: string;
  phase: number;
  priority: "critical" | "high" | "medium" | "low";
  riskIds: string[];                   // file paths from risk items
  estimatedFiles: string[];
  dependencies: string[];              // task IDs this depends on
  type: "refactor" | "migrate" | "test" | "dependency" | "documentation";
}
```

### PlanPhase

```typescript
interface PlanPhase {
  number: number;
  name: string;
  description: string;
  tasks: PlanTask[];
}
```

## Behavior

- Implements `Skill` interface with `name = "plan_synthesis"`
- Produces exactly 4 phases:
  - **Phase 1 — Foundation**: Dependency upgrades and build system changes. Contains tasks for each build tool and low-risk files (overallScore < 60). Task type: `dependency`.
  - **Phase 2 — Core Migration**: Refactors high-risk files (overallScore ≥ 60). Sorted by score descending (critical first). Task type: `refactor`.
  - **Phase 3 — Test Coverage**: Generates test tasks for all files changed in phases 1–2. Task type: `test`.
  - **Phase 4 — Documentation**: Single documentation task covering all changed files. Task type: `documentation`.
- Task IDs are sequential: `task-001`, `task-002`, etc.
- Task priority is derived from risk item severity
- `riskIds` contains the file paths of referenced risk items
- If `dependencyGraph` is provided, phase 2 tasks include dependency references so that depended-upon files are migrated before their dependents
- Summary string includes migration name, target stack, task count, phase count, and file count
- Empty risk items produce a minimal plan with only build tool upgrade tasks
