import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EvaluationService } from "../evaluation.js";
import type { MetricResult } from "../evaluation.js";

describe("EvaluationService", () => {
  let service: EvaluationService;
  let tempDir: string;
  let baselineDir: string;

  beforeEach(async () => {
    service = new EvaluationService();
    tempDir = await mkdtemp(join(tmpdir(), "eval-test-"));
    baselineDir = await mkdtemp(join(tmpdir(), "eval-baseline-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(baselineDir, { recursive: true, force: true });
  });

  describe("evaluateAccuracy", () => {
    it("passes for valid artifacts", async () => {
      await writeFile(join(tempDir, "Manifest.json"), JSON.stringify({ name: "test" }));
      await writeFile(
        join(tempDir, "DependencyGraph.json"),
        JSON.stringify({ nodes: [{ id: "a" }] }),
      );
      await writeFile(
        join(tempDir, "ModernizationPlan.json"),
        JSON.stringify({ phases: [{ name: "p1" }] }),
      );

      const results = await service.evaluateAccuracy(tempDir);

      const jsonValidity = results.find((r) => r.name === "json-validity");
      expect(jsonValidity).toBeDefined();
      expect(jsonValidity!.score).toBe(1);
      expect(jsonValidity!.passed).toBe(true);

      const completeness = results.find((r) => r.name === "artifact-completeness");
      expect(completeness).toBeDefined();
      expect(completeness!.score).toBe(1);
      expect(completeness!.passed).toBe(true);
    });

    it("fails for invalid JSON", async () => {
      await writeFile(join(tempDir, "Manifest.json"), "not valid json {{{");
      await writeFile(
        join(tempDir, "DependencyGraph.json"),
        JSON.stringify({ nodes: [] }),
      );

      const results = await service.evaluateAccuracy(tempDir);

      const jsonValidity = results.find((r) => r.name === "json-validity");
      expect(jsonValidity).toBeDefined();
      expect(jsonValidity!.score).toBe(0.5);
      expect(jsonValidity!.passed).toBe(false);
    });
  });

  describe("evaluateSafety", () => {
    it("detects API key pattern", async () => {
      await writeFile(
        join(tempDir, "config.json"),
        JSON.stringify({ api_key: "AKIAIOSFODNN7EXAMPLE1" }),
      );

      const results = await service.evaluateSafety(tempDir);

      const noSecrets = results.find((r) => r.name === "no-secrets");
      expect(noSecrets).toBeDefined();
      expect(noSecrets!.score).toBe(0);
      expect(noSecrets!.passed).toBe(false);
    });

    it("passes for clean artifacts", async () => {
      await writeFile(
        join(tempDir, "Manifest.json"),
        JSON.stringify({ name: "my-project", version: "1.0.0" }),
      );

      const results = await service.evaluateSafety(tempDir);

      const noSecrets = results.find((r) => r.name === "no-secrets");
      expect(noSecrets).toBeDefined();
      expect(noSecrets!.score).toBe(1);
      expect(noSecrets!.passed).toBe(true);

      const noPii = results.find((r) => r.name === "no-pii");
      expect(noPii).toBeDefined();
      expect(noPii!.score).toBe(1);
      expect(noPii!.passed).toBe(true);
    });
  });

  describe("evaluateRelevance", () => {
    it("checks non-empty graph", async () => {
      await writeFile(
        join(tempDir, "DependencyGraph.json"),
        JSON.stringify({ nodes: [{ id: "a" }, { id: "b" }] }),
      );

      const results = await service.evaluateRelevance(tempDir);

      const graphMetric = results.find((r) => r.name === "graph-non-empty");
      expect(graphMetric).toBeDefined();
      expect(graphMetric!.score).toBe(1);
      expect(graphMetric!.passed).toBe(true);
      expect(graphMetric!.details).toContain("2 nodes");
    });

    it("fails for empty graph", async () => {
      await writeFile(
        join(tempDir, "DependencyGraph.json"),
        JSON.stringify({ nodes: [] }),
      );

      const results = await service.evaluateRelevance(tempDir);

      const graphMetric = results.find((r) => r.name === "graph-non-empty");
      expect(graphMetric).toBeDefined();
      expect(graphMetric!.score).toBe(0);
      expect(graphMetric!.passed).toBe(false);
    });
  });

  describe("detectRegressions", () => {
    it("flags score drops", () => {
      const current: MetricResult[] = [
        { name: "json-validity", category: "accuracy", score: 0.5, threshold: 0.9, passed: false, details: "" },
        { name: "no-secrets", category: "safety", score: 0.7, threshold: 1.0, passed: false, details: "" },
      ];
      const baseline: MetricResult[] = [
        { name: "json-validity", category: "accuracy", score: 0.9, threshold: 0.9, passed: true, details: "" },
        { name: "no-secrets", category: "safety", score: 0.8, threshold: 1.0, passed: false, details: "" },
      ];

      const regressions = service.detectRegressions(current, baseline);

      expect(regressions.length).toBe(2);

      const criticalReg = regressions.find((r) => r.metric === "json-validity");
      expect(criticalReg).toBeDefined();
      expect(criticalReg!.severity).toBe("critical");
      expect(criticalReg!.delta).toBeCloseTo(-0.4);

      const warningReg = regressions.find((r) => r.metric === "no-secrets");
      expect(warningReg).toBeDefined();
      expect(warningReg!.severity).toBe("warning");
      expect(warningReg!.delta).toBeCloseTo(-0.1);
    });

    it("returns empty array when no baseline", () => {
      const current: MetricResult[] = [
        { name: "test", category: "accuracy", score: 1, threshold: 0.9, passed: true, details: "" },
      ];
      expect(service.detectRegressions(current)).toEqual([]);
    });
  });

  describe("computeOverallScore", () => {
    it("applies category weights", () => {
      const metrics: MetricResult[] = [
        { name: "m1", category: "accuracy", score: 1.0, threshold: 0.9, passed: true, details: "" },
        { name: "m2", category: "safety", score: 1.0, threshold: 1.0, passed: true, details: "" },
        { name: "m3", category: "relevance", score: 1.0, threshold: 0.7, passed: true, details: "" },
        { name: "m4", category: "determinism", score: 1.0, threshold: 0.7, passed: true, details: "" },
      ];

      const score = service.computeOverallScore(metrics);
      expect(score).toBeCloseTo(1.0);
    });

    it("computes weighted average correctly", () => {
      const metrics: MetricResult[] = [
        { name: "m1", category: "accuracy", score: 0.8, threshold: 0.9, passed: false, details: "" },
        { name: "m2", category: "safety", score: 0.6, threshold: 1.0, passed: false, details: "" },
        { name: "m3", category: "relevance", score: 1.0, threshold: 0.7, passed: true, details: "" },
        { name: "m4", category: "determinism", score: 0.5, threshold: 0.7, passed: false, details: "" },
      ];

      // accuracy: 0.8 * 0.3 = 0.24, safety: 0.6 * 0.3 = 0.18,
      // relevance: 1.0 * 0.2 = 0.20, determinism: 0.5 * 0.2 = 0.10
      // total = 0.72, weight = 1.0, score = 0.72
      const score = service.computeOverallScore(metrics);
      expect(score).toBeCloseTo(0.72);
    });
  });

  describe("evaluate", () => {
    it("returns full EvaluationReport", async () => {
      await writeFile(join(tempDir, "Manifest.json"), JSON.stringify({ name: "test" }));
      await writeFile(
        join(tempDir, "DependencyGraph.json"),
        JSON.stringify({ nodes: [{ id: "a" }] }),
      );
      await writeFile(
        join(tempDir, "ModernizationPlan.json"),
        JSON.stringify({ phases: [{ name: "p1" }] }),
      );

      const report = await service.evaluate({
        runId: "test-run-1",
        agentType: "planning",
        artifactDir: tempDir,
      });

      expect(report.runId).toBe("test-run-1");
      expect(report.agentType).toBe("planning");
      expect(report.evaluatedAt).toBeDefined();
      expect(typeof report.overallScore).toBe("number");
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeLessThanOrEqual(1);
      expect(typeof report.passed).toBe("boolean");
      expect(Array.isArray(report.metrics)).toBe(true);
      expect(report.metrics.length).toBeGreaterThan(0);
      expect(Array.isArray(report.regressions)).toBe(true);
    });
  });
});
