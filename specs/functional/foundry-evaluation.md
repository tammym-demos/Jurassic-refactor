# Foundry Evaluation

**TL;DR:** Every agent run produces an `EvaluationReport.json` that scores output quality across three metrics — artifact completeness, schema validation rate, and determinism score. Reports are validated against `specs/schemas/EvaluationReport.schema.json` and persisted to Application Insights.

## Overview

The evaluation framework measures agent output quality to catch regressions, ensure schema compliance, and maintain deterministic behavior. It runs automatically after each agent execution and produces a structured report.

## EvaluationReport Schema

Each evaluation produces an `EvaluationReport.json` validated against `specs/schemas/EvaluationReport.schema.json`. See the schema file for the full definition.

### Top-Level Fields

| Field         | Type     | Description                                       |
| ------------- | -------- | ------------------------------------------------- |
| `runId`       | string   | Run identifier matching the `Manifest.json` runId |
| `evaluatedAt` | datetime | ISO-8601 timestamp of the evaluation              |
| `metrics`     | object   | Aggregate quality metrics (see below)             |
| `status`      | enum     | Overall result: `pass`, `fail`, or `warning`      |
| `details`     | array    | Per-artifact evaluation results                   |

## Metrics

### Artifact Completeness

Measures the fraction of expected artifacts that were actually produced by the agent run.

```
artifactCompleteness = (artifacts produced) / (artifacts expected)
```

- A planning run expects 9 artifacts (Manifest through ModernizationPlan).
- An implementation run expects 2 artifacts (ImplementationLog, TestScaffold).
- Score of `1.0` means all expected artifacts were produced.

### Schema Validation Rate

Measures the fraction of produced artifacts that pass Ajv schema validation.

```
schemaValidationRate = (artifacts passing validation) / (artifacts produced)
```

- Every artifact is validated against its corresponding schema in `specs/schemas/`.
- A score below `1.0` indicates schema violations that must be fixed.

### Determinism Score

Measures reproducibility by comparing the current run's artifacts against a prior run with the same inputs.

```
determinismScore = (byte-identical artifacts) / (comparable artifacts)
```

- Excludes non-deterministic fields (timestamps, run IDs) from comparison.
- A score of `1.0` means the agent produces identical output for identical input.
- Only computed when a prior run with matching inputs exists; otherwise defaults to `1.0`.

## Status Thresholds

| Status      | Condition                                                      |
| ----------- | -------------------------------------------------------------- |
| **pass**    | All three metrics ≥ 0.95                                       |
| **warning** | Any metric between 0.80 and 0.95                               |
| **fail**    | Any metric < 0.80, or schema validation rate < 1.0             |

## Evaluation Triggers

| Trigger              | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| **Post-run**         | Automatically after every agent run completes                |
| **Pull request**     | CI evaluates agent output on PR branches                     |
| **Scheduled**        | Nightly evaluation against a fixed set of reference repos    |

## Regression Detection

The evaluation framework compares reports across runs to detect regressions:

1. **Metric comparison:** Current metrics are compared against the most recent passing run.
2. **Delta thresholds:** A drop of more than 0.05 in any metric triggers a warning.
3. **Artifact diff:** When determinism score drops, the framework identifies which artifacts changed.

## Telemetry Integration

Evaluation results are sent to **Application Insights** as custom events:

| Event Name               | Properties                                           |
| ------------------------ | ---------------------------------------------------- |
| `EvaluationCompleted`    | `runId`, `status`, all three metric values            |
| `EvaluationRegression`   | `runId`, `metric`, `previousValue`, `currentValue`    |

Custom metrics are also emitted for dashboard tracking:

- `evaluation.artifactCompleteness`
- `evaluation.schemaValidationRate`
- `evaluation.determinismScore`

These flow into the Application Insights instance configured in `infra/foundry.config.json`.

## Per-Artifact Details

The `details` array contains one entry per expected artifact:

| Field      | Type   | Description                                    |
| ---------- | ------ | ---------------------------------------------- |
| `artifact` | string | Artifact file name (e.g., `Manifest.json`)     |
| `result`   | enum   | `pass`, `fail`, or `missing`                   |
| `message`  | string | Optional explanation for failures              |

## Implementation

The evaluation logic lives in `packages/foundry/src/evaluation.ts` (see issue #52 for implementation details).
