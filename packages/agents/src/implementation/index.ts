// Implementation Agent - executes approved plans, produces code changes

import { BaseAgent, type AgentContext } from "../base.js";
import type { ArtifactName } from "@jurassic/schemas";
import {
  CodeRefactorSkill,
  MigrationExecutorSkill,
  DependencyUpgraderSkill,
  TestScaffoldSkill,
  prWriterSkill,
  type Skill,
} from "@jurassic/skills";
import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

/**
 * Convert a path to a valid URI. If already a URI, return as-is.
 */
function toUri(pathOrUri: string): string {
  if (pathOrUri.startsWith("http://") || pathOrUri.startsWith("https://") || pathOrUri.startsWith("file://")) {
    return pathOrUri;
  }
  // Convert local path to file:// URI
  return pathToFileURL(pathOrUri).href;
}

/**
 * Transform TestScaffoldSkill output to TestScaffold schema format.
 * Schema expects: { testFiles: [{ filePath, targetFile, entryPoints, priority, template }] }
 */
function transformToTestScaffoldSchema(output: Record<string, unknown>): Record<string, unknown> {
  const templates = (output.templates as Array<Record<string, unknown>>) ?? [];
  const entries = (output.entries as Array<Record<string, unknown>>) ?? [];

  // Group entries by source file
  const entriesByFile = new Map<string, Array<{ name: string; type: string }>>();
  for (const entry of entries) {
    const filePath = entry.filePath as string;
    if (!entriesByFile.has(filePath)) {
      entriesByFile.set(filePath, []);
    }
    entriesByFile.get(filePath)!.push({
      name: entry.name as string,
      type: entry.type as string,
    });
  }

  // Convert templates to testFiles schema format
  const testFiles = templates.map((template) => {
    const sourceFilePath = template.sourceFilePath as string;
    const entryPoints = entriesByFile.get(sourceFilePath) ?? [];
    // Compute priority based on entry count
    const priority = entryPoints.length > 5 ? "high" :
                     entryPoints.length > 2 ? "medium" : "low";

    return {
      filePath: template.testFilePath as string,
      targetFile: sourceFilePath,
      entryPoints: entryPoints.map(e => ({
        name: e.name,
        type: e.type === "method" ? "function" : e.type as "function" | "endpoint" | "class",
      })),
      priority,
      template: template.content as string,
    };
  });

  return { testFiles };
}

/** Skills registered by the Implementation Agent. */
const IMPLEMENTATION_SKILLS = [
  "code_refactor",
  "migration_executor",
  "test_scaffold",
  "pr_writer",
  "dependency_upgrader",
] as const;

type ImplementationSkillName = (typeof IMPLEMENTATION_SKILLS)[number];

/** Planning artifacts required before implementation can proceed. */
const REQUIRED_PLANNING_ARTIFACTS: ArtifactName[] = [
  "ModernizationPlan",
  "DependencyGraph",
  "StackAnalysis",
  "RiskAssessment",
];

/** Artifacts the Implementation Agent produces. */
const IMPLEMENTATION_ARTIFACTS: ArtifactName[] = [
  "ImplementationLog",
  "TestScaffold",
  "Manifest",
];

/**
 * Implementation Agent — read-write execution of approved plans.
 *
 * Responsibilities:
 * - Read and validate approved planning artifacts
 * - Generate a test scaffold before making changes
 * - Execute plan phases in order, delegating to registered skills
 * - Log each change to an ImplementationLog
 * - Write a Manifest upon completion
 *
 * The Implementation Agent requires APPROVED Planning Agent artifacts as input.
 */
export class ImplementationAgent extends BaseAgent {
  readonly name = "implementation";
  readonly mode = "read-write" as const;

  private skills = new Map<ImplementationSkillName, Skill>();
  private planningArtifacts = new Map<string, Record<string, unknown>>();
  private localRepoPath: string = "";

  /**
   * Initialize the Implementation Agent.
   * Validates that required planning artifacts exist.
   */
  override async initialize(context: AgentContext): Promise<void> {
    await super.initialize(context);

    // Resolve the local repo path (cloned by Planning Agent)
    this.localRepoPath = this.resolveLocalRepoPath();

    // Register implementation skills
    this.registerSkill("code_refactor", new CodeRefactorSkill());
    this.registerSkill("migration_executor", new MigrationExecutorSkill());
    this.registerSkill("dependency_upgrader", new DependencyUpgraderSkill());
    this.registerSkill("test_scaffold", new TestScaffoldSkill());
    this.registerSkill("pr_writer", prWriterSkill);
  }

  /**
   * Resolve the local repository path.
   * If the repoPath is a URL, find the cloned repo in artifacts/.repos/.
   * Throws if repo doesn't exist (planning must run first).
   */
  private resolveLocalRepoPath(): string {
    const repoPath = this.context!.repoPath;

    // If it's already a local path that exists, use it
    if (existsSync(repoPath)) {
      return repoPath;
    }

    // If it's a GitHub URL, look for the cloned repo
    if (repoPath.includes("github.com")) {
      const repoName = repoPath.split("/").pop()?.replace(".git", "") ?? "repo";
      const localPath = join(this.context!.artifactsDir, ".repos", repoName);

      if (existsSync(localPath)) {
        console.log(`Using cloned repo at ${localPath}`);
        return localPath;
      }

      throw new Error(
        `Repository not found at ${localPath}. ` +
        `Run the Planning Agent first to clone the repository.`
      );
    }

    throw new Error(
      `Invalid repository path: ${repoPath}. ` +
      `Must be a local path or GitHub URL.`
    );
  }

