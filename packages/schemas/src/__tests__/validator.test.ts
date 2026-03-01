import { describe, it, expect } from "vitest";
import { validateArtifact, validateArtifactSafe, getSchemaNames } from "../validator.js";

describe("getSchemaNames", () => {
  it("loads all 11 schemas", () => {
    const names = getSchemaNames();
    expect(names).toHaveLength(11);
    expect(names).toContain("Manifest");
    expect(names).toContain("RiskAssessment");
    expect(names).toContain("TestScaffold");
  });
});

describe("validateArtifact", () => {
  it("returns true for valid Manifest data", () => {
    const valid = validateArtifact("Manifest", {
      runId: "run-001",
      repoUrl: "https://github.com/odriverobotics/ODrive",
      profilePath: "specs/repos/odrive.profile.json",
      startedAt: "2026-01-01T00:00:00Z",
      agent: "planning",
      status: "completed",
      artifactPaths: ["artifacts/run-001/DependencyGraph.json"],
    });
    expect(valid).toBe(true);
  });

  it("throws for invalid Manifest data", () => {
    expect(() => validateArtifact("Manifest", { runId: 123 })).toThrow(
      "Validation failed for Manifest",
    );
  });

  it("throws for unknown schema name", () => {
    expect(() =>
      validateArtifact("NonExistent" as Parameters<typeof validateArtifact>[0], {}),
    ).toThrow("Unknown schema");
  });

  it("validates RiskAssessment with proper structure", () => {
    const valid = validateArtifact("RiskAssessment", {
      items: [
        {
          filePath: "Firmware/main.c",
          riskScore: 0.85,
          factors: {
            churn: 0.9,
            complexity: 0.8,
            safetyPath: 1.0,
            docCoverage: 0.7,
            testCoverage: 0.6,
          },
          safetyFlags: ["IRQHandler"],
        },
      ],
    });
    expect(valid).toBe(true);
  });
});

describe("validateArtifactSafe", () => {
  it("returns valid: true for valid data", () => {
    const result = validateArtifactSafe("RunLogEvent", {
      timestamp: "2026-01-01T00:00:00Z",
      skill: "repo_snapshot",
      inputs: {},
      outputs: {},
      durationMs: 1500,
      status: "success",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  it("returns valid: false with errors for invalid data", () => {
    const result = validateArtifactSafe("RunLogEvent", { timestamp: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).not.toBeNull();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});
