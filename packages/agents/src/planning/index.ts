// Planning Agent - read-only, interactive, produces analysis + migration artifacts

import { BaseAgent, type AgentContext } from "../base.js";
import type { ArtifactName } from "@jurassic/schemas";
import type { Skill } from "@jurassic/skills";

/** Skills registered by the Planning Agent for analysis. */
const PLANNING_SKILLS = [
  "repo_snapshot",
  "include_graph",
  "risk_scoring",
  "stack_fingerprint",
  "migration_evaluator",
  "user_dialog",
] as const;

type PlanningSkillName = (typeof PLANNING_SKILLS)[number];

/** Artifacts the Planning Agent is expected to produce. */
const PLANNING_ARTIFACTS: ArtifactName[] = [
  "Manifest",
  "StackAnalysis",
  "DependencyGraph",
  "RiskAssessment",
  "MigrationOptions",
  "ModernizationPlan",
  "UserDecisions",
  "DocCoverage",
  "RunLogEvent",
];

/** Options for configuring the Planning Agent. */
export interface PlanningAgentOptions {
  /** Enable interactive Q&A with the user. */
  interactive?: boolean;
  /** Callback for presenting questions to the user and receiving answers. */
  onQuestion?: (question: string, choices?: string[]) => Promise<string>;
}

/**
 * Planning Agent — read-only analysis of a legacy codebase.
 *
 * Responsibilities:
 * - Analyze repository structure, dependencies, and technology stack
 * - Score risk factors per file
 * - Generate migration options with multi-dimensional scoring
 * - Conduct interactive Q&A to gather user requirements
 * - Produce all plan artifacts for handoff to Implementation Agent
 *
 * The Planning Agent NEVER modifies the repository.
 */
export class PlanningAgent extends BaseAgent {
  readonly name = "planning";
  readonly mode = "read-only" as const;

  private skills = new Map<PlanningSkillName, Skill>();
  private options: PlanningAgentOptions;
  private runLog: Array<Record<string, unknown>> = [];

  constructor(options: PlanningAgentOptions = {}) {
    super();
    this.options = { interactive: false, ...options };
  }

  /**
   * Initialize the Planning Agent.
   * Registers analysis skills and prepares for a read-only run.
   */
  override async initialize(context: AgentContext): Promise<void> {
    await super.initialize(context);
    // Skills will be registered here once implemented (Phase D)
    // For now, the agent operates with direct analysis methods
  }

  /**
   * Register a skill for use during planning.
   */
  registerSkill(name: PlanningSkillName, skill: Skill): void {
    this.skills.set(name, skill);
  }

  /**
   * Execute the full planning workflow:
   * 1. Snapshot the repository structure
   * 2. Build dependency graph
   * 3. Analyze technology stack
   * 4. Score risks per file
   * 5. Generate migration options
   * 6. (Optional) Interactive Q&A with user
   * 7. Produce modernization plan
   * 8. Write all artifacts
   */
  async run(): Promise<void> {
    this.assertReady();

    const startedAt = new Date().toISOString();
    const artifactPaths: string[] = [];

    try {
      // Step 1: Analyze dependencies
      const depGraph = await this.analyzeDependencies();
      artifactPaths.push(this.writeArtifact("DependencyGraph", depGraph));
      this.log("stack_fingerprint", { step: "dependencies" }, { nodeCount: depGraph.nodes.length });

      // Step 2: Analyze technology stack
      const stackAnalysis = await this.analyzeStack();
      artifactPaths.push(this.writeArtifact("StackAnalysis", stackAnalysis));
      this.log("stack_fingerprint", { step: "stack" }, { languageCount: stackAnalysis.languages.length });

      // Step 3: Score risks
      const riskAssessment = await this.assessRisks();
      artifactPaths.push(this.writeArtifact("RiskAssessment", riskAssessment));
      this.log("risk_scoring", {}, { itemCount: riskAssessment.items.length });

      // Step 4: Analyze documentation coverage
      const docCoverage = await this.analyzeDocCoverage();
      artifactPaths.push(this.writeArtifact("DocCoverage", docCoverage));
      this.log("repo_snapshot", { step: "docs" }, { coverage: docCoverage.overallPercentage });

      // Step 5: Generate migration options
      const migrationOptions = await this.generateMigrationOptions(stackAnalysis);
      artifactPaths.push(this.writeArtifact("MigrationOptions", migrationOptions));
      this.log("migration_evaluator", {}, { optionCount: migrationOptions.options.length });

      // Step 6: Interactive Q&A (if enabled)
      let userDecisions: Record<string, unknown> = { decisions: [] };
      if (this.options.interactive && this.options.onQuestion) {
        userDecisions = await this.gatherUserDecisions(migrationOptions);
        artifactPaths.push(this.writeArtifact("UserDecisions", userDecisions));
        this.log("user_dialog", {}, { decisionCount: (userDecisions.decisions as unknown[]).length });
      }

      // Step 7: Generate modernization plan
      const selectedOptionId = this.selectBestOption(migrationOptions, userDecisions);
      const plan = await this.generatePlan(selectedOptionId, riskAssessment);
      artifactPaths.push(this.writeArtifact("ModernizationPlan", plan));
      this.log("migration_evaluator", { step: "plan" }, { phaseCount: plan.phases.length });

      // Step 8: Write manifest
      const manifest = {
        runId: this.context!.runId,
        repoUrl: this.loadFixture().repoUrl as string,
        profilePath: this.context!.profilePath,
        startedAt,
        completedAt: new Date().toISOString(),
        agent: "planning" as const,
        status: "completed" as const,
        artifactPaths,
      };
      this.writeArtifact("Manifest", manifest);

      // Write run log events
      for (const event of this.runLog) {
        this.writeArtifact("RunLogEvent", event);
      }
    } catch (error) {
      // Write failed manifest
      const manifest = {
        runId: this.context!.runId,
        repoUrl: this.loadFixture().repoUrl as string,
        profilePath: this.context!.profilePath,
        startedAt,
        completedAt: new Date().toISOString(),
        agent: "planning" as const,
        status: "failed" as const,
        artifactPaths,
      };
      this.writeArtifact("Manifest", manifest);
      throw error;
    }
  }

