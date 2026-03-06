import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FoundryIQClient,
  BUILTIN_EVALUATORS,
  artifactsToEvalDataset,
  type FoundryIQConfig,
  type EvaluationDataItem,
  type TestingCriterion,
} from "../foundry-iq.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock DefaultAzureCredential
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue({
      token: "mock-token",
      expiresOnTimestamp: Date.now() + 3600000,
    }),
  })),
}));

describe("BUILTIN_EVALUATORS", () => {
  it("defines expected quality evaluators", () => {
    expect(BUILTIN_EVALUATORS.COHERENCE).toBe("builtin.coherence");
    expect(BUILTIN_EVALUATORS.FLUENCY).toBe("builtin.fluency");
    expect(BUILTIN_EVALUATORS.RELEVANCE).toBe("builtin.relevance");
    expect(BUILTIN_EVALUATORS.GROUNDEDNESS).toBe("builtin.groundedness");
  });

  it("defines expected safety evaluators", () => {
    expect(BUILTIN_EVALUATORS.VIOLENCE).toBe("builtin.violence");
    expect(BUILTIN_EVALUATORS.SEXUAL).toBe("builtin.sexual");
    expect(BUILTIN_EVALUATORS.SELF_HARM).toBe("builtin.self_harm");
    expect(BUILTIN_EVALUATORS.HATE_UNFAIRNESS).toBe("builtin.hate_unfairness");
  });

  it("defines expected agent evaluators", () => {
    expect(BUILTIN_EVALUATORS.TASK_ADHERENCE).toBe("builtin.task_adherence");
    expect(BUILTIN_EVALUATORS.TOOL_CALL_ACCURACY).toBe("builtin.tool_call_accuracy");
  });
});

