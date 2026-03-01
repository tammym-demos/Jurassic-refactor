import { describe, it, expect, beforeEach } from "vitest";
import { Orchestrator } from "../orchestrator.js";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AgentContext } from "../base.js";

describe("Orchestrator", () => {
  let orchestrator: Orchestrator;
  let tempDir: string;
  let context: AgentContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orchestrator-test-"));
    const fixturePath = join(tempDir, "fixture.json");
    const profilePath = join(tempDir, "profile.json");
    writeFileSync(fixturePath, JSON.stringify({ repoUrl: "https://github.com/example/test-repo" }));
    writeFileSync(profilePath, JSON.stringify({ name: "test" }));

    context = {
      runId: "orch-test-run",
      repoPath: tempDir,
      fixturePath,
      profilePath,
      artifactsDir: join(tempDir, "artifacts"),
    };
    orchestrator = new Orchestrator();
  });

  it("executes 'plan' command and produces artifacts", async () => {
    const result = await orchestrator.execute({
      command: "plan",
      context,
    });
    expect(result.status).toBe("completed");
    expect(result.command).toBe("plan");
    expect(result.artifactPaths.length).toBeGreaterThan(0);
  });

  it("blocks 'implement' without approval", async () => {
    const result = await orchestrator.execute({
      command: "implement",
      context,
    });
    expect(result.status).toBe("awaiting-approval");
    expect(result.error).toContain("approved");
  });

  it("allows 'implement' with planApproved flag", async () => {
    // Run planning first to produce required artifacts
    await orchestrator.execute({ command: "plan", context });

    const result = await orchestrator.execute({
      command: "implement",
      context,
      planApproved: true,
    });
    expect(result.status).toBe("completed");
    expect(result.command).toBe("implement");
  });

  it("full-pipeline stops at approval gate", async () => {
    const result = await orchestrator.execute({
      command: "full-pipeline",
      context,
    });
    expect(result.status).toBe("awaiting-approval");
    expect(result.artifactPaths.length).toBeGreaterThan(0);
  });

  it("full-pipeline runs implementation when approved", async () => {
    const result = await orchestrator.execute({
      command: "full-pipeline",
      context,
      planApproved: true,
    });
    expect(result.status).toBe("completed");
    expect(result.artifactPaths.length).toBeGreaterThan(0);
  });
});
