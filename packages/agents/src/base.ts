import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { validateArtifact, type ArtifactName } from "@jurassic/schemas";

/** Agent execution context with isolation boundaries. */
export interface AgentContext {
  /** Unique run identifier. */
  runId: string;
  /** Path to the repository being analyzed. */
  repoPath: string;
  /** Path to the fixture JSON (e.g., specs/repos/odrive.fixture.json). */
  fixturePath: string;
  /** Path to the profile JSON (e.g., specs/repos/odrive.profile.json). */
  profilePath: string;
  /** Root directory for artifact output. */
  artifactsDir: string;
}

/**
 * Base agent class providing common SDK initialization, context isolation,
 * artifact I/O, and configuration loading.
 */
export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly mode: "read-only" | "read-write";

  protected context: AgentContext | null = null;

  /**
   * Initialize the agent with a run context.
   * Subclasses should call super.initialize() then perform agent-specific setup.
   */
  async initialize(context: AgentContext): Promise<void> {
    this.context = context;
    const agentDir = this.getArtifactsPath();
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }
  }

  /** Get the artifacts output path for this agent's run. */
  protected getArtifactsPath(): string {
    this.assertInitialized();
    return join(this.context!.artifactsDir, this.context!.runId, this.name);
  }

  /**
   * Write a validated artifact to the agent's output directory.
   * Validates against the schema before writing.
   */
  protected writeArtifact(artifactName: ArtifactName, data: unknown): string {
    validateArtifact(artifactName, data);
    const outPath = join(this.getArtifactsPath(), `${artifactName}.json`);
    writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
    return outPath;
  }

  /**
   * Read and validate an artifact from a given path.
   */
  protected readArtifact<T = unknown>(artifactName: ArtifactName, filePath: string): T {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as T;
    validateArtifact(artifactName, data);
    return data;
  }

  /**
   * Load the fixture configuration for the target repository.
   */
  protected loadFixture(): Record<string, unknown> {
    this.assertInitialized();
    const raw = readFileSync(this.context!.fixturePath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  /**
   * Load the profile configuration for the target repository.
   */
  protected loadProfile(): Record<string, unknown> {
    this.assertInitialized();
    const raw = readFileSync(this.context!.profilePath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  /**
   * Run the agent. Must be implemented by subclasses.
   */
  abstract run(): Promise<void>;

  /** Enforce that initialize() was called. */
  private assertInitialized(): void {
    if (!this.context) {
      throw new Error(`Agent "${this.name}" not initialized. Call initialize() first.`);
    }
  }
}
