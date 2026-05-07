/**
 * Foundry IQ Cloud Evaluation Integration
 *
 * Programmatic interface to Azure AI Foundry evaluation APIs for:
 * - Creating evaluation definitions with custom testing criteria
 * - Uploading agent run artifacts as evaluation datasets
 * - Running evaluations and polling for results
 * - Model comparison (GPT-4o vs GPT-4o-mini)
 *
 * @see https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/cloud-evaluation
 */

import { DefaultAzureCredential } from "@azure/identity";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface FoundryIQConfig {
  /** Foundry project endpoint (e.g., https://account.services.ai.azure.com/api/projects/project) */
  projectEndpoint: string;
  /** Model deployment name for AI-assisted evaluators */
  modelDeployment: string;
  /** Optional comparison model deployment */
  comparisonDeployment?: string;
}

export interface EvaluationDataItem {
  query: string;
  response: string;
  ground_truth?: string;
  context?: string;
  [key: string]: unknown;
}

export interface TestingCriterion {
  type: "azure_ai_evaluator";
  name: string;
  evaluator_name: string;
  initialization_parameters?: Record<string, unknown>;
  data_mapping: Record<string, string>;
}

export interface EvalDefinition {
  id: string;
  name: string;
  data_source_config: Record<string, unknown>;
  testing_criteria: TestingCriterion[];
}

export interface EvalRun {
  id: string;
  eval_id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  report_url?: string;
  result_counts?: {
    passed: number;
    failed: number;
    total: number;
  };
  per_testing_criteria_results?: Array<{
    name: string;
    passed: number;
    failed: number;
    pass_rate: number;
  }>;
}

export interface EvalOutputItem {
  item_id: string;
  results: Array<{
    type: string;
    name: string;
    metric: string;
    score: number;
    label: "pass" | "fail";
    reason?: string;
    threshold: number;
    passed: boolean;
  }>;
}

/**
 * Built-in evaluators from Azure AI Foundry
 * @see https://learn.microsoft.com/en-us/azure/foundry/concepts/built-in-evaluators
 */
export const BUILTIN_EVALUATORS = {
  // Quality evaluators
  COHERENCE: "builtin.coherence",
  FLUENCY: "builtin.fluency",
  RELEVANCE: "builtin.relevance",
  GROUNDEDNESS: "builtin.groundedness",

  // Safety evaluators
  VIOLENCE: "builtin.violence",
  SEXUAL: "builtin.sexual",
  SELF_HARM: "builtin.self_harm",
  HATE_UNFAIRNESS: "builtin.hate_unfairness",
  PROTECTED_MATERIAL: "builtin.protected_material",

  // Similarity evaluators
  F1_SCORE: "builtin.f1_score",
  SIMILARITY: "builtin.similarity",

  // Agent evaluators
  TASK_ADHERENCE: "builtin.task_adherence",
  TOOL_CALL_ACCURACY: "builtin.tool_call_accuracy",
} as const;

/**
 * Foundry IQ Cloud Evaluation Client
 *
 * Provides programmatic access to Azure AI Foundry evaluation APIs.
 */