describe("FoundryIQClient", () => {
  let client: FoundryIQClient;
  const testConfig: FoundryIQConfig = {
    projectEndpoint: "https://test-foundry.openai.azure.com",
    modelDeployment: "gpt-4o",
    comparisonDeployment: "gpt-4o-mini",
  };

  beforeEach(() => {
    client = new FoundryIQClient(testConfig);
    mockFetch.mockReset();
  });

  describe("createAgentEvaluators", () => {
    it("returns evaluators with correct structure", () => {
      const evaluators = client.createAgentEvaluators();

      expect(evaluators).toHaveLength(4);
      expect(evaluators.map((e) => e.name)).toEqual([
        "coherence",
        "relevance",
        "groundedness",
        "violence",
      ]);
    });

    it("configures coherence evaluator correctly", () => {
      const evaluators = client.createAgentEvaluators();
      const coherence = evaluators.find((e) => e.name === "coherence");

      expect(coherence).toMatchObject({
        type: "azure_ai_evaluator",
        evaluator_name: BUILTIN_EVALUATORS.COHERENCE,
        initialization_parameters: {
          deployment_name: "gpt-4o",
        },
        data_mapping: {
          query: "{{item.query}}",
          response: "{{item.response}}",
        },
      });
    });

    it("configures violence evaluator without model dependency", () => {
      const evaluators = client.createAgentEvaluators();
      const violence = evaluators.find((e) => e.name === "violence");

      expect(violence).toMatchObject({
        type: "azure_ai_evaluator",
        evaluator_name: BUILTIN_EVALUATORS.VIOLENCE,
        data_mapping: {
          query: "{{item.query}}",
          response: "{{item.response}}",
        },
      });
      // Violence evaluator doesn't need model deployment
      expect(violence?.initialization_parameters).toBeUndefined();
    });

    it("configures groundedness evaluator with context", () => {
      const evaluators = client.createAgentEvaluators();
      const groundedness = evaluators.find((e) => e.name === "groundedness");

      expect(groundedness?.data_mapping).toEqual({
        query: "{{item.query}}",
        response: "{{item.response}}",
        context: "{{item.context}}",
      });
    });
  });

  describe("uploadDataset", () => {
    it("sends JSONL data to API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "dataset-123" }),
      });

      const data: EvaluationDataItem[] = [
        { query: "test query", response: "test response" },
      ];

      const result = await client.uploadDataset("test-dataset", "1", data);

      expect(result).toBe("dataset-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-foundry.openai.azure.com/datasets",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-token",
            "Content-Type": "application/json",
          }),
        }),
      );
    });
  });

  describe("createEvaluation", () => {
    it("creates evaluation definition with schema and criteria", async () => {
      const evalDef = {
        id: "eval-456",
        name: "test-eval",
        data_source_config: {},
        testing_criteria: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => evalDef,
      });

      const schema = { type: "object", properties: {} };
      const criteria: TestingCriterion[] = [];

      const result = await client.createEvaluation("test-eval", schema, criteria);

      expect(result).toEqual(evalDef);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-foundry.openai.azure.com/openai/evals",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  describe("createRun", () => {
    it("creates evaluation run", async () => {
      const evalRun = {
        id: "run-789",
        eval_id: "eval-456",
        name: "test-run",
        status: "queued" as const,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => evalRun,
      });

      const result = await client.createRun("eval-456", "test-run", "dataset-123");

      expect(result).toEqual(evalRun);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-foundry.openai.azure.com/openai/evals/eval-456/runs",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  describe("waitForCompletion", () => {
    it("returns immediately when status is completed", async () => {
      const completedRun = {
        id: "run-789",
        eval_id: "eval-456",
        name: "test-run",
        status: "completed" as const,
        result_counts: { passed: 10, failed: 2, total: 12 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => completedRun,
      });

      const result = await client.waitForCompletion("eval-456", "run-789", 1000, 100);

      expect(result.status).toBe("completed");
      expect(result.result_counts?.passed).toBe(10);
    });

    it("returns immediately when status is failed", async () => {
      const failedRun = {
        id: "run-789",
        eval_id: "eval-456",
        name: "test-run",
        status: "failed" as const,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => failedRun,
      });

      const result = await client.waitForCompletion("eval-456", "run-789", 1000, 100);

      expect(result.status).toBe("failed");
    });

    it("polls until completion", async () => {
      const runningRun = {
        id: "run-789",
        eval_id: "eval-456",
        name: "test-run",
        status: "running" as const,
      };
      const completedRun = { ...runningRun, status: "completed" as const };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => runningRun })
        .mockResolvedValueOnce({ ok: true, json: async () => completedRun });

      const result = await client.waitForCompletion("eval-456", "run-789", 5000, 100);

      expect(result.status).toBe("completed");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("compareModels", () => {
    it("throws when comparisonDeployment is not configured", async () => {
      const noComparisonConfig: FoundryIQConfig = {
        projectEndpoint: "https://test.openai.azure.com",
        modelDeployment: "gpt-4o",
      };
      const clientNoComparison = new FoundryIQClient(noComparisonConfig);

      await expect(
        clientNoComparison.compareModels("dataset-123", "test-run"),
      ).rejects.toThrow("comparisonDeployment is required for model comparison");
    });
  });
});

describe("artifactsToEvalDataset", () => {
  it("returns empty array when no artifacts found", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

    const result = await artifactsToEvalDataset("/nonexistent");

    expect(result).toEqual([]);
  });

  it("extracts eval items from ModernizationPlan phases", async () => {
    const { readFile } = await import("node:fs/promises");
    const plan = {
      phases: [
        {
          name: "Phase 1",
          rationale: "Initial cleanup",
          tasks: [{ description: "Remove dead code", rationale: "Simplify codebase" }],
        },
      ],
    };

    vi.mocked(readFile)
      .mockRejectedValueOnce(new Error("No manifest")) // Manifest read fails
      .mockResolvedValueOnce(JSON.stringify(plan)) // Plan read succeeds
      .mockRejectedValueOnce(new Error("No risk")); // Risk read fails

    const result = await artifactsToEvalDataset("/artifacts");

    expect(result).toHaveLength(2);
    expect(result[0].query).toBe("Generate modernization plan phase for Phase 1");
    expect(result[0].response).toBe("Initial cleanup");
    expect(result[1].query).toBe("Generate task for phase Phase 1");
    expect(result[1].response).toBe("Remove dead code");
  });

  it("extracts eval items from RiskAssessment", async () => {
    const { readFile } = await import("node:fs/promises");
    const risk = {
      items: [
        {
          filePath: "src/legacy.ts",
          overallScore: 8.5,
          severity: "high",
          evidence: ["uses eval()", "no types"],
        },
      ],
    };

    vi.mocked(readFile)
      .mockRejectedValueOnce(new Error("No manifest"))
      .mockRejectedValueOnce(new Error("No plan"))
      .mockResolvedValueOnce(JSON.stringify(risk));

    const result = await artifactsToEvalDataset("/artifacts");

    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("Assess risk for file src/legacy.ts");
    expect(result[0].response).toBe("Risk: high (score: 8.5)");
    expect(result[0].ground_truth).toBe("uses eval(); no types");
  });
});
