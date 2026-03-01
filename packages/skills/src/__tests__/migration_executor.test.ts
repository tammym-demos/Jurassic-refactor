import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MigrationExecutorSkill,
  type MigrationExecutorInput,
} from "../migration_executor.js";

describe("MigrationExecutorSkill", () => {
  let skill: MigrationExecutorSkill;
  let tempDir: string;

  beforeEach(async () => {
    skill = new MigrationExecutorSkill();
    tempDir = await mkdtemp(join(tmpdir(), "migration-exec-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('has name "migration_executor"', () => {
    expect(skill.name).toBe("migration_executor");
  });

  it("executes a phase with a dependency-upgrade task", async () => {
    const pkgPath = join(tempDir, "package.json");
    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: { react: "^17.0.0" },
        devDependencies: { vitest: "^1.0.0" },
      }),
    );

    const input: MigrationExecutorInput = {
      repoPath: tempDir,
      plan: {
        selectedOptionId: "opt-1",
        phases: [
          {
            name: "Upgrade deps",
            description: "Upgrade dependencies",
            tasks: [
              {
                id: "t1",
                type: "dependency-upgrade",
                description: "Upgrade react to v18",
                filePath: "package.json",
                details: { updates: { react: "^18.0.0" } },
              },
            ],
          },
        ],
      },
      currentPhaseIndex: 0,
    };

    const result = await skill.execute(input);
    expect(result.status).toBe("completed");
    expect(result.phaseName).toBe("Upgrade deps");
    expect(result.phaseIndex).toBe(0);
    expect(result.taskResults).toHaveLength(1);
    expect(result.taskResults[0].status).toBe("completed");

    const updatedPkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    expect(updatedPkg.dependencies.react).toBe("^18.0.0");
  });

  it("executes a phase with a config-update task", async () => {
    const configPath = join(tempDir, "tsconfig.json");
    await writeFile(
      configPath,
      JSON.stringify({ compilerOptions: { target: "es5" } }),
    );

    const input: MigrationExecutorInput = {
      repoPath: tempDir,
      plan: {
        selectedOptionId: "opt-1",
        phases: [
          {
            name: "Update config",
            description: "Update tsconfig",
            tasks: [
              {
                id: "t2",
                type: "config-update",
                description: "Set strict mode",
                filePath: "tsconfig.json",
                details: { changes: { strict: true } },
              },
            ],
          },
        ],
      },
      currentPhaseIndex: 0,
    };

    const result = await skill.execute(input);
    expect(result.status).toBe("completed");
    expect(result.taskResults[0].status).toBe("completed");

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.strict).toBe(true);
    expect(config.compilerOptions.target).toBe("es5");
  });

  it("handles missing phase index (out of bounds)", async () => {
    const input: MigrationExecutorInput = {
      repoPath: tempDir,
      plan: {
        selectedOptionId: "opt-1",
        phases: [
          { name: "Phase 0", description: "Only phase", tasks: [] },
        ],
      },
      currentPhaseIndex: 5,
    };

    const result = await skill.execute(input);
    expect(result.status).toBe("failed");
    expect(result.phaseName).toBe("unknown");
    expect(result.taskResults).toHaveLength(0);
  });

  it("handles partial failure (one task fails, others succeed)", async () => {
    const pkgPath = join(tempDir, "package.json");
    await writeFile(
      pkgPath,
      JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
    );

    const input: MigrationExecutorInput = {
      repoPath: tempDir,
      plan: {
        selectedOptionId: "opt-1",
        phases: [
          {
            name: "Mixed phase",
            description: "Some succeed, some fail",
            tasks: [
              {
                id: "t-ok",
                type: "dependency-upgrade",
                description: "Upgrade lodash",
                filePath: "package.json",
                details: { updates: { lodash: "^5.0.0" } },
              },
              {
                id: "t-fail",
                type: "config-update",
                description: "Update missing config",
                filePath: "nonexistent.json",
                details: { changes: { key: "value" } },
              },
              {
                id: "t-stub",
                type: "framework-migration",
                description: "Migrate framework (stub)",
                filePath: "src/app.ts",
                details: {},
              },
            ],
          },
        ],
      },
      currentPhaseIndex: 0,
    };

    const result = await skill.execute(input);
    expect(result.status).toBe("partial");
    expect(result.taskResults).toHaveLength(3);

    const okTask = result.taskResults.find((r) => r.taskId === "t-ok")!;
    expect(okTask.status).toBe("completed");

    const failTask = result.taskResults.find((r) => r.taskId === "t-fail")!;
    expect(failTask.status).toBe("failed");
    expect(failTask.error).toBeDefined();

    const stubTask = result.taskResults.find((r) => r.taskId === "t-stub")!;
    expect(stubTask.status).toBe("completed");
  });

  it("handles an empty phase (no tasks)", async () => {
    const input: MigrationExecutorInput = {
      repoPath: tempDir,
      plan: {
        selectedOptionId: "opt-1",
        phases: [
          { name: "Empty phase", description: "No tasks here", tasks: [] },
        ],
      },
      currentPhaseIndex: 0,
    };

    const result = await skill.execute(input);
    expect(result.status).toBe("completed");
    expect(result.phaseName).toBe("Empty phase");
    expect(result.taskResults).toHaveLength(0);
  });
});