export class FoundryIQClient {
  private credential: DefaultAzureCredential;
  private config: FoundryIQConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: FoundryIQConfig) {
    this.config = config;
    this.credential = new DefaultAzureCredential();
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiry > now + 60000) {
      return this.accessToken;
    }

    const tokenResponse = await this.credential.getToken(
      "https://cognitiveservices.azure.com/.default",
    );
    this.accessToken = tokenResponse.token;
    this.tokenExpiry = tokenResponse.expiresOnTimestamp;
    return this.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.config.projectEndpoint}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "api-version": "2024-12-01-preview",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Foundry API error ${response.status}: ${errorText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Upload a JSONL dataset for evaluation
   */
  async uploadDataset(
    name: string,
    version: string,
    data: EvaluationDataItem[],
  ): Promise<string> {
    // Convert data to JSONL format
    const jsonlContent = data.map((item) => JSON.stringify(item)).join("\n");

    // Upload as file
    const response = await this.request<{ id: string }>("POST", "/datasets", {
      name,
      version,
      file_content: jsonlContent,
    });

    return response.id;
  }

  /**
   * Create an evaluation definition with testing criteria
   */
  async createEvaluation(
    name: string,
    itemSchema: Record<string, unknown>,
    testingCriteria: TestingCriterion[],
  ): Promise<EvalDefinition> {
    return this.request<EvalDefinition>("POST", "/openai/evals", {
      name,
      data_source_config: {
        type: "custom",
        item_schema: itemSchema,
      },
      testing_criteria: testingCriteria,
    });
  }

  /**
   * Create evaluation run against a dataset
   */
  async createRun(
    evalId: string,
    name: string,
    datasetId: string,
  ): Promise<EvalRun> {
    return this.request<EvalRun>("POST", `/openai/evals/${evalId}/runs`, {
      name,
      data_source: {
        type: "jsonl",
        source: {
          type: "file_id",
          id: datasetId,
        },
      },
    });
  }

  /**
   * Poll for evaluation run completion
   */
  async waitForCompletion(
    evalId: string,
    runId: string,
    timeoutMs = 300000,
    pollIntervalMs = 5000,
  ): Promise<EvalRun> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const run = await this.request<EvalRun>(
        "GET",
        `/openai/evals/${evalId}/runs/${runId}`,
      );

      if (run.status === "completed" || run.status === "failed") {
        return run;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Evaluation run timed out after ${timeoutMs}ms`);
  }

  /**
   * Get detailed output items from a completed run
   */
  async getOutputItems(evalId: string, runId: string): Promise<EvalOutputItem[]> {
    const response = await this.request<{ data: EvalOutputItem[] }>(
      "GET",
      `/openai/evals/${evalId}/runs/${runId}/output_items`,
    );
    return response.data;
  }

  /**
   * Create standard Jurassic agent evaluators
   *
   * Returns testing criteria for:
   * - Coherence: Response clarity and logical flow
   * - Relevance: Response matches the query
   * - Groundedness: Response grounded in context (if provided)
   * - Safety: No harmful content (violence check)
   */
  createAgentEvaluators(): TestingCriterion[] {
    const modelDeployment = this.config.modelDeployment;

    return [
      {
        type: "azure_ai_evaluator",
        name: "coherence",
        evaluator_name: BUILTIN_EVALUATORS.COHERENCE,
        initialization_parameters: {
          deployment_name: modelDeployment,
        },
        data_mapping: {
          query: "{{item.query}}",
          response: "{{item.response}}",
        },
      },
      {
        type: "azure_ai_evaluator",
        name: "relevance",
        evaluator_name: BUILTIN_EVALUATORS.RELEVANCE,
        initialization_parameters: {
          deployment_name: modelDeployment,
        },
        data_mapping: {
          query: "{{item.query}}",
          response: "{{item.response}}",
        },
      },
      {
        type: "azure_ai_evaluator",
        name: "groundedness",
        evaluator_name: BUILTIN_EVALUATORS.GROUNDEDNESS,
        initialization_parameters: {
          deployment_name: modelDeployment,
        },
        data_mapping: {
          query: "{{item.query}}",
          response: "{{item.response}}",
          context: "{{item.context}}",
        },
      },
      {
        type: "azure_ai_evaluator",
        name: "violence",
        evaluator_name: BUILTIN_EVALUATORS.VIOLENCE,
        data_mapping: {
          query: "{{item.query}}",
          response: "{{item.response}}",
        },
      },
    ];
  }

  /**
   * Run model comparison evaluation
   *
   * Evaluates the same dataset against two models and returns comparative results.
   * Used for GPT-4o vs GPT-4o-mini comparison (issue #73).
   */
  async compareModels(
    datasetId: string,
    runName: string,
  ): Promise<{
    primary: EvalRun;
    comparison: EvalRun;
    recommendation: string;
  }> {
    if (!this.config.comparisonDeployment) {
      throw new Error("comparisonDeployment is required for model comparison");
    }

    // Create evaluation definitions for both models
    const schema = {
      type: "object",
      properties: {
        query: { type: "string" },
        response: { type: "string" },
        context: { type: "string" },
      },
      required: ["query", "response"],
    };

    // Primary model evaluation
    const primaryEvaluators = this.createAgentEvaluators();
    const primaryEval = await this.createEvaluation(
      `${runName}-${this.config.modelDeployment}`,
      schema,
      primaryEvaluators,
    );
    const primaryRun = await this.createRun(
      primaryEval.id,
      `${runName}-primary`,
      datasetId,
    );

    // Comparison model evaluation (swap deployment)
    const originalDeployment = this.config.modelDeployment;
    this.config.modelDeployment = this.config.comparisonDeployment;
    const comparisonEvaluators = this.createAgentEvaluators();
    this.config.modelDeployment = originalDeployment;

    const comparisonEval = await this.createEvaluation(
      `${runName}-${this.config.comparisonDeployment}`,
      schema,
      comparisonEvaluators,
    );
    const comparisonRun = await this.createRun(
      comparisonEval.id,
      `${runName}-comparison`,
      datasetId,
    );

    // Wait for both to complete
    const [primaryResult, comparisonResult] = await Promise.all([
      this.waitForCompletion(primaryEval.id, primaryRun.id),
      this.waitForCompletion(comparisonEval.id, comparisonRun.id),
    ]);

    // Generate recommendation
    const primaryPassRate =
      (primaryResult.result_counts?.passed ?? 0) /
      (primaryResult.result_counts?.total ?? 1);
    const comparisonPassRate =
      (comparisonResult.result_counts?.passed ?? 0) /
      (comparisonResult.result_counts?.total ?? 1);

    let recommendation: string;
    if (primaryPassRate > comparisonPassRate + 0.05) {
      recommendation = `${this.config.modelDeployment} recommended (${(primaryPassRate * 100).toFixed(1)}% vs ${(comparisonPassRate * 100).toFixed(1)}%)`;
    } else if (comparisonPassRate > primaryPassRate + 0.05) {
      recommendation = `${this.config.comparisonDeployment} recommended (${(comparisonPassRate * 100).toFixed(1)}% vs ${(primaryPassRate * 100).toFixed(1)}%)`;
    } else {
      recommendation = `Models perform similarly (${this.config.modelDeployment}: ${(primaryPassRate * 100).toFixed(1)}%, ${this.config.comparisonDeployment}: ${(comparisonPassRate * 100).toFixed(1)}%); prefer ${this.config.comparisonDeployment} for cost efficiency`;
    }

    return {
      primary: primaryResult,
      comparison: comparisonResult,
      recommendation,
    };
  }
}

/**
 * Convert agent artifacts to evaluation dataset format
 *
 * Transforms Jurassic agent run artifacts into the JSONL format
 * expected by Foundry IQ evaluations.
 */
export async function artifactsToEvalDataset(
  artifactDir: string,
): Promise<EvaluationDataItem[]> {
  const items: EvaluationDataItem[] = [];

  // Read manifest for run context
  let manifest: { runId?: string; repoUrl?: string } = {};
  try {
    const manifestContent = await readFile(
      join(artifactDir, "Manifest.json"),
      "utf-8",
    );
    manifest = JSON.parse(manifestContent);
  } catch {
    // No manifest available
  }

  // Read ModernizationPlan for query/response pairs
  try {
    const planContent = await readFile(
      join(artifactDir, "ModernizationPlan.json"),
      "utf-8",
    );
    const plan = JSON.parse(planContent) as {
      phases?: Array<{
        name: string;
        rationale?: string;
        tasks?: Array<{ description: string; rationale?: string }>;
      }>;
    };

    if (plan.phases) {
      for (const phase of plan.phases) {
        // Each phase becomes an eval item
        items.push({
          query: `Generate modernization plan phase for ${phase.name}`,
          response: phase.rationale ?? phase.name,
          context: JSON.stringify({ runId: manifest.runId, phase: phase.name }),
        });

        // Each task becomes an eval item
        if (phase.tasks) {
          for (const task of phase.tasks) {
            items.push({
              query: `Generate task for phase ${phase.name}`,
              response: task.description,
              context: JSON.stringify({
                phase: phase.name,
                rationale: task.rationale,
              }),
            });
          }
        }
      }
    }
  } catch {
    // No plan available
  }

  // Read RiskAssessment for additional eval items
  try {
    const riskContent = await readFile(
      join(artifactDir, "RiskAssessment.json"),
      "utf-8",
    );
    const risk = JSON.parse(riskContent) as {
      items?: Array<{
        filePath: string;
        overallScore: number;
        severity: string;
        evidence?: string[];
      }>;
    };

    if (risk.items) {
      for (const item of risk.items) {
        items.push({
          query: `Assess risk for file ${item.filePath}`,
          response: `Risk: ${item.severity} (score: ${item.overallScore})`,
          ground_truth: item.evidence?.join("; ") ?? "",
          context: JSON.stringify({ filePath: item.filePath }),
        });
      }
    }
  } catch {
    // No risk assessment available
  }

  return items;
}

/**
 * Run a complete Foundry IQ evaluation for an agent run
 *
 * This is the main entry point for F3 (Foundry IQ Dashboard Setup).
 * It uploads artifacts, creates evaluators, runs evaluation, and returns results.
 */
export async function runFoundryIQEvaluation(
  config: FoundryIQConfig,
  artifactDir: string,
  runId: string,
): Promise<{
  evalRun: EvalRun;
  outputItems: EvalOutputItem[];
  reportUrl: string;
}> {
  const client = new FoundryIQClient(config);

  // Convert artifacts to evaluation dataset
  const evalData = await artifactsToEvalDataset(artifactDir);

  if (evalData.length === 0) {
    throw new Error("No evaluation data could be extracted from artifacts");
  }

  // Upload dataset
  const datasetId = await client.uploadDataset(
    `jurassic-eval-${runId}`,
    "1",
    evalData,
  );

  // Create evaluation with standard agent evaluators
  const schema = {
    type: "object",
    properties: {
      query: { type: "string" },
      response: { type: "string" },
      ground_truth: { type: "string" },
      context: { type: "string" },
    },
    required: ["query", "response"],
  };

  const evaluators = client.createAgentEvaluators();
  const evalDef = await client.createEvaluation(
    `jurassic-agent-eval-${runId}`,
    schema,
    evaluators,
  );

  // Create and run evaluation
  const evalRun = await client.createRun(evalDef.id, `run-${runId}`, datasetId);

  // Wait for completion
  const completedRun = await client.waitForCompletion(evalDef.id, evalRun.id);

  // Get detailed results
  const outputItems = await client.getOutputItems(evalDef.id, completedRun.id);

  return {
    evalRun: completedRun,
    outputItems,
    reportUrl: completedRun.report_url ?? `${config.projectEndpoint}/evals/${evalDef.id}/runs/${completedRun.id}`,
  };
}
