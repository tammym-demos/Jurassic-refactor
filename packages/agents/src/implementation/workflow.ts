// Implementation Agent workflow - executes approved plan with code changes

import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "@jurassic/skills";
import { ApprovalGate } from "./approval-gate.js";
import { ToolSelector, type SkillDescriptor, type ToolSelectionResult } from "../tool-selector.js";

export interface ImplWorkflowConfig {
  repoPath: string;
  runId: string;
  planArtifactDir: string;
  outputDir: string;
  forkOwner: string;
  enableWrites: boolean;
  skills?: Map<string, Skill>;
  /** Optional repo profile for LLM-driven tool selection. */
  repoProfile?: unknown;
}

export interface ImplPhase {
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  artifacts: string[];
  error?: string;
}

export interface ImplWorkflowResult {
  runId: string;
  status: "completed" | "failed";
  phases: ImplPhase[];
  artifactDir: string;
  totalArtifacts: number;
  durationMs: number;
  prsCreated: number;
  /** Records which tool-selection mode was used. */
  toolSelection?: ToolSelectionResult;
}

/** Phase definitions describing the implementation workflow sequence. */
const IMPL_PHASE_DEFINITIONS: ReadonlyArray<{
  name: string;
  description: string;
  skill?: string;
}> = [
  { name: "validate_approval", description: "Check APPROVED marker exists in planArtifactDir" },
  { name: "load_plan", description: "Read ModernizationPlan.json from planArtifactDir" },
  { name: "generate_test_scaffold", description: "Invoke test_writer skill on the plan", skill: "test_writer" },
  { name: "execute_migrations", description: "Execute migration phases from the plan", skill: "migration_executor" },
  { name: "upgrade_dependencies", description: "Upgrade dependencies per the plan", skill: "dependency_upgrader" },
  { name: "apply_refactors", description: "Apply code transformations from the plan", skill: "code_refactor" },
  { name: "create_prs", description: "Create PRs for completed work", skill: "pr_writer" },
  { name: "write_manifest", description: "Write ImplementationLog and Manifest artifacts" },
];

/**
 * ImplementationWorkflow — orchestrates execution of an approved modernization plan.
 *
 * Runs each phase sequentially, delegating to registered skills.
 * The workflow requires an APPROVED marker and a ModernizationPlan.json
 * in the planArtifactDir before proceeding.
 */
export class ImplementationWorkflow {
  private plan: Record<string, unknown> | null = null;
  private prsCreated = 0;

  /**
   * Execute the full implementation workflow.
   */
  async execute(config: ImplWorkflowConfig): Promise<ImplWorkflowResult> {
    const startTime = Date.now();
    const artifactDir = path.join(config.outputDir, config.runId, "implementation");
    fs.mkdirSync(artifactDir, { recursive: true });

    // Tool selection: determine skill order (LLM or deterministic)
    const toolSelection = await this.resolveToolSelection(config);
    console.log(
      `[ImplementationWorkflow] Tool selection mode: ${toolSelection.mode} — ${toolSelection.reasoning}`,
    );

    const phases = this.buildPhases(toolSelection);
    let anyFailed = false;

    for (const phase of phases) {
      // If a critical early phase failed, skip the rest
      if (anyFailed && (phase.name !== "write_manifest")) {
        phase.status = "skipped";
        continue;
      }

      await this.executePhase(phase, config, artifactDir);
      if (phase.status === "failed") anyFailed = true;
    }

    const totalArtifacts = phases.reduce((sum, p) => sum + p.artifacts.length, 0);

    return {
      runId: config.runId,
      status: anyFailed ? "failed" : "completed",
      phases,
      artifactDir,
      totalArtifacts,
      durationMs: Date.now() - startTime,
      prsCreated: this.prsCreated,
      toolSelection,
    };
  }

  /** Build initial phase objects from definitions.
   *  If LLM tool selection provided a custom skill order, reorder skill-backed phases accordingly. */
  private buildPhases(toolSelection?: ToolSelectionResult): ImplPhase[] {
    let defs = [...IMPL_PHASE_DEFINITIONS];

    if (toolSelection?.mode === "llm" && toolSelection.selectedSkills.length > 0) {
      const skillOrder = toolSelection.selectedSkills;
      const skillBacked = defs.filter((d) => d.skill && skillOrder.includes(d.skill));
      const nonSkillBacked = defs.filter((d) => !d.skill || !skillOrder.includes(d.skill));

      skillBacked.sort(
        (a, b) => skillOrder.indexOf(a.skill!) - skillOrder.indexOf(b.skill!),
      );

      defs = [...nonSkillBacked.filter((d) => d.name === "validate_approval" || d.name === "load_plan"),
        ...skillBacked,
        ...nonSkillBacked.filter((d) => d.name !== "validate_approval" && d.name !== "load_plan")];
    }

    return defs.map((def) => ({
      name: def.name,
      description: def.description,
      status: "pending" as const,
      artifacts: [],
    }));
  }

  /** Resolve tool selection using ToolSelector (LLM or deterministic). */
  private async resolveToolSelection(config: ImplWorkflowConfig): Promise<ToolSelectionResult> {
    const skillDescriptors: SkillDescriptor[] = IMPL_PHASE_DEFINITIONS
      .filter((d) => d.skill)
      .map((d) => ({
        name: d.skill!,
        description: d.description,
        inputSchema: { repoPath: { type: "string" } },
        agent: "implementation" as const,
      }));

    const selector = new ToolSelector(skillDescriptors);
    return selector.selectSkills({ repoProfile: config.repoProfile ?? {} });
  }