  /**
   * Register a skill for use during implementation.
   */
  registerSkill(name: ImplementationSkillName, skill: Skill): void {
    this.skills.set(name, skill);
  }

  /**
   * Execute the full implementation workflow:
   * 1. Read and validate approved planning artifacts
   * 2. Generate TestScaffold
   * 3. Execute plan phases in order
   * 4. Log changes to ImplementationLog
   * 5. Write Manifest
   */
  async run(): Promise<void> {
    this.assertReady();

    const startedAt = new Date().toISOString();
    const artifactPaths: string[] = [];

    try {
      // Step 1: Load and validate planning artifacts
      this.loadPlanningArtifacts();

      // Step 2: Generate test scaffold
      const testScaffold = await this.generateTestScaffold();
      artifactPaths.push(this.writeArtifact("TestScaffold", testScaffold));

      // Step 3: Execute plan phases and collect log entries
      const entries = await this.executePlanPhases();

      // Step 4: Write implementation log
      const implementationLog = { entries };
      artifactPaths.push(this.writeArtifact("ImplementationLog", implementationLog));

      // Step 5: Write manifest
      const manifest = {
        runId: this.context!.runId,
        repoUrl: toUri(this.context!.repoPath),
        profilePath: this.context!.profilePath,
        startedAt,
        completedAt: new Date().toISOString(),
        agent: "implementation" as const,
        status: "completed" as const,
        artifactPaths,
      };
      artifactPaths.push(this.writeArtifact("Manifest", manifest));
    } catch (error) {
      // Write failed manifest
      const manifest = {
        runId: this.context!.runId,
        repoUrl: toUri(this.context!.repoPath),
        profilePath: this.context!.profilePath,
        startedAt,
        completedAt: new Date().toISOString(),
        agent: "implementation" as const,
        status: "failed" as const,
        artifactPaths,
      };
      this.writeArtifact("Manifest", manifest);
      throw error;
    }
  }

  /** Get the list of artifacts this agent produces. */
  get producedArtifacts(): readonly ArtifactName[] {
    return IMPLEMENTATION_ARTIFACTS;
  }

  // ─── Private methods ───

  /**
   * Load and validate required planning artifacts from the planning agent's output directory.
   * Throws if any required artifact is missing.
   */
  private loadPlanningArtifacts(): void {
    const planningDir = join(
      this.context!.artifactsDir,
      this.context!.runId,
      "planning",
    );

    for (const artifactName of REQUIRED_PLANNING_ARTIFACTS) {
      const filePath = join(planningDir, `${artifactName}.json`);
      if (!existsSync(filePath)) {
        throw new Error(
          `Missing required planning artifact: ${artifactName}. ` +
          `Run the Planning Agent first and ensure artifacts are approved.`,
        );
      }
      const data = this.readArtifact<Record<string, unknown>>(artifactName, filePath);
      this.planningArtifacts.set(artifactName, data);
    }
  }

  /**
   * Generate a test scaffold based on the modernization plan.
   */
  private async generateTestScaffold(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("test_scaffold");
    if (skill) {
      const output = (await skill.execute({
        repoPath: this.localRepoPath,
      })) as Record<string, unknown>;
      return transformToTestScaffoldSchema(output);
    }
    // Stub: return empty scaffold when skill not registered
    return { testFiles: [] };
  }

  /**
   * Execute plan phases in order, delegating to skills.
   * Returns implementation log entries.
   */
  private async executePlanPhases(): Promise<Array<Record<string, unknown>>> {
    const plan = this.planningArtifacts.get("ModernizationPlan");
    const phases = (plan?.phases as Array<Record<string, unknown>>) ?? [];
    const entries: Array<Record<string, unknown>> = [];

    for (const phase of phases) {
      const phaseEntries = await this.executePhase(phase);
      entries.push(...phaseEntries);
    }

    return entries;
  }

  /**
   * Execute a single phase, delegating to appropriate skills.
   */
  private async executePhase(
    phase: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const entries: Array<Record<string, unknown>> = [];
    const tasks = (phase.tasks as Array<Record<string, unknown>>) ?? [];

    for (const task of tasks) {
      const entry = await this.executeTask(task);
      entries.push(entry);
    }

    return entries;
  }

  /**
   * Execute a single task, delegating to the appropriate skill.
   */
  private async executeTask(
    task: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Handle both schema field names (taskId, riskId) and legacy field names (id, filePath)
    const taskId = (task.taskId as string) ?? (task.id as string) ?? "unknown";
    const filePath = (task.riskId as string) ?? (task.filePath as string) ?? "unknown";
    const changeType = (task.changeType as string) ?? "modify";
    const description = (task.description as string) ?? "";
    const skillName = (task.skill as ImplementationSkillName) ?? "code_refactor";

    try {
      const skill = this.skills.get(skillName);
      if (skill) {
        await skill.execute({
          repoPath: this.localRepoPath,
          task: { ...task, filePath }, // Ensure filePath is available
          plan: this.planningArtifacts.get("ModernizationPlan"),
        });
      }

      return {
        taskId,
        filePath,
        changeType,
        description,
        status: "completed",
      };
    } catch {
      return {
        taskId,
        filePath,
        changeType,
        description,
        status: "failed",
      };
    }
  }

  private assertReady(): void {
    if (!this.context) {
      throw new Error("ImplementationAgent not initialized. Call initialize() first.");
    }
  }
}
