#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Orchestrator } from "@jurassic/agents/orchestrator.js";
import type { AgentContext } from "@jurassic/agents/base.js";
import type { OrchestratorCommand } from "@jurassic/agents/orchestrator.js";

const USAGE = `Usage: jurassic <command> [options]

Commands:
  plan            Run the Planning Agent (read-only analysis)
  implement       Run the Implementation Agent (requires approved plan)
  full-pipeline   Run plan → approval → implement

Options:
  --fork-owner <owner>   GitHub owner of the fork to target
  --repo <owner/repo>    Full repository identifier
  --fixture <path>       Path to fixture JSON file
  --profile <path>       Path to profile JSON file
  --interactive          Enable interactive Q&A during planning
  --plan-approved        Skip approval gate for implementation
  --run-id <id>          Custom run identifier
  --artifacts-dir <path> Artifacts output directory (default: ./artifacts)
  --help                 Show this help message
`;

export interface ParsedArgs {
  command: OrchestratorCommand;
  forkOwner?: string;
  repo?: string;
  fixture?: string;
  profile?: string;
  interactive: boolean;
  planApproved: boolean;
  runId: string;
  artifactsDir: string;
  help: boolean;
}

const VALID_COMMANDS = new Set<string>(["plan", "implement", "full-pipeline"]);

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
  };

  let i = 0;

  // Check first positional argument for command
  if (argv.length > 0 && !argv[0].startsWith("--")) {
    if (VALID_COMMANDS.has(argv[0])) {
      result.command = argv[0] as OrchestratorCommand;
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
      case "--help":
        result.help = true;
        break;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
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
