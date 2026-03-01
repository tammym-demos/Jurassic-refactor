import { describe, it, expect } from "vitest";
import { RiskScoringSkill } from "../risk_scoring.js";
import type { RiskScoringInput, RiskScoringOutput } from "../risk_scoring.js";

describe("RiskScoringSkill", () => {
  const skill = new RiskScoringSkill();

  it("has name risk_scoring", () => {
    expect(skill.name).toBe("risk_scoring");
  });

  it("combines churn + complexity + safety data", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [{ path: "src/engine.ts", changeCount: 50, churnScore: 1 }],
      },
      complexityData: {
        files: [
          { filePath: "src/engine.ts", avgCyclomaticComplexity: 10, maxNestingDepth: 5, loc: 300 },
        ],
      },
      safetyData: {
        safetyIndicators: [
          { filePath: "src/engine.ts", severityMultiplier: 3, type: "interrupt handler" },
        ],
        highRiskFiles: [],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;
    const item = result.items.find((i) => i.filePath === "src/engine.ts")!;

    expect(item).toBeDefined();
    expect(item.churnScore).toBeGreaterThan(0);
    expect(item.complexityScore).toBeGreaterThan(0);
    expect(item.safetyScore).toBeGreaterThan(0);
    expect(item.overallScore).toBeGreaterThan(0);
    expect(item.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it("normalizes churn scores correctly", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [
          { path: "hot.ts", changeCount: 100, churnScore: 1 },
          { path: "warm.ts", changeCount: 50, churnScore: 0.5 },
          { path: "cold.ts", changeCount: 10, churnScore: 0.1 },
        ],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;
    const hot = result.items.find((i) => i.filePath === "hot.ts")!;
    const warm = result.items.find((i) => i.filePath === "warm.ts")!;
    const cold = result.items.find((i) => i.filePath === "cold.ts")!;

    expect(hot.churnScore).toBe(100);
    expect(warm.churnScore).toBe(50);
    expect(cold.churnScore).toBe(10);
  });

  it("assigns severity based on thresholds", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [
          { path: "critical.ts", changeCount: 100, churnScore: 1 },
          { path: "low.ts", changeCount: 5, churnScore: 0.05 },
        ],
      },
      complexityData: {
        files: [
          { filePath: "critical.ts", avgCyclomaticComplexity: 15, maxNestingDepth: 8, loc: 500 },
          { filePath: "low.ts", avgCyclomaticComplexity: 1, maxNestingDepth: 1, loc: 20 },
        ],
      },
      safetyData: {
        safetyIndicators: [
          { filePath: "critical.ts", severityMultiplier: 5, type: "safety critical" },
        ],
        highRiskFiles: ["critical.ts"],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;
    const critical = result.items.find((i) => i.filePath === "critical.ts")!;
    const low = result.items.find((i) => i.filePath === "low.ts")!;

    expect(critical.severity).toBe("critical");
    expect(low.severity).toBe("low");
  });

  it("handles missing churn data", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      complexityData: {
        files: [
          { filePath: "src/util.ts", avgCyclomaticComplexity: 8, maxNestingDepth: 4, loc: 200 },
        ],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;
    const item = result.items.find((i) => i.filePath === "src/util.ts")!;

    expect(item.churnScore).toBe(0);
    expect(item.complexityScore).toBeGreaterThan(0);
  });

  it("handles missing complexity data", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [{ path: "src/api.ts", changeCount: 30, churnScore: 1 }],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;
    const item = result.items.find((i) => i.filePath === "src/api.ts")!;

    expect(item.complexityScore).toBe(0);
    expect(item.churnScore).toBeGreaterThan(0);
  });

  it("handles missing safety data", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [{ path: "src/lib.ts", changeCount: 20, churnScore: 1 }],
      },
      complexityData: {
        files: [
          { filePath: "src/lib.ts", avgCyclomaticComplexity: 5, maxNestingDepth: 2, loc: 100 },
        ],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;
    const item = result.items.find((i) => i.filePath === "src/lib.ts")!;

    expect(item.safetyScore).toBe(0);
    expect(item.churnScore).toBeGreaterThan(0);
    expect(item.complexityScore).toBeGreaterThan(0);
  });

  it("sorts by overall score descending", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [
          { path: "a.ts", changeCount: 10, churnScore: 0.1 },
          { path: "b.ts", changeCount: 80, churnScore: 0.8 },
          { path: "c.ts", changeCount: 50, churnScore: 0.5 },
        ],
      },
      complexityData: {
        files: [
          { filePath: "a.ts", avgCyclomaticComplexity: 2, maxNestingDepth: 1, loc: 50 },
          { filePath: "b.ts", avgCyclomaticComplexity: 12, maxNestingDepth: 6, loc: 400 },
          { filePath: "c.ts", avgCyclomaticComplexity: 7, maxNestingDepth: 3, loc: 150 },
        ],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;

    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i - 1].overallScore).toBeGreaterThanOrEqual(
        result.items[i].overallScore,
      );
    }
  });

  it("summary counts are correct", async () => {
    const input: RiskScoringInput = {
      repoPath: "/repo",
      churnData: {
        hotspots: [
          { path: "critical.ts", changeCount: 100, churnScore: 1 },
          { path: "high.ts", changeCount: 70, churnScore: 0.7 },
          { path: "medium.ts", changeCount: 40, churnScore: 0.4 },
          { path: "low.ts", changeCount: 5, churnScore: 0.05 },
        ],
      },
      complexityData: {
        files: [
          { filePath: "critical.ts", avgCyclomaticComplexity: 15, maxNestingDepth: 8, loc: 500 },
          { filePath: "high.ts", avgCyclomaticComplexity: 10, maxNestingDepth: 5, loc: 300 },
          { filePath: "medium.ts", avgCyclomaticComplexity: 6, maxNestingDepth: 3, loc: 150 },
          { filePath: "low.ts", avgCyclomaticComplexity: 1, maxNestingDepth: 1, loc: 20 },
        ],
      },
      safetyData: {
        safetyIndicators: [
          { filePath: "critical.ts", severityMultiplier: 5, type: "safety critical" },
        ],
        highRiskFiles: ["critical.ts"],
      },
    };

    const result = (await skill.execute(input)) as RiskScoringOutput;

    expect(result.summary.totalFiles).toBe(4);
    expect(result.summary.criticalCount + result.summary.highCount + result.summary.mediumCount + result.summary.lowCount).toBe(4);
    expect(result.summary.averageScore).toBeGreaterThan(0);
    expect(result.summary.averageScore).toBeLessThanOrEqual(100);
  });
});
