import type { Skill } from "./index.js";

export interface PlanSynthesisInput {
  riskItems: Array<{ filePath: string; overallScore: number; severity: string; evidence: string[] }>;
  stackData: { languages: Array<{ name: string }>; frameworks: Array<{ name: string }>; buildTools: Array<{ name: string }> };
  migrationOption: { id: string; name: string; targetStack: string; effort: string };
  dependencyGraph?: { nodes: Array<{ id: string; path: string }>; edges: Array<{ from: string; to: string }> };
  userDecisions?: { decisions: Array<{ questionId: string; answer: string | number }> };
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  phase: number;
  priority: "critical" | "high" | "medium" | "low";
  riskIds: string[];
  estimatedFiles: string[];
  dependencies: string[];
  type: "refactor" | "migrate" | "test" | "dependency" | "documentation";
}

export interface PlanPhase {
  number: number;
  name: string;
  description: string;
  tasks: PlanTask[];
}

export interface PlanSynthesisOutput {
  planId: string;
  selectedOption: string;
  phases: PlanPhase[];
  totalTasks: number;
  estimatedFileCount: number;
  summary: string;
  confidence: number;
}

function formatTaskId(n: number): string {
  return `task-${String(n).padStart(3, "0")}`;
}

function severityToPriority(severity: string): PlanTask["priority"] {
  switch (severity) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    default: return "low";
  }
}

type RiskItem = { filePath: string; overallScore: number; severity: string; evidence: string[] };

function sortBySeverity(
  items: RiskItem[],
): RiskItem[] {
  return [...items].sort((a, b) => b.overallScore - a.overallScore);
}

export class PlanSynthesisSkill implements Skill {
  readonly name = "plan_synthesis";

