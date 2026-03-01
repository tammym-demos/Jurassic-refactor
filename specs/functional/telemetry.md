# Telemetry

**TL;DR:** The `TelemetryService` (`packages/data/src/telemetry.ts`) emits structured events for agent lifecycle, skill invocations, and run completion. It integrates with Azure Application Insights via connection string. When no connection string is configured, all tracking methods are safe no-ops — local development produces zero telemetry traffic.

## Overview

Telemetry serves two purposes:

1. **Operational visibility** — Track agent runs, skill durations, and failure rates in production.
2. **Performance analysis** — Identify slow skills, compare run durations across repositories, and spot regressions.

## TelemetryService API

Defined in `packages/data/src/telemetry.ts`:

| Method                 | Signature                                                                         | Description                                |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `trackAgentEvent`      | `(agentName, event, properties?) → void`                                          | Track agent lifecycle events               |
| `trackSkillInvocation` | `(skillName, durationMs, success) → void`                                         | Track individual skill execution           |
| `trackRunCompletion`   | `(runId, agentName, success, durationMs) → void`                                  | Track overall run completion               |
| `flush`                | `() → Promise<void>`                                                              | Flush pending telemetry (no-op until SDK)   |

### Initialization

```typescript
const telemetry = new TelemetryService();
```

The constructor checks for `APPLICATIONINSIGHTS_CONNECTION_STRING`. If the variable is set, telemetry is enabled. If unset, all methods return immediately — no errors, no output.

## Event Types

### Agent Lifecycle Events

Tracked via `trackAgentEvent(agentName, event, properties?)`:

| Event               | When Emitted                    | Properties                          |
| ------------------- | ------------------------------- | ----------------------------------- |
| `agent.started`     | Agent `run()` begins            | `{ runId }`                         |
| `agent.completed`   | Agent `run()` succeeds          | `{ runId, artifactCount }`          |
| `agent.failed`      | Agent `run()` throws            | `{ runId, error }`                  |
| `approval.checked`  | Orchestrator checks gate        | `{ runId, approved: "true"/"false" }` |

### Skill Invocations

Tracked via `trackSkillInvocation(skillName, durationMs, success)`:

```typescript
const start = Date.now();
try {
  await skill.execute(context);
  telemetry.trackSkillInvocation('risk_scoring', Date.now() - start, true);
} catch (err) {
  telemetry.trackSkillInvocation('risk_scoring', Date.now() - start, false);
  throw err;
}
```

**Metrics derived:**
- **Duration** — wall-clock milliseconds per skill execution.
- **Success rate** — ratio of successful invocations to total invocations.

### Run Completion

Tracked via `trackRunCompletion(runId, agentName, success, durationMs)`:

```typescript
telemetry.trackRunCompletion(runId, 'planning', true, totalDurationMs);
```

**Metrics derived:**
- **Run duration** — total wall-clock time for an agent run.
- **Artifact count** — number of artifacts produced (passed via agent events).

## No-Op Behavior

When `APPLICATIONINSIGHTS_CONNECTION_STRING` is not set:

- All `track*` methods return immediately without side effects.
- `flush()` resolves immediately.
- No console output, no network calls, no errors.

This ensures local development and CI runs without Azure infrastructure work identically — the telemetry code path is always exercised, but produces no output.

## Application Insights Integration

### Infrastructure

Provisioned via `infra/modules/app-insights.bicep`:

- **Application Insights** resource with `DisableLocalAuth: true` — forces `DefaultAzureCredential`.
- **Log Analytics workspace** backing store with 30-day retention.
- Connection string passed to Container Apps via the `APPLICATIONINSIGHTS_CONNECTION_STRING` environment variable.

### Authentication

Application Insights is configured with `DisableLocalAuth: true`, meaning the instrumentation key alone is not sufficient. The agent must authenticate using `DefaultAzureCredential` with the **Monitoring Metrics Publisher** role assigned.

| RBAC Role                       | Scope                | Purpose                                 |
| ------------------------------- | -------------------- | --------------------------------------- |
| Monitoring Metrics Publisher    | Application Insights | Publish custom metrics and events       |

### Future: SDK Integration

The current implementation logs to `console.log` as a placeholder. Full Application Insights SDK integration will:

1. Initialize the `@azure/monitor-opentelemetry` or `applicationinsights` SDK with the connection string.
2. Authenticate using `DefaultAzureCredential` from `@jurassic/auth`.
3. Replace `console.log` calls with `trackEvent()` and `trackMetric()` SDK methods.
4. Implement `flush()` to drain the telemetry buffer before process exit.

## Environment Variables

| Variable                                  | Required | Default | Description                                  |
| ----------------------------------------- | -------- | ------- | -------------------------------------------- |
| `APPLICATIONINSIGHTS_CONNECTION_STRING`   | No       | —       | Enables telemetry when set                   |
