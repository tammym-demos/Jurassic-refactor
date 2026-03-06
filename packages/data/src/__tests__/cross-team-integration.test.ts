/**
 * Cross-Team Integration Tests (Issue #88)
 *
 * Validates the integration between:
 * - Fabric IQ (ontology, data bindings, data agent)
 * - Foundry IQ (evaluation metrics, tabular formatters)
 * - OneLake Pipeline (data persistence, governance views)
 * - Agent Pipeline (planning → implementation workflow)
 *
 * These tests verify that all components work together correctly
 * and that data flows properly through the system.
 *
 * Set JURASSIC_INTEGRATION_TEST=true to run against live services.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  FabricIQClient,
  MODERNIZATION_ONTOLOGY,
  DATA_BINDINGS,
  DATA_AGENT_EXAMPLES,
} from "../fabric-iq.js";
import {
  formatEvalItemsTable,
  formatCriteriaSummaryTable,
  extractAggregateSummary,
  formatRunComparisonTable,
  formatDetailedItemTable,
  toJsonLines,
} from "@jurassic/foundry";
import type { EvalRun, EvalOutputItem } from "@jurassic/foundry";
import type { EvaluationRecord } from "../lakehouse-tables.js";

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockEvalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    id: "eval-run-123",
    eval_id: "eval-def-456",
    name: "integration-test-run",
    status: "completed",
    result_counts: {
      passed: 8,
      failed: 2,
      total: 10,
    },
    per_testing_criteria_results: [
      { name: "coherence", passed: 9, failed: 1, pass_rate: 0.9 },
      { name: "relevance", passed: 8, failed: 2, pass_rate: 0.8 },
      { name: "groundedness", passed: 7, failed: 3, pass_rate: 0.7 },
      { name: "violence", passed: 10, failed: 0, pass_rate: 1.0 },
    ],
    report_url: "https://foundry.azure.com/evals/123/runs/456",
    ...overrides,
  };
}

function createMockOutputItems(count: number = 3): EvalOutputItem[] {
  return Array.from({ length: count }, (_, i) => ({
    item_id: `item-${i + 1}`,
    results: [
      {
        type: "azure_ai_evaluator",
        name: "coherence",
        metric: "coherence_score",
        score: 0.85 + Math.random() * 0.1,
        label: "pass" as const,
        threshold: 0.7,
        passed: true,
      },
      {
        type: "azure_ai_evaluator",
        name: "relevance",
        metric: "relevance_score",
        score: i % 3 === 0 ? 0.6 : 0.8,
        label: (i % 3 === 0 ? "fail" : "pass") as const,
        threshold: 0.7,
        passed: i % 3 !== 0,
        reason: i % 3 === 0 ? "Response not relevant to query" : undefined,
      },
      {
        type: "azure_ai_evaluator",
        name: "groundedness",
        metric: "groundedness_score",
        score: 0.75 + Math.random() * 0.2,
        label: "pass" as const,
        threshold: 0.6,
        passed: true,
      },
    ],
  }));
}

// ============================================================================
// FABRIC IQ + FOUNDRY IQ INTEGRATION
// ============================================================================

describe("Cross-Team Integration: Fabric IQ + Foundry IQ", () => {
  let fabricClient: FabricIQClient;

  beforeAll(() => {
    fabricClient = new FabricIQClient();
  });

  describe("Ontology aligns with Foundry evaluation schema", () => {
    it("Evaluation entity type matches EvaluationRecord interface", () => {
      const ontology = fabricClient.getOntologyDefinition();
      const evalEntity = ontology.entityTypes.find((e) => e.name === "Evaluation");

      expect(evalEntity).toBeDefined();

      // Verify properties match EvaluationRecord from lakehouse-tables.ts
      const propNames = evalEntity!.properties.map((p) => p.name);
      expect(propNames).toContain("status");
      expect(propNames).toContain("artifactCompleteness");
      expect(propNames).toContain("schemaValidationRate");
      expect(propNames).toContain("determinismScore");
      expect(propNames).toContain("regressionDetected");
      expect(propNames).toContain("evaluatedAt");
    });

    it("Run entity has relationship to Evaluation", () => {
      const ontology = fabricClient.getOntologyDefinition();
      const evalRelation = ontology.relationships.find((r) => r.name === "hasEvaluation");

      expect(evalRelation).toBeDefined();
      expect(evalRelation!.sourceEntityType).toBe("Run");
      expect(evalRelation!.targetEntityType).toBe("Evaluation");
      expect(evalRelation!.cardinality).toBe("one-to-one");
    });
  });

  describe("Data bindings support Foundry IQ evaluation writes", () => {
    it("evaluations table binding exists", () => {
      const bindings = fabricClient.getDataBindings();
      const evalBinding = bindings.find((b) => b.tableName === "evaluations");

      expect(evalBinding).toBeDefined();
      expect(evalBinding!.entityType).toBe("Evaluation");
    });

    it("evaluation binding maps all required columns", () => {
      const bindings = fabricClient.getDataBindings();
      const evalBinding = bindings.find((b) => b.tableName === "evaluations");

      const mappings = evalBinding!.columnMappings;
      expect(mappings.status).toBe("status");
      expect(mappings.artifactCompleteness).toBe("artifactCompleteness");
      expect(mappings.schemaValidationRate).toBe("schemaValidationRate");
      expect(mappings.determinismScore).toBe("determinismScore");
    });
  });

  describe("Foundry eval formatters produce valid tabular data", () => {
    it("formatEvalItemsTable creates Markdown table for Data Agent display", () => {
      const outputItems = createMockOutputItems(5);
      const table = formatEvalItemsTable(outputItems);

      expect(table.markdown).toContain("|");
      expect(table.markdown).toContain("item_id");
      expect(table.markdown).toContain("coherence");
      expect(table.markdown).toContain("relevance");
      expect(table.rows.length).toBe(5);
    });

    it("formatCriteriaSummaryTable aligns with Data Agent query format", () => {
      const evalRun = createMockEvalRun();
      const markdown = formatCriteriaSummaryTable(evalRun);

      // Should be parseable by Data Agent for natural language responses
      expect(markdown).toContain("Criterion");
      expect(markdown).toContain("Pass Rate");
      expect(markdown).toContain("coherence");
      expect(markdown).toContain("90.0%");
    });

    it("extractAggregateSummary provides data for ontology Evaluation entity", () => {
      const evalRun = createMockEvalRun();
      const summary = extractAggregateSummary(evalRun);

      // Summary should map to Evaluation entity properties
      expect(summary.runId).toBe("eval-run-123");
      expect(summary.status).toBe("completed");
      expect(summary.overallPassRate).toBeCloseTo(0.8, 1);
      expect(summary.criteriaSummaries.length).toBe(4);
    });
  });

  describe("JSONL export integrates with Lakehouse tables", () => {
    it("toJsonLines produces records compatible with evaluations table", () => {
      const evalRun = createMockEvalRun();
      const outputItems = createMockOutputItems(3);
      const jsonl = toJsonLines(evalRun, outputItems);

      const lines = jsonl.split("\n").filter((l) => l.trim());
      expect(lines.length).toBe(9); // 3 items × 3 criteria each

      const firstRecord = JSON.parse(lines[0]);
      expect(firstRecord).toHaveProperty("eval_id");
      expect(firstRecord).toHaveProperty("run_id");
      expect(firstRecord).toHaveProperty("item_id");
      expect(firstRecord).toHaveProperty("criterion");
      expect(firstRecord).toHaveProperty("score");
      expect(firstRecord).toHaveProperty("passed");
      expect(firstRecord).toHaveProperty("evaluated_at");
    });
  });
});

// ============================================================================
// DATA AGENT QUERY COMPATIBILITY
// ============================================================================

describe("Cross-Team Integration: Data Agent Queries", () => {
  let fabricClient: FabricIQClient;

  beforeAll(() => {
    fabricClient = new FabricIQClient();
  });

  describe("Example queries cover Foundry evaluation use cases", () => {
    it("includes failed evaluation query", () => {
      const examples = fabricClient.getDataAgentExamples();
      const failedEvalQuery = examples.find(
        (e) => e.question.toLowerCase().includes("evaluation") && e.question.toLowerCase().includes("fail"),
      );

      expect(failedEvalQuery).toBeDefined();
      expect(failedEvalQuery!.query).toContain("evaluations");
      expect(failedEvalQuery!.query.toLowerCase()).toContain("fail");
    });

    it("includes run artifacts query compatible with evaluation artifacts", () => {
      const examples = fabricClient.getDataAgentExamples();
      const artifactQuery = examples.find((e) => e.question.toLowerCase().includes("artifact"));

      expect(artifactQuery).toBeDefined();
      expect(artifactQuery!.query).toContain("artifacts");
    });

    it("includes audit trail query for full run lineage", () => {
      const examples = fabricClient.getDataAgentExamples();
      const auditQuery = examples.find((e) => e.question.toLowerCase().includes("audit"));

      expect(auditQuery).toBeDefined();
      // Should join runs, skills, artifacts - full lineage
      expect(auditQuery!.query).toContain("runs");
      expect(auditQuery!.query).toContain("skill_invocations");
      expect(auditQuery!.query).toContain("artifacts");
    });
  });

  describe("Data Agent instructions include evaluation domain", () => {
    it("instructions mention evaluation metrics", () => {
      const instructions = fabricClient.getDataAgentInstructions();

      expect(instructions).toContain("artifactCompleteness");
      expect(instructions).toContain("determinismScore");
    });

    it("instructions explain key evaluation concepts", () => {
      const instructions = fabricClient.getDataAgentInstructions();

      expect(instructions).toContain("riskScore");
      expect(instructions).toContain("Skills");
      expect(instructions).toContain("Artifacts");
    });
  });
});

// ============================================================================
// MODEL COMPARISON INTEGRATION
// ============================================================================

describe("Cross-Team Integration: Model Comparison", () => {
  it("formatRunComparisonTable supports GPT-4o vs GPT-4o-mini comparison", () => {
    const gpt4oRun = createMockEvalRun({
      id: "gpt4o-run",
      name: "gpt-4o-eval",
      result_counts: { passed: 9, failed: 1, total: 10 },
    });

    const gpt4oMiniRun = createMockEvalRun({
      id: "gpt4o-mini-run",
      name: "gpt-4o-mini-eval",
      result_counts: { passed: 7, failed: 3, total: 10 },
    });

    const comparison = formatRunComparisonTable(
      [gpt4oRun, gpt4oMiniRun],
      ["GPT-4o", "GPT-4o-mini"],
    );

    expect(comparison).toContain("GPT-4o");
    expect(comparison).toContain("GPT-4o-mini");
    expect(comparison).toContain("Overall");
    expect(comparison).toContain("coherence");
  });

  it("comparison table includes all criteria from both runs", () => {
    const run1 = createMockEvalRun({
      per_testing_criteria_results: [
        { name: "coherence", passed: 9, failed: 1, pass_rate: 0.9 },
        { name: "safety", passed: 10, failed: 0, pass_rate: 1.0 },
      ],
    });

    const run2 = createMockEvalRun({
      per_testing_criteria_results: [
        { name: "coherence", passed: 8, failed: 2, pass_rate: 0.8 },
        { name: "relevance", passed: 7, failed: 3, pass_rate: 0.7 },
      ],
    });

    const comparison = formatRunComparisonTable([run1, run2]);

    // Should include all unique criteria
    expect(comparison).toContain("coherence");
    expect(comparison).toContain("safety");
    expect(comparison).toContain("relevance");
  });
});

// ============================================================================
// END-TO-END DATA FLOW VALIDATION
// ============================================================================

describe("Cross-Team Integration: End-to-End Data Flow", () => {
  it("Evaluation data can flow: Foundry IQ → JSONL → Lakehouse → Data Agent", () => {
    // Step 1: Foundry IQ produces evaluation results
    const evalRun = createMockEvalRun();
    const outputItems = createMockOutputItems(5);

    // Step 2: Format as JSONL for Lakehouse ingestion
    const jsonl = toJsonLines(evalRun, outputItems);
    const records = jsonl.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

    // Step 3: Verify records match Fabric IQ schema expectations
    const fabricClient = new FabricIQClient();
    const ontology = fabricClient.getOntologyDefinition();
    const evalEntity = ontology.entityTypes.find((e) => e.name === "Evaluation");

    // Each record should have properties that can be queried via Data Agent
    for (const record of records) {
      expect(record.eval_id).toBeTruthy();
      expect(record.criterion).toBeTruthy();
      expect(typeof record.score).toBe("number");
      expect(typeof record.passed).toBe("boolean");
    }

    // Step 4: Verify Data Agent has queries for this data
    const examples = fabricClient.getDataAgentExamples();
    const relevantQueries = examples.filter(
      (e) =>
        e.query.toLowerCase().includes("evaluation") ||
        e.query.toLowerCase().includes("fail") ||
        e.question.toLowerCase().includes("run"),
    );
    expect(relevantQueries.length).toBeGreaterThan(0);
  });

  it("Ontology diagram includes evaluation workflow", () => {
    const fabricClient = new FabricIQClient();
    const diagram = fabricClient.generateOntologyDiagram();

    // Diagram should show the evaluation relationship
    expect(diagram).toContain("Run");
    expect(diagram).toContain("Evaluation");
    expect(diagram).toContain("hasEvaluation");
  });

  it("Exported ontology JSON includes evaluation data bindings", () => {
    const fabricClient = new FabricIQClient();
    const json = fabricClient.exportOntologyJson();
    const parsed = JSON.parse(json);

    // Find evaluation binding
    const evalBinding = parsed.dataBindings.find(
      (b: { entityType: string }) => b.entityType === "Evaluation",
    );

    expect(evalBinding).toBeDefined();
    expect(evalBinding.source.tableName).toBe("evaluations");
  });
});

// ============================================================================
// LIVE SERVICE INTEGRATION (opt-in)
// ============================================================================

const shouldRunLive = process.env.JURASSIC_INTEGRATION_TEST === "true";

describe.skipIf(!shouldRunLive)("Cross-Team Integration: Live Services", () => {
  it("placeholder for live Fabric IQ API tests", async () => {
    // When live services are available:
    // - Create ontology in Fabric IQ
    // - Write evaluation records to Lakehouse
    // - Query via Data Agent
    // - Verify end-to-end flow
    expect(true).toBe(true);
  });

  it("placeholder for live Foundry IQ evaluation tests", async () => {
    // When live services are available:
    // - Upload test dataset
    // - Run evaluation against GPT-4o
    // - Format results with tabular formatters
    // - Verify output quality
    expect(true).toBe(true);
  });
});
