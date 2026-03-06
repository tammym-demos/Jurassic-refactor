/**
 * Evaluation Formatters for Foundry IQ
 *
 * Utilities to generate tabular views of evaluation results in various formats
 * (Markdown tables, CSV, structured rows) for dashboards and reporting.
 *
 * @see Issue #85 - Configure Foundry IQ evaluation dashboards
 */

import type { EvalRun, EvalOutputItem } from "./foundry-iq.js";

export interface TabularEvalResult {
  /** Column headers for the table */
  headers: string[];
  /** Row data as key-value records */
  rows: Array<Record<string, unknown>>;
  /** Pre-formatted Markdown table */
  markdown: string;
  /** Pre-formatted CSV content */
  csv: string;
}

export interface CriteriaSummary {
  criterion: string;
  passed: number;
  failed: number;
  passRate: number;
}

export interface AggregateEvalSummary {
  runId: string;
  status: string;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  overallPassRate: number;
  criteriaSummaries: CriteriaSummary[];
}

/**
 * Format per-item evaluation output into a tabular view.
 *
 * Creates a table where each row is an evaluated item and columns
 * are the different evaluation criteria (coherence, relevance, etc.).
 *
 * @param outputItems - Detailed output items from Foundry IQ evaluation
 * @returns Tabular result with headers, rows, markdown, and CSV formats
 */