  /** Execute a single workflow phase. */
  private async executePhase(
    phase: ImplPhase,
    config: ImplWorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const phaseDef = IMPL_PHASE_DEFINITIONS.find((d) => d.name === phase.name);
    const skillName = phaseDef?.skill;
    const skills = config.skills;

    // Skip if phase requires a skill that is not registered
    if (skillName && (!skills || !skills.has(skillName))) {
      phase.status = "skipped";
      return;
    }

    phase.status = "running";
    phase.startedAt = new Date().toISOString();

    try {
      switch (phase.name) {
        case "validate_approval":
          this.runValidateApproval(config);
          break;

        case "load_plan":
          this.runLoadPlan(phase, config, artifactDir);
          break;

        case "generate_test_scaffold":
          await this.runGenerateTestScaffold(phase, config, artifactDir);
          break;

        case "execute_migrations":
          await this.runExecuteMigrations(phase, config, artifactDir);
          break;

        case "upgrade_dependencies":
          await this.runUpgradeDependencies(phase, config, artifactDir);
          break;

        case "apply_refactors":
          await this.runApplyRefactors(phase, config, artifactDir);
          break;

        case "create_prs":
          await this.runCreatePrs(phase, config, artifactDir);
          break;

        case "write_manifest":
          this.runWriteManifest(phase, config, artifactDir);
          break;
      }

      phase.status = "completed";
      phase.completedAt = new Date().toISOString();
    } catch (err) {
      phase.status = "failed";
      phase.completedAt = new Date().toISOString();
      phase.error = err instanceof Error ? err.message : String(err);
    }
  }

  // ─── Phase implementations ───

  private runValidateApproval(config: ImplWorkflowConfig): void {
    const result = ApprovalGate.check(config.planArtifactDir);
    if (!result.approved) {
      throw new Error(result.error ?? "Plan not approved");
    }
  }

  private runLoadPlan(phase: ImplPhase, config: ImplWorkflowConfig, _artifactDir: string): void {
    const planPath = path.join(config.planArtifactDir, "ModernizationPlan.json");
    if (!fs.existsSync(planPath)) {
      throw new Error(`ModernizationPlan.json not found at ${planPath}`);
    }
    this.plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as Record<string, unknown>;
    phase.artifacts.push(planPath);
  }

  private async runGenerateTestScaffold(
    phase: ImplPhase,
    config: ImplWorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const skill = config.skills!.get("test_writer")!;
    const result = await skill.execute({
      repoPath: config.repoPath,
      plan: this.plan,
    });
    const artifactPath = this.writeArtifact(artifactDir, "TestScaffold", result);
    phase.artifacts.push(artifactPath);
  }

  private async runExecuteMigrations(
    phase: ImplPhase,
    config: ImplWorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const skill = config.skills!.get("migration_executor")!;
    const planPhases = (this.plan?.phases as Array<Record<string, unknown>>) ?? [];
    const entries: Array<Record<string, unknown>> = [];

    for (const planPhase of planPhases) {
      const result = await skill.execute({
        repoPath: config.repoPath,
        phase: planPhase,
        plan: this.plan,
        enableWrites: config.enableWrites,
      });
      entries.push(result as Record<string, unknown>);
    }

    if (entries.length > 0) {
      const artifactPath = this.writeArtifact(artifactDir, "MigrationResults", entries);
      phase.artifacts.push(artifactPath);
    }
  }

  private async runUpgradeDependencies(
    phase: ImplPhase,
    config: ImplWorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const skill = config.skills!.get("dependency_upgrader")!;
    const result = await skill.execute({
      repoPath: config.repoPath,
      plan: this.plan,
      enableWrites: config.enableWrites,
    });
    const artifactPath = this.writeArtifact(artifactDir, "DependencyUpgrades", result);
    phase.artifacts.push(artifactPath);
  }

  private async runApplyRefactors(
    phase: ImplPhase,
    config: ImplWorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const skill = config.skills!.get("code_refactor")!;
    const tasks = (this.plan?.tasks as Array<Record<string, unknown>>) ?? [];
    const entries: Array<Record<string, unknown>> = [];

    for (const task of tasks) {
      const result = await skill.execute({
        repoPath: config.repoPath,
        task,
        plan: this.plan,
        enableWrites: config.enableWrites,
      });
      entries.push(result as Record<string, unknown>);
    }

    if (entries.length > 0) {
      const artifactPath = this.writeArtifact(artifactDir, "RefactorResults", entries);
      phase.artifacts.push(artifactPath);
    }
  }

  private async runCreatePrs(
    phase: ImplPhase,
    config: ImplWorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const skill = config.skills!.get("pr_writer")!;
    const result = (await skill.execute({
      repoPath: config.repoPath,
      plan: this.plan,
      forkOwner: config.forkOwner,
    })) as Record<string, unknown>;

    this.prsCreated = (result.prsCreated as number) ?? 0;
    const artifactPath = this.writeArtifact(artifactDir, "PRs", result);
    phase.artifacts.push(artifactPath);
  }

  private runWriteManifest(
    phase: ImplPhase,
    _config: ImplWorkflowConfig,
    artifactDir: string,
  ): void {
    const log = {
      completedAt: new Date().toISOString(),
      prsCreated: this.prsCreated,
    };
    const logPath = this.writeArtifact(artifactDir, "ImplementationLog", log);
    phase.artifacts.push(logPath);

    const manifest = {
      generatedAt: new Date().toISOString(),
      artifactDir,
      prsCreated: this.prsCreated,
    };
    const manifestPath = this.writeArtifact(artifactDir, "Manifest", manifest);
    phase.artifacts.push(manifestPath);
  }

  /** Write a JSON artifact to the output directory. */
  private writeArtifact(outputDir: string, name: string, data: unknown): string {
    const filePath = path.join(outputDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  }
}
