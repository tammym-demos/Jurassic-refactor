import appInsights, { TelemetryClient } from 'applicationinsights';

export class TelemetryService {
  private enabled: boolean;
  private client: TelemetryClient | undefined;

  constructor() {
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    this.enabled = !!connectionString;

    if (this.enabled) {
      appInsights
        .setup(connectionString)
        .setAutoCollectRequests(false)
        .setAutoCollectDependencies(false)
        .setAutoCollectPerformance(false, false)
        .start();
      this.client = appInsights.defaultClient;
    }
  }

  trackAgentEvent(agentName: string, event: string, properties?: Record<string, string>): void {
    if (!this.enabled || !this.client) return;
    this.client.trackEvent({
      name: event,
      properties: { agentName, ...properties },
    });
  }

  trackSkillInvocation(skillName: string, durationMs: number, success: boolean): void {
    if (!this.enabled || !this.client) return;
    this.client.trackDependency({
      dependencyTypeName: 'Skill',
      name: skillName,
      data: skillName,
      duration: durationMs,
      resultCode: success ? 0 : 1,
      success,
    });
  }

  trackRunCompletion(runId: string, agentName: string, success: boolean, durationMs: number): void {
    if (!this.enabled || !this.client) return;
    this.client.trackMetric({
      name: `RunCompletion.${agentName}`,
      value: durationMs,
      properties: { runId, agentName, success: String(success) },
    });
  }

  async flush(): Promise<void> {
    if (!this.client) return;
    await this.client.flush();
  }
}
