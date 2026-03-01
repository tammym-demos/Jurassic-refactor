/**
 * Acceptance tests — RED BASELINE (SDD)
 *
 * These tests define the expected contract for agent-produced artifacts.
 * They should FAIL until the Planning Agent and Implementation Agent
 * are implemented and produce valid output.
 */
import { describe, it, expect } from "vitest";
import { validateArtifact, type ArtifactName } from "../index.js";

// ─── Schema validation: every artifact type must validate a realistic sample ───

const artifactSamples: Record<ArtifactName, unknown> = {
  Manifest: {
    runId: "run-001",
    repoUrl: "https://github.com/example/legacy-app",
    profilePath: "specs/repos/legacy-app.fixture.json",
    startedAt: "2026-01-01T00:00:00Z",
    agent: "planning",
    status: "completed",
    artifactPaths: [
      "artifacts/StackAnalysis.json",
      "artifacts/RiskAssessment.json",
    ],
  },
  RunLogEvent: {
    timestamp: "2026-01-01T00:00:01Z",
    skill: "analyzeStack",
    inputs: { repoUrl: "https://github.com/example/legacy-app" },
    outputs: { languageCount: 3 },
    durationMs: 1200,
    status: "success",
  },
  DependencyGraph: {
    nodes: [
      { path: "src/core/engine.cpp", type: "source", language: "cpp", loc: 450 },
      { path: "src/core/engine.h", type: "header", language: "cpp", loc: 80 },
    ],
    edges: [
      { source: "src/core/engine.cpp", target: "src/core/engine.h", type: "include" },
    ],
  },
  StackAnalysis: {
    languages: [{ name: "C++", percentage: 85, files: 120 }],
    frameworks: [{ name: "Qt", version: "4.8", confidence: 0.95 }],
    buildTools: [{ name: "CMake", version: "3.16" }],
    packageManagers: [{ name: "pip", version: "22.0" }],
    runtimeDependencies: [{ name: "boost", version: "1.74.0" }],
  },
  RiskAssessment: {
    items: [
      {
        filePath: "src/core/engine.cpp",
        riskScore: 0.82,
        factors: {
          churn: 0.9,
          complexity: 0.8,
          safetyPath: 0.7,
          docCoverage: 0.85,
          testCoverage: 0.9,
        },
        safetyFlags: ["IRQHandler"],
      },
    ],
  },
  ModernizationPlan: {
    selectedOptionId: "opt-1",
    phases: [
      {
        phaseNumber: 1,
        name: "Dependency Updates",
        description: "Upgrade all outdated dependencies to current versions.",
        tasks: [
          {
            taskId: "task-1",
            description: "Upgrade Qt 4.8 to Qt 6",
            estimatedEffort: "high",
          },
        ],
        dependencies: [],
      },
    ],
  },
  MigrationOptions: {
    options: [
      {
        id: "opt-1",
        name: "Full rewrite in Rust",
        description: "Rewrite the entire codebase in Rust for memory safety.",
        fromStack: "C++03",
        toStack: "Rust 2021",
        scores: {
          effort: 0.9,
          risk: 0.6,
          ecosystemSupport: 0.8,
          teamExpertise: 0.3,
        },
        prerequisites: ["Rust training for team"],
      },
    ],
  },
  UserDecisions: {
    decisions: [
      {
        questionId: "q-1",
        category: "business-drivers",
        questionText: "What is the primary motivation for modernization?",
        responseType: "free-text",
        response: "Security and maintainability",
        timestamp: "2026-01-01T00:06:30Z",
      },
    ],
  },
  TestScaffold: {
    testFiles: [
      {
        filePath: "tests/core_test.rs",
        targetFile: "src/core/engine.cpp",
        entryPoints: [
          { name: "initialize", type: "function" },
        ],
        priority: "high",
        template: "// TODO: test initialize()",
      },
    ],
  },
  DocCoverage: {
    overallPercentage: 35,
    gaps: [
      {
        filePath: "src/core/engine.cpp",
        type: "undocumented-api",
        description: "42 public functions without documentation",
      },
    ],
    stubs: [
      {
        filePath: "src/core/README.md",
        template: "# Core Engine\n\nTODO: Document the core engine module.",
      },
    ],
  },
  ImplementationLog: {
    entries: [
      {
        taskId: "task-1",
        filePath: "src/core/engine.cpp",
        changeType: "modify",
        description: "Replaced deprecated API calls",
        status: "completed",
      },
    ],
  },
};

