# User Dialog

## Overview

Interactive skill that presents structured questions to the user to gather migration decisions. Supports multi-choice, scale, free-text, and yes-no question types across categories including business drivers, constraints, expertise, timeline, budget, and technical concerns. Responses are collected into a structured `UserDecisions.json` format.

## Interfaces

### Question

```typescript
type QuestionType = "multi-choice" | "scale" | "free-text" | "yes-no";
type QuestionCategory = "business_drivers" | "constraints" | "expertise" | "timeline" | "budget" | "technical";

interface Question {
  id: string;                // Unique question identifier
  category: QuestionCategory; // Question category
  type: QuestionType;        // Input format
  text: string;              // Question text
  choices?: string[];        // Options for multi-choice
  scaleMin?: number;         // Min value for scale
  scaleMax?: number;         // Max value for scale
  required: boolean;         // Whether the question can be skipped
}
```

### UserResponse

```typescript
interface UserResponse {
  questionId: string;         // References Question.id
  answer: string | number;   // User's answer
  timestamp: string;         // ISO 8601 timestamp
}
```

### UserDialogInput

```typescript
interface UserDialogInput {
  migrationOptions?: Record<string, unknown>; // Optional migration context
  questions?: Question[];    // Custom questions (defaults used if omitted)
  onQuestion: (question: string, choices?: string[]) => Promise<string>;
}
```

### UserDialogOutput

```typescript
interface UserDialogOutput {
  decisions: UserResponse[];  // Collected responses
  sessionId: string;          // Unique session identifier
  completedAt: string;        // ISO 8601 completion timestamp
  skippedQuestions: string[]; // IDs of questions the user skipped
}
```

## Behavior

- Implements the `Skill` interface with `name = "user_dialog"`
- `execute()` iterates through the question bank and calls `onQuestion` for each
- If `input.questions` is provided, uses those instead of the default question bank
- Formats questions based on type:
  - **multi-choice**: Displays numbered choices below the question text
  - **scale**: Appends `(min-max)` range to the question text
  - **yes-no**: Appends `(yes/no)` to the question text
  - **free-text**: Presents the question text as-is
- If the user returns an empty string, the question is added to `skippedQuestions`
- Scale answers are parsed as numbers when possible
- Generates a unique `sessionId` using `crypto.randomUUID()`
- Returns all collected decisions with timestamps

## Default Question Bank

The skill includes ~9 default questions covering all categories:

| ID | Category | Type | Question |
|----|----------|------|----------|
| biz-driver | business_drivers | multi-choice | What is the primary driver for modernization? |
| biz-risk-tolerance | business_drivers | scale | What is your risk tolerance for the migration? |
| constraint-downtime | constraints | scale | What is the maximum acceptable downtime? |
| constraint-legacy-deps | constraints | yes-no | Are there legacy dependencies that must be preserved? |
| expertise-target-stack | expertise | scale | Team familiarity with target stack? |
| timeline-target | timeline | multi-choice | What is the target completion timeframe? |
| budget-tooling | budget | multi-choice | Available budget for tooling/licensing? |
| tech-integration | technical | free-text | Are there integration requirements? |
| tech-testing-strategy | technical | multi-choice | What testing strategy should be used during migration? |
