# Migration Evaluator

## Overview

Evaluates available migration paths for a codebase by cross-referencing the current stack fingerprint against a catalog of known migration options. Each path is scored across multiple dimensions — effort, risk, ecosystem support, and team readiness — to produce a ranked list of recommendations.

## Interfaces

### MigrationEvaluatorInput

```typescript
interface MigrationEvaluatorInput {
  stackFingerprint: {
    languages: Array<{ name: string; version?: string; confidence: number }>;
    frameworks: Array<{ name: string; version?: string; confidence: number }>;
    buildTools: Array<{ name: string }>;
  };
  teamExpertise?: Record<string, number>; // technology → skill level (1-5)
}
```

### MigrationPath

```typescript
interface MigrationPath {
  id: string;
  name: string;
  description: string;
  sourceStack: string[];
  targetStack: string[];
  scores: {
    effort: number;          // 0-100, lower is easier
    risk: number;            // 0-100, lower is safer
    ecosystemSupport: number; // 0-100, higher is better
    teamReadiness: number;   // 0-100, higher is better
    overall: number;         // weighted composite
  };
  pros: string[];
  cons: string[];
  prerequisites: string[];
}
```

### MigrationEvaluatorOutput

```typescript
interface MigrationEvaluatorOutput {
  options: MigrationPath[];
  recommendedId: string;
  rationale: string;
}
```

## Migration Catalog

| ID | Name | Source | Target |
|----|------|--------|--------|
| c-to-cpp | C → C++ | C | C++ |
| c-to-rust | C → Rust | C | Rust |
| python2-to-python3 | Python 2 → Python 3 | Python | Python |
| js-to-ts | JavaScript → TypeScript | JavaScript | TypeScript |
| vue2-to-vue3 | Vue 2 → Vue 3 | Vue | Vue |
| jquery-to-react | jQuery → React | jQuery | React |
| express-to-fastify | Express → Fastify | Express | Fastify |
| makefile-to-cmake | Makefile → CMake | Make | CMake |

## Behavior

- Implements the `Skill` interface with `name = "migration_evaluator"`
- `execute()` accepts a `MigrationEvaluatorInput` and returns a `MigrationEvaluatorOutput`
- Matches catalog entries whose `sourceStack` elements all appear in the stack fingerprint (languages, frameworks, or build tools)
- If no catalog entries match, returns empty `options`, empty `recommendedId`, and explanatory `rationale`

### Scoring

Each matched migration path is scored across four dimensions:

| Dimension | Range | Meaning | Source |
|-----------|-------|---------|--------|
| effort | 0-100 | Lower is easier | Catalog baseline |
| risk | 0-100 | Lower is safer | Catalog baseline |
| ecosystemSupport | 0-100 | Higher is better | Catalog baseline |
| teamReadiness | 0-100 | Higher is better | Derived from `teamExpertise` input |

**Team readiness** is computed from the `teamExpertise` map:
- If no expertise data is provided, defaults to 50
- Maps the 1-5 skill level to 0-100 scale: `((level - 1) / 4) * 100`
- Averages across all target stack technologies

**Overall score** is a weighted composite where effort and risk are inverted (since lower is better for those):
```
overall = (100 - effort) * 0.25 + (100 - risk) * 0.25 + ecosystemSupport * 0.25 + teamReadiness * 0.25
```

### Ranking

- Options are sorted by overall score descending (highest = best)
- The top-scoring option is recommended via `recommendedId`
- `rationale` explains why the recommended option was chosen
