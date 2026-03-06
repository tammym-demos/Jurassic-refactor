import { ArtifactStore } from "@jurassic/data/artifact-store";
import { TelemetryService } from "@jurassic/data/telemetry";
import { RunMetadataService } from "@jurassic/data/run-metadata";

export interface DataIntegrationConfig {
  storageProvider: "local" | "fabric";
  enableTelemetry: boolean;
  artifactStore?: ArtifactStore;
  telemetry?: TelemetryService;
  runMetadata?: RunMetadataService;
}

/**
 * Bridge between agent layer and underlying data services.
 * Wraps ArtifactStore, TelemetryService, and RunMetadataService with
 * agent-specific convenience methods.
 */
export class AgentDataBridge {
  private artifactStore: ArtifactStore;
  private telemetry: TelemetryService;
  private runMetadata: RunMetadataService;
  private enableTelemetry: boolean;

  constructor(config: DataIntegrationConfig) {
    this.artifactStore = config.artifactStore ?? new ArtifactStore();
    this.telemetry = config.telemetry ?? new TelemetryService();
    this.runMetadata = config.runMetadata ?? new RunMetadataService();
    this.enableTelemetry = config.enableTelemetry;
  }

  // --- Artifact operations ---

  async uploadArtifact(runId: string, name: string, data: unknown): Promise<void> {
    await this.artifactStore.upload(runId, "agent", name, data);
  }

  async downloadArtifact(runId: string, name: string): Promise<unknown> {
    return this.artifactStore.download(runId, "agent", name);
  }

  async listArtifacts(runId: string): Promise<string[]> {
    return this.artifactStore.list(runId, "agent");
  }

  async checkApproval(runId: string): Promise<boolean> {
    try {
      const artifacts = await this.artifactStore.list(runId, "agent");
      // markApproved writes an APPROVED file in the run directory;
      // we check by attempting to read it via the store's directory listing
      // at the run level (not agent level). Use a filesystem check instead.
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const approvedPath = path.join("artifacts", runId, "APPROVED");
      await fs.access(approvedPath);
      return true;
    } catch {
      return false;
    }
  }

  // --- Telemetry ---

  trackSkillExecution(skillName: string, durationMs: number, success: boolean): void {
    if (!this.enableTelemetry) return;
    this.telemetry.trackSkillInvocation(skillName, durationMs, success);
  }

  trackAgentPhase(agentType: string, phase: string, status: string): void {
    if (!this.enableTelemetry) return;
    this.telemetry.trackAgentEvent(agentType, phase, { status });
  }

  // --- Run metadata ---

  async startRun(runId: string, agentType: string): Promise<void> {
    const type = agentType as "planning" | "implementation";
    await this.runMetadata.createRun(runId, type, {});
  }

  async completeRun(runId: string, status: "completed" | "failed"): Promise<void> {
    await this.runMetadata.updateRunStatus(runId, status);
  }

  async flush(): Promise<void> {
    await this.telemetry.flush();
  }
}