  async execute(context: unknown): Promise<PlanSynthesisOutput> {
    const input = context as PlanSynthesisInput;
    const { riskItems, stackData, migrationOption, dependencyGraph } = input;

    let taskCounter = 0;
    const allTasks: PlanTask[] = [];
    const allFiles = new Set<string>();

    // --- Phase 1: Foundation — dependency upgrades and build system changes ---
    const phase1Tasks: PlanTask[] = [];

    // Build tool upgrade tasks
    for (const tool of stackData.buildTools) {
      taskCounter++;
      phase1Tasks.push({
        id: formatTaskId(taskCounter),
        title: `Upgrade build tool: ${tool.name}`,
        description: `Update ${tool.name} configuration for ${migrationOption.targetStack} compatibility.`,
        phase: 1,
        priority: "high",
        riskIds: [],
        estimatedFiles: [],
        dependencies: [],
        type: "dependency",
      });
    }

    // Low-risk file dependency tasks (score < 60)
    const lowRiskItems = sortBySeverity(
      riskItems.filter((r) => r.overallScore < 60),
    );
    for (const item of lowRiskItems) {
      taskCounter++;
      allFiles.add(item.filePath);
      phase1Tasks.push({
        id: formatTaskId(taskCounter),
        title: `Update dependencies in ${item.filePath}`,
        description: `Upgrade imports and dependencies in ${item.filePath} for ${migrationOption.targetStack}.`,
        phase: 1,
        priority: severityToPriority(item.severity),
        riskIds: [item.filePath],
        estimatedFiles: [item.filePath],
        dependencies: [],
        type: "dependency",
      });
    }

    allTasks.push(...phase1Tasks);

    // --- Phase 2: Core Migration — refactor high-risk files ---
    const phase2Tasks: PlanTask[] = [];
    const highRiskItems = sortBySeverity(
      riskItems.filter((r) => r.overallScore >= 60),
    );

    // Build a map of file dependencies if graph is available
    const fileDeps = new Map<string, string[]>();
    if (dependencyGraph) {
      const nodePathById = new Map<string, string>();
      for (const node of dependencyGraph.nodes) {
        nodePathById.set(node.id, node.path);
      }
      for (const edge of dependencyGraph.edges) {
        const fromPath = nodePathById.get(edge.from);
        const toPath = nodePathById.get(edge.to);
        if (fromPath && toPath) {
          const deps = fileDeps.get(fromPath) ?? [];
          deps.push(toPath);
          fileDeps.set(fromPath, deps);
        }
      }
    }

    // Two-pass: first assign task IDs, then resolve dependencies
    const fileToTaskId = new Map<string, string>();
    for (const item of highRiskItems) {
      taskCounter++;
      fileToTaskId.set(item.filePath, formatTaskId(taskCounter));
      allFiles.add(item.filePath);
    }

    for (const item of highRiskItems) {
      const taskId = fileToTaskId.get(item.filePath)!;

      // Resolve task dependencies from the dependency graph
      const taskDeps: string[] = [];
      const depFiles = fileDeps.get(item.filePath) ?? [];
      for (const depFile of depFiles) {
        const depTaskId = fileToTaskId.get(depFile);
        if (depTaskId) {
          taskDeps.push(depTaskId);
        }
      }

      phase2Tasks.push({
        id: taskId,
        title: `Refactor ${item.filePath}`,
        description: `Migrate ${item.filePath} to ${migrationOption.targetStack}. Evidence: ${item.evidence.join("; ")}.`,
        phase: 2,
        priority: severityToPriority(item.severity),
        riskIds: [item.filePath],
        estimatedFiles: [item.filePath],
        dependencies: taskDeps,
        type: "refactor",
      });
    }

    allTasks.push(...phase2Tasks);

    // --- Phase 3: Test Coverage — generate tests for all changed files ---
    const phase3Tasks: PlanTask[] = [];
    const changedFiles = [...allFiles];

    for (const filePath of changedFiles) {
      taskCounter++;
      phase3Tasks.push({
        id: formatTaskId(taskCounter),
        title: `Add tests for ${filePath}`,
        description: `Generate test coverage for ${filePath} after migration changes.`,
        phase: 3,
        priority: "medium",
        riskIds: [filePath],
        estimatedFiles: [filePath],
        dependencies: [],
        type: "test",
      });
    }

    allTasks.push(...phase3Tasks);

    // --- Phase 4: Documentation — update docs for changed APIs ---
    const phase4Tasks: PlanTask[] = [];

    if (changedFiles.length > 0) {
      taskCounter++;
      phase4Tasks.push({
        id: formatTaskId(taskCounter),
        title: "Update API documentation",
        description: `Update documentation for ${changedFiles.length} changed files after ${migrationOption.name} migration.`,
        phase: 4,
        priority: "low",
        riskIds: [],
        estimatedFiles: changedFiles,
        dependencies: [],
        type: "documentation",
      });
    }

    allTasks.push(...phase4Tasks);

    // Build phases
    const phases: PlanPhase[] = [
      { number: 1, name: "Foundation", description: "Dependency upgrades and build system changes.", tasks: phase1Tasks },
      { number: 2, name: "Core Migration", description: "Refactor high-risk files with most dependencies.", tasks: phase2Tasks },
      { number: 3, name: "Test Coverage", description: "Generate tests for all changed files.", tasks: phase3Tasks },
      { number: 4, name: "Documentation", description: "Update docs for changed APIs.", tasks: phase4Tasks },
    ];

    const totalTasks = allTasks.length;
    const estimatedFileCount = allFiles.size;
    const summary = `Plan "${migrationOption.name}" targeting ${migrationOption.targetStack}: ${totalTasks} tasks across 4 phases, covering ${estimatedFileCount} files. ${highRiskItems.length} high-risk refactors, ${lowRiskItems.length} low-risk dependency updates.`;

    return {
      planId: `plan-${migrationOption.id}`,
      selectedOption: migrationOption.id,
      phases,
      totalTasks,
      estimatedFileCount,
      summary,
      confidence: totalTasks > 0 ? 0.85 : 0.5,
    };
  }
}