  /** Get the list of artifacts this agent produces. */
  get producedArtifacts(): readonly ArtifactName[] {
    return PLANNING_ARTIFACTS;
  }

  // ─── Analysis methods (delegates to skills when registered) ───

  private async analyzeDependencies(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("include_graph");
    if (skill) {
      return (await skill.execute({ repoPath: this.context!.repoPath })) as Record<string, unknown>;
    }
    // Stub: return empty graph when skill not registered
    return { nodes: [], edges: [] };
  }

  private async analyzeStack(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("stack_fingerprint");
    if (skill) {
      return (await skill.execute({ repoPath: this.context!.repoPath })) as Record<string, unknown>;
    }
    return {
      languages: [],
      frameworks: [],
      buildTools: [],
      packageManagers: [],
      runtimeDependencies: [],
    };
  }

  private async assessRisks(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("risk_scoring");
    if (skill) {
      return (await skill.execute({ repoPath: this.context!.repoPath })) as Record<string, unknown>;
    }
    return { items: [] };
  }

  private async analyzeDocCoverage(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("repo_snapshot");
    if (skill) {
      return (await skill.execute({
        repoPath: this.context!.repoPath,
        mode: "doc-coverage",
      })) as Record<string, unknown>;
    }
    return { overallPercentage: 0, gaps: [], stubs: [] };
  }

  private async generateMigrationOptions(
    _stackAnalysis: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const skill = this.skills.get("migration_evaluator");
    if (skill) {
      return (await skill.execute({
        repoPath: this.context!.repoPath,
        stackAnalysis: _stackAnalysis,
      })) as Record<string, unknown>;
    }
    return { options: [] };
  }

  private async gatherUserDecisions(
    _migrationOptions: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const skill = this.skills.get("user_dialog");
    if (skill) {
      return (await skill.execute({
        migrationOptions: _migrationOptions,
        onQuestion: this.options.onQuestion,
      })) as Record<string, unknown>;
    }
    return { decisions: [] };
  }

  private async generatePlan(
    selectedOptionId: string,
    _riskAssessment: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return { selectedOptionId, phases: [] };
  }

  private selectBestOption(
    migrationOptions: Record<string, unknown>,
    _userDecisions: Record<string, unknown>,
  ): string {
    const options = (migrationOptions.options as Array<{ id: string }>) ?? [];
    return options.length > 0 ? options[0].id : "default";
  }

  // ─── Logging ───

  private log(
    skill: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
  ): void {
    this.runLog.push({
      timestamp: new Date().toISOString(),
      skill,
      inputs,
      outputs,
      durationMs: 0,
      status: "success",
    });
  }

  private assertReady(): void {
    if (!this.context) {
      throw new Error("PlanningAgent not initialized. Call initialize() first.");
    }
  }
}
