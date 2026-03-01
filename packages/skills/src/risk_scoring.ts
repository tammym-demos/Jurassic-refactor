import type { Skill } from "./index.js";

export interface RiskScoringInput {
  repoPath: string;
  churnData?: {
    hotspots: Array<{ path: string; changeCount: number; churnScore: number }>;
  };
  complexityData?: {
    files: Array<{ filePath: string; avgCyclomaticComplexity: number; maxNestingDepth: number; loc: number }>;
  };
  safetyData?: {
    safetyIndicators: Array<{ filePath: string; severityMultiplier: number; type: string }>;
    highRiskFiles: string[];
  };
}

export interface RiskItem {
  filePath: string;
  overallScore: number;
  churnScore: number;
  complexityScore: number;
  safetyScore: number;
  evidence: string[];
  severity: "critical" | "high" | "medium" | "low";
}

export interface RiskScoringOutput {
  items: RiskItem[];
  summary: {
    totalFiles: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    averageScore: number;
  };
}

export class RiskScoringSkill implements Skill {
  readonly name = "risk_scoring";

  async execute(context: unknown): Promise<RiskScoringOutput> {
    const input = context as RiskScoringInput;
    const { churnData, complexityData, safetyData } = input;

    // Collect all unique file paths
    const filePaths = new Set<string>();
    if (churnData) {
      for (const h of churnData.hotspots) filePaths.add(h.path);
    }
    if (complexityData) {
      for (const f of complexityData.files) filePaths.add(f.filePath);
    }
    if (safetyData) {
      for (const s of safetyData.safetyIndicators) filePaths.add(s.filePath);
      for (const f of safetyData.highRiskFiles) filePaths.add(f);
    }

    // Find max change count for normalization
    const maxChangeCount = churnData
      ? Math.max(...churnData.hotspots.map((h) => h.changeCount), 1)
      : 1;

    const items: RiskItem[] = [...filePaths].map((filePath) => {
      const evidence: string[] = [];

      // Churn score (0-100)
      let churnScore = 0;
      if (churnData) {
        const hotspot = churnData.hotspots.find((h) => h.path === filePath);
        if (hotspot) {
          churnScore = (hotspot.changeCount / maxChangeCount) * 100;
          evidence.push(`High churn: ${hotspot.changeCount} changes`);
        }
      }

      // Complexity score (0-100)
      let complexityScore = 0;
      if (complexityData) {
        const file = complexityData.files.find((f) => f.filePath === filePath);
        if (file) {
          const complexityPart = Math.min(file.avgCyclomaticComplexity / 10, 1) * 100;
          const nestingPart = Math.min(file.maxNestingDepth / 10, 1) * 100;
          complexityScore = complexityPart * 0.7 + nestingPart * 0.3;
          evidence.push(`Cyclomatic complexity: ${file.avgCyclomaticComplexity}`);
          if (file.maxNestingDepth > 3) {
            evidence.push(`Deep nesting: ${file.maxNestingDepth} levels`);
          }
        }
      }

      // Safety score (0-100)
      let safetyScore = 0;
      if (safetyData) {
        const indicators = safetyData.safetyIndicators.filter(
          (s) => s.filePath === filePath,
        );
        if (indicators.length > 0) {
          const totalSeverity = indicators.reduce(
            (sum, s) => sum + s.severityMultiplier,
            0,
          );
          safetyScore = Math.min(totalSeverity * indicators.length * 10, 100);
          for (const ind of indicators) {
            evidence.push(`Contains ${ind.type}`);
          }
        }
      }

      // Weighted average: churn 30%, complexity 40%, safety 30%
      const overallScore = Math.round(
        churnScore * 0.3 + complexityScore * 0.4 + safetyScore * 0.3,
      );

      const severity: RiskItem["severity"] =
        overallScore >= 80
          ? "critical"
          : overallScore >= 60
            ? "high"
            : overallScore >= 40
              ? "medium"
              : "low";

      return {
        filePath,
        overallScore,
        churnScore: Math.round(churnScore),
        complexityScore: Math.round(complexityScore),
        safetyScore: Math.round(safetyScore),
        evidence,
        severity,
      };
    });

    // Sort by overallScore descending
    items.sort((a, b) => b.overallScore - a.overallScore);

    const criticalCount = items.filter((i) => i.severity === "critical").length;
    const highCount = items.filter((i) => i.severity === "high").length;
    const mediumCount = items.filter((i) => i.severity === "medium").length;
    const lowCount = items.filter((i) => i.severity === "low").length;
    const averageScore =
      items.length > 0
        ? Math.round(items.reduce((sum, i) => sum + i.overallScore, 0) / items.length)
        : 0;

    return {
      items,
      summary: {
        totalFiles: items.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        averageScore,
      },
    };
  }
}
