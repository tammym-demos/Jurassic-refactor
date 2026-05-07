import { ArtifactStore } from "@jurassic/data/artifact-store";
import { TelemetryService } from "@jurassic/data/telemetry";
import { RunMetadataService } from "@jurassic/data/run-metadata";
import type { LakehouseTables, RunRecord, SkillInvocationRecord, ArtifactRecord } from "@jurassic/data/lakehouse-tables";

export interface DataIntegrationConfig {
  storageProvider: "local" | "fabric";
  enableTelemetry: boolean;
  artifactStore?: ArtifactStore;
  telemetry?: TelemetryService;
  runMetadata?: RunMetadataService;
  repoUrl?: string;
  branch?: string;
}

/**
 * Bridge between agent layer and underlying data services.
 * Wraps ArtifactStore, TelemetryService, and RunMetadataService with
 * agent-specific convenience methods.
 * 
 * When storageProvider is "fabric", also writes to Lakehouse tables
 * for Microsoft Fabric IQ integration.
 */
export class AgentDataBridge {
  private artifactStore: ArtifactStore;
  private telemetry: TelemetryService;
  private runMetadata: RunMetadataService;
  private enableTelemetry: boolean;
  private storageProvider: "local" | "fabric";
  private lakehouseTables: LakehouseTables | null = null;
  private repoUrl: string;
  private branch: string;
  private currentRunId: string | null = null;
  private invocationCounter = 0;

  constructor(config: DataIntegrationConfig) {
    this.artifactStore = config.artifactStore ?? new ArtifactStore();
    this.telemetry = config.telemetry ?? new TelemetryService();
    this.runMetadata = config.runMetadata ?? new RunMetadataService();
    this.enableTelemetry = config.enableTelemetry;
    this.storageProvider = config.storageProvider;
    this.repoUrl = config.repoUrl ?? "";
    this.branch = config.branch ?? "main";
  }

  /**
   * Initialize Fabric Lakehouse tables (lazy load)
   */
  private async initLakehouse(): Promise<LakehouseTables | null> {
    if (this.storageProvider !== "fabric") return null;
    if (this.lakehouseTables) return this.lakehouseTables;

    try {
      const { LakehouseTables: LTClass } = await import("@jurassic/data/lakehouse-tables");
      this.lakehouseTables = new LTClass();
      return this.lakehouseTables;
    } catch {
      console.warn("Failed to initialize Lakehouse tables - Fabric features disabled");
      return null;
    }
  }

  // --- Artifact operations ---

  async uploadArtifact(runId: string, agentName: string, name: string, data: unknown): Promise<void> {
    await this.artifactStore.upload(runId, agentName, name, data);

    // Write to Lakehouse if Fabric is enabled
    const tables = await this.initLakehouse();
    if (tables) {
      const sizeBytes = JSON.stringify(data).length;
      const artifactRecord: ArtifactRecord = {
        runId,
        agentName,
        artifactName: name,
        schemaName: `${name.replace(".json", "")}.schema.json`,
        createdAt: new Date().toISOString(),
        sizeBytes,
        path: `artifacts/${runId}/${agentName}/${name}`,
        validated: true, // Assume validated if upload succeeds
      };
      await tables.writeArtifact(artifactRecord);
    }
  }

  async downloadArtifact(runId: string, name: string): Promise<unknown> {
    return this.artifactStore.download(runId, "agent", name);
  }

  async listArtifacts(runId: string): Promise<string[]> {
    return this.artifactStore.list(runId, "agent");
  }

  async checkApproval(runId: string): Promise<boolean> {
    try {
      const _artifacts = await this.artifactStore.list(runId, "agent");
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

  /**
   * Track skill execution with Fabric Lakehouse integration
   */
  async trackSkillExecutionAsync(
    runId: string,
    skillName: string,
    startedAt: Date,
    completedAt: Date,
    success: boolean,
    inputSummary: string,
    outputSummary: string,
    confidence?: number,
    errorMessage?: string,
  ): Promise<void> {
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Track in telemetry
    if (this.enableTelemetry) {
      this.telemetry.trackSkillInvocation(skillName, durationMs, success);
    }

    // Write to Lakehouse if Fabric is enabled
    const tables = await this.initLakehouse();
    if (tables) {
      this.invocationCounter++;
      const record: SkillInvocationRecord = {
        runId,
        invocationId: `${runId}-skill-${this.invocationCounter}`,
        skillName,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        status: success ? "success" : "failed",
        inputSummary: this.truncate(inputSummary, 500),
        outputSummary: this.truncate(outputSummary, 500),
        confidence,
        errorMessage,
      };
      await tables.writeSkillInvocation(record);
    }
  }

  trackAgentPhase(agentType: string, phase: string, status: string): void {
    if (!this.enableTelemetry) return;
    this.telemetry.trackAgentEvent(agentType, phase, { status });
  }

  // --- Run metadata ---

  async startRun(runId: string, agentType: string): Promise<void> {
    this.currentRunId = runId;
    const type = agentType as "planning" | "implementation";
    await this.runMetadata.createRun(runId, type, {});

    // Write to Lakehouse if Fabric is enabled
    const tables = await this.initLakehouse();
    if (tables) {
      const record: RunRecord = {
        runId,
        startedAt: new Date().toISOString(),
        agentName: type,
        status: "running",
        repoUrl: this.repoUrl,
        branch: this.branch,
        artifactCount: 0,
      };
      await tables.writeRun(record);
    }
  }

  async completeRun(runId: string, status: "completed" | "failed", artifactCount?: number): Promise<void> {
    await this.runMetadata.updateRunStatus(runId, status);

    // Update Lakehouse if Fabric is enabled
    const tables = await this.initLakehouse();
    if (tables) {
      const record: RunRecord = {
        runId,
        startedAt: new Date().toISOString(), // Will be overwritten by merge
        completedAt: new Date().toISOString(),
        agentName: "planning", // Will be overwritten by merge
        status,
        repoUrl: this.repoUrl,
        branch: this.branch,
        artifactCount: artifactCount ?? 0,
      };
      await tables.writeRun(record);
    }
  }

  async flush(): Promise<void> {
    await this.telemetry.flush();
  }

  // --- Helpers ---

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + "...";
  }
}
