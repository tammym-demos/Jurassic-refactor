import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import type { Skill } from "./index.js";
import { DslParserRegistry } from "./dsl_parser_registry.js";

export interface FwIncludeGraphInput {
  repoPath: string;
  firmwareDir?: string;
}

export interface FwIncludeGraphOutput {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  sccs: string[][];
  stats: {
    totalFiles: number;
    totalIncludes: number;
    cycleCount: number;
  };
}

const FIRMWARE_EXTENSIONS = new Set([".c", ".h", ".cpp", ".hpp"]);

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath)));
    } else if (FIRMWARE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

function tarjanScc(
  nodes: string[],
  adjacency: Map<string, string[]>,
): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) {
      strongconnect(node);
    }
  }

  return sccs;
}

export const fwIncludeGraphSkill: Skill = {
  name: "fw_include_graph",

  async execute(context: unknown): Promise<FwIncludeGraphOutput> {
    const input = context as FwIncludeGraphInput;
    const firmwareDir = input.firmwareDir ?? "Firmware";
    const rootDir = join(input.repoPath, firmwareDir);

    const registry = new DslParserRegistry();
    const filePaths = await walkDir(rootDir);

    // Build relative path set for resolution
    const relPaths = filePaths.map((fp) => relative(rootDir, fp));
    const relPathSet = new Set(relPaths);
    const absToRel = new Map<string, string>();
    for (let i = 0; i < filePaths.length; i++) {
      absToRel.set(filePaths[i], relPaths[i]);
    }

    // Build basename lookup for include resolution
    const basenameMap = new Map<string, string>();
    for (const rel of relPaths) {
      const base = rel.replace(/\\/g, "/").split("/").pop()!;
      basenameMap.set(base, rel);
    }

    const nodes = [...relPaths];
    const edges: Array<{ from: string; to: string }> = [];
    const adjacency = new Map<string, string[]>();

    for (let i = 0; i < filePaths.length; i++) {
      const absPath = filePaths[i];
      const relPath = relPaths[i];
      const content = await readFile(absPath, "utf-8");
      const result = registry.parse(content, absPath);

      const neighbors: string[] = [];
      for (const imp of result.imports) {
        // Resolve include: try exact relative path, then basename match
        const source = imp.source.replace(/\\/g, "/");
        let target: string | undefined;
        if (relPathSet.has(source)) {
          target = source;
        } else {
          const baseName = source.split("/").pop()!;
          target = basenameMap.get(baseName);
        }
        if (target) {
          edges.push({ from: relPath, to: target });
          neighbors.push(target);
        }
      }
      adjacency.set(relPath, neighbors);
    }

    const sccs = tarjanScc(nodes, adjacency);
    const cycleCount = sccs.filter((scc) => scc.length > 1).length;

    return {
      nodes,
      edges,
      sccs,
      stats: {
        totalFiles: nodes.length,
        totalIncludes: edges.length,
        cycleCount,
      },
    };
  },
};
