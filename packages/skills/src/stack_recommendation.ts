import type { Skill } from "./index.js";

export interface StackRecommendationInput {
  stackFingerprint: {
    languages: Array<{ name: string; confidence: number }>;
    frameworks: Array<{ name: string; confidence: number }>;
  };
  migrationOptions: Array<{
    id: string;
    name: string;
    targetStack: string[];
    scores: {
      effort: number;
      risk: number;
      ecosystemSupport: number;
      teamReadiness: number;
      overall: number;
    };
    pros: string[];
    cons: string[];
    prerequisites: string[];
  }>;
  userDecisions?: {
    decisions: Array<{ questionId: string; answer: string | number }>;
  };
}

export interface Recommendation {
  rank: number;
  migrationId: string;
  name: string;
  adjustedScore: number;
  pros: string[];
  cons: string[];
  risks: string[];
  prerequisites: string[];
  rationale: string;
  userAligned: boolean;
}

export interface StackRecommendationOutput {
  recommendations: Recommendation[];
  topRecommendation: string;
  summary: string;
  userInfluence: string;
}

function findDecision(
  decisions: Array<{ questionId: string; answer: string | number }>,
  questionId: string,
): string | number | undefined {
  const d = decisions.find((dec) => dec.questionId === questionId);
  return d?.answer;
}

function computeAdjustment(
  option: StackRecommendationInput["migrationOptions"][number],
  decisions: Array<{ questionId: string; answer: string | number }>,
): { adjustment: number; aligned: boolean } {
  let adjustment = 0;
  let aligned = false;

  const priority = findDecision(decisions, "priority");
  if (priority === "cost reduction") {
    // Boost low-effort options (effort < 50 gets a bonus)
    const bonus = Math.max(0, 50 - option.scores.effort);
    adjustment += bonus * 0.2;
    if (bonus > 0) aligned = true;
  }

  const timeline = findDecision(decisions, "timeline");
  if (timeline === "short") {
    // Penalize high-effort options
    const penalty = Math.max(0, option.scores.effort - 50);
    adjustment -= penalty * 0.2;
    if (penalty > 0) aligned = false;
    else aligned = true;
  }

  const expertise = findDecision(decisions, "expertise");
  if (typeof expertise === "number" && expertise > 3) {
    adjustment += (expertise - 3) * 5;
    aligned = true;
  }

  return { adjustment, aligned };
}

function generateRisks(option: StackRecommendationInput["migrationOptions"][number]): string[] {
  const risks: string[] = [];

  for (const con of option.cons) {
    risks.push(con);
  }

  if (option.scores.effort > 70) {
    risks.push("High effort required — may exceed budget or timeline");
  }
  if (option.scores.risk > 60) {
    risks.push("Elevated risk score — careful planning and validation needed");
  }

  return risks;
}

function generateRationale(rank: number, option: StackRecommendationInput["migrationOptions"][number], adjustedScore: number, userAligned: boolean): string {
  let rationale = `Ranked #${rank} with adjusted score ${adjustedScore.toFixed(1)}/100.`;
  rationale += ` Base overall score: ${option.scores.overall}/100.`;
  if (userAligned) {
    rationale += " User preferences align with this option.";
  }
  if (option.scores.effort > 70) {
    rationale += " Note: high effort requirement.";
  }
  if (option.scores.risk > 60) {
    rationale += " Note: elevated risk.";
  }
  return rationale;
}

export class StackRecommendationSkill implements Skill {
  readonly name = "stack_recommendation";

  async execute(context: unknown): Promise<StackRecommendationOutput> {
    const input = context as StackRecommendationInput;
    const { migrationOptions, userDecisions } = input;

    if (migrationOptions.length === 0) {
      return {
        recommendations: [],
        topRecommendation: "",
        summary: "No migration options provided.",
        userInfluence: "No user decisions to apply.",
      };
    }

    const decisions = userDecisions?.decisions ?? [];
    const hasDecisions = decisions.length > 0;

    // Score and rank options
    const scored = migrationOptions.map((option) => {
      const { adjustment, aligned } = hasDecisions
        ? computeAdjustment(option, decisions)
        : { adjustment: 0, aligned: false };

      return {
        option,
        adjustedScore: option.scores.overall + adjustment,
        userAligned: aligned,
      };
    });

    // Sort by adjusted score descending
    scored.sort((a, b) => b.adjustedScore - a.adjustedScore);

    const recommendations: Recommendation[] = scored.map((entry, index) => {
      const rank = index + 1;
      const risks = generateRisks(entry.option);
      const rationale = generateRationale(rank, entry.option, entry.adjustedScore, entry.userAligned);

      return {
        rank,
        migrationId: entry.option.id,
        name: entry.option.name,
        adjustedScore: Math.round(entry.adjustedScore * 10) / 10,
        pros: entry.option.pros,
        cons: entry.option.cons,
        risks,
        prerequisites: entry.option.prerequisites,
        rationale,
        userAligned: entry.userAligned,
      };
    });

    const top = recommendations[0];

    const influenceParts: string[] = [];
    if (hasDecisions) {
      for (const d of decisions) {
        influenceParts.push(`${d.questionId}=${String(d.answer)}`);
      }
    }
    const userInfluence = hasDecisions
      ? `User decisions (${influenceParts.join(", ")}) influenced ranking.`
      : "No user decisions provided — ranking based on base scores only.";

    return {
      recommendations,
      topRecommendation: top.migrationId,
      summary: `Top recommendation: "${top.name}" with adjusted score ${top.adjustedScore}/100. ${recommendations.length} option(s) evaluated.`,
      userInfluence,
    };
  }
}
