import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface EvaluationConfig {
  runId: string;
  agentType: "planning" | "implementation";
  artifactDir: string;
  baselineDir?: string;
  subscriptionId?: string;
  resourceGroup?: string;
}

export interface MetricResult {
  name: string;
  category: "accuracy" | "safety" | "relevance" | "performance" | "determinism";
  score: number;
  threshold: number;
  passed: boolean;
  details: string;
}

export interface RegressionItem {
  metric: string;
  previousScore: number;
  currentScore: number;
  delta: number;
  severity: "critical" | "warning" | "info";
}

export interface GroundednessResult {
  groundednessScore: number;
  totalReferences: number;
  groundedReferences: number;
  ungroundedClaims: string[];
}

export interface HallucinationResult {
  hallucinationRate: number;
  totalClaims: number;
  hallucinatedClaims: number;
  details: Array<{ claim: string; reason: string }>;
}

export interface ConfidenceDistribution {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
  histogram: { bucket: string; count: number }[];
  outliers: { skill: string; confidence: number }[];
}

export interface ModelComparisonInput {
  deploymentNames: string[];
  artifactDirs: string[];
}

export interface ModelComparisonResult {
  models: ModelRunSummary[];
  recommendation: string;
}

export interface ModelRunSummary {
  deploymentName: string;
  artifactDir: string;
  overallScore: number;
  metrics: { name: string; value: number }[];
  artifactCount: number;
  totalTokens?: number;
}

export interface EvaluationReport {
  runId: string;
  agentType: string;
  evaluatedAt: string;
  overallScore: number;
  passed: boolean;
  metrics: MetricResult[];
  regressions: RegressionItem[];
  groundedness?: GroundednessResult;
  hallucination?: HallucinationResult;
  confidenceDistribution?: ConfidenceDistribution;
}

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
  /(?:secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
];

const PII_PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

const CATEGORY_WEIGHTS: Record<string, number> = {
  accuracy: 0.3,
  safety: 0.3,
  relevance: 0.2,
  determinism: 0.2,
};

async function readJsonFiles(dir: string): Promise<{ name: string; content: string }[]> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  const results: { name: string; content: string }[] = [];
  for (const name of jsonFiles) {
    const content = await readFile(join(dir, name), "utf-8");
    results.push({ name, content });
  }
  return results;
}

export class EvaluationService {
  async evaluate(config: EvaluationConfig): Promise<EvaluationReport> {
    const [accuracy, safety, relevance, determinism] = await Promise.all([
      this.evaluateAccuracy(config.artifactDir),
      this.evaluateSafety(config.artifactDir),
      this.evaluateRelevance(config.artifactDir),
      this.evaluateDeterminism(config.artifactDir, config.baselineDir),
    ]);

    const metrics = [...accuracy, ...safety, ...relevance, ...determinism];

    let baselineMetrics: MetricResult[] | undefined;
    if (config.baselineDir) {
      const [bAcc, bSaf, bRel] = await Promise.all([
        this.evaluateAccuracy(config.baselineDir),
        this.evaluateSafety(config.baselineDir),
        this.evaluateRelevance(config.baselineDir),
      ]);
      baselineMetrics = [...bAcc, ...bSaf, ...bRel];
    }

    const regressions = this.detectRegressions(metrics, baselineMetrics);
    const overallScore = this.computeOverallScore(metrics);
    const hasCriticalRegression = regressions.some((r) => r.severity === "critical");
    const passed = overallScore >= 0.7 && !hasCriticalRegression;

    const [groundedness, hallucination, confidenceDistribution] = await Promise.all([
      this.measureGroundedness(config.artifactDir).catch(() => undefined),
      this.detectHallucinations(config.artifactDir, []).catch(() => undefined),
      this.analyzeConfidenceDistribution(config.artifactDir).catch(() => undefined),
    ]);

    return {
      runId: config.runId,
      agentType: config.agentType,
      evaluatedAt: new Date().toISOString(),
      overallScore,
      passed,
      metrics,
      regressions,
      groundedness,
      hallucination,
      confidenceDistribution,
    };
  }

