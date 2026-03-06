// Agent orchestrator - dispatches commands, manages artifact handoffs, approval gate

import { type AgentContext } from "./base.js";
import { PlanningAgent, type PlanningAgentOptions } from "./planning/index.js";
import { ImplementationAgent } from "./implementation/index.js";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

/** Commands the orchestrator can dispatch. */
export type OrchestratorCommand = "plan" | "implement" | "full-pipeline" | "evaluate";

/** Options for orchestrator execution. */
export interface OrchestratorOptions {
  /** The command to execute. */
  command: OrchestratorCommand;
  /** Agent execution context. */
  context: AgentContext;
  /** Planning Agent options (interactive, onQuestion). */
  planningOptions?: PlanningAgentOptions;
  /** If true, skip the approval gate (for testing). */
  skipApproval?: boolean;
  /** If true, the plan has been approved (required for 'implement'). */
  planApproved?: boolean;
  /** Baseline run ID for evaluation regression detection. */
  baselineRunId?: string;
  /** If true, run evaluation after pipeline completes. */
  runEvaluation?: boolean;
}

/** Result of an orchestrator run. */
export interface OrchestratorResult {
  command: OrchestratorCommand;
  status: "completed" | "failed" | "awaiting-approval";
  /** Paths to produced artifacts. */
  artifactPaths: string[];
  /** Error message if status is 'failed'. */
  error?: string;
}

/**
 * Orchestrator — coordinates the 2-agent workflow.
 *
 * Supported commands:
 * - `plan`: Run the Planning Agent (read-only analysis)
 * - `implement`: Run the Implementation Agent (requires approved plan)
 * - `full-pipeline`: plan → approval gate → implement
 * - `evaluate`: Run evaluation on existing artifacts
 *
 * The orchestrator enforces the approval gate:
 * Planning Agent artifacts must be explicitly approved before
 * the Implementation Agent can proceed.
 */
export class Orchestrator {
  /**
   * Execute a command through the orchestrator.
   */
  async execute(options: OrchestratorOptions): Promise<OrchestratorResult> {
    const { command, context } = options;

    switch (command) {
      case "plan":
        return this.executePlan(context, options.planningOptions);

      case "implement":
        return this.executeImplement(context, options);

      case "full-pipeline":
        return this.executeFullPipeline(context, options);

      case "evaluate":
        return this.executeEvaluate(context, options.baselineRunId);

      default:
        return {
          command,
          status: "failed",
          artifactPaths: [],
          error: `Unknown command: ${command}`,
        };
    }
  }

  /**
   * Run the Planning Agent.
   */
  private async executePlan(
    context: AgentContext,
    planningOptions?: PlanningAgentOptions,
  ): Promise<OrchestratorResult> {
    const agent = new PlanningAgent(planningOptions);
    try {
      await agent.initialize(context);
      await agent.run();
      return {
        command: "plan",
        status: "completed",
        artifactPaths: this.listArtifacts(context, "planning"),
      };
    } catch (error) {
      return {
        command: "plan",
        status: "failed",
        artifactPaths: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run the Implementation Agent (requires approved plan).
   */
  private async executeImplement(
    context: AgentContext,
    options: OrchestratorOptions,
  ): Promise<OrchestratorResult> {
    // Check approval gate
    if (!options.skipApproval && !options.planApproved) {
      const isApproved = this.checkApproval(context);
      if (!isApproved) {
        return {
          command: "implement",
          status: "awaiting-approval",
          artifactPaths: [],
          error: "Plan must be approved before implementation. Review planning artifacts and set --plan-approved.",
        };
      }
    }

    const agent = new ImplementationAgent();
    try {
      await agent.initialize(context);
      await agent.run();
      return {
        command: "implement",
        status: "completed",
        artifactPaths: this.listArtifacts(context, "implementation"),
      };
    } catch (error) {
      return {
        command: "implement",
        status: "failed",
        artifactPaths: this.listArtifacts(context, "implementation"),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Full pipeline: plan → approval → implement.
   */
  private async executeFullPipeline(
    context: AgentContext,
    options: OrchestratorOptions,
  ): Promise<OrchestratorResult> {
    // Step 1: Run Planning Agent
    const planResult = await this.executePlan(context, options.planningOptions);
    if (planResult.status === "failed") {
      return { ...planResult, command: "full-pipeline" };
    }

    // Step 2: Check approval gate
    if (!options.skipApproval && !options.planApproved) {
      return {
        command: "full-pipeline",
        status: "awaiting-approval",
        artifactPaths: planResult.artifactPaths,
        error: "Planning complete. Review artifacts and re-run with --plan-approved to proceed to implementation.",
      };
    }

    // Step 3: Run Implementation Agent
    const implResult = await this.executeImplement(context, {
      ...options,
      command: "implement",
    });

    // Step 4: Optional evaluation
    let evalArtifacts: string[] = [];
    if (options.runEvaluation) {
      try {
        const evalResult = await this.executeEvaluate(context, options.baselineRunId);
        evalArtifacts = evalResult.artifactPaths;
      } catch (error) {
        // Evaluation failure shouldn't fail the pipeline, just log warning
        console.warn("Evaluation failed:", error instanceof Error ? error.message : String(error));
      }
    }

    return {
      command: "full-pipeline",
      status: implResult.status,
      artifactPaths: [...planResult.artifactPaths, ...implResult.artifactPaths, ...evalArtifacts],
      error: implResult.error,
    };
  }

  /**
   * Run evaluation on artifacts from a completed run.
   */
  private async executeEvaluate(
    context: AgentContext,
    baselineRunId?: string,
  ): Promise<OrchestratorResult> {
    const artifactDir = join(context.artifactsDir, context.runId, "planning");
    
    if (!existsSync(artifactDir)) {
      return {
        command: "evaluate",
        status: "failed",
        artifactPaths: [],
        error: `No artifacts found for run ${context.runId}`,
      };
    }

    try {
      // Dynamic import to avoid circular dependencies
      const { EvaluationService } = await import("@jurassic/foundry");
      const evaluationService = new EvaluationService();
      
      const baselineDir = baselineRunId 
        ? join(context.artifactsDir, baselineRunId, "planning")
        : undefined;

      const report = await evaluationService.evaluate({
        runId: context.runId,
        agentType: "planning",
        artifactDir,
        baselineDir,
      });

      // Save evaluation report
      const reportPath = join(context.artifactsDir, context.runId, "EvaluationReport.json");
      writeFileSync(reportPath, JSON.stringify(report, null, 2));

      return {
        command: "evaluate",
        status: report.passed ? "completed" : "failed",
        artifactPaths: [reportPath],
        error: report.passed 
          ? undefined 
          : `Evaluation failed (score: ${report.overallScore.toFixed(3)})`,
      };
    } catch (error) {
      return {
        command: "evaluate",
        status: "failed",
        artifactPaths: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if planning artifacts have been approved.
   * Looks for an APPROVED marker file in the planning artifacts directory.
   */
  private checkApproval(context: AgentContext): boolean {
    const approvedPath = join(
      context.artifactsDir,
      context.runId,
      "planning",
      "APPROVED",
    );
    return existsSync(approvedPath);
  }

  /**
   * List artifact files produced by a specific agent.
   */
  private listArtifacts(context: AgentContext, agentName: string): string[] {
    const dir = join(context.artifactsDir, context.runId, agentName);
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir)
        .filter((f: string) => f.endsWith(".json"))
        .map((f: string) => join(dir, f));
    } catch {
      return [];
    }
  }
}
