import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "./index.js";

export interface RepoSnapshotInput {
  repoPath: string;
  forkOwner?: string;
  commitSha?: string;
  mode?: "full" | "doc-coverage";
}

export interface FileEntry {
  path: string;
  extension: string;
  sizeBytes: number;
  language?: string;
}

export interface RepoSnapshotOutput {
  commitSha: string;
  forkUrl?: string;
  totalFiles: number;
  fileIndex: FileEntry[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "__pycache__",
  ".next",
  "build",
]);

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".hpp": "C++",
  ".java": "Java",
  ".go": "Go",
  ".rs": "Rust",
  ".vue": "Vue",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".cs": "C#",
  ".md": "Markdown",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
};

function walkDirectory(dirPath: string, rootPath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      entries.push(
        ...walkDirectory(path.join(dirPath, item.name), rootPath),
      );
    } else if (item.isFile()) {
      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(rootPath, fullPath);
      const ext = path.extname(item.name);
      const stat = fs.statSync(fullPath);
      const language = EXTENSION_LANGUAGE_MAP[ext];

      entries.push({
        path: relativePath.replace(/\\/g, "/"),
        extension: ext,
        sizeBytes: stat.size,
        ...(language ? { language } : {}),
      });
    }
  }

  return entries;
}

export class RepoSnapshotSkill implements Skill {
  readonly name = "repo_snapshot";

  async execute(context: unknown): Promise<RepoSnapshotOutput> {
    const input = context as RepoSnapshotInput;
    const repoPath = path.resolve(input.repoPath);

    const fileIndex = walkDirectory(repoPath, repoPath);

    const repoName = path.basename(repoPath);
    const forkUrl = input.forkOwner
      ? `https://github.com/${input.forkOwner}/${repoName}`
      : undefined;

    return {
      commitSha: input.commitSha ?? "HEAD",
      ...(forkUrl ? { forkUrl } : {}),
      totalFiles: fileIndex.length,
      fileIndex,
    };
  }
}
