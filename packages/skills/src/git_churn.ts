import { execSync } from "node:child_process";
import type { Skill } from "./index.js";

export interface GitChurnInput {
  repoPath: string;
  maxCommits?: number;
  sinceDate?: string;
}

export interface HotspotFile {
  path: string;
  changeCount: number;
  lastChanged: string;
  churnScore: number;
}

export interface GitChurnOutput {
  hotspots: HotspotFile[];
  stats: {
    totalCommits: number;
    totalFilesChanged: number;
    analysisWindow: { from: string; to: string };
  };
}

export class GitChurnSkill implements Skill {
  readonly name = "git_churn";

  async execute(context: unknown): Promise<GitChurnOutput> {
    const input = context as GitChurnInput;
    const repoPath = input.repoPath;
    const maxCommits = input.maxCommits ?? 500;
    const sinceFlag = input.sinceDate ? ` --since="${input.sinceDate}"` : "";

    // Get commit list with dates
    const commitLogCmd = `git log --format="%H %aI" --max-count=${maxCommits}${sinceFlag}`;
    const commitLog = execSafe(commitLogCmd, repoPath);

    const commitLines = commitLog
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (commitLines.length === 0) {
      return {
        hotspots: [],
        stats: {
          totalCommits: 0,
          totalFilesChanged: 0,
          analysisWindow: { from: "", to: "" },
        },
      };
    }

    // Parse commit dates
    const commitDates = commitLines.map((line) => {
      const spaceIdx = line.indexOf(" ");
      return line.slice(spaceIdx + 1);
    });

    const latestDate = commitDates[0];
    const earliestDate = commitDates[commitDates.length - 1];

    // Get changed files per commit
    const filesCmd = `git log --name-only --format="" --max-count=${maxCommits}${sinceFlag}`;
    const filesLog = execSafe(filesCmd, repoPath);

    // Count file changes and track last changed date
    const changeCounts = new Map<string, number>();
    const lastChangedMap = new Map<string, string>();

    // Parse name-only output: commits separated by blank lines
    // We need per-commit file lists to associate dates
    const perCommitCmd = `git log --name-only --format="---COMMIT---%aI" --max-count=${maxCommits}${sinceFlag}`;
    const perCommitLog = execSafe(perCommitCmd, repoPath);

    let currentDate = "";
    for (const line of perCommitLog.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("---COMMIT---")) {
        currentDate = trimmed.slice("---COMMIT---".length);
        continue;
      }
      const filePath = trimmed;
      changeCounts.set(filePath, (changeCounts.get(filePath) ?? 0) + 1);
      if (!lastChangedMap.has(filePath)) {
        lastChangedMap.set(filePath, currentDate);
      }
    }

    const maxChangeCount = Math.max(...changeCounts.values(), 1);

    const hotspots: HotspotFile[] = [...changeCounts.entries()]
      .map(([path, changeCount]) => ({
        path,
        changeCount,
        lastChanged: lastChangedMap.get(path) ?? "",
        churnScore: changeCount / maxChangeCount,
      }))
      .sort((a, b) => b.changeCount - a.changeCount);

    return {
      hotspots,
      stats: {
        totalCommits: commitLines.length,
        totalFilesChanged: hotspots.length,
        analysisWindow: { from: earliestDate, to: latestDate },
      },
    };
  }
}

function execSafe(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return "";
  }
}
