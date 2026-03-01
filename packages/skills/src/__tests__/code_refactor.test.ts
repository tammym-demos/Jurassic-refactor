import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodeRefactorSkill, type CodeRefactorInput } from "../code_refactor.js";

describe("CodeRefactorSkill", () => {
  let skill: CodeRefactorSkill;
  let tempDir: string;

  beforeEach(async () => {
    skill = new CodeRefactorSkill();
    tempDir = await mkdtemp(join(tmpdir(), "code-refactor-"));
    await mkdir(join(tempDir, "src"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has name 'code_refactor'", () => {
    expect(skill.name).toBe("code_refactor");
  });

  describe("rename transformation", () => {
    it("replaces identifier in file content", async () => {
      const filePath = "src/app.ts";
      const fullPath = join(tempDir, filePath);
      await writeFile(fullPath, "function oldName() { return oldName(); }", "utf-8");

      const input: CodeRefactorInput = {
        repoPath: tempDir,
        task: {
          id: "task-1",
          filePath: "src/app.ts",
          changeType: "modify",
          description: "rename oldName to newName",
          transformations: [
            { type: "rename", target: "oldName", replacement: "newName", language: "typescript" },
          ],
        },
      };

      const result = await skill.execute(input);
      expect(result.status).toBe("completed");
      expect(result.taskId).toBe("task-1");
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe("rename");

      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe("function newName() { return newName(); }");
    });
  });

  describe("replace-pattern transformation", () => {
    it("applies regex replacement in file content", async () => {
      const filePath = "src/legacy.py";
      const fullPath = join(tempDir, filePath);
      await writeFile(fullPath, "print 'hello'\nprint 'world'\n", "utf-8");

      const input: CodeRefactorInput = {
        repoPath: tempDir,
        task: {
          id: "task-2",
          filePath: "src/legacy.py",
          changeType: "modify",
          description: "modernize print statements",
          transformations: [
            {
              type: "replace-pattern",
              target: "print '(.*?)'",
              replacement: "print('$1')",
              language: "python",
            },
          ],
        },
      };

      const result = await skill.execute(input);
      expect(result.status).toBe("completed");
      expect(result.changes).toHaveLength(1);

      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe("print('hello')\nprint('world')\n");
    });
  });

  describe("create changeType", () => {
    it("creates a new file", async () => {
      const input: CodeRefactorInput = {
        repoPath: tempDir,
        task: {
          id: "task-3",
          filePath: "new/module.ts",
          changeType: "create",
          description: "export const VERSION = '1.0';",
          transformations: [],
        },
      };

      const result = await skill.execute(input);
      expect(result.status).toBe("completed");
      expect(result.changes[0].type).toBe("create");

      const content = await readFile(join(tempDir, "new/module.ts"), "utf-8");
      expect(content).toBe("export const VERSION = '1.0';");
    });
  });

  describe("delete changeType", () => {
    it("removes a file", async () => {
      const filePath = "src/old.ts";
      const fullPath = join(tempDir, filePath);
      await writeFile(fullPath, "// deprecated", "utf-8");

      const input: CodeRefactorInput = {
        repoPath: tempDir,
        task: {
          id: "task-4",
          filePath: "src/old.ts",
          changeType: "delete",
          description: "remove deprecated file",
          transformations: [],
        },
      };

      const result = await skill.execute(input);
      expect(result.status).toBe("completed");
      expect(result.changes[0].type).toBe("delete");

      await expect(readFile(fullPath, "utf-8")).rejects.toThrow();
    });
  });

  describe("error handling", () => {
    it("returns error for missing file on modify", async () => {
      const input: CodeRefactorInput = {
        repoPath: tempDir,
        task: {
          id: "task-5",
          filePath: "nonexistent.ts",
          changeType: "modify",
          description: "modify missing file",
          transformations: [
            { type: "rename", target: "a", replacement: "b", language: "typescript" },
          ],
        },
      };

      const result = await skill.execute(input);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("nonexistent.ts");
    });
  });

  describe("unsupported transformation types", () => {
    it("skips move and inline gracefully", async () => {
      const filePath = "src/app.ts";
      const fullPath = join(tempDir, filePath);
      await writeFile(fullPath, "const x = 1;", "utf-8");

      const input: CodeRefactorInput = {
        repoPath: tempDir,
        task: {
          id: "task-6",
          filePath: "src/app.ts",
          changeType: "modify",
          description: "stub transformations",
          transformations: [
            { type: "move", target: "x", language: "typescript" },
            { type: "inline", target: "y", language: "typescript" },
          ],
        },
      };

      const result = await skill.execute(input);
      expect(result.status).toBe("completed");
      expect(result.changes).toHaveLength(2);
      expect(result.changes[0].description).toContain("planned");
      expect(result.changes[1].description).toContain("planned");
    });
  });
});
