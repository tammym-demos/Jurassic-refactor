// Planning Agent - read-only, interactive, produces analysis + migration artifacts

import { BaseAgent, type AgentContext } from "../base.js";
import type { ArtifactName } from "@jurassic/schemas";
import {
  RepoSnapshotSkill,
  fwIncludeGraphSkill,
  PyImportGraphSkill,
  guiImportGraphSkill,
  GitChurnSkill,
  ComplexityMetricsSkill,
  RiskScoringSkill,
  SafetyPathAnalysisSkill,
  StackFingerprintSkill,
  DocCoverageAnalysisSkill,
  MigrationEvaluatorSkill,
  PlanSynthesisSkill,
  UserDialogSkill,
  type Skill,
} from "@jurassic/skills";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

/** Skills registered by the Planning Agent for analysis. */
const PLANNING_SKILLS = [
  "repo_snapshot",
  "fw_include_graph",
  "py_import_graph",
  "gui_import_graph",
  "git_churn",
  "complexity_metrics",
  "risk_scoring",
  "safety_path_analysis",
  "stack_fingerprint",
  "doc_coverage_analysis",
  "migration_evaluator",
  "plan_synthesis",
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
  private localRepoPath: string = "";

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
    
    // Clone the repository if it's a URL
    this.localRepoPath = await this.ensureLocalRepo();
    
    // Register all skills
    this.registerSkill("repo_snapshot", new RepoSnapshotSkill());
    this.registerSkill("fw_include_graph", fwIncludeGraphSkill);
    this.registerSkill("py_import_graph", new PyImportGraphSkill());
    this.registerSkill("gui_import_graph", guiImportGraphSkill);
    this.registerSkill("git_churn", new GitChurnSkill());
    this.registerSkill("complexity_metrics", new ComplexityMetricsSkill());
    this.registerSkill("risk_scoring", new RiskScoringSkill());
    this.registerSkill("safety_path_analysis", new SafetyPathAnalysisSkill());
    this.registerSkill("stack_fingerprint", new StackFingerprintSkill());
    this.registerSkill("doc_coverage_analysis", new DocCoverageAnalysisSkill());
    this.registerSkill("migration_evaluator", new MigrationEvaluatorSkill());
    this.registerSkill("plan_synthesis", new PlanSynthesisSkill());
    this.registerSkill("user_dialog", new UserDialogSkill());
  }

  /**
   * Clone the target repo to a local directory if needed.
   */
  private async ensureLocalRepo(): Promise<string> {
    const repoPath = this.context!.repoPath;
    
    // If it's already a local path, use it directly
    if (existsSync(repoPath)) {
      return repoPath;
    }
    
    // If it's a GitHub URL, clone it
    if (repoPath.includes("github.com")) {
      const cloneDir = join(this.context!.artifactsDir, ".repos");
      if (!existsSync(cloneDir)) {
        mkdirSync(cloneDir, { recursive: true });
      }
      
      // Extract repo name from URL
      const repoName = repoPath.split("/").pop()?.replace(".git", "") ?? "repo";
      const localPath = join(cloneDir, repoName);
      
      // Clone if not already cloned
      if (!existsSync(localPath)) {
        console.log(`Cloning ${repoPath} to ${localPath}...`);
        execSync(`git clone --depth 100 ${repoPath} "${localPath}"`, {
          stdio: "inherit",
        });
      } else {
        console.log(`Using existing clone at ${localPath}`);
      }
      
      return localPath;
    }
    
    throw new Error(`Cannot resolve repository path: ${repoPath}`);
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
      const nodes = (depGraph.nodes ?? []) as unknown[];
      this.log("stack_fingerprint", { step: "dependencies" }, { nodeCount: nodes.length });

      // Step 2: Analyze technology stack
      const stackAnalysis = await this.analyzeStack();
      artifactPaths.push(this.writeArtifact("StackAnalysis", stackAnalysis));
      const languages = (stackAnalysis.languages ?? []) as unknown[];
      this.log("stack_fingerprint", { step: "stack" }, { languageCount: languages.length });

      // Step 3: Score risks
      const riskAssessment = await this.assessRisks();
      artifactPaths.push(this.writeArtifact("RiskAssessment", riskAssessment));
      const riskItems = (riskAssessment.items ?? []) as unknown[];
      this.log("risk_scoring", {}, { itemCount: riskItems.length });

      // Step 4: Analyze documentation coverage
      const docCoverage = await this.analyzeDocCoverage();
      artifactPaths.push(this.writeArtifact("DocCoverage", docCoverage));
      this.log("repo_snapshot", { step: "docs" }, { coverage: docCoverage.overallPercentage });

      // Step 5: Generate migration options
      const migrationOptions = await this.generateMigrationOptions(stackAnalysis);
      artifactPaths.push(this.writeArtifact("MigrationOptions", migrationOptions));
      const options = (migrationOptions.options ?? []) as unknown[];
      this.log("migration_evaluator", {}, { optionCount: options.length });

      // Step 6: Interactive Q&A (if enabled)
      let userDecisions: Record<string, unknown> = { decisions: [] };
      if (this.options.interactive && this.options.onQuestion) {
        userDecisions = await this.gatherUserDecisions(migrationOptions);
        artifactPaths.push(this.writeArtifact("UserDecisions", userDecisions));
        this.log("user_dialog", {}, { decisionCount: (userDecisions.decisions as unknown[]).length });
      }

      // Step 7: Generate modernization plan
      const selectedOptionId = this.selectBestOption(migrationOptions, userDecisions);
      const plan = await this.generatePlan(selectedOptionId, riskAssessment, stackAnalysis, depGraph, userDecisions);
      artifactPaths.push(this.writeArtifact("ModernizationPlan", plan));
      const phases = (plan.phases ?? []) as unknown[];
      this.log("migration_evaluator", { step: "plan" }, { phaseCount: phases.length });

      // Step 8: Write manifest
      const manifest = {
        runId: this.context!.runId,
        repoUrl: toUri(this.context!.repoPath),
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
        repoUrl: toUri(this.context!.repoPath),
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

  /**
   * Transform raw skill output to schema-compliant DependencyGraph format.
   */
  private transformToSchemaFormat(
    rawResult: Record<string, unknown>,
    language: string,
  ): Record<string, unknown> {
    const rawNodes = (rawResult.nodes ?? []) as string[];
    const rawEdges = (rawResult.edges ?? []) as Array<{ from?: string; to?: string }>;
    
    // Convert string nodes to schema-compliant node objects
    const nodes = rawNodes.map((nodePath: string) => {
      const ext = nodePath.split(".").pop()?.toLowerCase() ?? "";
      const nodeType = ext === "h" || ext === "hpp" ? "header" : "source";
      return {
        path: nodePath,
        type: nodeType,
        language,
        loc: 0, // Would need actual LOC count for accuracy
      };
    });
    
    // Convert edges from {from, to} to {source, target, type}
    const edges = rawEdges.map((edge) => ({
      source: edge.from ?? "",
      target: edge.to ?? "",
      type: "include" as const,
    }));
    
    return { nodes, edges };
  }

  private async analyzeDependencies(): Promise<Record<string, unknown>> {
    // Try C/C++ include graph first (for firmware projects like ODrive)
    const fwSkill = this.skills.get("fw_include_graph");
    if (fwSkill) {
      try {
        const result = await fwSkill.execute({ repoPath: this.localRepoPath }) as Record<string, unknown>;
        if ((result.nodes as unknown[])?.length > 0) {
          return this.transformToSchemaFormat(result, "cpp");
        }
      } catch {
        // Firmware dir not found, try other graphs
      }
    }
    
    // Try Python import graph
    const pySkill = this.skills.get("py_import_graph");
    if (pySkill) {
      try {
        const result = await pySkill.execute({ repoPath: this.localRepoPath }) as Record<string, unknown>;
        if ((result.nodes as unknown[])?.length > 0) {
          return this.transformToSchemaFormat(result, "python");
        }
      } catch {
        // Python dir not found
      }
    }
    
    // Try GUI/JS import graph
    const guiSkill = this.skills.get("gui_import_graph");
    if (guiSkill) {
      try {
        const result = await guiSkill.execute({ repoPath: this.localRepoPath }) as Record<string, unknown>;
        if ((result.nodes as unknown[])?.length > 0) {
          return this.transformToSchemaFormat(result, "javascript");
        }
      } catch {
        // GUI dir not found
      }
    }
    
    return { nodes: [], edges: [] };
  }

  /**
   * Transform stack fingerprint output to schema-compliant StackAnalysis format.
   */
  private transformStackToSchema(rawResult: Record<string, unknown>): Record<string, unknown> {
    type RawItem = { name: string; version?: string; confidence?: number };
    
    const rawLanguages = (rawResult.languages ?? []) as RawItem[];
    const rawFrameworks = (rawResult.frameworks ?? []) as RawItem[];
    const rawBuildTools = (rawResult.buildTools ?? []) as RawItem[];
    const rawPackageManagers = (rawResult.packageManagers ?? []) as RawItem[];
    const rawRuntimeDeps = (rawResult.runtimeDependencies ?? []) as RawItem[];
    
    const totalLangs = rawLanguages.length || 1;
    const languages = rawLanguages.map((item, idx) => ({
      name: item.name,
      percentage: Math.round((100 / totalLangs) * 10) / 10, // Rough estimate
      files: Math.max(1, Math.floor(10 / (idx + 1))),  // Placeholder
    }));
    
    const frameworks = rawFrameworks.map((item) => ({
      name: item.name,
      version: item.version ?? "unknown",
      confidence: item.confidence ?? 0.8,
    }));
    
    const buildTools = rawBuildTools.map((item) => ({
      name: item.name,
      version: item.version ?? "unknown",
    }));
    
    const packageManagers = rawPackageManagers.map((item) => ({
      name: item.name,
      version: item.version ?? "unknown",
    }));
    
    const runtimeDependencies = rawRuntimeDeps.map((item) => ({
      name: item.name,
      version: item.version ?? "unknown",
      source: "detected" as const,
    }));
    
    return {
      languages,
      frameworks,
      buildTools,
      packageManagers,
      runtimeDependencies,
    };
  }

  private async analyzeStack(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("stack_fingerprint");
    if (skill) {
      const rawResult = (await skill.execute({ repoPath: this.localRepoPath })) as Record<string, unknown>;
      return this.transformStackToSchema(rawResult);
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
    // First gather prerequisite data
    const gitChurnSkill = this.skills.get("git_churn");
    const complexitySkill = this.skills.get("complexity_metrics");
    const safetySkill = this.skills.get("safety_path_analysis");
    
    let churnData: Record<string, unknown> | undefined;
    let complexityData: Record<string, unknown> | undefined;
    let safetyData: Record<string, unknown> | undefined;
    
    if (gitChurnSkill) {
      try {
        churnData = await gitChurnSkill.execute({ repoPath: this.localRepoPath }) as Record<string, unknown>;
      } catch {
        // Git churn analysis failed
      }
    }
    
    if (complexitySkill) {
      try {
        complexityData = await complexitySkill.execute({ repoPath: this.localRepoPath }) as Record<string, unknown>;
      } catch {
        // Complexity analysis failed
      }
    }
    
    if (safetySkill) {
      try {
        safetyData = await safetySkill.execute({ repoPath: this.localRepoPath }) as Record<string, unknown>;
      } catch {
        // Safety analysis failed
      }
    }
    
    // Now run risk scoring with all the data
    const riskSkill = this.skills.get("risk_scoring");
    if (riskSkill) {
      const rawResult = (await riskSkill.execute({
        repoPath: this.localRepoPath,
        churnData,
        complexityData,
        safetyData,
      })) as Record<string, unknown>;
      return this.transformRiskToSchema(rawResult);
    }
    return { items: [] };
  }

  /**
   * Transform risk scoring output to schema-compliant RiskAssessment format.
   */
  private transformRiskToSchema(rawResult: Record<string, unknown>): Record<string, unknown> {
    type RawItem = {
      filePath: string;
      overallScore?: number;
      churnScore?: number;
      complexityScore?: number;
      safetyScore?: number;
      evidence?: string[];
    };
    
    const rawItems = (rawResult.items ?? []) as RawItem[];
    
    const items = rawItems.map((item) => ({
      filePath: item.filePath,
      riskScore: Math.min((item.overallScore ?? 0) / 100, 1),
      factors: {
        churn: Math.min((item.churnScore ?? 0) / 100, 1),
        complexity: Math.min((item.complexityScore ?? 0) / 100, 1),
        safetyPath: Math.min((item.safetyScore ?? 0) / 100, 1),
        docCoverage: 0.5, // Not computed by skill
        testCoverage: 0.5, // Not computed by skill
      },
      safetyFlags: item.evidence?.filter(e => e.toLowerCase().includes('safety')) ?? [],
    }));
    
    return { items };
  }

  private async analyzeDocCoverage(): Promise<Record<string, unknown>> {
    const skill = this.skills.get("doc_coverage_analysis");
    if (skill) {
      const rawResult = (await skill.execute({ repoPath: this.localRepoPath })) as Record<string, unknown>;
      return this.transformDocCoverageToSchema(rawResult);
    }
    return { overallPercentage: 0, gaps: [], stubs: [] };
  }

  /**
   * Transform doc coverage skill output to schema-compliant DocCoverage format.
   */
  private transformDocCoverageToSchema(rawResult: Record<string, unknown>): Record<string, unknown> {
    type RawGap = {
      filePath: string;
      symbol?: string;
      type?: string;
    };
    type RawStub = {
      filePath: string;
      content?: string;
    };
    
    const rawGaps = (rawResult.gaps ?? []) as RawGap[];
    const rawStubs = (rawResult.stubs ?? []) as RawStub[];
    const missingReadmes = (rawResult.missingReadmes ?? []) as string[];
    
    // Convert gaps to schema format
    const gaps: Array<{filePath: string; type: string; description: string}> = [];
    
    // Add missing readmes as gaps
    for (const readmePath of missingReadmes) {
      gaps.push({
        filePath: readmePath,
        type: "missing-readme",
        description: `Missing README file at ${readmePath}`,
      });
    }
    
    // Add API gaps with mapped type
    for (const gap of rawGaps) {
      gaps.push({
        filePath: gap.filePath,
        type: "undocumented-api",
        description: `Undocumented ${gap.type ?? "symbol"}: ${gap.symbol ?? "unknown"}`,
      });
    }
    
    // Convert stubs to schema format (content → template)
    const stubs = rawStubs.map((stub) => ({
      filePath: stub.filePath,
      template: stub.content ?? "",
    }));
    
    return {
      overallPercentage: rawResult.overallPercentage ?? 0,
      gaps,
      stubs,
    };
  }

  private async generateMigrationOptions(
    stackAnalysis: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const skill = this.skills.get("migration_evaluator");
    if (skill) {
      const rawResult = (await skill.execute({
        stackFingerprint: stackAnalysis,
      })) as Record<string, unknown>;
      return this.transformMigrationOptionsToSchema(rawResult);
    }
    return { options: [] };
  }

  /**
   * Transform migration evaluator output to schema-compliant MigrationOptions format.
   */
  private transformMigrationOptionsToSchema(rawResult: Record<string, unknown>): Record<string, unknown> {
    type RawOption = {
      id: string;
      name: string;
      description?: string;
      sourceStack?: string[];
      targetStack?: string[];
      scores?: {
        effort?: number;
        risk?: number;
        ecosystemSupport?: number;
        teamReadiness?: number;
      };
      prerequisites?: string[];
    };
    
    const rawOptions = (rawResult.options ?? []) as RawOption[];
    
    const options = rawOptions.map((opt) => ({
      id: opt.id,
      name: opt.name,
      description: opt.description ?? "",
      fromStack: (opt.sourceStack ?? []).join(", ") || "unknown",
      toStack: (opt.targetStack ?? []).join(", ") || "modern",
      scores: {
        effort: Math.min((opt.scores?.effort ?? 0) / 100, 1),
        risk: Math.min((opt.scores?.risk ?? 0) / 100, 1),
        ecosystemSupport: Math.min((opt.scores?.ecosystemSupport ?? 0) / 100, 1),
        teamExpertise: Math.min((opt.scores?.teamReadiness ?? 50) / 100, 1),
      },
      prerequisites: opt.prerequisites ?? [],
    }));
    
    return { options };
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
    riskAssessment: Record<string, unknown>,
    stackData?: Record<string, unknown>,
    depGraph?: Record<string, unknown>,
    userDecisions?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const skill = this.skills.get("plan_synthesis");
    if (skill) {
      // Get the selected migration option details
      const migrationOption = {
        id: selectedOptionId,
        name: selectedOptionId,
        targetStack: "modernized",
        effort: "medium",
      };

      // Transform risk items from RiskAssessment schema to PlanSynthesisInput format
      type RiskItem = { filePath: string; riskScore: number; factors?: Record<string, number>; safetyFlags?: string[] };
      const rawItems = (riskAssessment.items ?? []) as RiskItem[];
      const riskItems = rawItems.map(item => {
        const score = item.riskScore * 100; // Convert 0-1 to 0-100
        let severity: string;
        if (score >= 70) severity = "critical";
        else if (score >= 50) severity = "high";
        else if (score >= 30) severity = "medium";
        else severity = "low";

        const evidence: string[] = [];
        if (item.factors) {
          if (item.factors.churn > 0.5) evidence.push("High code churn");
          if (item.factors.complexity > 0.7) evidence.push("High complexity");
          if (item.factors.safetyPath > 0.5) evidence.push("Safety-critical path");
          if (item.factors.docCoverage < 0.3) evidence.push("Poor documentation");
          if (item.factors.testCoverage < 0.3) evidence.push("Low test coverage");
        }
        if (item.safetyFlags && item.safetyFlags.length > 0) {
          evidence.push(...item.safetyFlags.map(f => `Safety flag: ${f}`));
        }

        return {
          filePath: item.filePath,
          overallScore: score,
          severity,
          evidence,
        };
      });
      
      const rawResult = (await skill.execute({
        riskItems,
        stackData: stackData ?? { languages: [], frameworks: [], buildTools: [] },
        migrationOption,
        dependencyGraph: depGraph,
        userDecisions,
      })) as Record<string, unknown>;
      return this.transformPlanToSchema(rawResult, selectedOptionId);
    }
    return { selectedOptionId, phases: [] };
  }

  /**
   * Transform plan synthesis output to schema-compliant ModernizationPlan format.
   */
  private transformPlanToSchema(rawResult: Record<string, unknown>, selectedOptionId: string): Record<string, unknown> {
    type RawTask = {
      id?: string;
      title?: string;
      description?: string;
      priority?: string;
      riskIds?: string[];
    };
    type RawPhase = {
      number?: number;
      name?: string;
      description?: string;
      tasks?: RawTask[];
    };
    
    const rawPhases = (rawResult.phases ?? []) as RawPhase[];
    
    const phases = rawPhases.map((phase, index) => ({
      phaseNumber: phase.number ?? index + 1,
      name: phase.name ?? `Phase ${index + 1}`,
      description: phase.description ?? "",
      tasks: (phase.tasks ?? []).map((task, taskIdx) => ({
        taskId: task.id ?? `task-${index + 1}-${taskIdx + 1}`,
        description: task.description ?? task.title ?? "",
        riskId: (task.riskIds ?? [])[0], // Take first if any
        estimatedEffort: this.mapPriorityToEffort(task.priority),
      })),
      dependencies: index > 0 ? [index] : [], // Each phase depends on previous
    }));
    
    return {
      selectedOptionId,
      phases,
    };
  }

  private mapPriorityToEffort(priority?: string): "low" | "medium" | "high" {
    switch (priority) {
      case "critical":
      case "high":
        return "high";
      case "medium":
        return "medium";
      default:
        return "low";
    }
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