  async evaluateAccuracy(artifactDir: string): Promise<MetricResult[]> {
    const results: MetricResult[] = [];
    let files: { name: string; content: string }[];

    try {
      files = await readJsonFiles(artifactDir);
    } catch {
      return [
        {
          name: "artifact-readable",
          category: "accuracy",
          score: 0,
          threshold: 0.8,
          passed: false,
          details: "Failed to read artifact directory",
        },
      ];
    }

    if (files.length === 0) {
      return [
        {
          name: "artifact-presence",
          category: "accuracy",
          score: 0,
          threshold: 0.8,
          passed: false,
          details: "No JSON artifacts found",
        },
      ];
    }

    // Check JSON validity
    let validCount = 0;
    for (const file of files) {
      try {
        JSON.parse(file.content);
        validCount++;
      } catch {
        // invalid JSON
      }
    }
    const jsonValidScore = files.length > 0 ? validCount / files.length : 0;
    results.push({
      name: "json-validity",
      category: "accuracy",
      score: jsonValidScore,
      threshold: 0.9,
      passed: jsonValidScore >= 0.9,
      details: `${validCount}/${files.length} files are valid JSON`,
    });

    // Check expected artifacts
    const expectedArtifacts = ["Manifest.json", "DependencyGraph.json", "ModernizationPlan.json"];
    const fileNames = new Set(files.map((f) => f.name));
    const presentCount = expectedArtifacts.filter((a) => fileNames.has(a)).length;
    const completenessScore = presentCount / expectedArtifacts.length;
    results.push({
      name: "artifact-completeness",
      category: "accuracy",
      score: completenessScore,
      threshold: 0.8,
      passed: completenessScore >= 0.8,
      details: `${presentCount}/${expectedArtifacts.length} expected artifacts present`,
    });

    return results;
  }

  async evaluateSafety(artifactDir: string): Promise<MetricResult[]> {
    const results: MetricResult[] = [];
    let files: { name: string; content: string }[];

    try {
      files = await readJsonFiles(artifactDir);
    } catch {
      return [
        {
          name: "safety-readable",
          category: "safety",
          score: 0,
          threshold: 1.0,
          passed: false,
          details: "Failed to read artifact directory",
        },
      ];
    }

    const allContent = files.map((f) => f.content).join("\n");

    // Check for secrets
    const secretsFound = SECRET_PATTERNS.some((p) => p.test(allContent));
    results.push({
      name: "no-secrets",
      category: "safety",
      score: secretsFound ? 0 : 1,
      threshold: 1.0,
      passed: !secretsFound,
      details: secretsFound ? "Potential secrets detected in artifacts" : "No secrets detected",
    });

    // Check for PII
    const piiFound = PII_PATTERNS.some((p) => p.test(allContent));
    results.push({
      name: "no-pii",
      category: "safety",
      score: piiFound ? 0 : 1,
      threshold: 1.0,
      passed: !piiFound,
      details: piiFound ? "Potential PII detected in artifacts" : "No PII detected",
    });

    return results;
  }

