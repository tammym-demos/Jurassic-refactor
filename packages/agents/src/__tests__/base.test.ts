import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BaseAgent, type AgentContext } from "../base.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

class TestAgent extends BaseAgent {
  readonly name = "test-agent";
  readonly mode = "read-only" as const;

  async run(): Promise<void> {
    // no-op for testing
  }

  // Expose protected methods for testing
  public testGetArtifactsPath(): string {
    return this.getArtifactsPath();
  }

  public testLoadFixture(): Record<string, unknown> {
    return this.loadFixture();
  }
}

const TEST_DIR = join(tmpdir(), "jurassic-test-" + Date.now());
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function makeContext(): AgentContext {
  return {
    runId: "test-run-001",
    repoPath: REPO_ROOT,
    fixturePath: join(REPO_ROOT, "specs", "repos", "odrive.fixture.json"),
    profilePath: join(REPO_ROOT, "specs", "repos", "odrive.profile.json"),
    artifactsDir: TEST_DIR,
  };
}

describe("BaseAgent", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("throws if not initialized", () => {
    const agent = new TestAgent();
    expect(() => agent.testGetArtifactsPath()).toThrow("not initialized");
  });

  it("initializes and creates artifacts directory", async () => {
    const agent = new TestAgent();
    await agent.initialize(makeContext());

    const path = agent.testGetArtifactsPath();
    expect(path).toContain("test-run-001");
    expect(path).toContain("test-agent");
    expect(existsSync(path)).toBe(true);
  });

  it("loads fixture JSON", async () => {
    const agent = new TestAgent();
    await agent.initialize(makeContext());

    const fixture = agent.testLoadFixture();
    expect(fixture.repoName).toBe("ODrive");
    expect(fixture.upstreamUrl).toContain("github.com");
  });
});
