export class TelemetryService {
  private enabled: boolean;

  constructor() {
    this.enabled = !!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  }

  trackAgentEvent(agentName: string, event: string, properties?: Record<string, string>): void {
    if (!this.enabled) return;
    console.log(`[telemetry] agent=${agentName} event=${event}`, properties ?? '');
  }

  trackSkillInvocation(skillName: string, durationMs: number, success: boolean): void {
    if (!this.enabled) return;
    console.log(`[telemetry] skill=${skillName} duration=${durationMs}ms success=${success}`);
  }

  trackRunCompletion(runId: string, agentName: string, success: boolean, durationMs: number): void {
    if (!this.enabled) return;
    console.log(`[telemetry] run=${runId} agent=${agentName} success=${success} duration=${durationMs}ms`);
  }

  async flush(): Promise<void> {
    // App Insights SDK integration deferred — no-op for now
  }
}
