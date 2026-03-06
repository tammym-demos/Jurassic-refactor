import { describe, it, expect } from "vitest";
import { MigrationEvaluatorSkill } from "../migration_evaluator.js";
import type {
  MigrationEvaluatorInput,
  MigrationEvaluatorOutput,
} from "../migration_evaluator.js";

describe("MigrationEvaluatorSkill", () => {
  const skill = new MigrationEvaluatorSkill();

  it("has name migration_evaluator", () => {
    expect(skill.name).toBe("migration_evaluator");
  });

  it("matches C source stack to C++ and Rust paths", async () => {
    const input: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [{ name: "C", confidence: 1.0 }],
        frameworks: [],
        buildTools: [],
      },
    };

    const result = (await skill.execute(input)) as MigrationEvaluatorOutput;

    const ids = result.options.map((o) => o.id);
    expect(ids).toContain("c-to-cpp");
    expect(ids).toContain("c-to-rust");
    expect(result.options.length).toBe(2);
  });

  it("matches JavaScript to TypeScript path", async () => {
    const input: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [{ name: "JavaScript", confidence: 1.0 }],
        frameworks: [],
        buildTools: [],
      },
    };

    const result = (await skill.execute(input)) as MigrationEvaluatorOutput;

    const ids = result.options.map((o) => o.id);
    expect(ids).toContain("js-to-ts");
  });

  it("scores include team readiness when expertise provided", async () => {
    const inputWithExpertise: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [{ name: "JavaScript", confidence: 1.0 }],
        frameworks: [],
        buildTools: [],
      },
      teamExpertise: { TypeScript: 5 },
    };

    const inputWithoutExpertise: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [{ name: "JavaScript", confidence: 1.0 }],
        frameworks: [],
        buildTools: [],
      },
    };

    const withExp = (await skill.execute(inputWithExpertise)) as MigrationEvaluatorOutput;
    const withoutExp = (await skill.execute(inputWithoutExpertise)) as MigrationEvaluatorOutput;

    const tsWithExp = withExp.options.find((o) => o.id === "js-to-ts")!;
    const tsWithoutExp = withoutExp.options.find((o) => o.id === "js-to-ts")!;

    expect(tsWithExp.scores.teamReadiness).toBe(100);
    expect(tsWithoutExp.scores.teamReadiness).toBe(50);
    expect(tsWithExp.scores.overall).toBeGreaterThan(tsWithoutExp.scores.overall);
  });

  it("empty stack returns empty options", async () => {
    const input: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [],
        frameworks: [],
        buildTools: [],
      },
    };

    const result = (await skill.execute(input)) as MigrationEvaluatorOutput;

    expect(result.options).toHaveLength(0);
    expect(result.recommendedId).toBe("");
    expect(result.rationale).toContain("No known migration paths");
  });

  it("recommends highest-scoring option", async () => {
    const input: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [{ name: "C", confidence: 1.0 }],
        frameworks: [],
        buildTools: [],
      },
    };

    const result = (await skill.execute(input)) as MigrationEvaluatorOutput;

    expect(result.options.length).toBeGreaterThan(0);
    expect(result.recommendedId).toBe(result.options[0].id);
    // The recommended option should have the highest overall score
    for (const option of result.options) {
      expect(result.options[0].scores.overall).toBeGreaterThanOrEqual(
        option.scores.overall,
      );
    }
  });

  it("pros and cons are populated", async () => {
    const input: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [{ name: "JavaScript", confidence: 1.0 }],
        frameworks: [{ name: "Express", confidence: 1.0 }],
        buildTools: [],
      },
    };

    const result = (await skill.execute(input)) as MigrationEvaluatorOutput;

    for (const option of result.options) {
      expect(option.pros.length).toBeGreaterThan(0);
      expect(option.cons.length).toBeGreaterThan(0);
      expect(option.prerequisites.length).toBeGreaterThan(0);
    }
  });

  it("multiple matching paths sorted by overall score descending", async () => {
    const input: MigrationEvaluatorInput = {
      stackFingerprint: {
        languages: [
          { name: "C", confidence: 1.0 },
          { name: "JavaScript", confidence: 0.8 },
        ],
        frameworks: [{ name: "Express", confidence: 1.0 }],
        buildTools: [{ name: "Make" }],
      },
    };

    const result = (await skill.execute(input)) as MigrationEvaluatorOutput;

    expect(result.options.length).toBeGreaterThan(2);
    for (let i = 1; i < result.options.length; i++) {
      expect(result.options[i - 1].scores.overall).toBeGreaterThanOrEqual(
        result.options[i].scores.overall,
      );
    }
  });
});
