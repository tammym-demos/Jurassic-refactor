import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "./index.js";

export interface SafetyPathInput {
  repoPath: string;
  filePaths?: string[];
}

export interface SafetyIndicator {
  type:
    | "interrupt_handler"
    | "watchdog"
    | "fail_safe"
    | "critical_section"
    | "error_handler"
    | "signal_handler";
  pattern: string;
  filePath: string;
  line: number;
  context: string;
  severityMultiplier: number;
}

export interface SafetyZone {
  filePath: string;
  startLine: number;
  endLine: number;
  indicators: SafetyIndicator[];
  aggregateSeverity: number;
  recommendation: string;
}

export interface SafetyPathOutput {
  totalFilesScanned: number;
  safetyIndicators: SafetyIndicator[];
  safetyZones: SafetyZone[];
  highRiskFiles: string[];
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

const SUPPORTED_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".h",
  ".py",
  ".ts",
  ".js",
]);

interface PatternDef {
  regex: RegExp;
  type: SafetyIndicator["type"];
  severity: number;
}

const SAFETY_PATTERNS: PatternDef[] = [
  // C/C++ interrupt handlers
  { regex: /__interrupt/, type: "interrupt_handler", severity: 4.0 },
  { regex: /\bISR\s*\(/, type: "interrupt_handler", severity: 4.0 },
  { regex: /void\s+\w+_Handler\b/, type: "interrupt_handler", severity: 3.5 },
  // Watchdog timers
  { regex: /\bIWDG\b/, type: "watchdog", severity: 4.5 },
  { regex: /\bWWDG\b/, type: "watchdog", severity: 4.5 },
  // Critical sections
  { regex: /__disable_irq/, type: "critical_section", severity: 5.0 },
  { regex: /__enable_irq/, type: "critical_section", severity: 5.0 },
  { regex: /\bcritical_section\b/, type: "critical_section", severity: 3.5 },
  { regex: /\bmutex\b/, type: "critical_section", severity: 2.5 },
  { regex: /\bsemaphore\b/, type: "critical_section", severity: 2.5 },
  // Python signal / exit handlers
  { regex: /signal\.signal/, type: "signal_handler", severity: 3.5 },
  { regex: /atexit\.register/, type: "error_handler", severity: 3.0 },
  { regex: /sys\.exit/, type: "fail_safe", severity: 2.5 },
  // General safety patterns
  { regex: /\bfail_safe\b/, type: "fail_safe", severity: 4.0 },
  { regex: /\bemergency\b/, type: "fail_safe", severity: 4.5 },
  { regex: /\bshutdown\b/, type: "fail_safe", severity: 3.0 },
  { regex: /\babort\b/, type: "fail_safe", severity: 4.0 },
  { regex: /\bpanic\b/, type: "fail_safe", severity: 4.5 },
];

const ZONE_PROXIMITY = 20;
const HIGH_RISK_THRESHOLD = 3.0;

function getContext(lines: string[], lineIndex: number): string {
  const start = Math.max(0, lineIndex - 2);
  const end = Math.min(lines.length, lineIndex + 3);
  return lines.slice(start, end).join("\n");
}

function scanFile(
  filePath: string,
  relativePath: string,
): SafetyIndicator[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const indicators: SafetyIndicator[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of SAFETY_PATTERNS) {
      if (pat.regex.test(line)) {
        indicators.push({
          type: pat.type,
          pattern: pat.regex.source,
          filePath: relativePath,
          line: i + 1,
          context: getContext(lines, i),
          severityMultiplier: pat.severity,
        });
      }
    }
  }

  return indicators;
}

function groupIntoZones(indicators: SafetyIndicator[]): SafetyZone[] {
  const byFile = new Map<string, SafetyIndicator[]>();
  for (const ind of indicators) {
    const list = byFile.get(ind.filePath) ?? [];
    list.push(ind);
    byFile.set(ind.filePath, list);
  }

  const zones: SafetyZone[] = [];

  for (const [filePath, fileIndicators] of byFile) {
    const sorted = [...fileIndicators].sort((a, b) => a.line - b.line);
    let zoneStart = sorted[0].line;
    let zoneEnd = sorted[0].line;
    let current: SafetyIndicator[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].line - zoneEnd <= ZONE_PROXIMITY) {
        current.push(sorted[i]);
        zoneEnd = sorted[i].line;
      } else {
        zones.push(buildZone(filePath, zoneStart, zoneEnd, current));
        zoneStart = sorted[i].line;
        zoneEnd = sorted[i].line;
        current = [sorted[i]];
      }
    }

    zones.push(buildZone(filePath, zoneStart, zoneEnd, current));
  }

  return zones;
}

function buildZone(
  filePath: string,
  startLine: number,
  endLine: number,
  indicators: SafetyIndicator[],
): SafetyZone {
  const aggregateSeverity = Math.max(
    ...indicators.map((i) => i.severityMultiplier),
  );

  let recommendation: string;
  if (aggregateSeverity >= 4.5) {
    recommendation =
      "Critical safety zone — requires dedicated safety review before any modification.";
  } else if (aggregateSeverity >= 3.5) {
    recommendation =
      "High-risk safety zone — changes should be reviewed by domain expert.";
  } else if (aggregateSeverity >= 2.5) {
    recommendation =
      "Moderate safety zone — ensure adequate test coverage before modifying.";
  } else {
    recommendation =
      "Low-risk zone — standard review process is sufficient.";
  }

  return {
    filePath,
    startLine,
    endLine,
    indicators,
    aggregateSeverity,
    recommendation,
  };
}

function walkDirectory(dirPath: string, rootPath: string): string[] {
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
      files.push(...walkDirectory(path.join(dirPath, item.name), rootPath));
    } else if (item.isFile()) {
      const ext = path.extname(item.name);
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        files.push(path.join(dirPath, item.name));
      }
    }
  }

  return files;
}

export class SafetyPathAnalysisSkill implements Skill {
  readonly name = "safety_path_analysis";

  async execute(context: unknown): Promise<SafetyPathOutput> {
    const input = context as SafetyPathInput;
    const repoPath = path.resolve(input.repoPath);

    let filePaths: string[];
    if (input.filePaths && input.filePaths.length > 0) {
      filePaths = input.filePaths.map((f) => path.resolve(repoPath, f));
    } else {
      filePaths = walkDirectory(repoPath, repoPath);
    }

    const allIndicators: SafetyIndicator[] = [];
    for (const fullPath of filePaths) {
      const relativePath = path
        .relative(repoPath, fullPath)
        .replace(/\\/g, "/");
      allIndicators.push(...scanFile(fullPath, relativePath));
    }

    const safetyZones =
      allIndicators.length > 0 ? groupIntoZones(allIndicators) : [];

    const highRiskFiles = [
      ...new Set(
        safetyZones
          .filter((z) => z.aggregateSeverity > HIGH_RISK_THRESHOLD)
          .map((z) => z.filePath),
      ),
    ];

    return {
      totalFilesScanned: filePaths.length,
      safetyIndicators: allIndicators,
      safetyZones,
      highRiskFiles,
      confidence: filePaths.length > 0 ? 0.9 : 0.5,
    };
  }
}
