import { describe, it, expect, beforeEach } from "vitest";
import { ImplementationAgent } from "../implementation/index.js";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AgentContext } from "../base.js";
import type { Skill } from "@jurassic/skills";

describe("ImplementationAgent", () => {
  let agent: ImplementationAgent;
  let tempDir: string;
  let fixturePath: string;
  let profilePath: string;
  let context: AgentContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "implementation-test-"));
    fixturePath = join(tempDir, "fixture.json");
    profilePath = join(tempDir, "profile.json");
    writeFileSync(fixturePath, JSON.stringify({ repoUrl: "https://github.com/example/test-repo" }));
    writeFileSync(profilePath, JSON.stringify({ name: "test" }));

    context = {
      runId: "impl-test-run",
      repoPath: tempDir,
      fixturePath,
      profilePath,
      artifactsDir: join(tempDir, "artifacts"),
    };

    agent = new ImplementationAgent();
  });

  /** Write minimal valid planning artifacts to the expected directory. */
  function writePlanningArtifacts(): void {
    const planningDir = join(tempDir, "artifacts", "impl-test-run", "planning");
    mkdirSync(planningDir, { recursive: true });

    writeFileSync(
      join(planningDir, "ModernizationPlan.json"),
      JSON.stringify({ selectedOptionId: "opt-1", phases: [] }),
    );
    writeFileSync(
      join(planningDir, "DependencyGraph.json"),
      JSON.stringify({ nodes: [], edges: [] }),
    );
    writeFileSync(
      join(planningDir, "StackAnalysis.json"),
      JSON.stringify({
        languages: [],
        frameworks: [],
        buildTools: [],
        packageManagers: [],
        runtimeDependencies: [],
      }),
    );
    writeFileSync(
      join(planningDir, "RiskAssessment.json"),
      JSON.stringify({ items: [] }),
    );
  }

  it("has name 'implementation' and mode 'read-write'", () => {
    expect(agent.name).toBe("implementation");
    expect(agent.mode).toBe("read-write");
  });

  it("initializes without error", async () => {
    await expect(agent.initialize(context)).resolves.toBeUndefined();
  });

  it("registers skills", () => {
    const stubSkill: Skill = {
      name: "code_refactor",
      execute: async () => ({}),
    };
    agent.registerSkill("code_refactor", stubSkill);
    // No error means success; skills are internal
  });

  it("throws if run() called before initialize()", async () => {
    await expect(agent.run()).rejects.toThrow("not initialized");
  });

  it("fails gracefully if planning artifacts are missing", async () => {
    await agent.initialize(context);
    await expect(agent.run()).rejects.toThrow("Missing required planning artifact");
  });

  it("runs and produces ImplementationLog and TestScaffold artifacts", async () => {
    writePlanningArtifacts();
    await agent.initialize(context);
    await agent.run();

    const implDir = join(tempDir, "artifacts", "impl-test-run", "implementation");

    const logPath = join(implDir, "ImplementationLog.json");
    expect(existsSync(logPath)).toBe(true);
    const log = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(log).toHaveProperty("entries");
    expect(Array.isArray(log.entries)).toBe(true);

    const scaffoldPath = join(implDir, "TestScaffold.json");
    expect(existsSync(scaffoldPath)).toBe(true);
    const scaffold = JSON.parse(readFileSync(scaffoldPath, "utf-8"));
    expect(scaffold).toHaveProperty("testFiles");
    expect(Array.isArray(scaffold.testFiles)).toBe(true);
  });

  it("writes Manifest on completion", async () => {
    writePlanningArtifacts();
    await agent.initialize(context);
    await agent.run();

    const manifestPath = join(
      tempDir, "artifacts", "impl-test-run", "implementation", "Manifest.json",
    );
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.agent).toBe("implementation");
    expect(manifest.status).toBe("completed");
    expect(manifest.runId).toBe("impl-test-run");
    expect(manifest.artifactPaths).toBeDefined();
    expect(Array.isArray(manifest.artifactPaths)).toBe(true);
  });

  it("lists produced artifact types", () => {
    expect(agent.producedArtifacts).toContain("ImplementationLog");
    expect(agent.producedArtifacts).toContain("TestScaffold");
    expect(agent.producedArtifacts).toContain("Manifest");
  });
});
