import type { Skill } from "./index.js";

export interface MigrationEvaluatorInput {
  stackFingerprint: {
    languages: Array<{ name: string; version?: string; confidence: number }>;
    frameworks: Array<{ name: string; version?: string; confidence: number }>;
    buildTools: Array<{ name: string }>;
  };
  teamExpertise?: Record<string, number>; // technology → skill level (1-5)
}

export interface MigrationPath {
  id: string;
  name: string;
  description: string;
  sourceStack: string[];
  targetStack: string[];
  scores: {
    effort: number; // 0-100, lower is easier
    risk: number; // 0-100, lower is safer
    ecosystemSupport: number; // 0-100, higher is better
    teamReadiness: number; // 0-100, higher is better
    overall: number; // weighted composite
  };
  pros: string[];
  cons: string[];
  prerequisites: string[];
}

export interface MigrationEvaluatorOutput {
  options: MigrationPath[];
  recommendedId: string;
  rationale: string;
}

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  sourceStack: string[];
  targetStack: string[];
  effort: number;
  risk: number;
  ecosystemSupport: number;
  pros: string[];
  cons: string[];
  prerequisites: string[];
}

const MIGRATION_CATALOG: CatalogEntry[] = [
  {
    id: "c-to-cpp",
    name: "C → C++",
    description: "Modernize C codebase with C++ classes, RAII, and type safety",
    sourceStack: ["C"],
    targetStack: ["C++"],
    effort: 40,
    risk: 30,
    ecosystemSupport: 85,
    pros: [
      "Incremental adoption — C++ is a superset of C",
      "RAII eliminates manual resource management",
      "Strong type system catches bugs at compile time",
    ],
    cons: [
      "Increased compile times",
      "C++ complexity can overwhelm teams new to it",
      "ABI compatibility concerns with existing C libraries",
    ],
    prerequisites: ["C++ compiler toolchain", "Familiarity with RAII and classes"],
  },
  {
    id: "c-to-rust",
    name: "C → Rust",
    description: "Safety-focused rewrite from C to Rust with memory safety guarantees",
    sourceStack: ["C"],
    targetStack: ["Rust"],
    effort: 75,
    risk: 50,
    ecosystemSupport: 70,
    pros: [
      "Memory safety without garbage collection",
      "Eliminates entire classes of bugs (use-after-free, data races)",
      "Modern tooling with cargo package manager",
    ],
    cons: [
      "Steep learning curve for ownership model",
      "Full rewrite required — no incremental path",
      "Smaller talent pool compared to C/C++",
    ],
    prerequisites: ["Rust toolchain", "Team training on ownership and borrowing"],
  },
  {
    id: "python2-to-python3",
    name: "Python 2 → Python 3",
    description: "Migrate from end-of-life Python 2 to Python 3",
    sourceStack: ["Python"],
    targetStack: ["Python"],
    effort: 35,
    risk: 25,
    ecosystemSupport: 95,
    pros: [
      "Python 2 is end-of-life — security patches no longer available",
      "Automated tooling (2to3, futurize) handles most changes",
      "Access to modern Python features (f-strings, typing, asyncio)",
    ],
    cons: [
      "Unicode handling differences can cause subtle bugs",
      "Some third-party libraries may behave differently",
      "Division operator semantics changed",
    ],
    prerequisites: ["Python 3 runtime", "2to3 or futurize tool"],
  },
  {
    id: "js-to-ts",
    name: "JavaScript → TypeScript",
    description: "Add static typing to JavaScript codebase with TypeScript",
    sourceStack: ["JavaScript"],
    targetStack: ["TypeScript"],
    effort: 30,
    risk: 15,
    ecosystemSupport: 95,
    pros: [
      "Incremental adoption — rename .js to .ts",
      "Catches type errors at compile time",
      "Excellent IDE support and autocompletion",
    ],
    cons: [
      "Build step required",
      "Type definition maintenance overhead",
      "Learning curve for advanced type features",
    ],
    prerequisites: ["TypeScript compiler", "tsconfig.json configuration"],
  },
  {
    id: "vue2-to-vue3",
    name: "Vue 2 → Vue 3",
    description: "Upgrade from Vue 2 to Vue 3 with Composition API",
    sourceStack: ["Vue"],
    targetStack: ["Vue"],
    effort: 50,
    risk: 40,
    ecosystemSupport: 85,
    pros: [
      "Composition API improves code reuse",
      "Better TypeScript support",
      "Improved performance with proxy-based reactivity",
    ],
    cons: [
      "Breaking changes in template syntax and lifecycle hooks",
      "Ecosystem plugins may not support Vue 3",
      "Mixins need to be refactored to composables",
    ],
    prerequisites: ["Vue 3 compatible dependencies", "Migration build tool"],
  },
  {
    id: "jquery-to-react",
    name: "jQuery → React",
    description: "Replace jQuery DOM manipulation with React component architecture",
    sourceStack: ["jQuery"],
    targetStack: ["React"],
    effort: 70,
    risk: 55,
    ecosystemSupport: 90,
    pros: [
      "Component-based architecture improves maintainability",
      "Virtual DOM provides better performance for complex UIs",
      "Massive ecosystem and community support",
    ],
    cons: [
      "Full rewrite of UI layer required",
      "Different mental model (declarative vs imperative)",
      "Build toolchain complexity increases",
    ],
    prerequisites: ["Node.js and npm", "Bundler setup (webpack/vite)", "React fundamentals training"],
  },
  {
    id: "express-to-fastify",
    name: "Express → Fastify",
    description: "Migrate Node.js HTTP server from Express to Fastify for better performance",
    sourceStack: ["Express"],
    targetStack: ["Fastify"],
    effort: 45,
    risk: 35,
    ecosystemSupport: 75,
    pros: [
      "Significantly better performance and lower overhead",
      "Built-in schema validation with JSON Schema",
      "Plugin architecture with proper encapsulation",
    ],
    cons: [
      "Middleware ecosystem is smaller than Express",
      "Different plugin registration model",
      "Some Express middleware has no Fastify equivalent",
    ],
    prerequisites: ["Fastify package", "JSON Schema definitions for routes"],
  },
  {
    id: "makefile-to-cmake",
    name: "Makefile → CMake",
    description: "Replace hand-written Makefiles with CMake build system",
    sourceStack: ["Make"],
    targetStack: ["CMake"],
    effort: 45,
    risk: 30,
    ecosystemSupport: 80,
    pros: [
      "Cross-platform build support (Windows, macOS, Linux)",
      "Automatic dependency detection",
      "IDE integration (Visual Studio, CLion, VS Code)",
    ],
    cons: [
      "CMake syntax has a learning curve",
      "Generated build files can be hard to debug",
      "Complex projects may need significant restructuring",
    ],
    prerequisites: ["CMake installation", "Understanding of CMakeLists.txt syntax"],
  },
];

