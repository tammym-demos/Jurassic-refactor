import * as fs from "node:fs";
import type { Skill } from "./index.js";

export interface PolicyInput {
  agentType: "planning" | "implementation";
  operation: "read" | "write" | "create" | "delete";
  targetPath: string;
  enableWrites: boolean;
  gateFilePath?: string;
  ciEnvironment?: boolean;
  allowedPaths?: string[];
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  rule: string;
}

export interface PolicyResult {
  decisions: PolicyDecision[];
  overallAllowed: boolean;
  agentType: string;
  summary: string;
}

export interface PolicyRule {
  name: string;
  evaluate(input: PolicyInput): PolicyDecision;
}

// Rule 1 — Read-only default: read operations always allowed
const readOnlyDefaultRule: PolicyRule = {
  name: "read-only-default",
  evaluate(input: PolicyInput): PolicyDecision {
    if (input.operation === "read") {
      return { allowed: true, reason: "Read operations are always allowed", rule: "read-only-default" };
    }
    return { allowed: true, reason: "Non-read operation; deferred to other rules", rule: "read-only-default" };
  },
};

// Rule 2 — Planning Agent is read-only
const planningAgentReadOnlyRule: PolicyRule = {
  name: "planning-agent-read-only",
  evaluate(input: PolicyInput): PolicyDecision {
    if (input.agentType === "planning" && input.operation !== "read") {
      return {
        allowed: false,
        reason: "Planning Agent is read-only and cannot perform write/create/delete operations",
        rule: "planning-agent-read-only",
      };
    }
    return { allowed: true, reason: "Agent type permitted for this operation", rule: "planning-agent-read-only" };
  },
};

// Rule 3 — Gate file required for writes
const gateFileRequiredRule: PolicyRule = {
  name: "gate-file-required",
  evaluate(input: PolicyInput): PolicyDecision {
    if (input.operation === "read") {
      return { allowed: true, reason: "Gate file not required for reads", rule: "gate-file-required" };
    }
    if (input.agentType !== "implementation") {
      return { allowed: true, reason: "Gate file check deferred to agent type rule", rule: "gate-file-required" };
    }
    if (!input.gateFilePath) {
      return { allowed: false, reason: "Gate file path not provided; APPROVED marker required", rule: "gate-file-required" };
    }
    if (!fs.existsSync(input.gateFilePath)) {
      return { allowed: false, reason: "Gate file does not exist on disk; APPROVED marker required", rule: "gate-file-required" };
    }
    return { allowed: true, reason: "Gate file exists", rule: "gate-file-required" };
  },
};

// Rule 4 — Enable-writes flag required
const enableWritesFlagRule: PolicyRule = {
  name: "enable-writes-flag",
  evaluate(input: PolicyInput): PolicyDecision {
    if (input.operation === "read") {
      return { allowed: true, reason: "Enable-writes flag not required for reads", rule: "enable-writes-flag" };
    }
    if (input.agentType !== "implementation") {
      return { allowed: true, reason: "Enable-writes check deferred to agent type rule", rule: "enable-writes-flag" };
    }
    if (!input.enableWrites) {
      return { allowed: false, reason: "Write operations require --enable-writes flag", rule: "enable-writes-flag" };
    }
    return { allowed: true, reason: "Enable-writes flag is set", rule: "enable-writes-flag" };
  },
};

// Rule 5 — CI environment requires gate file
const ciEnvironmentRule: PolicyRule = {
  name: "ci-environment",
  evaluate(input: PolicyInput): PolicyDecision {
    if (input.operation === "read") {
      return { allowed: true, reason: "CI check not required for reads", rule: "ci-environment" };
    }
    if (!input.ciEnvironment) {
      return { allowed: true, reason: "Not in CI environment", rule: "ci-environment" };
    }
    if (!input.gateFilePath || !fs.existsSync(input.gateFilePath)) {
      return { allowed: false, reason: "CI environment requires gate file to exist", rule: "ci-environment" };
    }
    return { allowed: true, reason: "CI environment gate file check passed", rule: "ci-environment" };
  },
};

// Rule 6 — Path allowlist
const pathAllowlistRule: PolicyRule = {
  name: "path-allowlist",
  evaluate(input: PolicyInput): PolicyDecision {
    if (input.operation === "read") {
      return { allowed: true, reason: "Path allowlist not enforced for reads", rule: "path-allowlist" };
    }
    if (!input.allowedPaths || input.allowedPaths.length === 0) {
      return { allowed: true, reason: "No path allowlist configured", rule: "path-allowlist" };
    }
    const matched = input.allowedPaths.some((pattern) => globMatch(pattern, input.targetPath));
    if (!matched) {
      return {
        allowed: false,
        reason: `Target path "${input.targetPath}" does not match any allowed pattern`,
        rule: "path-allowlist",
      };
    }
    return { allowed: true, reason: "Target path matches allowed pattern", rule: "path-allowlist" };
  },
};

/** Simple glob matching supporting * and ** wildcards. */
export function globMatch(pattern: string, path: string): boolean {
  const normalized = pattern.replace(/\\/g, "/");
  const normalizedPath = path.replace(/\\/g, "/");

  const regexStr = normalized
    .replace(/[.+^${}()|[\]]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, "[^/]");

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalizedPath);
}

export class PolicyEnforcer {
  private rules: PolicyRule[];

  constructor() {
    this.rules = [
      readOnlyDefaultRule,
      planningAgentReadOnlyRule,
      gateFileRequiredRule,
      enableWritesFlagRule,
      ciEnvironmentRule,
      pathAllowlistRule,
    ];
  }

  checkAccess(input: PolicyInput): PolicyResult {
    const decisions = this.rules.map((rule) => rule.evaluate(input));
    const overallAllowed = decisions.every((d) => d.allowed);
    const denied = decisions.filter((d) => !d.allowed);
    const summary =
      overallAllowed
        ? `Access allowed for ${input.agentType} agent to ${input.operation} ${input.targetPath}`
        : `Access denied: ${denied.map((d) => d.reason).join("; ")}`;

    return {
      decisions,
      overallAllowed,
      agentType: input.agentType,
      summary,
    };
  }

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }
}

export class PolicySkill implements Skill {
  readonly name = "policy";

  async execute(context: unknown): Promise<PolicyResult> {
    const input = context as PolicyInput;
    const enforcer = new PolicyEnforcer();
    return enforcer.checkAccess(input);
  }
}
