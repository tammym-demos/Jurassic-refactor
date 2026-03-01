// py_import_graph — Builds a directed import graph from Python source files.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Skill } from "./index.js";
import { DslParserRegistry } from "./dsl_parser_registry.js";

export interface PyImportGraphInput {
  repoPath: string;
  pythonDir?: string;
}

export interface PyImportGraphEdge {
  from: string;
  to: string;
  specifiers: string[];
}

export interface PyImportGraphOutput {
  nodes: string[];
  edges: PyImportGraphEdge[];
  stats: {
    totalFiles: number;
    totalImports: number;
    externalDeps: string[];
  };
}

async function collectPyFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectPyFiles(full)));
    } else if (entry.name.endsWith(".py")) {
      results.push(full);
    }
  }
  return results;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export class PyImportGraphSkill implements Skill {
  readonly name = "py_import_graph";

  async execute(context: unknown): Promise<PyImportGraphOutput> {
    const input = context as PyImportGraphInput;
    const pythonDir = input.pythonDir ?? "tools";
    const scanDir = join(input.repoPath, pythonDir);

    const registry = new DslParserRegistry();
    const absolutePaths = await collectPyFiles(scanDir);
    const nodes = absolutePaths.map((p) => relative(scanDir, p).replace(/\\/g, "/"));

    const edges: PyImportGraphEdge[] = [];
    const externalSet = new Set<string>();
    let totalImports = 0;

    for (let i = 0; i < absolutePaths.length; i++) {
      const content = await readFile(absolutePaths[i], "utf-8");
      const result = registry.parse(content, absolutePaths[i]);

      for (const imp of result.imports) {
        totalImports++;
        const moduleParts = imp.source.split(".");
        const baseName = moduleParts[0];

        // Try to resolve to a local file
        const candidateFile = join(scanDir, baseName + ".py");
        const candidateInit = join(scanDir, baseName, "__init__.py");

        const localFile = (await fileExists(candidateFile))
          ? baseName + ".py"
          : (await fileExists(candidateInit))
            ? baseName + "/__init__.py"
            : null;

        if (localFile) {
          edges.push({
            from: nodes[i],
            to: localFile,
            specifiers: imp.specifiers,
          });
        } else {
          externalSet.add(imp.source);
        }
      }
    }

    return {
      nodes: nodes.sort(),
      edges,
      stats: {
        totalFiles: nodes.length,
        totalImports,
        externalDeps: [...externalSet].sort(),
      },
    };
  }
}
