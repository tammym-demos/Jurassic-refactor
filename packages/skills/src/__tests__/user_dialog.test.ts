import { describe, it, expect } from "vitest";
import {
  UserDialogSkill,
  type Question,
  type UserDialogOutput,
} from "../user_dialog.js";

describe("UserDialogSkill", () => {
  it("has name user_dialog", () => {
    const skill = new UserDialogSkill();
    expect(skill.name).toBe("user_dialog");
  });

  it("presents default questions when none provided", async () => {
    const skill = new UserDialogSkill();
    const asked: string[] = [];
    const mockOnQuestion = async (q: string) => {
      asked.push(q);
      return "answer";
    };

    await skill.execute({ onQuestion: mockOnQuestion });
    // Default bank has 9 questions
    expect(asked.length).toBe(9);
  });

  it("records user responses with timestamps", async () => {
    const skill = new UserDialogSkill();
    const mockOnQuestion = async () => "test answer";

    const result = (await skill.execute({
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;

    expect(result.decisions.length).toBeGreaterThan(0);
    for (const decision of result.decisions) {
      expect(decision.questionId).toBeDefined();
      expect(decision.answer).toBeDefined();
      expect(decision.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(result.sessionId).toBeDefined();
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles skipped questions (empty answer)", async () => {
    const skill = new UserDialogSkill();
    let callCount = 0;
    const mockOnQuestion = async () => {
      callCount++;
      return callCount === 1 ? "" : "answer";
    };

    const result = (await skill.execute({
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;

    expect(result.skippedQuestions.length).toBe(1);
    expect(result.skippedQuestions[0]).toBe("biz-driver");
  });

  it("formats multi-choice questions with numbered choices", async () => {
    const skill = new UserDialogSkill();
    const asked: string[] = [];
    const mockOnQuestion = async (q: string) => {
      asked.push(q);
      return "1";
    };

    const customQuestions: Question[] = [
      {
        id: "test-mc",
        category: "business_drivers",
        type: "multi-choice",
        text: "Pick one:",
        choices: ["alpha", "beta", "gamma"],
        required: true,
      },
    ];

    await skill.execute({ questions: customQuestions, onQuestion: mockOnQuestion });

    expect(asked[0]).toContain("Pick one:");
    expect(asked[0]).toContain("1. alpha");
    expect(asked[0]).toContain("2. beta");
    expect(asked[0]).toContain("3. gamma");
  });

  it("formats scale questions with min-max range", async () => {
    const skill = new UserDialogSkill();
    const asked: string[] = [];
    const mockOnQuestion = async (q: string) => {
      asked.push(q);
      return "3";
    };

    const customQuestions: Question[] = [
      {
        id: "test-scale",
        category: "expertise",
        type: "scale",
        text: "Rate your experience:",
        scaleMin: 1,
        scaleMax: 10,
        required: true,
      },
    ];

    const result = (await skill.execute({
      questions: customQuestions,
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;

    expect(asked[0]).toContain("Rate your experience:");
    expect(asked[0]).toContain("(1-10)");
    expect(result.decisions[0].answer).toBe(3);
  });

  it("handles free-text questions", async () => {
    const skill = new UserDialogSkill();
    const asked: string[] = [];
    const mockOnQuestion = async (q: string) => {
      asked.push(q);
      return "We need REST API compatibility";
    };

    const customQuestions: Question[] = [
      {
        id: "test-freetext",
        category: "technical",
        type: "free-text",
        text: "Describe integration needs:",
        required: false,
      },
    ];

    const result = (await skill.execute({
      questions: customQuestions,
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;

    expect(asked[0]).toBe("Describe integration needs:");
    expect(result.decisions[0].answer).toBe("We need REST API compatibility");
  });

  it("uses custom questions when provided, overriding defaults", async () => {
    const skill = new UserDialogSkill();
    const asked: string[] = [];
    const mockOnQuestion = async (q: string) => {
      asked.push(q);
      return "answer";
    };

    const customQuestions: Question[] = [
      {
        id: "custom-1",
        category: "budget",
        type: "multi-choice",
        text: "Custom question 1?",
        choices: ["a", "b"],
        required: true,
      },
      {
        id: "custom-2",
        category: "timeline",
        type: "yes-no",
        text: "Custom question 2?",
        required: true,
      },
    ];

    const result = (await skill.execute({
      questions: customQuestions,
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;

    expect(asked.length).toBe(2);
    expect(result.decisions.length).toBe(2);
    expect(result.decisions[0].questionId).toBe("custom-1");
    expect(result.decisions[1].questionId).toBe("custom-2");
  });

  it("generates a unique sessionId", async () => {
    const skill = new UserDialogSkill();
    const mockOnQuestion = async () => "answer";

    const result1 = (await skill.execute({
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;
    const result2 = (await skill.execute({
      onQuestion: mockOnQuestion,
    })) as UserDialogOutput;

    expect(result1.sessionId).not.toBe(result2.sessionId);
  });

  it("passes choices array to onQuestion for multi-choice", async () => {
    const skill = new UserDialogSkill();
    const receivedChoices: (string[] | undefined)[] = [];
    const mockOnQuestion = async (_q: string, choices?: string[]) => {
      receivedChoices.push(choices);
      return "answer";
    };

    const customQuestions: Question[] = [
      {
        id: "mc",
        category: "budget",
        type: "multi-choice",
        text: "Pick:",
        choices: ["x", "y"],
        required: true,
      },
      {
        id: "ft",
        category: "technical",
        type: "free-text",
        text: "Describe:",
        required: false,
      },
    ];

    await skill.execute({ questions: customQuestions, onQuestion: mockOnQuestion });

    expect(receivedChoices[0]).toEqual(["x", "y"]);
    expect(receivedChoices[1]).toBeUndefined();
  });
});
