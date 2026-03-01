# Policy

## Overview

Enforces access control policies for agent operations. Implements a read-only default, validates agent permissions, checks for gate file (APPROVED marker), enable-writes flag, CI environment constraints, and path allowlists. All rules are evaluated for every request to support auditability.

## Interfaces

### PolicyInput

```typescript
interface PolicyInput {
  agentType: "planning" | "implementation";
  operation: "read" | "write" | "create" | "delete";
  targetPath: string;
  enableWrites: boolean;
  gateFilePath?: string;   // Path to APPROVED marker file
  ciEnvironment?: boolean;  // Whether running in CI
  allowedPaths?: string[];  // Glob patterns for allowed write paths
}
```

### PolicyDecision

```typescript
interface PolicyDecision {
  allowed: boolean;
  reason: string;
  rule: string;  // Which policy rule was applied
}
```

### PolicyResult

```typescript
interface PolicyResult {
  decisions: PolicyDecision[];
  overallAllowed: boolean;
  agentType: string;
  summary: string;
}
```

### PolicyRule

```typescript
interface PolicyRule {
  name: string;
  evaluate(input: PolicyInput): PolicyDecision;
}
```

## Rules

| # | Rule | Description |
|---|------|-------------|
| 1 | read-only-default | All read operations are always allowed |
| 2 | planning-agent-read-only | Planning Agent cannot perform write/create/delete operations |
| 3 | gate-file-required | Implementation Agent writes require an APPROVED gate file on disk |
| 4 | enable-writes-flag | Implementation Agent writes require `enableWrites: true` |
| 5 | ci-environment | In CI, gate file must exist for write operations |
| 6 | path-allowlist | If configured, target path must match at least one allowed glob pattern |

## Behavior

- All rules are evaluated for every request; all must pass for the operation to be allowed.
- All decisions (including passing ones) are returned in the result for audit purposes.
- The `PolicyEnforcer` class holds the rule set and supports adding custom rules via `addRule()`.
- The `PolicySkill` class implements the `Skill` interface and delegates to `PolicyEnforcer`.
- Glob matching supports `*` (single segment) and `**` (cross-segment) wildcards.