function matchCatalogEntries(
  input: MigrationEvaluatorInput,
): CatalogEntry[] {
  const stackNames = new Set<string>();

  for (const lang of input.stackFingerprint.languages) {
    stackNames.add(lang.name);
  }
  for (const fw of input.stackFingerprint.frameworks) {
    stackNames.add(fw.name);
  }
  for (const bt of input.stackFingerprint.buildTools) {
    stackNames.add(bt.name);
  }

  return MIGRATION_CATALOG.filter((entry) =>
    entry.sourceStack.every((src) => stackNames.has(src)),
  );
}

function computeTeamReadiness(
  targetStack: string[],
  teamExpertise?: Record<string, number>,
): number {
  if (!teamExpertise) return 50;

  const scores = targetStack.map((tech) => {
    const level = teamExpertise[tech];
    if (level === undefined) return 50;
    // Map 1-5 scale to 0-100
    return ((level - 1) / 4) * 100;
  });

  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

function computeOverall(scores: {
  effort: number;
  risk: number;
  ecosystemSupport: number;
  teamReadiness: number;
}): number {
  // For effort and risk, lower is better, so we invert them for the composite
  const effortScore = 100 - scores.effort;
  const riskScore = 100 - scores.risk;
  return Math.round(
    effortScore * 0.25 +
      riskScore * 0.25 +
      scores.ecosystemSupport * 0.25 +
      scores.teamReadiness * 0.25,
  );
}

export class MigrationEvaluatorSkill implements Skill {
  readonly name = "migration_evaluator";

  async execute(context: unknown): Promise<MigrationEvaluatorOutput> {
    const input = context as MigrationEvaluatorInput;
    const matched = matchCatalogEntries(input);

    if (matched.length === 0) {
      return {
        options: [],
        recommendedId: "",
        rationale: "No known migration paths match the current stack fingerprint.",
      };
    }

    const options: MigrationPath[] = matched.map((entry) => {
      const teamReadiness = computeTeamReadiness(
        entry.targetStack,
        input.teamExpertise,
      );

      const scores = {
        effort: entry.effort,
        risk: entry.risk,
        ecosystemSupport: entry.ecosystemSupport,
        teamReadiness,
        overall: 0,
      };
      scores.overall = computeOverall(scores);

      return {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        sourceStack: entry.sourceStack,
        targetStack: entry.targetStack,
        scores,
        pros: entry.pros,
        cons: entry.cons,
        prerequisites: entry.prerequisites,
      };
    });

    // Sort by overall score descending (highest = best)
    options.sort((a, b) => b.scores.overall - a.scores.overall);

    const recommended = options[0];

    return {
      options,
      recommendedId: recommended.id,
      rationale: `"${recommended.name}" scores highest overall (${recommended.scores.overall}/100) based on effort, risk, ecosystem support, and team readiness.`,
    };
  }
}
