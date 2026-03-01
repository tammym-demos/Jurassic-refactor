# Policy Enforcement

**TL;DR:** A rule-based access-control engine that gates every agent operation. Six rules are evaluated on every request; all must pass for the operation to be allowed. Read operations are always permitted. Write operations require the correct agent type, an APPROVED gate file, the `--enable-writes` flag, and (optionally) a matching path allowlist.

## Overview

The policy system sits between agent intent and file-system side effects. Before any skill performs a write, create, or delete operation, the `PolicyEnforcer` evaluates the request against all registered rules and returns a `PolicyResult` containing every individual decision plus an overall allow/deny verdict and a human-readable summary.

This design ensures:

- **Defense in depth** — multiple independent rules must all agree.
- **Auditability** — every rule's decision is recorded, even when the overall result is "allowed."
- **Extensibility** — custom rules can be added via `PolicyEnforcer.addRule()`.

## Rules

All six rules are evaluated for every request. The overall result is the logical AND of all decisions.

| # | Rule Name | Description | Applies When |
|---|-----------|-------------|--------------|
| 1 | `read-only-default` | Read operations are always allowed | Every request |
| 2 | `planning-agent-read-only` | Planning Agent cannot write, create, or delete | `agentType === "planning"` and non-read operation |
| 3 | `gate-file-required` | Implementation Agent writes require an APPROVED marker file on disk | `agentType === "implementation"` and non-read operation |
| 4 | `enable-writes-flag` | Implementation Agent writes require explicit `enableWrites: true` | `agentType === "implementation"` and non-read operation |
| 5 | `ci-environment` | In CI, gate file must exist for any write operation | `ciEnvironment === true` and non-read operation |
| 6 | `path-allowlist` | Target path must match at least one allowed glob pattern (if configured) | `allowedPaths` is non-empty and non-read operation |

## Decision Flow

```
           ┌──────────────┐
           │  Operation?  │
           └──────┬───────┘
                  │
          ┌───────▼────────┐
          │ op === "read"? │──── yes ──▶ ALLOWED
          └───────┬────────┘
                  │ no
          ┌───────▼──────────────┐
          │ agentType=planning?  │──── yes ──▶ DENIED (rule 2)
          └───────┬──────────────┘
                  │ no (implementation)
          ┌───────▼──────────────┐
          │ gate file exists?    │──── no ───▶ DENIED (rule 3)
          └───────┬──────────────┘
                  │ yes
          ┌───────▼──────────────┐
          │ enableWrites=true?   │──── no ───▶ DENIED (rule 4)
          └───────┬──────────────┘
                  │ yes
          ┌───────▼──────────────┐
          │ CI + gate missing?   │──── yes ──▶ DENIED (rule 5)
          └───────┬──────────────┘
                  │ no
          ┌───────▼──────────────┐
          │ path in allowlist?   │──── no ───▶ DENIED (rule 6)
          └───────┬──────────────┘
                  │ yes (or no allowlist)
                  ▼
               ALLOWED
```

> Note: all rules are evaluated regardless; the diagram shows the logical effect. The `PolicyEnforcer` collects every decision for audit purposes.

## Examples

### Allowed — Implementation Agent write with all prerequisites

| Field | Value |
|-------|-------|
| `agentType` | `implementation` |
| `operation` | `write` |
| `targetPath` | `src/auth/login.ts` |
| `enableWrites` | `true` |
| `gateFilePath` | `artifacts/run-1/planning/APPROVED` (exists) |
| `allowedPaths` | `["src/**"]` |

**Result:** `overallAllowed: true` — all six rules pass.

### Denied — Planning Agent attempting a write

| Field | Value |
|-------|-------|
| `agentType` | `planning` |
| `operation` | `create` |

**Result:** `overallAllowed: false` — rule 2 (`planning-agent-read-only`) denies.

### Denied — Missing gate file

| Field | Value |
|-------|-------|
| `agentType` | `implementation` |
| `operation` | `write` |
| `enableWrites` | `true` |
| `gateFilePath` | `artifacts/run-1/planning/APPROVED` (does not exist) |

**Result:** `overallAllowed: false` — rule 3 (`gate-file-required`) denies.

### Denied — Path outside allowlist

| Field | Value |
|-------|-------|
| `agentType` | `implementation` |
| `operation` | `write` |
| `targetPath` | `node_modules/pkg/index.js` |
| `allowedPaths` | `["src/**", "tests/**"]` |

**Result:** `overallAllowed: false` — rule 6 (`path-allowlist`) denies.

## Integration with the Agent Workflow

1. The Orchestrator creates the `APPROVED` marker after human review (see [`agents.md`](./agents.md)).
2. The Implementation Agent calls `PolicyEnforcer.checkAccess()` before every file mutation.
3. If denied, the agent logs the `PolicyResult.summary` and skips the operation.
4. In CI pipelines (`ciEnvironment: true`), rule 5 adds an extra gate-file check independent of agent type, ensuring automated runs cannot bypass approval.

## RBAC Considerations

- **Planning Agent** — effectively a read-only role; rules 2 blocks all mutations.
- **Implementation Agent** — a gated write role; rules 3, 4, and 6 constrain what it can change.
- **Custom roles** — add rules via `PolicyEnforcer.addRule()` to create additional roles (e.g., a `reviewer` role that can only annotate).

## Glob Matching

Path allowlist patterns use a built-in glob matcher supporting:

- `*` — matches any characters within a single path segment.
- `**` — matches any characters across multiple path segments.
- `?` — matches a single non-separator character.

Backslashes are normalized to forward slashes before matching.

## Source

- Skill implementation: `packages/skills/src/policy.ts`
- Skill-level spec: [`skills/policy.md`](./skills/policy.md)
