import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guiImportGraphSkill } from "../gui_import_graph.js";
import type { GuiImportGraphOutput } from "../gui_import_graph.js";

describe("gui_import_graph skill", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gui-import-graph-"));

    // Create directory structure
    await mkdir(join(tempDir, "GUI", "components"), { recursive: true });
    await mkdir(join(tempDir, "GUI", "utils"), { recursive: true });

    // GUI/App.vue
    await writeFile(
      join(tempDir, "GUI", "App.vue"),
      [
        "import Header from './components/Header.vue'",
        "import axios from 'axios'",
      ].join("\n"),
    );

    // GUI/components/Header.vue
    await writeFile(
      join(tempDir, "GUI", "components", "Header.vue"),
      "import { ref } from 'vue'\n",
    );

    // GUI/utils/api.js
    await writeFile(
      join(tempDir, "GUI", "utils", "api.js"),
      [
        "import axios from 'axios'",
        "export function fetchData() {}",
      ].join("\n"),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has the correct skill name", () => {
    expect(guiImportGraphSkill.name).toBe("gui_import_graph");
  });

  it("finds the correct number of nodes", async () => {
    const result = (await guiImportGraphSkill.execute({
      repoPath: tempDir,
    })) as GuiImportGraphOutput;
    expect(result.nodes).toHaveLength(3);
    expect(result.stats.totalFiles).toBe(3);
  });

  it("identifies Vue components", async () => {
    const result = (await guiImportGraphSkill.execute({
      repoPath: tempDir,
    })) as GuiImportGraphOutput;
    expect(result.components).toHaveLength(2);
    expect(result.components).toContain("App.vue");
    expect(result.components).toContain("components/Header.vue");
    expect(result.stats.componentCount).toBe(2);
  });

  it("creates edges for local imports", async () => {
    const result = (await guiImportGraphSkill.execute({
      repoPath: tempDir,
    })) as GuiImportGraphOutput;
    const appToHeader = result.edges.find(
      (e) => e.from === "App.vue" && e.to === "components/Header.vue",
    );
    expect(appToHeader).toBeDefined();
    expect(appToHeader!.specifiers).toEqual(["Header"]);
  });

  it("detects external dependencies", async () => {
    const result = (await guiImportGraphSkill.execute({
      repoPath: tempDir,
    })) as GuiImportGraphOutput;
    expect(result.stats.externalDeps).toContain("axios");
    expect(result.stats.externalDeps).toContain("vue");
  });

  it("reports correct stats", async () => {
    const result = (await guiImportGraphSkill.execute({
      repoPath: tempDir,
    })) as GuiImportGraphOutput;
    // App.vue: 2 imports, Header.vue: 1 import, api.js: 1 import = 4
    expect(result.stats.totalImports).toBe(4);
    expect(result.stats.totalFiles).toBe(3);
    expect(result.stats.componentCount).toBe(2);
  });

  it("supports custom guiDir", async () => {
    await mkdir(join(tempDir, "custom"), { recursive: true });
    await writeFile(
      join(tempDir, "custom", "index.js"),
      "import lodash from 'lodash'\n",
    );
    const result = (await guiImportGraphSkill.execute({
      repoPath: tempDir,
      guiDir: "custom",
    })) as GuiImportGraphOutput;
    expect(result.nodes).toHaveLength(1);
    expect(result.stats.externalDeps).toContain("lodash");
  });
});
