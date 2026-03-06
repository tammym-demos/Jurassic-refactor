#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { Orchestrator } from "@jurassic/agents/orchestrator.js";
import type { AgentContext } from "@jurassic/agents/base.js";
import type { OrchestratorCommand } from "@jurassic/agents/orchestrator.js";
import { EvaluationService, runFoundryIQEvaluation } from "@jurassic/foundry";
import { generateDependencyGraphReport, generateRiskHeatmapReport } from "@jurassic/skills/report_generator.js";

const USAGE = `Usage: jurassic <command> [options]

Commands:
  plan            Run the Planning Agent (read-only analysis)
  implement       Run the Implementation Agent (requires approved plan)
  full-pipeline   Run plan → approval → implement
  evaluate        Evaluate artifacts from a completed run
  visualize       Generate HTML reports from artifacts

Options:
  --fork-owner <owner>   GitHub owner of the fork to target
  --repo <owner/repo>    Full repository identifier
  --fixture <path>       Path to fixture JSON file
  --profile <path>       Path to profile JSON file
  --interactive          Enable interactive Q&A during planning
  --plan-approved        Skip approval gate for implementation
  --run-id <id>          Custom run identifier
  --artifacts-dir <path> Artifacts output directory (default: ./artifacts)
  --cloud                Use Azure AI Foundry cloud evaluation (requires AZURE_AI_PROJECT_ENDPOINT)
  --baseline <run-id>    Baseline run ID for regression detection
  --artifact <name>      Artifact to visualize (DependencyGraph, RiskAssessment)
  --output <path>        Output HTML file path
  --help                 Show this help message
`;

export interface ParsedArgs {
  command: OrchestratorCommand | "evaluate" | "visualize";
  forkOwner?: string;
  repo?: string;
  fixture?: string;
  profile?: string;
  interactive: boolean;
  planApproved: boolean;
  runId: string;
  artifactsDir: string;
  help: boolean;
  cloud: boolean;
  baseline?: string;
  artifact?: string;
  output?: string;
}

const VALID_COMMANDS = new Set<string>(["plan", "implement", "full-pipeline", "evaluate", "visualize"]);

function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `run-${ts}`;
}

/** Parse CLI arguments into a structured options object. */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: "plan",
    interactive: false,
    planApproved: false,
    runId: generateRunId(),
    artifactsDir: "./artifacts",
    help: false,
    cloud: false,
  };

  let i = 0;

  // Check first positional argument for command
  if (argv.length > 0 && !argv[0].startsWith("--")) {
    if (VALID_COMMANDS.has(argv[0])) {
      result.command = argv[0] as OrchestratorCommand | "evaluate";
      i = 1;
    }
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--fork-owner":
        result.forkOwner = argv[++i];
        break;
      case "--repo":
        result.repo = argv[++i];
        break;
      case "--fixture":
        result.fixture = argv[++i];
        break;
      case "--profile":
        result.profile = argv[++i];
        break;
      case "--interactive":
        result.interactive = true;
        break;
      case "--plan-approved":
        result.planApproved = true;
        break;
      case "--run-id":
        result.runId = argv[++i];
        break;
      case "--artifacts-dir":
        result.artifactsDir = argv[++i];
        break;
      case "--cloud":
        result.cloud = true;
        break;
      case "--baseline":
        result.baseline = argv[++i];
        break;
      case "--artifact":
        result.artifact = argv[++i];
        break;
      case "--output":
        result.output = argv[++i];
        break;
      case "--help":
        result.help = true;
        break;
    }
  }

  return result;
}

/**
 * Run evaluation on artifacts from a completed agent run.
 * Supports both local evaluation and Azure AI Foundry cloud evaluation.
 */
