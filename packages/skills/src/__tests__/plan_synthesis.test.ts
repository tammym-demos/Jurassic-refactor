import { describe, it, expect } from "vitest";
import { PlanSynthesisSkill } from "../plan_synthesis.js";
import type { PlanSynthesisInput, PlanSynthesisOutput } from "../plan_synthesis.js";

describe("PlanSynthesisSkill", () => {
  const skill = new PlanSynthesisSkill();

  const baseInput: PlanSynthesisInput = {
    riskItems: [
      { filePath: "src/engine.ts", overallScore: 85, severity: "critical", evidence: ["High churn", "Deep nesting"] },
      { filePath: "src/parser.ts", overallScore: 65, severity: "high", evidence: ["Complex logic"] },
      { filePath: "src/utils.ts", overallScore: 30, severity: "low", evidence: ["Simple helper"] },
      { filePath: "src/config.ts", overallScore: 45, severity: "medium", evidence: ["Moderate complexity"] },
    ],
    stackData: {
      languages: [{ name: "TypeScript" }],
      frameworks: [{ name: "Express" }],
      buildTools: [{ name: "webpack" }],
    },
    migrationOption: { id: "mod-01", name: "Modernize to ESM", targetStack: "ESM + Vite", effort: "medium" },
  };

  it("generates phased plan from risk + stack data", async () => {
    const result = (await skill.execute(baseInput)) as PlanSynthesisOutput;

    expect(result.planId).toBe("plan-mod-01");
    expect(result.selectedOption).toBe("mod-01");
    expect(result.phases).toHaveLength(4);
    expect(result.phases[0].name).toBe("Foundation");
    expect(result.phases[1].name).toBe("Core Migration");
    expect(result.phases[2].name).toBe("Test Coverage");
    expect(result.phases[3].name).toBe("Documentation");
    expect(result.totalTasks).toBeGreaterThan(0);
  });

  it("Phase 1 contains dependency tasks", async () => {
    const result = (await skill.execute(baseInput)) as PlanSynthesisOutput;
    const phase1 = result.phases.find((p) => p.number === 1)!;

    expect(phase1.tasks.length).toBeGreaterThan(0);
    for (const task of phase1.tasks) {
      expect(task.type).toBe("dependency");
      expect(task.phase).toBe(1);
    }
  });

  it("high-risk files get critical priority", async () => {
    const result = (await skill.execute(baseInput)) as PlanSynthesisOutput;
    const phase2 = result.phases.find((p) => p.number === 2)!;

    const engineTask = phase2.tasks.find((t) => t.title.includes("engine.ts"));
    expect(engineTask).toBeDefined();
    expect(engineTask!.priority).toBe("critical");
    expect(engineTask!.type).toBe("refactor");
  });

  it("task IDs are unique and sequential", async () => {
    const result = (await skill.execute(baseInput)) as PlanSynthesisOutput;
    const allTasks = result.phases.flatMap((p) => p.tasks);
    const ids = allTasks.map((t) => t.id);

    // All unique
    expect(new Set(ids).size).toBe(ids.length);

    // Sequential format task-001, task-002, ...
    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(`task-${String(i + 1).padStart(3, "0")}`);
    }
  });

  it("empty risk items produce minimal plan", async () => {
    const input: PlanSynthesisInput = {
      ...baseInput,
      riskItems: [],
    };

    const result = (await skill.execute(input)) as PlanSynthesisOutput;

    expect(result.phases).toHaveLength(4);
    // Phase 1 should only have build tool tasks
    const phase1 = result.phases.find((p) => p.number === 1)!;
    expect(phase1.tasks.length).toBe(1); // just the webpack upgrade
    // Phase 2, 3 should be empty since no risk files
    expect(result.phases[1].tasks).toHaveLength(0);
    expect(result.phases[2].tasks).toHaveLength(0);
    expect(result.estimatedFileCount).toBe(0);
  });

  it("references risk file paths in riskIds", async () => {
    const result = (await skill.execute(baseInput)) as PlanSynthesisOutput;
    const allTasks = result.phases.flatMap((p) => p.tasks);

    const tasksWithRiskIds = allTasks.filter((t) => t.riskIds.length > 0);
    expect(tasksWithRiskIds.length).toBeGreaterThan(0);

    for (const task of tasksWithRiskIds) {
      for (const riskId of task.riskIds) {
        // Each riskId should be a file path from input
        expect(baseInput.riskItems.some((r) => r.filePath === riskId)).toBe(true);
      }
    }
  });

  it("summary includes correct stats", async () => {
    const result = (await skill.execute(baseInput)) as PlanSynthesisOutput;

    expect(result.summary).toContain("Modernize to ESM");
    expect(result.summary).toContain("ESM + Vite");
    expect(result.summary).toContain(`${result.totalTasks} tasks`);
    expect(result.summary).toContain(`${result.estimatedFileCount} files`);
    expect(result.summary).toContain("4 phases");
  });

  it("respects dependency graph ordering", async () => {
    const input: PlanSynthesisInput = {
      ...baseInput,
      riskItems: [
        { filePath: "src/a.ts", overallScore: 70, severity: "high", evidence: ["dep target"] },
        { filePath: "src/b.ts", overallScore: 75, severity: "high", evidence: ["dep source"] },
      ],
      dependencyGraph: {
        nodes: [
          { id: "n1", path: "src/a.ts" },
          { id: "n2", path: "src/b.ts" },
        ],
        edges: [{ from: "n2", to: "n1" }], // b depends on a
      },
    };

    const result = (await skill.execute(input)) as PlanSynthesisOutput;
    const phase2 = result.phases.find((p) => p.number === 2)!;

    // b has higher score so comes first, but should depend on a's task
    const taskB = phase2.tasks.find((t) => t.title.includes("src/b.ts"));
    const taskA = phase2.tasks.find((t) => t.title.includes("src/a.ts"));
    expect(taskA).toBeDefined();
    expect(taskB).toBeDefined();
    // b should list a's task as a dependency
    expect(taskB!.dependencies).toContain(taskA!.id);
  });

  it("has name plan_synthesis", () => {
    expect(skill.name).toBe("plan_synthesis");
  });
});
