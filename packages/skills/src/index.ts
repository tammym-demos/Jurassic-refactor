// Skill interface and registry

export interface Skill {
  readonly name: string;
  execute(context: unknown): Promise<unknown>;
}

// Report generators
export { generateDependencyGraphReport, generateRiskHeatmapReport } from "./report_generator.js";

// Planning skills
export { RepoSnapshotSkill } from "./repo_snapshot.js";
export type { RepoSnapshotInput, RepoSnapshotOutput, FileEntry } from "./repo_snapshot.js";

export { fwIncludeGraphSkill } from "./fw_include_graph.js";
export type { FwIncludeGraphInput, FwIncludeGraphOutput } from "./fw_include_graph.js";

export { PyImportGraphSkill } from "./py_import_graph.js";
export type { PyImportGraphInput, PyImportGraphOutput, PyImportGraphEdge } from "./py_import_graph.js";

export { guiImportGraphSkill } from "./gui_import_graph.js";
export type { GuiImportGraphInput, GuiImportGraphOutput } from "./gui_import_graph.js";

export { GitChurnSkill } from "./git_churn.js";
export type { GitChurnInput, GitChurnOutput, HotspotFile } from "./git_churn.js";

export { ComplexityMetricsSkill } from "./complexity_metrics.js";
export type { ComplexityMetricsInput, ComplexityMetricsOutput, FileMetrics, FunctionMetrics } from "./complexity_metrics.js";

export { RiskScoringSkill } from "./risk_scoring.js";
export type { RiskScoringInput, RiskScoringOutput, RiskItem } from "./risk_scoring.js";

export { SafetyPathAnalysisSkill } from "./safety_path_analysis.js";
export type { SafetyPathInput, SafetyPathOutput, SafetyIndicator, SafetyZone } from "./safety_path_analysis.js";

export { StackFingerprintSkill } from "./stack_fingerprint.js";
export type { StackFingerprintInput, StackFingerprintOutput, DetectedItem } from "./stack_fingerprint.js";

export { DocCoverageAnalysisSkill } from "./doc_coverage_analysis.js";
export type { DocCoverageInput, DocCoverageOutput, DocGap, PublicAPI } from "./doc_coverage_analysis.js";

export { MigrationEvaluatorSkill } from "./migration_evaluator.js";
export type { MigrationEvaluatorInput, MigrationEvaluatorOutput, MigrationPath } from "./migration_evaluator.js";

export { PlanSynthesisSkill } from "./plan_synthesis.js";
export type { PlanSynthesisInput, PlanSynthesisOutput, PlanPhase, PlanTask } from "./plan_synthesis.js";

export { UserDialogSkill } from "./user_dialog.js";
export type { UserDialogInput, UserDialogOutput } from "./user_dialog.js";

export { PolicySkill } from "./policy.js";

// Implementation skills
export { CodeRefactorSkill } from "./code_refactor.js";
export { DependencyUpgraderSkill } from "./dependency_upgrader.js";
export { MigrationExecutorSkill } from "./migration_executor.js";
export { TestScaffoldSkill } from "./test_scaffold.js";
export { testWriter } from "./test_writer.js";
export { prWriterSkill } from "./pr_writer.js";
export { incrementalPrSkill } from "./incremental_pr.js";
export { DocIngestSkill } from "./doc_ingest.js";
export type { DocIngestInput, DocIngestResult, ExtractedDocument, ExtractedTable } from "./doc_ingest.js";
