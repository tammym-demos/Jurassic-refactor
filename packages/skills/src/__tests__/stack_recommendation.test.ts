import { describe, it, expect } from "vitest";
import { StackRecommendationSkill } from "../stack_recommendation.js";
import type {
  StackRecommendationInput,
  StackRecommendationOutput,
} from "../stack_recommendation.js";

describe("StackRecommendationSkill", () => {
  const skill = new StackRecommendationSkill();

  const baseFingerprint: StackRecommendationInput["stackFingerprint"] = {
    languages: [{ name: "JavaScript", confidence: 1.0 }],
    frameworks: [{ name: "Express", confidence: 0.9 }],
  };

  const optionA = {
    id: "opt-a",
    name: "Option A",
    targetStack: ["TypeScript"],
    scores: { effort: 30, risk: 20, ecosystemSupport: 90, teamReadiness: 80, overall: 80 },
    pros: ["Easy adoption", "Great tooling"],
    cons: ["Build step required"],
    prerequisites: ["TypeScript compiler"],
  };

  const optionB = {
    id: "opt-b",
    name: "Option B",
    targetStack: ["Rust"],
    scores: { effort: 75, risk: 65, ecosystemSupport: 70, teamReadiness: 40, overall: 48 },
    pros: ["Memory safety"],
    cons: ["Steep learning curve", "Full rewrite required"],
    prerequisites: ["Rust toolchain", "Team training"],
  };

  const optionC = {
    id: "opt-c",
    name: "Option C",
    targetStack: ["Go"],
    scores: { effort: 50, risk: 40, ecosystemSupport: 80, teamReadiness: 60, overall: 63 },
    pros: ["Simple concurrency", "Fast builds"],
    cons: ["Less expressive type system"],
    prerequisites: ["Go runtime"],
  };

  it("ranks migration options by adjusted score", async () => {
    const input: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionC, optionA, optionB],
    };

    const result = (await skill.execute(input)) as StackRecommendationOutput;

    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0].migrationId).toBe("opt-a");
    expect(result.recommendations[1].migrationId).toBe("opt-c");
    expect(result.recommendations[2].migrationId).toBe("opt-b");
    for (let i = 1; i < result.recommendations.length; i++) {
      expect(result.recommendations[i - 1].adjustedScore).toBeGreaterThanOrEqual(
        result.recommendations[i].adjustedScore,
      );
    }
  });

  it("user decision adjusts scores", async () => {
    const inputWithoutDecisions: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionA, optionB],
    };

    const inputWithDecisions: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionA, optionB],
      userDecisions: {
        decisions: [{ questionId: "priority", answer: "cost reduction" }],
      },
    };

    const withoutDec = (await skill.execute(inputWithoutDecisions)) as StackRecommendationOutput;
    const withDec = (await skill.execute(inputWithDecisions)) as StackRecommendationOutput;

    const aWithout = withoutDec.recommendations.find((r) => r.migrationId === "opt-a")!;
    const aWith = withDec.recommendations.find((r) => r.migrationId === "opt-a")!;

    // Option A has low effort (30), so cost reduction should boost it
    expect(aWith.adjustedScore).toBeGreaterThan(aWithout.adjustedScore);
    expect(aWith.userAligned).toBe(true);
  });

  it("top recommendation is highest scored", async () => {
    const input: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionB, optionA, optionC],
    };

    const result = (await skill.execute(input)) as StackRecommendationOutput;

    expect(result.topRecommendation).toBe("opt-a");
    expect(result.topRecommendation).toBe(result.recommendations[0].migrationId);
  });

  it("generates risks from high-effort options", async () => {
    const input: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionB],
    };

    const result = (await skill.execute(input)) as StackRecommendationOutput;

    const rec = result.recommendations[0];
    expect(rec.risks).toContain("High effort required — may exceed budget or timeline");
    expect(rec.risks).toContain("Elevated risk score — careful planning and validation needed");
    // Cons should also appear in risks
    expect(rec.risks).toContain("Steep learning curve");
  });

  it("prerequisites passed through", async () => {
    const input: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionA, optionB],
    };

    const result = (await skill.execute(input)) as StackRecommendationOutput;

    const recA = result.recommendations.find((r) => r.migrationId === "opt-a")!;
    const recB = result.recommendations.find((r) => r.migrationId === "opt-b")!;

    expect(recA.prerequisites).toEqual(["TypeScript compiler"]);
    expect(recB.prerequisites).toEqual(["Rust toolchain", "Team training"]);
  });

  it("empty migration options returns empty recommendations", async () => {
    const input: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [],
    };

    const result = (await skill.execute(input)) as StackRecommendationOutput;

    expect(result.recommendations).toHaveLength(0);
    expect(result.topRecommendation).toBe("");
    expect(result.summary).toContain("No migration options");
  });

  it("handles missing user decisions", async () => {
    const input: StackRecommendationInput = {
      stackFingerprint: baseFingerprint,
      migrationOptions: [optionA, optionC],
    };

    const result = (await skill.execute(input)) as StackRecommendationOutput;

    expect(result.recommendations).toHaveLength(2);
    expect(result.userInfluence).toContain("No user decisions");
    // Without decisions, adjusted score should equal base overall score
    const recA = result.recommendations.find((r) => r.migrationId === "opt-a")!;
    expect(recA.adjustedScore).toBe(optionA.scores.overall);
    expect(recA.userAligned).toBe(false);
  });
});