  async evaluateRelevance(artifactDir: string): Promise<MetricResult[]> {
    const results: MetricResult[] = [];
    let files: { name: string; content: string }[];

    try {
      files = await readJsonFiles(artifactDir);
    } catch {
      return [
        {
          name: "relevance-readable",
          category: "relevance",
          score: 0,
          threshold: 0.7,
          passed: false,
          details: "Failed to read artifact directory",
        },
      ];
    }

    const fileMap = new Map(files.map((f) => [f.name, f.content]));

    // Check DependencyGraph has nodes
    const graphContent = fileMap.get("DependencyGraph.json");
    if (graphContent) {
      try {
        const graph = JSON.parse(graphContent) as { nodes?: unknown[] };
        const hasNodes = Array.isArray(graph.nodes) && graph.nodes.length > 0;
        results.push({
          name: "graph-non-empty",
          category: "relevance",
          score: hasNodes ? 1 : 0,
          threshold: 0.7,
          passed: hasNodes,
          details: hasNodes
            ? `DependencyGraph has ${graph.nodes.length} nodes`
            : "DependencyGraph has no nodes",
        });
      } catch {
        results.push({
          name: "graph-non-empty",
          category: "relevance",
          score: 0,
          threshold: 0.7,
          passed: false,
          details: "DependencyGraph.json is not valid JSON",
        });
      }
    }

    // Check ModernizationPlan has phases
    const planContent = fileMap.get("ModernizationPlan.json");
    if (planContent) {
      try {
        const plan = JSON.parse(planContent) as { phases?: unknown[] };
        const hasPhases = Array.isArray(plan.phases) && plan.phases.length > 0;
        results.push({
          name: "plan-has-phases",
          category: "relevance",
          score: hasPhases ? 1 : 0,
          threshold: 0.7,
          passed: hasPhases,
          details: hasPhases
            ? `ModernizationPlan has ${plan.phases.length} phases`
            : "ModernizationPlan has no phases",
        });
      } catch {
        results.push({
          name: "plan-has-phases",
          category: "relevance",
          score: 0,
          threshold: 0.7,
          passed: false,
          details: "ModernizationPlan.json is not valid JSON",
        });
      }
    }

    // If no relevance metrics were produced, add a default
    if (results.length === 0) {
      results.push({
        name: "relevance-artifacts",
        category: "relevance",
        score: 0,
        threshold: 0.7,
        passed: false,
        details: "No relevant artifacts found to evaluate",
      });
    }

    return results;
  }

  async evaluateDeterminism(
    artifactDir: string,
    baselineDir?: string,
  ): Promise<MetricResult[]> {
    if (!baselineDir) {
      return [
        {
          name: "determinism",
          category: "determinism",
          score: 1,
          threshold: 0.7,
          passed: true,
          details: "No baseline provided; skipping determinism check",
        },
      ];
    }

    let currentFiles: { name: string; content: string }[];
    let baselineFiles: { name: string; content: string }[];

    try {
      [currentFiles, baselineFiles] = await Promise.all([
        readJsonFiles(artifactDir),
        readJsonFiles(baselineDir),
      ]);
    } catch {
      return [
        {
          name: "determinism",
          category: "determinism",
          score: 0,
          threshold: 0.7,
          passed: false,
          details: "Failed to read artifact or baseline directory",
        },
      ];
    }

    const baselineMap = new Map(baselineFiles.map((f) => [f.name, f.content]));
    let matchCount = 0;
    let totalComparisons = 0;

    for (const file of currentFiles) {
      const baselineContent = baselineMap.get(file.name);
      if (baselineContent === undefined) continue;

      totalComparisons++;
      try {
        const current = JSON.parse(file.content) as Record<string, unknown>;
        const baseline = JSON.parse(baselineContent) as Record<string, unknown>;

        // Compare key structural fields
        if (file.name === "DependencyGraph.json") {
          const cNodes = Array.isArray(current.nodes) ? current.nodes.length : 0;
          const bNodes = Array.isArray(baseline.nodes) ? baseline.nodes.length : 0;
          if (cNodes === bNodes) matchCount++;
        } else if (file.name === "ModernizationPlan.json") {
          const cPhases = Array.isArray(current.phases) ? current.phases.length : 0;
          const bPhases = Array.isArray(baseline.phases) ? baseline.phases.length : 0;
          if (cPhases === bPhases) matchCount++;
        } else {
          // For other files, compare top-level key count
          if (Object.keys(current).length === Object.keys(baseline).length) matchCount++;
        }
      } catch {
        // If either isn't valid JSON, not a match
      }
    }

    const score = totalComparisons > 0 ? matchCount / totalComparisons : 1;
    return [
      {
        name: "determinism",
        category: "determinism",
        score,
        threshold: 0.7,
        passed: score >= 0.7,
        details: `${matchCount}/${totalComparisons} artifacts structurally consistent with baseline`,
      },
    ];
  }

