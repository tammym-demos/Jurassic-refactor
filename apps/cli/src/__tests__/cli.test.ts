import { describe, it, expect } from "vitest";
import { parseArgs } from "../index.js";

describe("parseArgs", () => {
  it("extracts command from first positional argument", () => {
    const result = parseArgs(["implement", "--repo", "owner/repo"]);
    expect(result.command).toBe("implement");
  });

  it("defaults command to 'plan' when no command given", () => {
    const result = parseArgs(["--repo", "owner/repo"]);
    expect(result.command).toBe("plan");
  });

  it("parses full-pipeline command", () => {
    const result = parseArgs(["full-pipeline", "--repo", "owner/repo"]);
    expect(result.command).toBe("full-pipeline");
  });

  it("parses --fork-owner flag", () => {
    const result = parseArgs(["plan", "--fork-owner", "myowner"]);
    expect(result.forkOwner).toBe("myowner");
  });

  it("parses --repo flag", () => {
    const result = parseArgs(["plan", "--repo", "owner/repo"]);
    expect(result.repo).toBe("owner/repo");
  });

  it("parses --interactive flag", () => {
    const result = parseArgs(["plan", "--interactive", "--repo", "x/y"]);
    expect(result.interactive).toBe(true);
  });

  it("parses --plan-approved flag", () => {
    const result = parseArgs(["implement", "--plan-approved", "--repo", "x/y"]);
    expect(result.planApproved).toBe(true);
  });

  it("parses --run-id flag", () => {
    const result = parseArgs(["plan", "--run-id", "my-run-123", "--repo", "x/y"]);
    expect(result.runId).toBe("my-run-123");
  });

  it("parses --artifacts-dir flag", () => {
    const result = parseArgs(["plan", "--artifacts-dir", "/tmp/out", "--repo", "x/y"]);
    expect(result.artifactsDir).toBe("/tmp/out");
  });

  it("sets --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.help).toBe(true);
  });

  it("generates a run ID when not provided", () => {
    const result = parseArgs(["plan", "--repo", "x/y"]);
    expect(result.runId).toMatch(/^run-/);
  });

  it("defaults artifacts-dir to ./artifacts", () => {
    const result = parseArgs(["plan", "--repo", "x/y"]);
    expect(result.artifactsDir).toBe("./artifacts");
  });

  it("defaults interactive and planApproved to false", () => {
    const result = parseArgs(["--repo", "x/y"]);
    expect(result.interactive).toBe(false);
    expect(result.planApproved).toBe(false);
  });
});