describe("Acceptance: Schema validation for all artifact types", () => {
  const artifactNames = Object.keys(artifactSamples) as ArtifactName[];

  it.each(artifactNames)(
    "validates a realistic %s sample against its schema",
    (name) => {
      // This should pass — the samples above are crafted to match the schemas
      expect(() => validateArtifact(name, artifactSamples[name])).not.toThrow();
    },
  );

  it.each(artifactNames)(
    "rejects an empty object for %s",
    (name) => {
      expect(() => validateArtifact(name, {})).toThrow();
    },
  );
});

// ─── Agent output format tests (SHOULD FAIL — agents not implemented yet) ───

describe("Acceptance: Planning Agent produces valid artifacts", () => {
  it.fails("Planning Agent produces a valid Manifest", async () => {
    // Import will fail until Planning Agent is implemented
    const { PlanningAgent } = await import(
      "@jurassic/agents/planning" as string
    );
    const agent = new PlanningAgent();
    await agent.initialize({
      repoUrl: "https://github.com/example/legacy-app",
      runId: "acceptance-test-001",
    });
    const result = await agent.run();
    expect(() => validateArtifact("Manifest", result.manifest)).not.toThrow();
  });

  it.fails("Planning Agent produces a valid StackAnalysis", async () => {
    const { PlanningAgent } = await import(
      "@jurassic/agents/planning" as string
    );
    const agent = new PlanningAgent();
    await agent.initialize({
      repoUrl: "https://github.com/example/legacy-app",
      runId: "acceptance-test-002",
    });
    const result = await agent.run();
    expect(() =>
      validateArtifact("StackAnalysis", result.stackAnalysis),
    ).not.toThrow();
  });

  it.fails("Planning Agent produces a valid RiskAssessment", async () => {
    const { PlanningAgent } = await import(
      "@jurassic/agents/planning" as string
    );
    const agent = new PlanningAgent();
    await agent.initialize({
      repoUrl: "https://github.com/example/legacy-app",
      runId: "acceptance-test-003",
    });
    const result = await agent.run();
    expect(() =>
      validateArtifact("RiskAssessment", result.riskAssessment),
    ).not.toThrow();
  });

  it.fails("Planning Agent produces a valid ModernizationPlan", async () => {
    const { PlanningAgent } = await import(
      "@jurassic/agents/planning" as string
    );
    const agent = new PlanningAgent();
    await agent.initialize({
      repoUrl: "https://github.com/example/legacy-app",
      runId: "acceptance-test-004",
    });
    const result = await agent.run();
    expect(() =>
      validateArtifact("ModernizationPlan", result.modernizationPlan),
    ).not.toThrow();
  });
});

describe("Acceptance: Implementation Agent produces valid artifacts", () => {
  it.fails("Implementation Agent produces a valid ImplementationLog", async () => {
    const { ImplementationAgent } = await import(
      "@jurassic/agents/implementation" as string
    );
    const agent = new ImplementationAgent();
    await agent.initialize({
      repoUrl: "https://github.com/example/legacy-app",
      runId: "acceptance-test-005",
      approvedPlan: artifactSamples.ModernizationPlan,
    });
    const result = await agent.run();
    expect(() =>
      validateArtifact("ImplementationLog", result.implementationLog),
    ).not.toThrow();
  });
});

// ─── Determinism tests (SHOULD FAIL — placeholder until agents exist) ───

describe("Acceptance: Determinism", () => {
  it.fails(
    "Planning Agent produces consistent StackAnalysis for the same repo",
    async () => {
      const { PlanningAgent } = await import(
        "@jurassic/agents/planning" as string
      );
      const config = {
        repoUrl: "https://github.com/example/legacy-app",
        runId: "determinism-test",
      };

      const agent1 = new PlanningAgent();
      await agent1.initialize(config);
      const result1 = await agent1.run();

      const agent2 = new PlanningAgent();
      await agent2.initialize({ ...config, runId: "determinism-test-2" });
      const result2 = await agent2.run();

      // Same repo should produce same language/framework detection
      expect(result1.stackAnalysis.languages).toEqual(
        result2.stackAnalysis.languages,
      );
      expect(result1.stackAnalysis.frameworks).toEqual(
        result2.stackAnalysis.frameworks,
      );
    },
  );
});
