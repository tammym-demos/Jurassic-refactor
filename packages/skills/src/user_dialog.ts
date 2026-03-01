import * as crypto from "node:crypto";
import type { Skill } from "./index.js";

export type QuestionType = "multi-choice" | "scale" | "free-text" | "yes-no";
export type QuestionCategory =
  | "business_drivers"
  | "constraints"
  | "expertise"
  | "timeline"
  | "budget"
  | "technical";

export interface Question {
  id: string;
  category: QuestionCategory;
  type: QuestionType;
  text: string;
  choices?: string[];
  scaleMin?: number;
  scaleMax?: number;
  required: boolean;
}

export interface UserResponse {
  questionId: string;
  answer: string | number;
  timestamp: string;
}

export interface UserDialogInput {
  migrationOptions?: Record<string, unknown>;
  questions?: Question[];
  onQuestion: (question: string, choices?: string[]) => Promise<string>;
}

export interface UserDialogOutput {
  decisions: UserResponse[];
  sessionId: string;
  completedAt: string;
  skippedQuestions: string[];
}

const DEFAULT_QUESTIONS: Question[] = [
  {
    id: "biz-driver",
    category: "business_drivers",
    type: "multi-choice",
    text: "What is the primary driver for modernization?",
    choices: [
      "cost reduction",
      "performance",
      "maintainability",
      "compliance",
      "developer productivity",
    ],
    required: true,
  },
  {
    id: "biz-risk-tolerance",
    category: "business_drivers",
    type: "scale",
    text: "What is your risk tolerance for the migration?",
    scaleMin: 1,
    scaleMax: 5,
    required: true,
  },
  {
    id: "constraint-downtime",
    category: "constraints",
    type: "scale",
    text: "What is the maximum acceptable downtime?",
    scaleMin: 1,
    scaleMax: 5,
    required: true,
  },
  {
    id: "constraint-legacy-deps",
    category: "constraints",
    type: "yes-no",
    text: "Are there legacy dependencies that must be preserved?",
    required: true,
  },
  {
    id: "expertise-target-stack",
    category: "expertise",
    type: "scale",
    text: "Team familiarity with target stack?",
    scaleMin: 1,
    scaleMax: 5,
    required: true,
  },
  {
    id: "timeline-target",
    category: "timeline",
    type: "multi-choice",
    text: "What is the target completion timeframe?",
    choices: ["1 month", "3 months", "6 months", "12+ months"],
    required: true,
  },
  {
    id: "budget-tooling",
    category: "budget",
    type: "multi-choice",
    text: "Available budget for tooling/licensing?",
    choices: ["minimal", "moderate", "flexible"],
    required: true,
  },
  {
    id: "tech-integration",
    category: "technical",
    type: "free-text",
    text: "Are there integration requirements?",
    required: false,
  },
  {
    id: "tech-testing-strategy",
    category: "technical",
    type: "multi-choice",
    text: "What testing strategy should be used during migration?",
    choices: [
      "manual testing",
      "automated unit tests",
      "integration tests",
      "full CI/CD pipeline",
    ],
    required: true,
  },
];

function formatQuestion(question: Question): {
  formatted: string;
  choices?: string[];
} {
  switch (question.type) {
    case "multi-choice": {
      const choiceList = (question.choices ?? [])
        .map((c, i) => `  ${i + 1}. ${c}`)
        .join("\n");
      return {
        formatted: `${question.text}\n${choiceList}`,
        choices: question.choices,
      };
    }
    case "scale": {
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      return {
        formatted: `${question.text} (${min}-${max})`,
      };
    }
    case "yes-no":
      return {
        formatted: `${question.text} (yes/no)`,
        choices: ["yes", "no"],
      };
    case "free-text":
    default:
      return { formatted: question.text };
  }
}

export class UserDialogSkill implements Skill {
  readonly name = "user_dialog";

  async execute(context: unknown): Promise<UserDialogOutput> {
    const input = context as UserDialogInput;
    const questions = input.questions ?? DEFAULT_QUESTIONS;
    const sessionId = crypto.randomUUID();
    const decisions: UserResponse[] = [];
    const skippedQuestions: string[] = [];

    for (const question of questions) {
      const { formatted, choices } = formatQuestion(question);
      const answer = await input.onQuestion(formatted, choices);

      if (answer === "" || answer === undefined || answer === null) {
        skippedQuestions.push(question.id);
        continue;
      }

      const parsedAnswer =
        question.type === "scale" && !isNaN(Number(answer))
          ? Number(answer)
          : answer;

      decisions.push({
        questionId: question.id,
        answer: parsedAnswer,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      decisions,
      sessionId,
      completedAt: new Date().toISOString(),
      skippedQuestions,
    };
  }
}