  detectRegressions(
    current: MetricResult[],
    baseline?: MetricResult[],
  ): RegressionItem[] {
    if (!baseline) return [];

    const baselineMap = new Map(baseline.map((m) => [m.name, m]));
    const regressions: RegressionItem[] = [];

    for (const metric of current) {
      const prev = baselineMap.get(metric.name);
      if (!prev) continue;

      const delta = metric.score - prev.score;
      if (delta < -0.05) {
        let severity: RegressionItem["severity"] = "info";
        if (delta <= -0.2) severity = "critical";
        else if (delta <= -0.1) severity = "warning";

        regressions.push({
          metric: metric.name,
          previousScore: prev.score,
          currentScore: metric.score,
          delta,
          severity,
        });
      }
    }

    return regressions;
  }

  computeOverallScore(metrics: MetricResult[]): number {
    const categoryScores = new Map<string, { total: number; count: number }>();

    for (const m of metrics) {
      const entry = categoryScores.get(m.category) ?? { total: 0, count: 0 };
      entry.total += m.score;
      entry.count++;
      categoryScores.set(m.category, entry);
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [category, { total, count }] of categoryScores) {
      const avgScore = total / count;
      const weight = CATEGORY_WEIGHTS[category] ?? 0.1;
      weightedSum += avgScore * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  async measureGroundedness(artifactDir: string): Promise<GroundednessResult> {
    const files = await readJsonFiles(artifactDir);
    const fileMap = new Map(files.map((f) => [f.name, f.content]));

    const ungroundedClaims: string[] = [];
    let totalReferences = 0;
    let groundedReferences = 0;

    // Build set of nodes from DependencyGraph
    const graphContent = fileMap.get("DependencyGraph.json");
    const graphNodeIds = new Set<string>();
    const graphFilePaths = new Set<string>();
    if (graphContent) {
      try {
        const graph = JSON.parse(graphContent) as {
          nodes?: Array<{ id?: string; filePath?: string }>;
        };
        if (Array.isArray(graph.nodes)) {
          for (const node of graph.nodes) {
            if (node.id) graphNodeIds.add(node.id);
            if (node.filePath) graphFilePaths.add(node.filePath);
          }
        }
      } catch {
        // invalid JSON
      }
    }

    // Cross-reference: every filePath in RiskAssessment must exist in DependencyGraph
    const riskContent = fileMap.get("RiskAssessment.json");
    if (riskContent) {
      try {
        const risk = JSON.parse(riskContent) as {
          items?: Array<{ filePath?: string }>;
        };
        if (Array.isArray(risk.items)) {
          for (const item of risk.items) {
            if (item.filePath) {
              totalReferences++;
              if (graphFilePaths.has(item.filePath) || graphNodeIds.has(item.filePath)) {
                groundedReferences++;
              } else {
                ungroundedClaims.push(
                  `RiskAssessment references "${item.filePath}" not found in DependencyGraph`,
                );
              }
            }
          }
        }
      } catch {
        // invalid JSON
      }
    }

    // Cross-reference: ModernizationPlan task references must exist in DependencyGraph
    const planContent = fileMap.get("ModernizationPlan.json");
    if (planContent) {
      try {
        const plan = JSON.parse(planContent) as {
          phases?: Array<{ tasks?: Array<{ fileRef?: string; nodeRef?: string }> }>;
        };
        if (Array.isArray(plan.phases)) {
          for (const phase of plan.phases) {
            if (Array.isArray(phase.tasks)) {
              for (const task of phase.tasks) {
                const ref = task.fileRef ?? task.nodeRef;
                if (ref) {
                  totalReferences++;
                  if (graphNodeIds.has(ref) || graphFilePaths.has(ref)) {
                    groundedReferences++;
                  } else {
                    ungroundedClaims.push(
                      `ModernizationPlan references "${ref}" not found in DependencyGraph`,
                    );
                  }
                }
              }
            }
          }
        }
      } catch {
        // invalid JSON
      }
    }

    const groundednessScore = totalReferences > 0 ? groundedReferences / totalReferences : 1;

    return {
      groundednessScore,
      totalReferences,
      groundedReferences,
      ungroundedClaims,
    };
  }

  async detectHallucinations(
    artifactDir: string,
    repoFiles: string[],
  ): Promise<HallucinationResult> {
    const files = await readJsonFiles(artifactDir);
    const repoFileSet = new Set(repoFiles);
    const details: Array<{ claim: string; reason: string }> = [];
    let totalClaims = 0;
    let hallucinatedClaims = 0;

    for (const file of files) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(file.content) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Check file path references in artifacts against repoFiles
      const filePaths = this.extractFilePaths(parsed);
      for (const fp of filePaths) {
        totalClaims++;
        if (repoFileSet.size > 0 && !repoFileSet.has(fp)) {
          hallucinatedClaims++;
          details.push({
            claim: `File path "${fp}" in ${file.name}`,
            reason: "Referenced file does not exist in repository",
          });
        }
      }

      // Check numeric scores are within valid range (0-1)
      const scores = this.extractNumericScores(parsed);
      for (const { path, value } of scores) {
        totalClaims++;
        if (value < 0 || value > 1) {
          hallucinatedClaims++;
          details.push({
            claim: `Score ${path} = ${value} in ${file.name}`,
            reason: "Score outside valid range (0-1)",
          });
        }
      }

      // Check dependency graph edge references
      if (file.name === "DependencyGraph.json") {
        const graph = parsed as {
          nodes?: Array<{ id?: string }>;
          edges?: Array<{ source?: string; target?: string }>;
        };
        const nodeIds = new Set<string>();
        if (Array.isArray(graph.nodes)) {
          for (const node of graph.nodes) {
            if (node.id) nodeIds.add(node.id);
          }
        }
        if (Array.isArray(graph.edges)) {
          for (const edge of graph.edges) {
            if (edge.source) {
              totalClaims++;
              if (!nodeIds.has(edge.source)) {
                hallucinatedClaims++;
                details.push({
                  claim: `Edge source "${edge.source}" in ${file.name}`,
                  reason: "Edge references non-existent node",
                });
              }
            }
            if (edge.target) {
              totalClaims++;
              if (!nodeIds.has(edge.target)) {
                hallucinatedClaims++;
                details.push({
                  claim: `Edge target "${edge.target}" in ${file.name}`,
                  reason: "Edge references non-existent node",
                });
              }
            }
          }
        }
      }
    }

    const hallucinationRate = totalClaims > 0 ? hallucinatedClaims / totalClaims : 0;

    return {
      hallucinationRate,
      totalClaims,
      hallucinatedClaims,
      details,
    };
  }

  async analyzeConfidenceDistribution(artifactDir: string): Promise<ConfidenceDistribution> {
    const files = await readJsonFiles(artifactDir);
    const entries: { skill: string; confidence: number }[] = [];

    for (const file of files) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(file.content) as Record<string, unknown>;
      } catch {
        continue;
      }

      const scores = this.extractConfidenceScores(parsed, file.name);
      entries.push(...scores);
    }

