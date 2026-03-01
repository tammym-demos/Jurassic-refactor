# Artifact Contract

**TL;DR:** Artifacts are JSON files that serve as the communication contract between the Planning Agent and Implementation Agent. Every artifact is validated against a schema in `specs/schemas/`, persisted to Microsoft Fabric Lakehouse, and flows through human approval before consumption.

## Overview

The two-agent system communicates exclusively through artifacts:

- **Planning Agent** (read-only) analyzes the codebase and produces planning artifacts.
- **Implementation Agent** (write after approval) consumes approved planning artifacts and produces implementation artifacts.

Agents never communicate directly. Artifacts are the sole interface between them.

## Artifact Lifecycle

```
Created → Validated → Stored → Reviewed → Approved → Consumed
```

| Stage        | Actor                  | Description                                           |
| ------------ | ---------------------- | ----------------------------------------------------- |
| **Created**  | Agent                  | Agent produces artifact as a JSON file                 |
| **Validated**| CI / Agent             | Artifact passes Ajv schema validation                  |
| **Stored**   | System                 | Artifact is persisted to Fabric Lakehouse              |
| **Reviewed** | Human                  | Human reviews planning artifacts for correctness       |
| **Approved** | Human                  | Human approves artifacts, unlocking implementation     |
| **Consumed** | Implementation Agent   | Approved artifacts drive implementation tasks          |

## Planning Agent Artifacts

All produced by the Planning Agent during analysis. Schemas live in `specs/schemas/`.

| Artifact                | Schema                              | Description                                                        | When Produced            |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| `Manifest.json`         | `Manifest.schema.json`              | Top-level run metadata: agent, status, repo URL, artifact paths    | Start of every run       |
| `RunLog.jsonl`          | `RunLogEvent.schema.json`           | Append-only log of skill invocations with inputs, outputs, timing  | Throughout run           |
| `DependencyGraph.json`  | `DependencyGraph.schema.json`       | Directed graph of source files and their import/call dependencies   | After code scan          |
| `RiskAssessment.json`   | `RiskAssessment.schema.json`        | Per-file risk scores (churn, complexity, safety, coverage)          | After dependency analysis|
| `DocCoverage.json`      | `DocCoverage.schema.json`           | Documentation gap analysis with remediation stubs                  | After code scan          |
| `StackAnalysis.json`    | `StackAnalysis.schema.json`         | Technology inventory: languages, frameworks, build tools, runtimes | After code scan          |
| `MigrationOptions.json` | `MigrationOptions.schema.json`      | Candidate migration paths scored by effort, risk, ecosystem fit    | After stack analysis     |
| `UserDecisions.json`    | `UserDecisions.schema.json`         | Captured user responses to planning questions                      | After user interview     |
| `ModernizationPlan.json`| `ModernizationPlan.schema.json`     | Phased migration plan with tasks and dependencies                  | End of planning          |

## Implementation Agent Artifacts

Produced by the Implementation Agent after consuming approved planning artifacts.

| Artifact                 | Schema                              | Description                                                    | When Produced               |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------- | --------------------------- |
| `ImplementationLog.json` | `ImplementationLog.schema.json`     | Log of code changes performed, linked to plan tasks            | During implementation       |
| `TestScaffold.json`      | `TestScaffold.schema.json`          | Test files to create with target entry points and templates    | Before code changes begin   |

## Artifact Flow

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│  Planning Agent  │         │   Human Review   │         │ Implementation Agent │
│   (read-only)    │────────▶│   & Approval     │────────▶│  (write after appr.) │
└──────────────────┘         └──────────────────┘         └──────────────────────┘
  Produces:                    Reviews:                     Consumes:
  - Manifest.json              - ModernizationPlan.json     - ModernizationPlan.json
  - RunLog.jsonl               - RiskAssessment.json        - DependencyGraph.json
  - DependencyGraph.json       - MigrationOptions.json      - StackAnalysis.json
  - RiskAssessment.json                                     - RiskAssessment.json
  - DocCoverage.json          Approves plan to unlock
  - StackAnalysis.json        implementation               Produces:
  - MigrationOptions.json                                   - ImplementationLog.json
  - UserDecisions.json                                      - TestScaffold.json
  - ModernizationPlan.json
```

> **Key rule:** The Implementation Agent cannot begin work until a human has approved the `ModernizationPlan.json`.

## Validation Requirements

- All artifacts **must** pass schema validation before storage.
- Validation uses [Ajv](https://ajv.js.org/) with strict mode enabled.
- CI enforces validation on every artifact — a failing schema check blocks the pipeline.
- Schemas are the single source of truth and live in `specs/schemas/`.

## Storage Layout

Artifacts are organized by run ID and agent phase:

```
artifacts/
└── <runId>/
    ├── planning/
    │   ├── Manifest.json
    │   ├── RunLog.jsonl
    │   ├── DependencyGraph.json
    │   ├── RiskAssessment.json
    │   ├── DocCoverage.json
    │   ├── StackAnalysis.json
    │   ├── MigrationOptions.json
    │   ├── UserDecisions.json
    │   └── ModernizationPlan.json
    └── implementation/
        ├── ImplementationLog.json
        └── TestScaffold.json
```

All artifacts are persisted to Microsoft Fabric Lakehouse under this layout.

## Determinism

Given the same inputs, the Planning Agent **must** produce identical artifacts:

- **Input identity:** repository content SHA + user profile (decisions)
- **Output guarantee:** byte-identical JSON output for the same input pair
- **Purpose:** enables caching, diffing between runs, and reproducible audits

> Non-deterministic fields (e.g., timestamps in `RunLog.jsonl`) are excluded from the determinism guarantee.
