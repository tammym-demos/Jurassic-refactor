import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "./index.js";

export interface StackFingerprintInput {
  repoPath: string;
}

export interface DetectedItem {
  name: string;
  category:
    | "language"
    | "framework"
    | "build_tool"
    | "package_manager"
    | "runtime";
  version?: string;
  confidence: number;
  evidence: string;
}

export interface StackFingerprintOutput {
  languages: DetectedItem[];
  frameworks: DetectedItem[];
  buildTools: DetectedItem[];
  packageManagers: DetectedItem[];
  runtimeDependencies: DetectedItem[];
  confidence: number;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "__pycache__",
  ".next",
  "build",
]);

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".hpp": "C++",
  ".vue": "Vue.js",
  ".go": "Go",
  ".rs": "Rust",
};

function collectFiles(dirPath: string): string[] {
  const files: string[] = [];
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const item of items) {
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      files.push(...collectFiles(path.join(dirPath, item.name)));
    } else if (item.isFile()) {
      files.push(path.join(dirPath, item.name));
    }
  }
  return files;
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function readLinesSafe(filePath: string): string[] {
  try {
    return fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "");
  } catch {
    return [];
  }
}

function fileExists(repoPath: string, name: string): boolean {
  return fs.existsSync(path.join(repoPath, name));
}

function detectLanguages(
  repoPath: string,
  files: string[],
): DetectedItem[] {
  const seen = new Map<string, { confidence: number; evidence: string }>();

  // Config files give high confidence
  if (fileExists(repoPath, "tsconfig.json")) {
    seen.set("TypeScript", {
      confidence: 1.0,
      evidence: "tsconfig.json",
    });
  }
  if (fileExists(repoPath, "go.mod")) {
    seen.set("Go", { confidence: 1.0, evidence: "go.mod" });
  }
  if (fileExists(repoPath, "Cargo.toml")) {
    seen.set("Rust", { confidence: 1.0, evidence: "Cargo.toml" });
  }
  if (
    fileExists(repoPath, "setup.py") ||
    fileExists(repoPath, "pyproject.toml") ||
    fileExists(repoPath, "requirements.txt")
  ) {
    const ev = fileExists(repoPath, "pyproject.toml")
      ? "pyproject.toml"
      : fileExists(repoPath, "requirements.txt")
        ? "requirements.txt"
        : "setup.py";
    seen.set("Python", { confidence: 1.0, evidence: ev });
  }

  // File extensions
  for (const filePath of files) {
    const ext = path.extname(filePath);
    const lang = EXTENSION_LANGUAGE[ext];
    if (lang && !seen.has(lang)) {
      seen.set(lang, { confidence: 0.5, evidence: `*${ext} files` });
    }
  }

  // Upgrade confidence if config + extensions both exist
  for (const filePath of files) {
    const ext = path.extname(filePath);
    const lang = EXTENSION_LANGUAGE[ext];
    if (lang) {
      const entry = seen.get(lang);
      if (entry && entry.confidence === 0.5) {
        // Multiple files → stronger evidence
        entry.confidence = 0.8;
      }
    }
  }

  return Array.from(seen.entries()).map(([name, info]) => ({
    name,
    category: "language" as const,
    confidence: info.confidence,
    evidence: info.evidence,
  }));
}

function detectFrameworks(repoPath: string): DetectedItem[] {
  const items: DetectedItem[] = [];

  // package.json frameworks
  const pkgPath = path.join(repoPath, "package.json");
  const pkg = readJsonSafe(pkgPath);
  if (pkg) {
    const allDeps: Record<string, string> = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };

    const frameworkMap: Record<string, string> = {
      react: "React",
      vue: "Vue",
      express: "Express",
      next: "Next.js",
      "@angular/core": "Angular",
      svelte: "Svelte",
    };

    for (const [dep, displayName] of Object.entries(frameworkMap)) {
      if (allDeps[dep]) {
        items.push({
          name: displayName,
          category: "framework",
          version: allDeps[dep],
          confidence: 1.0,
          evidence: `package.json dependency: ${dep}`,
        });
      }
    }
  }

  // requirements.txt frameworks
  const reqPath = path.join(repoPath, "requirements.txt");
  const reqLines = readLinesSafe(reqPath);
  const pyFrameworks: Record<string, string> = {
    django: "Django",
    flask: "Flask",
    fastapi: "FastAPI",
  };
  for (const line of reqLines) {
    const match = line.match(/^([a-zA-Z0-9_-]+)(?:([=<>!~]+.*))?$/);
    if (match) {
      const pkgName = match[1].toLowerCase();
      if (pyFrameworks[pkgName]) {
        items.push({
          name: pyFrameworks[pkgName],
          category: "framework",
          version: match[2]?.replace(/^[=<>!~]+/, ""),
          confidence: 1.0,
          evidence: `requirements.txt: ${match[1]}`,
        });
      }
    }
  }

  // CMakeLists.txt
  if (fileExists(repoPath, "CMakeLists.txt")) {
    items.push({
      name: "CMake",
      category: "framework",
      confidence: 1.0,
      evidence: "CMakeLists.txt",
    });
  }

  return items;
}

