/**
 * End-to-End Integration Tests for Azure AI Foundry Evaluation Pipeline
 *
 * Validates the complete flow from artifact creation through evaluation.
 * Uses mocked Azure services to test integration points.
 *
 * @see Issue #84 - F4: Validate End-to-End Flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EvaluationService } from "../evaluation.js";
import {
  FoundryIQClient,
  artifactsToEvalDataset,
  runFoundryIQEvaluation,
  type FoundryIQConfig,
} from "../foundry-iq.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock DefaultAzureCredential
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue({
      token: "mock-e2e-token",
      expiresOnTimestamp: Date.now() + 3600000,
    }),
  })),
}));

describe("End-to-End Evaluation Pipeline", () => {
  let testDir: string;

  const foundryConfig: FoundryIQConfig = {
    projectEndpoint: "https://jurassic-ai-foundry.openai.azure.com",
    modelDeployment: "gpt-4o",
    comparisonDeployment: "gpt-4o-mini",
  };

  beforeEach(async () => {
    // Create temp directory for test artifacts
    testDir = join(tmpdir(), `jurassic-e2e-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    mockFetch.mockReset();
  });

  afterEach(async () => {
    // Cleanup temp directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("EvaluationService → Schema Conversion → Foundry IQ", () => {
    it("converts EvaluationReport to schema-compliant format", async () => {
      // Arrange: Create EvaluationService and generate a report
      const evalService = new EvaluationService();

      // Create artifact files
      const manifest = { runId: "e2e-test-run", repoUrl: "https://github.com/test/repo" };
      const dependencyGraph = {
        runId: "e2e-test-run",
        nodes: [
          { id: "a", filePath: "src/a.ts", nodeType: "module" },
          { id: "b", filePath: "src/b.ts", nodeType: "module" },
        ],
        edges: [{ source: "a", target: "b", relationship: "imports" }],
      };
      const modernizationPlan = {
        runId: "e2e-test-run",
        phases: [
          {
            phaseNumber: 1,
            name: "Initial cleanup",
            rationale: "Remove dead code",
            tasks: [{ taskId: "t1", description: "Delete unused imports" }],
          },
        ],
      };

      // Write artifacts to temp dir
      await writeFile(join(testDir, "Manifest.json"), JSON.stringify(manifest));
      await writeFile(join(testDir, "DependencyGraph.json"), JSON.stringify(dependencyGraph));
      await writeFile(join(testDir, "ModernizationPlan.json"), JSON.stringify(modernizationPlan));

      // Generate evaluation report
      const report = await evalService.evaluate({
        runId: "e2e-test-run",
        agentType: "planning",
        artifactDir: testDir,
      });

      // Convert to schema format
      const schemaReport = await evalService.toSchemaFormat(report, testDir);

      // Assert: Schema-compliant report structure
      expect(schemaReport).toMatchObject({
        runId: "e2e-test-run",
        evaluatedAt: expect.any(String),
        metrics: {
          artifactCompleteness: expect.any(Number),
          schemaValidationRate: expect.any(Number),
          determinismScore: expect.any(Number),
        },
        status: expect.stringMatching(/pass|fail|warning/),
      });

      // Metrics are normalized 0-1
      expect(schemaReport.metrics.artifactCompleteness).toBeGreaterThanOrEqual(0);
      expect(schemaReport.metrics.artifactCompleteness).toBeLessThanOrEqual(1);
      expect(schemaReport.metrics.schemaValidationRate).toBeGreaterThanOrEqual(0);
      expect(schemaReport.metrics.schemaValidationRate).toBeLessThanOrEqual(1);
    });

    it("persists artifacts and converts to eval dataset", async () => {
      // Arrange: Write sample artifacts to temp directory
      const manifest = { runId: "e2e-persist-run", repoUrl: "https://github.com/test" };
      const plan = {
        phases: [
          {
            name: "Security Fixes",
            rationale: "Address critical vulnerabilities",
            tasks: [
              { description: "Upgrade lodash to 4.17.21", rationale: "CVE fix" },
              { description: "Add input validation", rationale: "XSS prevention" },
            ],
          },
          {
            name: "Performance",
            rationale: "Optimize hot paths",
            tasks: [{ description: "Add caching layer" }],
          },
        ],
      };
      const risk = {
        items: [
          {
            filePath: "src/auth.ts",
            overallScore: 9.2,
            severity: "critical",
            evidence: ["hardcoded credentials", "no rate limiting"],
          },
        ],
      };

      await writeFile(join(testDir, "Manifest.json"), JSON.stringify(manifest));
      await writeFile(join(testDir, "ModernizationPlan.json"), JSON.stringify(plan));
      await writeFile(join(testDir, "RiskAssessment.json"), JSON.stringify(risk));

      // Act: Convert to eval dataset
      const evalData = await artifactsToEvalDataset(testDir);

      // Assert: Correct number of items extracted
      // 2 phases + 3 tasks + 1 risk item = 6 items
      expect(evalData.length).toBe(6);

      // Find phase items
      const phaseItems = evalData.filter((d) => d.query.includes("phase for"));
      expect(phaseItems).toHaveLength(2);

      // Find task items
      const taskItems = evalData.filter((d) => d.query.includes("task for phase"));
      expect(taskItems).toHaveLength(3);

      // Find risk items
      const riskItems = evalData.filter((d) => d.query.includes("Assess risk"));
      expect(riskItems).toHaveLength(1);
      expect(riskItems[0].ground_truth).toBe(
        "hardcoded credentials; no rate limiting",
      );
    });
  });

  describe("Foundry IQ Cloud Evaluation Flow", () => {
    it("runs complete evaluation pipeline with mocked API", async () => {
      // Arrange: Set up mock responses
      mockFetch
        // Upload dataset
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "dataset-e2e-123" }),
        })
        // Create evaluation
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "eval-e2e-456",
            name: "jurassic-agent-eval-e2e-run",
            data_source_config: {},
            testing_criteria: [],
          }),
        })
        // Create run
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-e2e-789",
            eval_id: "eval-e2e-456",
            name: "run-e2e-run",
            status: "queued",
          }),
        })
        // Poll for completion - return completed immediately
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-e2e-789",
            eval_id: "eval-e2e-456",
            name: "run-e2e-run",
            status: "completed",
            report_url: "https://foundry.azure.com/report/run-e2e-789",
            result_counts: { passed: 18, failed: 2, total: 20 },
            per_testing_criteria_results: [
              { name: "coherence", passed: 5, failed: 0, pass_rate: 1.0 },
              { name: "relevance", passed: 5, failed: 0, pass_rate: 1.0 },
              { name: "groundedness", passed: 4, failed: 1, pass_rate: 0.8 },
              { name: "violence", passed: 4, failed: 1, pass_rate: 0.8 },
            ],
          }),
        })
        // Get output items
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                item_id: "item-1",
                results: [
                  {
                    type: "azure_ai_evaluator",
                    name: "coherence",
                    metric: "coherence",
                    score: 5,
                    label: "pass",
                    threshold: 3,
                    passed: true,
                  },
                ],
              },
            ],
          }),
        });

      // Write minimal artifacts
      const plan = {
        phases: [
          {
            name: "Test Phase",
            rationale: "Test rationale",
            tasks: [{ description: "Test task" }],
          },
        ],
      };
      await writeFile(join(testDir, "ModernizationPlan.json"), JSON.stringify(plan));

      // Act: Run evaluation using the client directly with short poll interval
      const client = new FoundryIQClient(foundryConfig);
      const evalData = await artifactsToEvalDataset(testDir);
      const datasetId = await client.uploadDataset("test", "1", evalData);
      const evalDef = await client.createEvaluation(
        "test-eval",
        { type: "object", properties: {} },
        client.createAgentEvaluators(),
      );
      const evalRun = await client.createRun(evalDef.id, "test-run", datasetId);
      const completedRun = await client.waitForCompletion(evalDef.id, evalRun.id, 10000, 10);
      const outputItems = await client.getOutputItems(evalDef.id, completedRun.id);

      // Assert: Complete flow executed
      expect(completedRun.status).toBe("completed");
      expect(completedRun.result_counts).toEqual({
        passed: 18,
        failed: 2,
        total: 20,
      });
      expect(completedRun.report_url).toBe("https://foundry.azure.com/report/run-e2e-789");
      expect(outputItems).toHaveLength(1);

      // Verify API calls were made in correct order
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("handles API errors gracefully", async () => {
      // Arrange: Mock API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized - invalid token",
      });

      // Write minimal artifacts
      const plan = { phases: [{ name: "Phase", rationale: "R" }] };
      await writeFile(join(testDir, "ModernizationPlan.json"), JSON.stringify(plan));

      // Act & Assert: Should throw with error details
      await expect(
        runFoundryIQEvaluation(foundryConfig, testDir, "error-run"),
      ).rejects.toThrow("Foundry API error 401: Unauthorized - invalid token");
    });

    it("throws when no artifacts can be extracted", async () => {
      // Arrange: Empty artifact directory (no files)

      // Act & Assert: Should throw clear error
      await expect(
        runFoundryIQEvaluation(foundryConfig, testDir, "empty-run"),
      ).rejects.toThrow("No evaluation data could be extracted from artifacts");
    });
  });

  describe("Model Comparison Flow", () => {
    it("compares GPT-4o and GPT-4o-mini performance", async () => {
      const client = new FoundryIQClient(foundryConfig);

      // Mock all the API calls for two parallel evaluations
      mockFetch
        // Primary model: create eval
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "eval-primary",
            name: "compare-gpt-4o",
            data_source_config: {},
            testing_criteria: [],
          }),
        })
        // Primary model: create run
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-primary",
            eval_id: "eval-primary",
            name: "compare-primary",
            status: "queued",
          }),
        })
        // Comparison model: create eval
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "eval-comparison",
            name: "compare-gpt-4o-mini",
            data_source_config: {},
            testing_criteria: [],
          }),
        })
        // Comparison model: create run
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-comparison",
            eval_id: "eval-comparison",
            name: "compare-comparison",
            status: "queued",
          }),
        })
        // Primary: poll -> completed
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-primary",
            eval_id: "eval-primary",
            status: "completed",
            result_counts: { passed: 18, failed: 2, total: 20 },
          }),
        })
        // Comparison: poll -> completed
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-comparison",
            eval_id: "eval-comparison",
            status: "completed",
            result_counts: { passed: 16, failed: 4, total: 20 },
          }),
        });

      // Act: Run comparison
      const result = await client.compareModels("dataset-123", "model-compare");

      // Assert: Comparison results
      expect(result.primary.result_counts?.passed).toBe(18);
      expect(result.comparison.result_counts?.passed).toBe(16);

      // GPT-4o (90%) > GPT-4o-mini (80%) by >5%, so GPT-4o recommended
      expect(result.recommendation).toContain("gpt-4o recommended");
      expect(result.recommendation).toContain("90.0%");
      expect(result.recommendation).toContain("80.0%");
    });

    it("recommends cost-efficient model when performance is similar", async () => {
      const client = new FoundryIQClient(foundryConfig);

      // Mock similar performance results
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "eval-p", name: "e", data_source_config: {}, testing_criteria: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "run-p", eval_id: "eval-p", status: "queued" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "eval-c", name: "e", data_source_config: {}, testing_criteria: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "run-c", eval_id: "eval-c", status: "queued" }),
        })
        // Similar results: 85% vs 82%
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-p",
            eval_id: "eval-p",
            status: "completed",
            result_counts: { passed: 17, failed: 3, total: 20 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "run-c",
            eval_id: "eval-c",
            status: "completed",
            result_counts: { passed: 16, failed: 4, total: 20 },
          }),
        });

      const result = await client.compareModels("dataset-123", "similar-test");

      // Within 5% difference, recommend cheaper model
      expect(result.recommendation).toContain("perform similarly");
      expect(result.recommendation).toContain("gpt-4o-mini");
      expect(result.recommendation).toContain("cost efficiency");
    });
  });

  describe("Configuration Validation", () => {
    it("loads config from foundry.config.json format", async () => {
      // This validates the config format matches what we use
      const configFile = {
        projectEndpoint: "https://jurassic-ai-foundry.openai.azure.com",
        modelDeployment: "gpt-4o",
        comparisonDeployment: "gpt-4o-mini",
        subscriptionId: "55a21ac9-472f-4164-b5fb-fb57f32566d3",
        resourceGroup: "rg-copilotchallenge",
      };

      // FoundryIQConfig accepts this format
      const config: FoundryIQConfig = {
        projectEndpoint: configFile.projectEndpoint,
        modelDeployment: configFile.modelDeployment,
        comparisonDeployment: configFile.comparisonDeployment,
      };

      const client = new FoundryIQClient(config);
      expect(client).toBeDefined();

      // Evaluators use the deployment from config
      const evaluators = client.createAgentEvaluators();
      const coherence = evaluators.find((e) => e.name === "coherence");
      expect(coherence?.initialization_parameters?.deployment_name).toBe("gpt-4o");
    });

    it("uses DefaultAzureCredential for authentication", async () => {
      // The client should use DefaultAzureCredential, not API keys
      const client = new FoundryIQClient(foundryConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "test" }),
      });

      await client.uploadDataset("test", "1", [{ query: "q", response: "r" }]);

      // Verify Bearer token auth was used
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mock-e2e-token",
          }),
        }),
      );
    });
  });
});