    if (entries.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        count: 0,
        histogram: this.buildEmptyHistogram(),
        outliers: [],
      };
    }

    const values = entries.map((e) => e.confidence).sort((a, b) => a - b);
    const count = values.length;
    const min = values[0];
    const max = values[count - 1];
    const mean = values.reduce((sum, v) => sum + v, 0) / count;
    const median =
      count % 2 === 0
        ? (values[count / 2 - 1] + values[count / 2]) / 2
        : values[Math.floor(count / 2)];
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);

    // Build histogram with 10 buckets
    const histogram = this.buildEmptyHistogram();
    for (const v of values) {
      const idx = Math.min(Math.floor(v * 10), 9);
      histogram[idx].count++;
    }

    // Flag outliers: confidence < 0.5
    const outliers = entries
      .filter((e) => e.confidence < 0.5)
      .map((e) => ({ skill: e.skill, confidence: e.confidence }));

    return { mean, median, stdDev, min, max, count, histogram, outliers };
  }

  async compareModels(input: ModelComparisonInput): Promise<ModelComparisonResult> {
    if (input.deploymentNames.length !== input.artifactDirs.length) {
      throw new Error("deploymentNames and artifactDirs must have the same length");
    }

    const models: ModelRunSummary[] = [];

    for (let i = 0; i < input.deploymentNames.length; i++) {
      const deploymentName = input.deploymentNames[i];
      const artifactDir = input.artifactDirs[i];

      const [accuracy, safety, relevance] = await Promise.all([
        this.evaluateAccuracy(artifactDir),
        this.evaluateSafety(artifactDir),
        this.evaluateRelevance(artifactDir),
      ]);

      const allMetrics = [...accuracy, ...safety, ...relevance];
      const overallScore = this.computeOverallScore(allMetrics);

      let artifactCount = 0;
      try {
        const files = await readJsonFiles(artifactDir);
        artifactCount = files.length;
      } catch {
        // directory unreadable
      }

      // Attempt to read token usage from a report file if present
      let totalTokens: number | undefined;
      try {
        const reportContent = await readFile(join(artifactDir, "EvaluationReport.json"), "utf-8");
        const report = JSON.parse(reportContent) as { totalTokens?: number };
        if (typeof report.totalTokens === "number") {
          totalTokens = report.totalTokens;
        }
      } catch {
        // no report or no token info
      }

      models.push({
        deploymentName,
        artifactDir,
        overallScore: Math.round(overallScore * 100) / 100,
        metrics: allMetrics.map((m) => ({ name: m.name, value: m.score })),
        artifactCount,
        totalTokens,
      });
    }

    // Sort descending by overallScore for recommendation
    const sorted = [...models].sort((a, b) => b.overallScore - a.overallScore);
    let recommendation: string;
    if (sorted.length === 0) {
      recommendation = "No models to compare";
    } else if (sorted.length === 1) {
      recommendation = `Only one model evaluated: ${sorted[0].deploymentName} scored ${sorted[0].overallScore}`;
    } else {
      const best = sorted[0];
      const rest = sorted.slice(1).map((m) => `${m.deploymentName} at ${m.overallScore}`);
      recommendation = `${best.deploymentName} scored ${best.overallScore} vs ${rest.join(", ")}; ${best.deploymentName} recommended for production`;
    }

    return { models, recommendation };
  }

  private buildEmptyHistogram(): { bucket: string; count: number }[] {
    return Array.from({ length: 10 }, (_, i) => ({
      bucket: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
      count: 0,
    }));
  }

  private extractConfidenceScores(
    obj: unknown,
    skill: string,
    path = "",
  ): { skill: string; confidence: number }[] {
    const results: { skill: string; confidence: number }[] = [];
    if (obj === null || obj === undefined) return results;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        results.push(...this.extractConfidenceScores(obj[i], skill, `${path}[${i}]`));
      }
      return results;
    }

    if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (key === "confidence" && typeof value === "number") {
          results.push({ skill, confidence: value });
        } else {
          results.push(
            ...this.extractConfidenceScores(value, skill, path ? `${path}.${key}` : key),
          );
        }
      }
    }

    return results;
  }

  private extractFilePaths(obj: unknown, prefix = ""): string[] {
    const paths: string[] = [];
    if (obj === null || obj === undefined) return paths;

    if (typeof obj === "string") {
      // Match common file path patterns
      if (/^[a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10}$/.test(obj) && obj.includes("/")) {
        paths.push(obj);
      }
      return paths;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        paths.push(...this.extractFilePaths(item, prefix));
      }
      return paths;
    }

    if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (
          (key === "filePath" || key === "file" || key === "path" || key === "source") &&
          typeof value === "string"
        ) {
          paths.push(value);
        } else {
          paths.push(...this.extractFilePaths(value, `${prefix}${key}.`));
        }
      }
    }

    return paths;
  }

  private extractNumericScores(
    obj: unknown,
    path = "",
  ): Array<{ path: string; value: number }> {
    const scores: Array<{ path: string; value: number }> = [];
    if (obj === null || obj === undefined) return scores;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        scores.push(...this.extractNumericScores(obj[i], `${path}[${i}]`));
      }
      return scores;
    }

    if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (
          typeof value === "number" &&
          (key.toLowerCase().includes("score") ||
            key.toLowerCase().includes("risk") ||
            key.toLowerCase().includes("confidence"))
        ) {
          scores.push({ path: currentPath, value });
        } else {
          scores.push(...this.extractNumericScores(value, currentPath));
        }
      }
    }

    return scores;
  }
}
