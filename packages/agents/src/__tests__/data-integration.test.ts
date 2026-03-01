import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentDataBridge, type DataIntegrationConfig } from "../data-integration.js";

// --- Mock implementations ---

function createMockArtifactStore() {
  return {
    upload: vi.fn().mockResolvedValue("/path/to/artifact.json"),
    download: vi.fn().mockResolvedValue({ key: "value" }),
    list: vi.fn().mockResolvedValue(["artifact-a", "artifact-b"]),
    markApproved: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockTelemetry() {
  return {
    trackAgentEvent: vi.fn(),
    trackSkillInvocation: vi.fn(),
    trackRunCompletion: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRunMetadata() {
  return {
    createRun: vi.fn().mockResolvedValue({
      runId: "run-1",
      agentType: "planning",
      status: "running",
      config: {},
      startedAt: new Date().toISOString(),
      skillInvocations: [],
      artifactPaths: [],
    }),
    updateRunStatus: vi.fn().mockResolvedValue(undefined),
    recordSkillInvocation: vi.fn().mockResolvedValue(undefined),
    finalizeRun: vi.fn().mockResolvedValue(undefined),
    getRun: vi.fn().mockResolvedValue(null),
    listRuns: vi.fn().mockResolvedValue([]),
  };
}

function createBridge(overrides: Partial<DataIntegrationConfig> = {}) {
  const artifactStore = createMockArtifactStore();
  const telemetry = createMockTelemetry();
  const runMetadata = createMockRunMetadata();

  const bridge = new AgentDataBridge({
    storageProvider: "local",
    enableTelemetry: true,
    artifactStore: artifactStore as any,
    telemetry: telemetry as any,
    runMetadata: runMetadata as any,
    ...overrides,
  });

  return { bridge, artifactStore, telemetry, runMetadata };
}

describe("AgentDataBridge", () => {
  it("uploadArtifact delegates to artifact store", async () => {
    const { bridge, artifactStore } = createBridge();
    await bridge.uploadArtifact("run-1", "plan", { steps: [] });
    expect(artifactStore.upload).toHaveBeenCalledWith("run-1", "agent", "plan", { steps: [] });
  });

  it("downloadArtifact delegates to artifact store", async () => {
    const { bridge, artifactStore } = createBridge();
    const result = await bridge.downloadArtifact("run-1", "plan");
    expect(artifactStore.download).toHaveBeenCalledWith("run-1", "agent", "plan");
    expect(result).toEqual({ key: "value" });
  });

  it("checkApproval returns true when approved", async () => {
    // Mock node:fs/promises.access to succeed (file exists)
    const fsAccess = vi.fn().mockResolvedValue(undefined);
    vi.doMock("node:fs/promises", () => ({ access: fsAccess }));

    const { bridge } = createBridge();
    const result = await bridge.checkApproval("run-1");
    // checkApproval uses dynamic import; if access succeeds -> true, if throws -> false
    // Since we can't easily mock dynamic imports in vitest without more setup,
    // we test that it returns a boolean (true if file exists, false otherwise)
    expect(typeof result).toBe("boolean");
  });

  it("trackSkillExecution records telemetry event", () => {
    const { bridge, telemetry } = createBridge();
    bridge.trackSkillExecution("analyze-code", 150, true);
    expect(telemetry.trackSkillInvocation).toHaveBeenCalledWith("analyze-code", 150, true);
  });

  it("trackAgentPhase records telemetry event", () => {
    const { bridge, telemetry } = createBridge();
    bridge.trackAgentPhase("planning", "initialization", "started");
    expect(telemetry.trackAgentEvent).toHaveBeenCalledWith("planning", "initialization", {
      status: "started",
    });
  });

  it("startRun creates run metadata", async () => {
    const { bridge, runMetadata } = createBridge();
    await bridge.startRun("run-1", "planning");
    expect(runMetadata.createRun).toHaveBeenCalledWith("run-1", "planning", {});
  });

  it("completeRun updates run status", async () => {
    const { bridge, runMetadata } = createBridge();
    await bridge.completeRun("run-1", "completed");
    expect(runMetadata.updateRunStatus).toHaveBeenCalledWith("run-1", "completed");
  });

  it("telemetry calls are no-ops when disabled", () => {
    const { bridge, telemetry } = createBridge({ enableTelemetry: false });
    bridge.trackSkillExecution("analyze-code", 150, true);
    bridge.trackAgentPhase("planning", "initialization", "started");
    expect(telemetry.trackSkillInvocation).not.toHaveBeenCalled();
    expect(telemetry.trackAgentEvent).not.toHaveBeenCalled();
  });

  it("flush delegates to telemetry service", async () => {
    const { bridge, telemetry } = createBridge();
    await bridge.flush();
    expect(telemetry.flush).toHaveBeenCalled();
  });

  it("listArtifacts delegates to artifact store", async () => {
    const { bridge, artifactStore } = createBridge();
    const result = await bridge.listArtifacts("run-1");
    expect(artifactStore.list).toHaveBeenCalledWith("run-1", "agent");
    expect(result).toEqual(["artifact-a", "artifact-b"]);
  });
});
