// Planning Agent workflow - orchestrates analysis + stack evaluation + Q&A

import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "@jurassic/skills";

export interface WorkflowConfig {
  repoPath: string;
  runId: string;
  outputDir: string;
  interactive?: boolean;
  onQuestion?: (question: string, choices?: string[]) => Promise<string>;
  skills?: Map<string, Skill>;
}

export interface WorkflowPhase {
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  artifacts: string[];
  error?: string;
}

export interface WorkflowResult {
  runId: string;
  status: "completed" | "failed";
  phases: WorkflowPhase[];
  artifactDir: string;
  totalArtifacts: number;
  durationMs: number;
}

/** Phase definitions describing the planning workflow sequence. */
const PHASE_DEFINITIONS: ReadonlyArray<{ name: string; description: string; skill?: string }> = [
  { name: "snapshot", description: "Capture repository structure snapshot", skill: "repo_snapshot" },
  { name: "dependency_analysis", description: "Build and analyze dependency graph", skill: "include_graph" },
  { name: "stack_analysis", description: "Fingerprint technology stack", skill: "stack_fingerprint" },
  { name: "complexity_analysis", description: "Analyze code complexity metrics", skill: "repo_snapshot" },
  { name: "safety_analysis", description: "Identify safety-critical code paths", skill: "risk_scoring" },
  { name: "doc_coverage", description: "Measure documentation coverage", skill: "repo_snapshot" },
  { name: "risk_scoring", description: "Score risk factors per file", skill: "risk_scoring" },
  { name: "migration_options", description: "Evaluate migration strategies", skill: "migration_evaluator" },
  { name: "user_dialog", description: "Gather user requirements via Q&A", skill: "user_dialog" },
  { name: "plan_synthesis", description: "Synthesize modernization plan" },
];

/**
 * PlanningWorkflow — higher-level orchestration layer that coordinates
 * the Planning Agent's analysis phases in sequence.
 *
 * Strictly read-only: never modifies the target repository.
 */
export class PlanningWorkflow {
  /**
   * Execute the full planning workflow.
   *
   * Runs each phase sequentially, recording timing and status.
   * Failed phases are recorded but do not halt the workflow (best-effort).
   */
  async execute(config: WorkflowConfig): Promise<WorkflowResult> {
    const startTime = Date.now();
    const artifactDir = path.join(config.outputDir, config.runId, "planning");
    fs.mkdirSync(artifactDir, { recursive: true });

    const phases = this.buildPhases(config);
    let anyFailed = false;

    for (const phase of phases) {
      await this.executePhase(phase, config, artifactDir);
      if (phase.status === "failed") anyFailed = true;
    }

    // Validate that expected artifacts exist
    this.validateArtifacts(artifactDir);

    const totalArtifacts = phases.reduce((sum, p) => sum + p.artifacts.length, 0);

    return {
      runId: config.runId,
      status: anyFailed ? "failed" : "completed",
      phases,
      artifactDir,
      totalArtifacts,
      durationMs: Date.now() - startTime,
    };
  }

  /** Build initial phase objects from definitions, filtering user_dialog for non-interactive runs. */
  private buildPhases(config: WorkflowConfig): WorkflowPhase[] {
    return PHASE_DEFINITIONS
      .filter((def) => def.name !== "user_dialog" || config.interactive)
      .map((def) => ({
        name: def.name,
        description: def.description,
        status: "pending" as const,
        artifacts: [],
      }));
  }

  /** Execute a single workflow phase. */
  private async executePhase(
    phase: WorkflowPhase,
    config: WorkflowConfig,
    artifactDir: string,
  ): Promise<void> {
    const phaseDef = PHASE_DEFINITIONS.find((d) => d.name === phase.name);
    const skillName = phaseDef?.skill;
    const skills = config.skills;

    // Skip if no skill is registered for this phase (and it requires one)
    if (skillName && (!skills || !skills.has(skillName))) {
      phase.status = "skipped";
      this.writeRunLogEvent(artifactDir, phase, config.runId);
      return;
    }

    phase.status = "running";
    phase.startedAt = new Date().toISOString();

    try {
      if (skillName && skills?.has(skillName)) {
        const skill = skills.get(skillName)!;
        const context = this.buildSkillContext(phase.name, config);
        const result = await skill.execute(context);

        // Write phase artifact
        const artifactPath = this.writeArtifact(artifactDir, phase.name, result);
        phase.artifacts.push(artifactPath);
      }
      // plan_synthesis has no skill — it's a synthesis step
      if (phase.name === "plan_synthesis") {
        const synthesized = { phases: [], synthesizedAt: new Date().toISOString() };
        const artifactPath = this.writeArtifact(artifactDir, phase.name, synthesized);
        phase.artifacts.push(artifactPath);
      }

      phase.status = "completed";
      phase.completedAt = new Date().toISOString();
    } catch (err) {
      phase.status = "failed";
      phase.completedAt = new Date().toISOString();
      phase.error = err instanceof Error ? err.message : String(err);
    }

    this.writeRunLogEvent(artifactDir, phase, config.runId);
  }

  /** Build the context object passed to a skill. */
  private buildSkillContext(phaseName: string, config: WorkflowConfig): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
      repoPath: config.repoPath,
      runId: config.runId,
      phase: phaseName,
    };
    if (phaseName === "user_dialog" && config.onQuestion) {
      ctx.onQuestion = config.onQuestion;
    }
    return ctx;
  }

  /** Write a JSON artifact to the output directory. */
  writeArtifact(outputDir: string, name: string, data: unknown): string {
    const filePath = path.join(outputDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  }

  /** Write a RunLogEvent artifact for a phase. */
  private writeRunLogEvent(outputDir: string, phase: WorkflowPhase, runId: string): void {
    const event = {
      timestamp: new Date().toISOString(),
      runId,
      phase: phase.name,
      status: phase.status,
      startedAt: phase.startedAt,
      completedAt: phase.completedAt,
      artifacts: phase.artifacts,
      error: phase.error,
    };
    const filePath = path.join(outputDir, `RunLogEvent_${phase.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(event, null, 2), "utf-8");
  }

  /** Validate that artifact files referenced by phases actually exist. */
  validateArtifacts(outputDir: string): string[] {
    const missing: string[] = [];
    if (!fs.existsSync(outputDir)) return missing;
    // Check all RunLogEvent files exist for known phases
    const files = fs.readdirSync(outputDir);
    const runLogFiles = files.filter((f) => f.startsWith("RunLogEvent_"));
    if (runLogFiles.length === 0) {
      missing.push("No RunLogEvent files found");
    }
    return missing;
  }
}
