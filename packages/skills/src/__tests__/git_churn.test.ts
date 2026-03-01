import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GitChurnSkill } from "../git_churn.js";
import type { GitChurnOutput } from "../git_churn.js";

function git(cmd: string, cwd: string): void {
  execSync(`git ${cmd}`, { cwd, stdio: "pipe", encoding: "utf-8" });
}

describe("GitChurnSkill", () => {
  let tmpDir: string;
  let skill: GitChurnSkill;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-churn-test-"));
    skill = new GitChurnSkill();

    // Initialize a git repo with commits
    git("init", tmpDir);
    git('config user.email "test@test.com"', tmpDir);
    git('config user.name "Test"', tmpDir);

    // Commit 1: create both files
    fs.writeFileSync(path.join(tmpDir, "hotfile.txt"), "v1");
    fs.writeFileSync(path.join(tmpDir, "stable.txt"), "v1");
    git("add .", tmpDir);
    git('commit -m "initial commit"', tmpDir);

    // Commit 2: change hotfile
    fs.writeFileSync(path.join(tmpDir, "hotfile.txt"), "v2");
    git("add .", tmpDir);
    git('commit -m "update hotfile"', tmpDir);

    // Commit 3: change hotfile again
    fs.writeFileSync(path.join(tmpDir, "hotfile.txt"), "v3");
    git("add .", tmpDir);
    git('commit -m "update hotfile again"', tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has name git_churn", () => {
    expect(skill.name).toBe("git_churn");
  });

  it("returns hotspots sorted by change count descending", async () => {
    const result = (await skill.execute({ repoPath: tmpDir })) as GitChurnOutput;

    expect(result.hotspots.length).toBe(2);
    expect(result.hotspots[0].path).toBe("hotfile.txt");
    expect(result.hotspots[0].changeCount).toBe(3);
    expect(result.hotspots[1].path).toBe("stable.txt");
    expect(result.hotspots[1].changeCount).toBe(1);
  });

  it("computes normalized churn scores", async () => {
    const result = (await skill.execute({ repoPath: tmpDir })) as GitChurnOutput;

    expect(result.hotspots[0].churnScore).toBe(1); // 3/3
    expect(result.hotspots[1].churnScore).toBeCloseTo(1 / 3); // 1/3
  });

  it("returns correct stats", async () => {
    const result = (await skill.execute({ repoPath: tmpDir })) as GitChurnOutput;

    expect(result.stats.totalCommits).toBe(3);
    expect(result.stats.totalFilesChanged).toBe(2);
    expect(result.stats.analysisWindow.from).toBeTruthy();
    expect(result.stats.analysisWindow.to).toBeTruthy();
  });

  it("includes lastChanged as ISO date", async () => {
    const result = (await skill.execute({ repoPath: tmpDir })) as GitChurnOutput;

    // lastChanged should be a valid ISO date string
    const date = new Date(result.hotspots[0].lastChanged);
    expect(date.getTime()).not.toBeNaN();
  });

  it("handles empty repo gracefully", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-churn-empty-"));
    git("init", emptyDir);

    try {
      const result = (await skill.execute({ repoPath: emptyDir })) as GitChurnOutput;
      expect(result.hotspots).toEqual([]);
      expect(result.stats.totalCommits).toBe(0);
      expect(result.stats.totalFilesChanged).toBe(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("respects maxCommits option", async () => {
    const result = (await skill.execute({
      repoPath: tmpDir,
      maxCommits: 2,
    })) as GitChurnOutput;

    // Only last 2 commits: hotfile changed twice, stable not at all
    expect(result.stats.totalCommits).toBe(2);
    expect(result.hotspots[0].path).toBe("hotfile.txt");
    expect(result.hotspots[0].changeCount).toBe(2);
  });
});
