// Dependency Upgrader — upgrades dependencies in npm and pip manifest files

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Skill } from "./index.js";

export interface DependencyUpgrade {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  ecosystem: "npm" | "pip";
  filePath: string;
  pinExact?: boolean;
}

export interface DependencyUpgraderInput {
  repoPath: string;
  upgrades: DependencyUpgrade[];
}

export interface UpgradeResult {
  packageName: string;
  previousVersion: string;
  newVersion: string;
  status: "upgraded" | "failed" | "already-current";
  error?: string;
}

export interface DependencyUpgraderOutput {
  results: UpgradeResult[];
  stats: {
    total: number;
    upgraded: number;
    failed: number;
    alreadyCurrent: number;
  };
  confidence: number;
}

async function upgradeNpm(
  fullPath: string,
  upgrade: DependencyUpgrade,
): Promise<UpgradeResult> {
  const content = await readFile(fullPath, "utf-8");
  const pkg = JSON.parse(content);

  const sections = ["dependencies", "devDependencies"] as const;
  let found = false;
  let previousVersion = "";

  for (const section of sections) {
    const deps = pkg[section];
    if (deps && upgrade.packageName in deps) {
      found = true;
      previousVersion = deps[upgrade.packageName];

      if (previousVersion === upgrade.targetVersion) {
        return {
          packageName: upgrade.packageName,
          previousVersion,
          newVersion: upgrade.targetVersion,
          status: "already-current",
        };
      }

      const version = upgrade.pinExact
        ? upgrade.targetVersion.replace(/^[\^~]/, "")
        : upgrade.targetVersion;

      deps[upgrade.packageName] = version;
      await writeFile(fullPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

      return {
        packageName: upgrade.packageName,
        previousVersion,
        newVersion: version,
        status: "upgraded",
      };
    }
  }

  return {
    packageName: upgrade.packageName,
    previousVersion: "",
    newVersion: upgrade.targetVersion,
    status: "failed",
    error: `Package "${upgrade.packageName}" not found in ${upgrade.filePath}`,
  };
}

async function upgradePip(
  fullPath: string,
  upgrade: DependencyUpgrade,
): Promise<UpgradeResult> {
  const content = await readFile(fullPath, "utf-8");
  const lines = content.split("\n");

  const pattern = new RegExp(
    `^${escapeRegExp(upgrade.packageName)}\\s*([=><~!]+)\\s*(.+)$`,
  );

  let found = false;
  let previousVersion = "";

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(pattern);
    if (match) {
      found = true;
      previousVersion = match[2].trim();
      const operator = match[1];

      if (previousVersion === upgrade.targetVersion) {
        return {
          packageName: upgrade.packageName,
          previousVersion,
          newVersion: upgrade.targetVersion,
          status: "already-current",
        };
      }

      lines[i] = `${upgrade.packageName}${operator}${upgrade.targetVersion}`;
      await writeFile(fullPath, lines.join("\n"), "utf-8");

      return {
        packageName: upgrade.packageName,
        previousVersion,
        newVersion: upgrade.targetVersion,
        status: "upgraded",
      };
    }
  }

  return {
    packageName: upgrade.packageName,
    previousVersion: "",
    newVersion: upgrade.targetVersion,
    status: "failed",
    error: `Package "${upgrade.packageName}" not found in ${upgrade.filePath}`,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class DependencyUpgraderSkill implements Skill {
  readonly name = "dependency_upgrader";

  async execute(context: unknown): Promise<DependencyUpgraderOutput> {
    const input = context as DependencyUpgraderInput;
    const results: UpgradeResult[] = [];

    for (const upgrade of input.upgrades) {
      const fullPath = join(input.repoPath, upgrade.filePath);
      try {
        const result =
          upgrade.ecosystem === "npm"
            ? await upgradeNpm(fullPath, upgrade)
            : await upgradePip(fullPath, upgrade);
        results.push(result);
      } catch (err) {
        results.push({
          packageName: upgrade.packageName,
          previousVersion: upgrade.currentVersion,
          newVersion: upgrade.targetVersion,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const stats = {
      total: results.length,
      upgraded: results.filter((r) => r.status === "upgraded").length,
      failed: results.filter((r) => r.status === "failed").length,
      alreadyCurrent: results.filter((r) => r.status === "already-current")
        .length,
    };

    return { results, stats, confidence: stats.total > 0 ? (stats.upgraded + stats.alreadyCurrent) / stats.total : 0.5 };
  }
}