function detectBuildTools(repoPath: string): DetectedItem[] {
  const items: DetectedItem[] = [];

  const buildToolFiles: Array<{
    file: string;
    name: string;
    confidence: number;
  }> = [
    { file: "Makefile", name: "Make", confidence: 1.0 },
    { file: "CMakeLists.txt", name: "CMake", confidence: 1.0 },
    { file: "tsconfig.json", name: "TypeScript Compiler", confidence: 1.0 },
    { file: "setup.py", name: "setuptools", confidence: 0.8 },
    { file: "pyproject.toml", name: "pyproject", confidence: 1.0 },
  ];

  for (const tool of buildToolFiles) {
    if (fileExists(repoPath, tool.file)) {
      items.push({
        name: tool.name,
        category: "build_tool",
        confidence: tool.confidence,
        evidence: tool.file,
      });
    }
  }

  // Glob-like checks for webpack/vite configs
  try {
    const rootFiles = fs.readdirSync(repoPath);
    for (const f of rootFiles) {
      if (f.startsWith("webpack.config.")) {
        items.push({
          name: "webpack",
          category: "build_tool",
          confidence: 1.0,
          evidence: f,
        });
        break;
      }
      if (f.startsWith("vite.config.")) {
        items.push({
          name: "Vite",
          category: "build_tool",
          confidence: 1.0,
          evidence: f,
        });
        break;
      }
    }
  } catch {
    // ignore
  }

  return items;
}

function detectPackageManagers(repoPath: string): DetectedItem[] {
  const items: DetectedItem[] = [];

  const managerFiles: Array<{ file: string; name: string }> = [
    { file: "package-lock.json", name: "npm" },
    { file: "pnpm-lock.yaml", name: "pnpm" },
    { file: "yarn.lock", name: "yarn" },
    { file: "Pipfile", name: "pipenv" },
    { file: "poetry.lock", name: "poetry" },
  ];

  for (const mgr of managerFiles) {
    if (fileExists(repoPath, mgr.file)) {
      items.push({
        name: mgr.name,
        category: "package_manager",
        confidence: 1.0,
        evidence: mgr.file,
      });
    }
  }

  return items;
}

function detectRuntimeDependencies(repoPath: string): DetectedItem[] {
  const items: DetectedItem[] = [];

  // package.json dependencies
  const pkg = readJsonSafe(path.join(repoPath, "package.json"));
  if (pkg) {
    const deps = (pkg.dependencies as Record<string, string>) ?? {};
    for (const [name, version] of Object.entries(deps)) {
      items.push({
        name,
        category: "runtime",
        version,
        confidence: 1.0,
        evidence: "package.json dependencies",
      });
    }
  }

  // requirements.txt entries
  const reqLines = readLinesSafe(path.join(repoPath, "requirements.txt"));
  for (const line of reqLines) {
    if (line.startsWith("#") || line.startsWith("-")) continue;
    const match = line.match(/^([a-zA-Z0-9_-]+)(?:([=<>!~]+.*))?$/);
    if (match) {
      items.push({
        name: match[1],
        category: "runtime",
        version: match[2]?.replace(/^[=<>!~]+/, ""),
        confidence: 1.0,
        evidence: "requirements.txt",
      });
    }
  }

  // go.mod requires
  if (fileExists(repoPath, "go.mod")) {
    const goModLines = readLinesSafe(path.join(repoPath, "go.mod"));
    let inRequire = false;
    for (const line of goModLines) {
      const trimmed = line.trim();
      if (trimmed === "require (") {
        inRequire = true;
        continue;
      }
      if (trimmed === ")") {
        inRequire = false;
        continue;
      }
      if (inRequire) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          items.push({
            name: parts[0],
            category: "runtime",
            version: parts[1],
            confidence: 1.0,
            evidence: "go.mod",
          });
        }
      }
    }
  }

  return items;
}

export class StackFingerprintSkill implements Skill {
  readonly name = "stack_fingerprint";

  async execute(context: unknown): Promise<StackFingerprintOutput> {
    const input = context as StackFingerprintInput;
    const repoPath = path.resolve(input.repoPath);

    const files = collectFiles(repoPath);

    return {
      languages: detectLanguages(repoPath, files),
      frameworks: detectFrameworks(repoPath),
      buildTools: detectBuildTools(repoPath),
      packageManagers: detectPackageManagers(repoPath),
      runtimeDependencies: detectRuntimeDependencies(repoPath),
      confidence: files.length > 0 ? 0.9 : 0.5,
    };
  }
}
