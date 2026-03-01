# Risk Scoring Skill

## Overview

Combines churn, complexity, and safety analysis data to produce a ranked list of risk items with composite scores and supporting evidence.

## Interfaces

### RiskScoringInput

```typescript
interface RiskScoringInput {
  repoPath: string;                    // Path to repository
  churnData?: {                        // Output from git_churn skill
    hotspots: Array<{ path: string; changeCount: number; churnScore: number }>;
  };
  complexityData?: {                   // Output from complexity_metrics skill
    files: Array<{ filePath: string; avgCyclomaticComplexity: number; maxNestingDepth: number; loc: number }>;
  };
  safetyData?: {                       // Output from safety_path_analysis skill
    safetyIndicators: Array<{ filePath: string; severityMultiplier: number; type: string }>;
    highRiskFiles: string[];
  };
}
```

### RiskScoringOutput

```typescript
interface RiskScoringOutput {
  items: RiskItem[];
  summary: {
    totalFiles: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    averageScore: number;
  };
}
```

### RiskItem

```typescript
interface RiskItem {
  filePath: string;
  overallScore: number;               // 0-100 composite score
  churnScore: number;                 // 0-100
  complexityScore: number;            // 0-100
  safetyScore: number;                // 0-100
  evidence: string[];                 // Human-readable reasons
  severity: "critical" | "high" | "medium" | "low";
}
```

## Behavior

- Implements `Skill` interface with `name = "risk_scoring"`
- Collects all unique file paths from churn, complexity, and safety data
- Computes per-file component scores:
  - **Churn score**: normalized `changeCount / maxChangeCount × 100`
  - **Complexity score**: weighted blend of cyclomatic complexity (70%) and nesting depth (30%), each capped at 100
  - **Safety score**: based on indicator count × severity multiplier, capped at 100
- Overall score = weighted average: churn 30%, complexity 40%, safety 30%
- Severity thresholds: critical ≥ 80, high ≥ 60, medium ≥ 40, low < 40
- Evidence lists human-readable reasons for each contributing factor
- Results sorted by overall score descending
- Missing input data (e.g., no churnData) results in that component scoring 0
- Summary includes file counts per severity and average score
