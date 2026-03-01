import { describe, it, expect, beforeEach, vi } from "vitest";
import { PlanningAgent } from "../planning/index.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("PlanningAgent", () => {
  let agent: PlanningAgent;
  let tempDir: string;
  let fixturePath: string;
  let profilePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "planning-test-"));
    fixturePath = join(tempDir, "fixture.json");
    profilePath = join(tempDir, "profile.json");
    writeFileSync(fixturePath, JSON.stringify({ repoUrl: "https://github.com/example/test-repo" }));
    writeFileSync(profilePath, JSON.stringify({ name: "test" }));
    agent = new PlanningAgent();
  });

  it("has name 'planning' and mode 'read-only'", () => {
    expect(agent.name).toBe("planning");
    expect(agent.mode).toBe("read-only");
  });

  it("initializes without error", async () => {
    await expect(
      agent.initialize({
        runId: "test-run",
        repoPath: tempDir,
        fixturePath,
        profilePath,
        artifactsDir: join(tempDir, "artifacts"),
      }),
    ).resolves.toBeUndefined();
  });

  it("runs and produces artifacts", async () => {
    await agent.initialize({
      runId: "test-run",
      repoPath: tempDir,
      fixturePath,
      profilePath,
      artifactsDir: join(tempDir, "artifacts"),
    });

    await expect(agent.run()).resolves.toBeUndefined();

    // Verify manifest was written
    const { readFileSync } = await import("fs");
    const manifestPath = join(tempDir, "artifacts", "test-run", "planning", "Manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.agent).toBe("planning");
    expect(manifest.status).toBe("completed");
    expect(manifest.runId).toBe("test-run");
  });

  it("throws if run() called before initialize()", async () => {
    await expect(agent.run()).rejects.toThrow("not initialized");
  });

  it("lists produced artifact types", () => {
    expect(agent.producedArtifacts).toContain("Manifest");
    expect(agent.producedArtifacts).toContain("StackAnalysis");
    expect(agent.producedArtifacts).toContain("ModernizationPlan");
  });
});
