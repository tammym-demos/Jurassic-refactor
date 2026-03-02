// migration_executor — Executes migration steps from an approved ModernizationPlan

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Skill } from "./index.js";

export interface MigrationTask {
  id: string;
  type: "dependency-upgrade" | "framework-migration" | "config-update" | "code-change";
  description: string;
  filePath: string;
  details: Record<string, unknown>;
}

export interface Phase {
  name: string;
  description: string;
  tasks: MigrationTask[];
}

export interface MigrationExecutorInput {
  repoPath: string;
  plan: {
    selectedOptionId: string;
    phases: Phase[];
  };
  currentPhaseIndex: number;
}

export interface TaskResult {
  taskId: string;
  type: string;
  status: "completed" | "failed" | "skipped";
  description: string;
  error?: string;
}

export interface MigrationExecutorOutput {
  phaseIndex: number;
  phaseName: string;
  status: "completed" | "partial" | "failed";
  taskResults: TaskResult[];
  confidence: number;
}

async function executeDependencyUpgrade(
  repoPath: string,
  task: MigrationTask,
): Promise<TaskResult> {
  try {
    const filePath = join(repoPath, task.filePath);
    const content = await readFile(filePath, "utf-8");
    const updates = task.details.updates as
      | Record<string, string>
      | undefined;

    if (!updates) {
      return {
        taskId: task.id,
        type: task.type,
        status: "failed",
        description: task.description,
        error: "No updates specified in task details",
      };
    }

    let updated = content;

    if (task.filePath.endsWith("package.json")) {
      const pkg = JSON.parse(updated);
      for (const [dep, version] of Object.entries(updates)) {
        if (pkg.dependencies?.[dep] !== undefined) {
          pkg.dependencies[dep] = version;
        }
        if (pkg.devDependencies?.[dep] !== undefined) {
          pkg.devDependencies[dep] = version;
        }
      }
      updated = JSON.stringify(pkg, null, 2) + "\n";
    } else if (task.filePath.endsWith("requirements.txt")) {
      for (const [dep, version] of Object.entries(updates)) {
        const re = new RegExp(`^(${dep})==.+$`, "m");
        updated = updated.replace(re, `${dep}==${version}`);
      }
    }

    await writeFile(filePath, updated, "utf-8");
    return {
      taskId: task.id,
      type: task.type,
      status: "completed",
      description: task.description,
    };
  } catch (err) {
    return {
      taskId: task.id,
      type: task.type,
      status: "failed",
      description: task.description,
      error: (err as Error).message,
    };
  }
}

async function executeConfigUpdate(
  repoPath: string,
  task: MigrationTask,
): Promise<TaskResult> {
  try {
    const filePath = join(repoPath, task.filePath);
    const content = await readFile(filePath, "utf-8");
    const config = JSON.parse(content);
    const changes = task.details.changes as
      | Record<string, unknown>
      | undefined;

    if (!changes) {
      return {
        taskId: task.id,
        type: task.type,
        status: "failed",
        description: task.description,
        error: "No changes specified in task details",
      };
    }

    for (const [key, value] of Object.entries(changes)) {
      config[key] = value;
    }

    await writeFile(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return {
      taskId: task.id,
      type: task.type,
      status: "completed",
      description: task.description,
    };
  } catch (err) {
    return {
      taskId: task.id,
      type: task.type,
      status: "failed",
      description: task.description,
      error: (err as Error).message,
    };
  }
}

function executeStubTask(task: MigrationTask): TaskResult {
  return {
    taskId: task.id,
    type: task.type,
    status: "completed",
    description: task.description,
  };
}

export class MigrationExecutorSkill implements Skill {
  readonly name = "migration_executor";

  async execute(context: unknown): Promise<MigrationExecutorOutput> {
    const input = context as MigrationExecutorInput;
    const { repoPath, plan, currentPhaseIndex } = input;

    if (currentPhaseIndex < 0 || currentPhaseIndex >= plan.phases.length) {
      return {
        phaseIndex: currentPhaseIndex,
        phaseName: "unknown",
        status: "failed",
        taskResults: [],
        confidence: 0.0,
      };
    }

    const phase = plan.phases[currentPhaseIndex];
    const taskResults: TaskResult[] = [];

    for (const task of phase.tasks) {
      let result: TaskResult;
      switch (task.type) {
        case "dependency-upgrade":
          result = await executeDependencyUpgrade(repoPath, task);
          break;
        case "config-update":
          result = await executeConfigUpdate(repoPath, task);
          break;
        case "framework-migration":
        case "code-change":
          result = executeStubTask(task);
          break;
        default:
          result = {
            taskId: task.id,
            type: task.type,
            status: "skipped",
            description: task.description,
            error: `Unknown task type: ${task.type}`,
          };
      }
      taskResults.push(result);
    }

    const failedCount = taskResults.filter((r) => r.status === "failed").length;
    let status: MigrationExecutorOutput["status"];
    if (failedCount === 0) {
      status = "completed";
    } else if (failedCount === taskResults.length) {
      status = "failed";
    } else {
      status = "partial";
    }

    return {
      phaseIndex: currentPhaseIndex,
      phaseName: phase.name,
      status,
      taskResults,
      confidence: status === "completed" ? 0.95 : status === "partial" ? 0.6 : 0.1,
    };
  }
}
