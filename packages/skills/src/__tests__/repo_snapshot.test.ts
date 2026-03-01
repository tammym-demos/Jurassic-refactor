import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RepoSnapshotSkill } from "../repo_snapshot.js";

describe("RepoSnapshotSkill", () => {
  let tmpDir: string;
  let skill: RepoSnapshotSkill;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-snapshot-test-"));
    skill = new RepoSnapshotSkill();

    // Create sample files
    fs.writeFileSync(path.join(tmpDir, "index.ts"), 'export const x = 1;\n');
    fs.writeFileSync(path.join(tmpDir, "main.py"), 'print("hello")\n');
    fs.mkdirSync(path.join(tmpDir, "src"));
    fs.writeFileSync(path.join(tmpDir, "src", "util.c"), 'int main() {}\n');

    // Create directories that should be skipped
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "dep.js"),
      "module.exports = {};\n",
    );
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, ".git", "HEAD"), "ref: refs/heads/main\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has name repo_snapshot", () => {
    expect(skill.name).toBe("repo_snapshot");
  });

  it("returns correct file count", async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalFiles).toBe(3);
  });

  it("returns file entries with correct extensions and languages", async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    const byPath = Object.fromEntries(
      result.fileIndex.map((f) => [f.path, f]),
    );

    expect(byPath["index.ts"]).toBeDefined();
    expect(byPath["index.ts"].extension).toBe(".ts");
    expect(byPath["index.ts"].language).toBe("TypeScript");

    expect(byPath["main.py"]).toBeDefined();
    expect(byPath["main.py"].extension).toBe(".py");
    expect(byPath["main.py"].language).toBe("Python");

    expect(byPath["src/util.c"]).toBeDefined();
    expect(byPath["src/util.c"].extension).toBe(".c");
    expect(byPath["src/util.c"].language).toBe("C");
  });

  it("skips node_modules and .git directories", async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    const paths = result.fileIndex.map((f) => f.path);

    expect(paths).not.toContain("node_modules/dep.js");
    expect(paths).not.toContain(".git/HEAD");
  });

  it("computes fork URL when forkOwner is provided", async () => {
    const repoName = path.basename(tmpDir);
    const result = await skill.execute({
      repoPath: tmpDir,
      forkOwner: "octocat",
    });

    expect(result.forkUrl).toBe(`https://github.com/octocat/${repoName}`);
  });

  it("does not include forkUrl when forkOwner is not provided", async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.forkUrl).toBeUndefined();
  });

  it("uses provided commitSha", async () => {
    const result = await skill.execute({
      repoPath: tmpDir,
      commitSha: "abc123",
    });
    expect(result.commitSha).toBe("abc123");
  });

  it('defaults commitSha to HEAD', async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.commitSha).toBe("HEAD");
  });

  it("works with doc-coverage mode", async () => {
    const result = await skill.execute({
      repoPath: tmpDir,
      mode: "doc-coverage",
    });
    expect(result.totalFiles).toBe(3);
    expect(result.fileIndex.length).toBe(3);
  });

  it("reports file sizes", async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    for (const entry of result.fileIndex) {
      expect(entry.sizeBytes).toBeGreaterThan(0);
    }
  });
});
