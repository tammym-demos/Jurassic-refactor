// Skill interface and registry
// TODO: Implement in Phase C (see issue #23)

export interface Skill {
  readonly name: string;
  execute(context: unknown): Promise<unknown>;
}

export { generateDependencyGraphReport, generateRiskHeatmapReport } from "./report_generator.js";
export { DocIngestSkill } from "./doc_ingest.js";
export type { DocIngestInput, DocIngestResult, ExtractedDocument, ExtractedTable } from "./doc_ingest.js";