export function formatEvalItemsTable(outputItems: EvalOutputItem[]): TabularEvalResult {
  if (outputItems.length === 0) {
    return {
      headers: ["item_id"],
      rows: [],
      markdown: "| item_id |\n| --- |\n| _No items_ |",
      csv: "item_id\n",
    };
  }

  // Collect all unique metric names across all items
  const metricNames = new Set<string>();
  for (const item of outputItems) {
    for (const result of item.results) {
      metricNames.add(result.name);
    }
  }

  const sortedMetrics = Array.from(metricNames).sort();
  const headers = ["item_id", ...sortedMetrics, "pass_count", "total", "status"];
  const rows: Array<Record<string, unknown>> = [];

  for (const item of outputItems) {
    const row: Record<string, unknown> = { item_id: item.item_id };
    let passCount = 0;

    for (const metric of sortedMetrics) {
      const result = item.results.find((r) => r.name === metric);
      if (result) {
        row[metric] = result.score;
        row[`${metric}_passed`] = result.passed;
        if (result.passed) passCount++;
      } else {
        row[metric] = null;
        row[`${metric}_passed`] = null;
      }
    }

    row.pass_count = passCount;
    row.total = item.results.length;
    row.status = passCount === item.results.length ? "pass" : "fail";
    rows.push(row);
  }

  // Generate Markdown table
  const markdownRows = rows.map((r) => {
    const cells = headers.map((h) => {
      const val = r[h];
      if (val === null || val === undefined) return "-";
      if (typeof val === "number") return val.toFixed(2);
      return String(val);
    });
    return `| ${cells.join(" | ")} |`;
  });

  const markdown = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...markdownRows,
  ].join("\n");

  // Generate CSV
  const csvRows = rows.map((r) => {
    return headers
      .map((h) => {
        const val = r[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "number") return val.toFixed(4);
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma
        if (str.includes(",") || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");

  return { headers, rows, markdown, csv };
}

/**
 * Format evaluation criteria summary into a table.
 *
 * Shows aggregate pass/fail counts per testing criterion from an EvalRun.
 *
 * @param evalRun - Completed evaluation run with per_testing_criteria_results
 * @returns Markdown table string
 */
export function formatCriteriaSummaryTable(evalRun: EvalRun): string {
  if (!evalRun.per_testing_criteria_results || evalRun.per_testing_criteria_results.length === 0) {
    return "| Criterion | Passed | Failed | Pass Rate |\n| --- | --- | --- | --- |\n| _No criteria results_ | - | - | - |";
  }

  const headers = ["Criterion", "Passed", "Failed", "Pass Rate"];
  const rows = evalRun.per_testing_criteria_results.map((c) => [
    c.name,
    c.passed.toString(),
    c.failed.toString(),
    `${(c.pass_rate * 100).toFixed(1)}%`,
  ]);

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => ":---:").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/**
 * Extract aggregate summary from an evaluation run.
 *
 * Provides structured data for dashboard widgets and charts.
 *
 * @param evalRun - Completed evaluation run
 * @returns Aggregate summary with pass rates and criteria breakdowns
 */
export function extractAggregateSummary(evalRun: EvalRun): AggregateEvalSummary {
  const passed = evalRun.result_counts?.passed ?? 0;
  const failed = evalRun.result_counts?.failed ?? 0;
  const total = evalRun.result_counts?.total ?? 0;

  const criteriaSummaries: CriteriaSummary[] = (evalRun.per_testing_criteria_results ?? []).map(
    (c) => ({
      criterion: c.name,
      passed: c.passed,
      failed: c.failed,
      passRate: c.pass_rate,
    }),
  );

  return {
    runId: evalRun.id,
    status: evalRun.status,
    totalItems: total,
    passedItems: passed,
    failedItems: failed,
    overallPassRate: total > 0 ? passed / total : 0,
    criteriaSummaries,
  };
}

/**
 * Format multiple evaluation runs for comparison.
 *
 * Creates a side-by-side comparison table for model or prompt comparisons.
 *
 * @param runs - Array of evaluation runs to compare
 * @param labels - Optional labels for each run (e.g., model names)
 * @returns Markdown comparison table
 */
export function formatRunComparisonTable(
  runs: EvalRun[],
  labels?: string[],
): string {
  if (runs.length === 0) {
    return "| Run | Status | Pass Rate |\n| --- | --- | --- |\n| _No runs_ | - | - |";
  }

  const runLabels = labels ?? runs.map((r) => r.name);

  // Collect all criteria across all runs
  const allCriteria = new Set<string>();
  for (const run of runs) {
    for (const c of run.per_testing_criteria_results ?? []) {
      allCriteria.add(c.name);
    }
  }

  const sortedCriteria = Array.from(allCriteria).sort();
  const headers = ["Run", "Status", "Overall", ...sortedCriteria];

  const rows = runs.map((run, idx) => {
    const counts = run.result_counts;
    const overall =
      counts && counts.total > 0
        ? `${((counts.passed / counts.total) * 100).toFixed(1)}%`
        : "-";

    const criteriaValues = sortedCriteria.map((criterion) => {
      const result = run.per_testing_criteria_results?.find((c) => c.name === criterion);
      return result ? `${(result.pass_rate * 100).toFixed(1)}%` : "-";
    });

    return [runLabels[idx], run.status, overall, ...criteriaValues];
  });

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => ":---:").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/**
 * Generate a detailed per-item breakdown with pass/fail indicators.
 *
 * Useful for debugging which specific items failed which criteria.
 *
 * @param outputItems - Detailed output items from evaluation
 * @returns Markdown table with visual pass/fail indicators
 */
export function formatDetailedItemTable(outputItems: EvalOutputItem[]): string {
  if (outputItems.length === 0) {
    return "| Item | Criterion | Score | Result |\n| --- | --- | --- | --- |\n| _No items_ | - | - | - |";
  }

  const headers = ["Item", "Criterion", "Score", "Threshold", "Result", "Reason"];
  const rows: string[][] = [];

  for (const item of outputItems) {
    for (const result of item.results) {
      rows.push([
        item.item_id,
        result.name,
        result.score.toFixed(3),
        result.threshold.toFixed(3),
        result.passed ? "✓ pass" : "✗ fail",
        result.reason ?? "-",
      ]);
    }
  }

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/**
 * Convert evaluation results to JSON Lines format for Lakehouse tables.
 *
 * Each line is a flattened record suitable for SQL querying in Fabric.
 *
 * @param evalRun - Evaluation run metadata
 * @param outputItems - Detailed output items
 * @returns JSONL string for table ingestion
 */
export function toJsonLines(evalRun: EvalRun, outputItems: EvalOutputItem[]): string {
  const lines: string[] = [];

  for (const item of outputItems) {
    for (const result of item.results) {
      const record = {
        eval_id: evalRun.eval_id,
        run_id: evalRun.id,
        run_name: evalRun.name,
        run_status: evalRun.status,
        item_id: item.item_id,
        criterion: result.name,
        metric: result.metric,
        score: result.score,
        threshold: result.threshold,
        passed: result.passed,
        label: result.label,
        reason: result.reason ?? null,
        evaluated_at: new Date().toISOString(),
      };
      lines.push(JSON.stringify(record));
    }
  }

  return lines.join("\n");
}