async function runEvaluate(args: ParsedArgs): Promise<void> {
  // Find artifacts directory for the run
  const artifactDir = join(args.artifactsDir, args.runId, "planning");
  
  if (!existsSync(artifactDir)) {
    console.error(`Error: No artifacts found for run ${args.runId}`);
    console.error(`Expected directory: ${artifactDir}`);
    process.exit(1);
  }

  console.log(`\nEvaluating artifacts from run: ${args.runId}`);
  console.log(`Artifact directory: ${artifactDir}`);
  console.log(`Mode: ${args.cloud ? "Azure AI Foundry (cloud)" : "Local evaluation"}\n`);

  if (args.cloud) {
    // Cloud evaluation via Azure AI Foundry
    const projectEndpoint = process.env.AZURE_AI_PROJECT_ENDPOINT;
    const modelDeployment = process.env.AZURE_AI_MODEL_DEPLOYMENT ?? "gpt-4o";
    if (!projectEndpoint) {
      console.error("Error: AZURE_AI_PROJECT_ENDPOINT environment variable is required for cloud evaluation.");
      console.error("Set it to your Azure AI Foundry project endpoint.");
      process.exit(1);
    }

    try {
      console.log("Uploading artifacts to Azure AI Foundry...");
      const result = await runFoundryIQEvaluation(
        { projectEndpoint, modelDeployment },
        artifactDir,
        args.runId,
      );

      console.log("\n=== Foundry IQ Evaluation Results ===");
      console.log(`Run ID:      ${result.evalRun.id}`);
      console.log(`Status:      ${result.evalRun.status}`);
      console.log(`Report URL:  ${result.reportUrl}`);
      
      if (result.outputItems.length > 0) {
        console.log(`\nMetrics (${result.outputItems.length} items evaluated):`);
        // Aggregate scores from output items
        const scores: Record<string, number[]> = {};
        for (const item of result.outputItems) {
          for (const res of item.results ?? []) {
            if (!scores[res.metric]) scores[res.metric] = [];
            scores[res.metric].push(res.score);
          }
        }
        for (const [metric, values] of Object.entries(scores)) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          console.log(`  - ${metric}: ${avg.toFixed(3)}`);
        }
      }
      
      process.exit(0);
    } catch (error) {
      console.error("Cloud evaluation failed:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else {
    // Local evaluation
    const evaluationService = new EvaluationService();
    
    try {
      const baselineDir = args.baseline 
        ? join(args.artifactsDir, args.baseline, "planning")
        : undefined;

      const report = await evaluationService.evaluate({
        runId: args.runId,
        agentType: "planning",
        artifactDir,
        baselineDir,
      });

      console.log("=== Local Evaluation Results ===");
      console.log(`Run ID:        ${report.runId}`);
      console.log(`Agent Type:    ${report.agentType}`);
      console.log(`Evaluated At:  ${report.evaluatedAt}`);
      console.log(`Overall Score: ${report.overallScore.toFixed(3)}`);
      console.log(`Passed:        ${report.passed ? "✓ Yes" : "✗ No"}`);
      
      console.log(`\nMetrics (${report.metrics.length}):`);
      for (const m of report.metrics) {
        const status = m.passed ? "✓" : "✗";
        console.log(`  ${status} ${m.name}: ${m.score.toFixed(3)} (threshold: ${m.threshold})`);
        if (m.details) console.log(`      ${m.details}`);
      }

      if (report.regressions.length > 0) {
        console.log(`\nRegressions (${report.regressions.length}):`);
        for (const r of report.regressions) {
          console.log(`  ⚠ ${r.metric}: ${r.severity} (${r.previousScore.toFixed(3)} → ${r.currentScore.toFixed(3)})`);
        }
      }

      if (report.groundedness) {
        console.log(`\nGroundedness: ${report.groundedness.groundednessScore.toFixed(3)}`);
      }

      if (report.confidenceDistribution) {
        console.log(`\nConfidence Distribution:`);
        console.log(`  Mean:   ${report.confidenceDistribution.mean.toFixed(3)}`);
        console.log(`  Median: ${report.confidenceDistribution.median.toFixed(3)}`);
        console.log(`  StdDev: ${report.confidenceDistribution.stdDev.toFixed(3)}`);
      }

      // Save report
      const reportPath = join(args.artifactsDir, args.runId, "EvaluationReport.json");
      const fs = await import("node:fs/promises");
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);

      process.exit(report.passed ? 0 : 1);
    } catch (error) {
      console.error("Local evaluation failed:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

/**
 * Generate HTML visualization from artifacts.
 * Supports DependencyGraph (force-directed graph) and RiskAssessment (heatmap).
 */
function runVisualize(args: ParsedArgs): void {
  const SUPPORTED_ARTIFACTS = ["DependencyGraph", "RiskAssessment"];
  
  if (!args.artifact) {
    console.error("Error: --artifact is required for visualize command.");
    console.error(`Supported artifacts: ${SUPPORTED_ARTIFACTS.join(", ")}`);
    process.exit(1);
  }

  if (!SUPPORTED_ARTIFACTS.includes(args.artifact)) {
    console.error(`Error: Unsupported artifact type: ${args.artifact}`);
    console.error(`Supported artifacts: ${SUPPORTED_ARTIFACTS.join(", ")}`);
    process.exit(1);
  }

  // Find the artifact file
  const planningDir = join(args.artifactsDir, args.runId, "planning");
  const artifactPath = join(planningDir, `${args.artifact}.json`);

  if (!existsSync(artifactPath)) {
    console.error(`Error: Artifact not found: ${artifactPath}`);
    console.error(`Run 'jurassic plan' first to generate ${args.artifact}.json`);
    process.exit(1);
  }

  // Read artifact data
  const artifactData = JSON.parse(readFileSync(artifactPath, "utf-8"));

  // Generate HTML report based on artifact type
  let html: string;
  if (args.artifact === "DependencyGraph") {
    console.log(`Generating dependency graph visualization...`);
    html = generateDependencyGraphReport(artifactData);
  } else {
    console.log(`Generating risk heatmap visualization...`);
    html = generateRiskHeatmapReport(artifactData);
  }

  // Determine output path
  const outputPath = args.output ?? join(args.artifactsDir, args.runId, `${args.artifact}.html`);
  
  // Write HTML file
  writeFileSync(outputPath, html, "utf-8");
  
  console.log(`\n✓ Visualization created: ${outputPath}`);
  console.log(`\nOpen in browser to view the interactive ${args.artifact === "DependencyGraph" ? "dependency graph" : "risk heatmap"}.`);
  
  // Show stats
  if (args.artifact === "DependencyGraph") {
    const nodes = artifactData.nodes?.length ?? 0;
    const edges = artifactData.edges?.length ?? 0;
    console.log(`  Nodes: ${nodes}  |  Edges: ${edges}`);
  } else {
    const items = artifactData.items?.length ?? 0;
    console.log(`  Files analyzed: ${items}`);
  }
  
  process.exit(0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  // Handle visualize command separately (synchronous)
  if (args.command === "visualize") {
    runVisualize(args);
    return;
  }

  // Handle evaluate command separately
  if (args.command === "evaluate") {
    await runEvaluate(args);
    return;
  }

  // Resolve fixture and profile paths (need fixture first to get repo name)
  const fixturePath = args.fixture ?? "";
  const profilePath = args.profile ?? "";

  if (!fixturePath) {
    console.error("Error: --fixture is required.\n");
    console.log(USAGE);
    process.exit(1);
  }

  // Read fixture to get repo name
  const fixtureData = JSON.parse(readFileSync(fixturePath, "utf-8")) as { repoName?: string; upstreamUrl?: string };
  const repoName = fixtureData.repoName ?? fixtureData.upstreamUrl?.split("/").pop() ?? "repo";

  // Resolve repository target  
  let repoPath: string;
  if (args.forkOwner) {
    repoPath = `https://github.com/${args.forkOwner}/${repoName}`;
  } else if (args.repo) {
    repoPath = args.repo;
  } else {
    console.error("Error: --fork-owner or --repo is required.\n");
    console.log(USAGE);
    process.exit(1);
  }

  const context: AgentContext = {
    runId: args.runId,
    repoPath,
    fixturePath,
    profilePath,
    artifactsDir: args.artifactsDir,
  };

  const orchestrator = new Orchestrator();

  try {
    const result = await orchestrator.execute({
      command: args.command,
      context,
      planApproved: args.planApproved,
      planningOptions: args.interactive ? { interactive: true } : undefined,
    });

    console.log(`\nCommand:  ${result.command}`);
    console.log(`Status:   ${result.status}`);

    if (result.artifactPaths.length > 0) {
      console.log(`Artifacts:`);
      for (const p of result.artifactPaths) {
        console.log(`  - ${p}`);
      }
    }

    if (result.error) {
      console.error(`Error:    ${result.error}`);
    }

    process.exit(result.status === "failed" ? 1 : 0);
  } catch (err) {
    console.error("Fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported for testing)
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
