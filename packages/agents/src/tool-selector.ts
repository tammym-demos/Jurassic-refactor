// LLM-driven tool selection — lets the model decide which skills to invoke based on context.
// Default: deterministic sequence (current behavior). Opt-in via JURASSIC_TOOL_SELECTION=llm.

/** Descriptor for a skill that can be selected by the tool selector. */
export interface SkillDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  agent: "planning" | "implementation";
}

/** Result of the tool selection process. */
export interface ToolSelectionResult {
  selectedSkills: string[];
  reasoning: string;
  mode: "llm" | "deterministic";
}

/** Context provided to the tool selector for skill selection. */
export interface ToolSelectionContext {
  repoProfile: unknown;
  userGoals?: string;
  previousResults?: string[];
}

/** Hardcoded deterministic phase order for each agent. */
const DETERMINISTIC_SEQUENCES: Record<"planning" | "implementation", string[]> = {
  planning: [
    "repo_snapshot",
    "include_graph",
    "stack_fingerprint",
    "risk_scoring",
    "migration_evaluator",
    "user_dialog",
  ],
  implementation: [
    "test_writer",
    "migration_executor",
    "dependency_upgrader",
    "code_refactor",
    "pr_writer",
  ],
};

/**
 * ToolSelector — decides which skills to invoke and in what order.
 *
 * Supports two modes:
 * - `deterministic` (default): returns the hardcoded sequence from existing workflows
 * - `llm`: builds a prompt for an LLM to recommend skill order based on context
 *
 * Enable LLM mode by setting env var `JURASSIC_TOOL_SELECTION=llm`.
 */
export class ToolSelector {
  private skills: SkillDescriptor[];

  constructor(skills: SkillDescriptor[]) {
    this.skills = skills;
  }

  /**
   * Select skills to invoke, using either LLM-driven or deterministic mode.
   */
  async selectSkills(context: ToolSelectionContext): Promise<ToolSelectionResult> {
    if (process.env.JURASSIC_TOOL_SELECTION === "llm") {
      return this.selectSkillsWithLLM(context);
    }
    return this.selectSkillsDeterministic();
  }

  /** Returns the hardcoded deterministic skill sequence for a given agent. */
  getDeterministicSequence(agent: "planning" | "implementation"): string[] {
    return [...DETERMINISTIC_SEQUENCES[agent]];
  }

  /**
   * LLM-driven skill selection.
   * Builds a structured prompt and parses the response to extract skill names.
   */
  private async selectSkillsWithLLM(context: ToolSelectionContext): Promise<ToolSelectionResult> {
    const prompt = this.buildSelectionPrompt(context);

    // TODO: Wire to Copilot SDK model call
    // For now, fall back to deterministic ordering since we don't have
    // direct model access here. When wired, the model response should be
    // parsed via parseModelResponse() below.
    const _unusedPrompt = prompt; // retain reference so prompt construction is exercised

    // Fallback: return deterministic sequence until LLM call is wired
    const agents = [...new Set(this.skills.map((s) => s.agent))];
    const selectedSkills = agents.flatMap((a) =>
      this.getDeterministicSequence(a).filter((name) =>
        this.skills.some((s) => s.name === name),
      ),
    );

    return {
      selectedSkills,
      reasoning: "LLM mode requested but model call not yet wired — using deterministic fallback",
      mode: "llm",
    };
  }

  /** Deterministic skill selection — mirrors existing workflow ordering. */
  private selectSkillsDeterministic(): ToolSelectionResult {
    const agents = [...new Set(this.skills.map((s) => s.agent))];
    const selectedSkills = agents.flatMap((a) =>
      this.getDeterministicSequence(a).filter((name) =>
        this.skills.some((s) => s.name === name),
      ),
    );

    return {
      selectedSkills,
      reasoning: "Deterministic sequence — skills executed in predefined order",
      mode: "deterministic",
    };
  }

  /** Build the prompt sent to the LLM for skill selection. */
  private buildSelectionPrompt(context: ToolSelectionContext): string {
    const skillList = this.skills
      .map(
        (s) =>
          `- ${s.name} (${s.agent}): ${s.description}\n  Input schema: ${JSON.stringify(s.inputSchema)}`,
      )
      .join("\n");

    const previousResultsSection = context.previousResults?.length
      ? `\nPrevious step results:\n${context.previousResults.map((r) => `- ${r}`).join("\n")}`
      : "";

    return [
      "You are a tool-selection agent. Given the following available skills and context,",
      "decide which skills to invoke and in what order. Return a JSON object with:",
      '  { "selectedSkills": ["skill_name", ...], "reasoning": "..." }',
      "",
      "Available skills:",
      skillList,
      "",
      `Repository profile: ${JSON.stringify(context.repoProfile)}`,
      context.userGoals ? `User goals: ${context.userGoals}` : "",
      previousResultsSection,
      "",
      "Respond with ONLY valid JSON. Do not include any other text.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Parse a model response into a ToolSelectionResult.
   * Exported for testability — called when the LLM call is wired.
   */
  parseModelResponse(raw: string): ToolSelectionResult {
    try {
      const parsed = JSON.parse(raw) as { selectedSkills?: string[]; reasoning?: string };
      const validSkillNames = new Set(this.skills.map((s) => s.name));
      const selectedSkills = (parsed.selectedSkills ?? []).filter((name) =>
        validSkillNames.has(name),
      );

      if (selectedSkills.length === 0) {
        // Model returned no valid skills — fall back to deterministic
        return this.selectSkillsDeterministic();
      }

      return {
        selectedSkills,
        reasoning: parsed.reasoning ?? "LLM-selected skill sequence",
        mode: "llm",
      };
    } catch {
      // JSON parse failed — fall back to deterministic
      return this.selectSkillsDeterministic();
    }
  }
}
