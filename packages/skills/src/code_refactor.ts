// code_refactor skill — applies code transformations from an approved modernization plan

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Skill } from "./index.js";

export interface Transformation {
  type: "rename" | "extract-function" | "inline" | "move" | "replace-pattern";
  target: string;
  replacement?: string;
  language: string;
}

export interface CodeRefactorInput {
  repoPath: string;
  task: {
    id: string;
    filePath: string;
    changeType: "create" | "modify" | "delete";
    description: string;
    transformations: Transformation[];
  };
}

export interface CodeRefactorOutput {
  taskId: string;
  filePath: string;
  status: "completed" | "failed" | "skipped";
  changes: Array<{
    type: string;
    target: string;
    description: string;
  }>;
  error?: string;
  confidence: number;
}

function applyRename(
  content: string,
  target: string,
  replacement: string | undefined,
): { content: string; description: string } {
  if (!replacement) {
    return { content, description: `rename skipped: no replacement for '${target}'` };
  }
  const pattern = new RegExp(`\\b${escapeRegExp(target)}\\b`, "g");
  const updated = content.replace(pattern, replacement);
  return { content: updated, description: `renamed '${target}' to '${replacement}'` };
}

function applyExtractFunction(
  content: string,
  target: string,
  replacement: string | undefined,
): { content: string; description: string } {
  const funcName = replacement ?? `extracted_${target}`;
  // Find the target code block and wrap it in a function call
  if (!content.includes(target)) {
    return { content, description: `extract-function skipped: target '${target}' not found` };
  }
  const extracted = `function ${funcName}() {\n  ${target}\n}\n\n`;
  const updated = content.replace(target, `${funcName}();`);
  return {
    content: extracted + updated,
    description: `extracted '${target}' into function '${funcName}'`,
  };
}

function applyReplacePattern(
  content: string,
  target: string,
  replacement: string | undefined,
): { content: string; description: string } {
  if (!replacement) {
    return { content, description: `replace-pattern skipped: no replacement for '${target}'` };
  }
  const pattern = new RegExp(target, "g");
  const updated = content.replace(pattern, replacement);
  return { content: updated, description: `replaced pattern '${target}' with '${replacement}'` };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class CodeRefactorSkill implements Skill {
  readonly name = "code_refactor";

  async execute(context: unknown): Promise<CodeRefactorOutput> {
    const input = context as CodeRefactorInput;
    const { task, repoPath } = input;
    const fullPath = `${repoPath}/${task.filePath}`;
    const changes: CodeRefactorOutput["changes"] = [];

    try {
      // Handle delete
      if (task.changeType === "delete") {
        await unlink(fullPath);
        return {
          taskId: task.id,
          filePath: task.filePath,
          status: "completed",
          changes: [{ type: "delete", target: task.filePath, description: "file deleted" }],
          confidence: 0.95,
        };
      }

      // Handle create
      if (task.changeType === "create") {
        await mkdir(dirname(fullPath), { recursive: true });
        const content = task.description;
        await writeFile(fullPath, content, "utf-8");
        return {
          taskId: task.id,
          filePath: task.filePath,
          status: "completed",
          changes: [{ type: "create", target: task.filePath, description: "file created" }],
          confidence: 0.95,
        };
      }

      // Handle modify — read file, apply transformations, write back
      let content: string;
      try {
        content = await readFile(fullPath, "utf-8");
      } catch {
        return {
          taskId: task.id,
          filePath: task.filePath,
          status: "failed",
          changes: [],
          error: `file not found: ${task.filePath}`,
          confidence: 0.0,
        };
      }

      for (const t of task.transformations) {
        let result: { content: string; description: string };

        switch (t.type) {
          case "rename":
            result = applyRename(content, t.target, t.replacement);
            break;
          case "extract-function":
            result = applyExtractFunction(content, t.target, t.replacement);
            break;
          case "replace-pattern":
            result = applyReplacePattern(content, t.target, t.replacement);
            break;
          case "move":
          case "inline":
            // Stub — record as planned
            changes.push({
              type: t.type,
              target: t.target,
              description: `${t.type} planned for '${t.target}' (not yet implemented)`,
            });
            continue;
          default:
            changes.push({
              type: t.type,
              target: t.target,
              description: `unsupported transformation type '${t.type}'`,
            });
            continue;
        }

        content = result.content;
        changes.push({ type: t.type, target: t.target, description: result.description });
      }

      await writeFile(fullPath, content, "utf-8");

      const applied = changes.filter(
        (c) => !c.description.includes("skipped") && !c.description.includes("not yet implemented") && !c.description.includes("unsupported"),
      ).length;

      return {
        taskId: task.id,
        filePath: task.filePath,
        status: "completed",
        changes,
        confidence: task.transformations.length > 0 ? applied / task.transformations.length : 0.85,
      };
    } catch (err) {
      return {
        taskId: task.id,
        filePath: task.filePath,
        status: "failed",
        changes,
        error: (err as Error).message,
        confidence: 0.0,
      };
    }
  }
}
