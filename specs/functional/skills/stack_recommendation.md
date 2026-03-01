# Stack Recommendation

## Overview

Synthesizes a stack fingerprint, migration options, and user decisions to produce ranked recommendations with pros/cons, risks, and prerequisites. This skill acts as the final decision layer that combines upstream analysis (stack fingerprint, migration evaluation, user dialog) into actionable recommendations.

## Interfaces

### StackRecommendationInput

```typescript
interface StackRecommendationInput {
  stackFingerprint: {
    languages: Array<{ name: string; confidence: number }>;
    frameworks: Array<{ name: string; confidence: number }>;
  };
  migrationOptions: Array<{
    id: string;
    name: string;
    targetStack: string[];
    scores: {
      effort: number;
      risk: number;
      ecosystemSupport: number;
      teamReadiness: number;
      overall: number;
    };
    pros: string[];
    cons: string[];
    prerequisites: string[];
  }>;
  userDecisions?: {
    decisions: Array<{ questionId: string; answer: string | number }>;
  };
}
```

### Recommendation

```typescript
interface Recommendation {
  rank: number;
  migrationId: string;
  name: string;
  adjustedScore: number;
  pros: string[];
  cons: string[];
  risks: string[];
  prerequisites: string[];
  rationale: string;
  userAligned: boolean;  // whether user decisions favor this option
}
```

### StackRecommendationOutput

```typescript
interface StackRecommendationOutput {
  recommendations: Recommendation[];
  topRecommendation: string;  // migration ID
  summary: string;
  userInfluence: string;      // how user decisions affected ranking
}
```

## Behavior

- Implements the `Skill` interface with `name = "stack_recommendation"`
- `execute()` accepts a `StackRecommendationInput` and returns a `StackRecommendationOutput`
- If no migration options are provided, returns empty recommendations with explanatory summary

### Score Adjustment

Starting from each migration option's base `overall` score, user decisions adjust the ranking:

| User Decision | Effect |
|--------------|--------|
| `priority = "cost reduction"` | Boost low-effort options (effort < 50 receives a bonus) |
| `timeline = "short"` | Penalize high-effort options (effort > 50 receives a penalty) |
| `expertise > 3` | Boost score based on expertise level |
| No decisions | No adjustment — ranking based on base scores only |

Options where user decisions resulted in a positive adjustment are marked `userAligned = true`.

### Risk Generation

Risks are derived from two sources:

1. **Cons** — all cons from the migration option are included as risks
2. **Score thresholds**:
   - `effort > 70` → "High effort required — may exceed budget or timeline"
   - `risk > 60` → "Elevated risk score — careful planning and validation needed"

### Rationale

Each recommendation includes a rationale string explaining:
- Its rank and adjusted score
- Its base overall score
- Whether user preferences align
- Any notes about high effort or elevated risk

### Ranking

- Options are sorted by adjusted score descending (highest = best)
- The top-scoring option is returned as `topRecommendation`
- `summary` describes the top recommendation and total options evaluated
- `userInfluence` describes which user decisions were applied
