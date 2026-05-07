// gui_import_graph skill — builds a directed import graph from JS/Vue GUI sources

import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname, posix } from "node:path";
import type { Skill } from "./index.js";
import { DslParserRegistry } from "./dsl_parser_registry.js";

export interface GuiImportGraphInput {
  repoPath: string;
  guiDir?: string;
}

export interface GuiImportGraphEdge {
  from: string;
  to: string;
  specifiers: string[];
}

export interface GuiImportGraphOutput {
  nodes: string[];
  edges: GuiImportGraphEdge[];
  components: string[];
  stats: {
    totalFiles: number;
    totalImports: number;
    componentCount: number;
    externalDeps: string[];
  };
  confidence: number;
}

const SUPPORTED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue"]);

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath)));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizePath(p: string): string {
  return p.split("\\").join("/");
}

function resolveImportSource(
  importSource: string,
  importerRelPath: string,
  nodeSet: Set<string>,
): string | undefined {
  const importerDir = posix.dirname(importerRelPath);
  const resolved = posix.normalize(posix.join(importerDir, importSource));

  // Try exact match first
  if (nodeSet.has(resolved)) return resolved;

  // Try appending supported extensions
  for (const ext of SUPPORTED_EXTENSIONS) {
    const withExt = resolved + ext;
    if (nodeSet.has(withExt)) return withExt;
  }

  // Try index files
  for (const ext of SUPPORTED_EXTENSIONS) {
    const indexFile = posix.join(resolved, "index" + ext);
    if (nodeSet.has(indexFile)) return indexFile;
  }

  return undefined;
}

export const guiImportGraphSkill: Skill = {
  name: "gui_import_graph",

  async execute(context: unknown): Promise<GuiImportGraphOutput> {
    const input = context as GuiImportGraphInput;
    const guiDir = input.guiDir ?? "GUI";
    const scanRoot = join(input.repoPath, guiDir);

    const registry = new DslParserRegistry();
    const absolutePaths = await walkDir(scanRoot);

    // Build node list as posix-style relative paths from scanRoot
    const nodes: string[] = absolutePaths.map((p) =>
      normalizePath(relative(scanRoot, p)),
    );
    const nodeSet = new Set(nodes);

    const edges: GuiImportGraphEdge[] = [];
    const components: string[] = [];
    const externalDepsSet = new Set<string>();
    let totalImports = 0;

    for (let i = 0; i < absolutePaths.length; i++) {
      const absPath = absolutePaths[i];
      const relPath = nodes[i];

      if (extname(absPath).toLowerCase() === ".vue") {
        components.push(relPath);
      }

      const content = await readFile(absPath, "utf-8");
      const parseResult = registry.parse(content, absPath);

      for (const imp of parseResult.imports) {
        totalImports++;

        if (imp.source.startsWith(".")) {
          const target = resolveImportSource(imp.source, relPath, nodeSet);
          if (target) {
            edges.push({
              from: relPath,
              to: target,
              specifiers: imp.specifiers,
            });
          }
        } else {
          // External npm package — use the bare package name
          const pkgName = imp.source.startsWith("@")
            ? imp.source.split("/").slice(0, 2).join("/")
            : imp.source.split("/")[0];
          externalDepsSet.add(pkgName);
        }
      }
    }

    return {
      nodes: nodes.sort(),
      edges,
      components: components.sort(),
      stats: {
        totalFiles: nodes.length,
        totalImports,
        componentCount: components.length,
        externalDeps: [...externalDepsSet].sort(),
      },
      confidence: nodes.length > 0 ? 0.9 : 0.5,
    };
  },
};
