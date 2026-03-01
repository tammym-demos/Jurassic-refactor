import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PyImportGraphSkill } from "../py_import_graph.js";

describe("PyImportGraphSkill", () => {
  let tempDir: string;
  let skill: PyImportGraphSkill;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "py-import-graph-"));
    const toolsDir = join(tempDir, "tools");
    await mkdir(toolsDir, { recursive: true });

    await writeFile(
      join(toolsDir, "main.py"),
      "import os\nfrom utils import helper\n",
    );
    await writeFile(
      join(toolsDir, "utils.py"),
      "from pathlib import Path\n",
    );
    await writeFile(
      join(toolsDir, "config.py"),
      "import json\nfrom utils import helper\n",
    );

    skill = new PyImportGraphSkill();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has the correct name", () => {
    expect(skill.name).toBe("py_import_graph");
  });

  it("finds the correct number of nodes", async () => {
    const result = await skill.execute({ repoPath: tempDir });
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes).toEqual(
      expect.arrayContaining(["config.py", "main.py", "utils.py"]),
    );
  });

  it("builds correct edges for local imports", async () => {
    const result = await skill.execute({ repoPath: tempDir });
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { from: "main.py", to: "utils.py", specifiers: ["helper"] },
        { from: "config.py", to: "utils.py", specifiers: ["helper"] },
      ]),
    );
    // No edges to external modules
    const edgeTargets = result.edges.map((e) => e.to);
    expect(edgeTargets).not.toContain("os.py");
    expect(edgeTargets).not.toContain("json.py");
  });

  it("collects external dependencies", async () => {
    const result = await skill.execute({ repoPath: tempDir });
    expect(result.stats.externalDeps).toEqual(
      expect.arrayContaining(["json", "os", "pathlib"]),
    );
  });

  it("reports correct stats", async () => {
    const result = await skill.execute({ repoPath: tempDir });
    expect(result.stats.totalFiles).toBe(3);
    // main.py: 2, utils.py: 1, config.py: 2 => 5
    expect(result.stats.totalImports).toBe(5);
    expect(result.stats.externalDeps).toHaveLength(3);
  });

  it("uses custom pythonDir", async () => {
    const customDir = join(tempDir, "src");
    await mkdir(customDir, { recursive: true });
    await writeFile(join(customDir, "app.py"), "import sys\n");

    const result = await skill.execute({
      repoPath: tempDir,
      pythonDir: "src",
    });
    expect(result.nodes).toEqual(["app.py"]);
    expect(result.stats.externalDeps).toEqual(["sys"]);
  });
});
