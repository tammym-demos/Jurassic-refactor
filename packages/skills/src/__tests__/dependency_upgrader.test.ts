import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DependencyUpgraderSkill,
  type DependencyUpgraderInput,
  type DependencyUpgraderOutput,
} from "../dependency_upgrader.js";

describe("DependencyUpgraderSkill", () => {
  let skill: DependencyUpgraderSkill;
  let tempDir: string;

  beforeEach(async () => {
    skill = new DependencyUpgraderSkill();
    tempDir = await mkdtemp(join(tmpdir(), "dep-upgrader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has the correct name", () => {
    expect(skill.name).toBe("dependency_upgrader");
  });

  it("upgrades an npm dependency in package.json", async () => {
    const pkg = {
      name: "test-pkg",
      dependencies: { react: "^16.0.0", lodash: "^4.0.0" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    const input: DependencyUpgraderInput = {
      repoPath: tempDir,
      upgrades: [
        {
          packageName: "react",
          currentVersion: "^16.0.0",
          targetVersion: "^18.0.0",
          ecosystem: "npm",
          filePath: "package.json",
        },
      ],
    };

    const output = (await skill.execute(input)) as DependencyUpgraderOutput;

    expect(output.results).toHaveLength(1);
    expect(output.results[0]).toMatchObject({
      packageName: "react",
      previousVersion: "^16.0.0",
      newVersion: "^18.0.0",
      status: "upgraded",
    });

    const updated = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8"),
    );
    expect(updated.dependencies.react).toBe("^18.0.0");
    expect(updated.dependencies.lodash).toBe("^4.0.0");
  });

  it("upgrades a pip dependency in requirements.txt", async () => {
    const content = "numpy==1.21.0\npandas>=1.3.0\nrequests==2.26.0\n";
    await writeFile(join(tempDir, "requirements.txt"), content);

    const input: DependencyUpgraderInput = {
      repoPath: tempDir,
      upgrades: [
        {
          packageName: "numpy",
          currentVersion: "1.21.0",
          targetVersion: "1.24.0",
          ecosystem: "pip",
          filePath: "requirements.txt",
        },
      ],
    };

    const output = (await skill.execute(input)) as DependencyUpgraderOutput;

    expect(output.results[0]).toMatchObject({
      packageName: "numpy",
      previousVersion: "1.21.0",
      newVersion: "1.24.0",
      status: "upgraded",
    });

    const updated = await readFile(
      join(tempDir, "requirements.txt"),
      "utf-8",
    );
    expect(updated).toContain("numpy==1.24.0");
    expect(updated).toContain("pandas>=1.3.0");
  });

  it("removes ^ prefix when pinExact is true", async () => {
    const pkg = {
      name: "test-pkg",
      dependencies: { react: "^16.0.0" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    const input: DependencyUpgraderInput = {
      repoPath: tempDir,
      upgrades: [
        {
          packageName: "react",
          currentVersion: "^16.0.0",
          targetVersion: "^18.0.0",
          ecosystem: "npm",
          filePath: "package.json",
          pinExact: true,
        },
      ],
    };

    const output = (await skill.execute(input)) as DependencyUpgraderOutput;

    expect(output.results[0]).toMatchObject({
      packageName: "react",
      newVersion: "18.0.0",
      status: "upgraded",
    });

    const updated = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8"),
    );
    expect(updated.dependencies.react).toBe("18.0.0");
  });

  it("reports failed when package not found in manifest", async () => {
    const pkg = {
      name: "test-pkg",
      dependencies: { lodash: "^4.0.0" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    const input: DependencyUpgraderInput = {
      repoPath: tempDir,
      upgrades: [
        {
          packageName: "react",
          currentVersion: "^16.0.0",
          targetVersion: "^18.0.0",
          ecosystem: "npm",
          filePath: "package.json",
        },
      ],
    };

    const output = (await skill.execute(input)) as DependencyUpgraderOutput;

    expect(output.results[0]).toMatchObject({
      packageName: "react",
      status: "failed",
    });
    expect(output.results[0].error).toBeDefined();
  });

  it("reports already-current when version matches target", async () => {
    const pkg = {
      name: "test-pkg",
      dependencies: { react: "^18.0.0" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    const input: DependencyUpgraderInput = {
      repoPath: tempDir,
      upgrades: [
        {
          packageName: "react",
          currentVersion: "^18.0.0",
          targetVersion: "^18.0.0",
          ecosystem: "npm",
          filePath: "package.json",
        },
      ],
    };

    const output = (await skill.execute(input)) as DependencyUpgraderOutput;

    expect(output.results[0]).toMatchObject({
      packageName: "react",
      status: "already-current",
    });
  });

  it("computes stats correctly across mixed results", async () => {
    const pkg = {
      name: "test-pkg",
      dependencies: { react: "^16.0.0", lodash: "^4.17.0" },
      devDependencies: { vitest: "^1.6.0" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    const input: DependencyUpgraderInput = {
      repoPath: tempDir,
      upgrades: [
        {
          packageName: "react",
          currentVersion: "^16.0.0",
          targetVersion: "^18.0.0",
          ecosystem: "npm",
          filePath: "package.json",
        },
        {
          packageName: "missing-pkg",
          currentVersion: "^1.0.0",
          targetVersion: "^2.0.0",
          ecosystem: "npm",
          filePath: "package.json",
        },
        {
          packageName: "lodash",
          currentVersion: "^4.17.0",
          targetVersion: "^4.17.0",
          ecosystem: "npm",
          filePath: "package.json",
        },
      ],
    };

    const output = (await skill.execute(input)) as DependencyUpgraderOutput;

    expect(output.stats).toEqual({
      total: 3,
      upgraded: 1,
      failed: 1,
      alreadyCurrent: 1,
    });
  });
});
