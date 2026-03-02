import * as fs from "node:fs";
import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { DefaultAzureCredential } from "@azure/identity";
import type { Skill } from "./index.js";

export interface DocIngestInput {
  filePaths: string[];
  endpoint?: string;
}

export interface ExtractedTable {
  rowCount: number;
  columnCount: number;
  cells: { row: number; column: number; text: string }[];
}

export interface ExtractedDocument {
  filePath: string;
  pages: number;
  text: string;
  tables: ExtractedTable[];
  keyValuePairs: { key: string; value: string }[];
  confidence: number;
}

export interface DocIngestResult {
  documents: ExtractedDocument[];
  totalPages: number;
  confidence: number;
}

export class DocIngestSkill implements Skill {
  readonly name = "doc_ingest";

  async execute(context: unknown): Promise<DocIngestResult> {
    const input = context as DocIngestInput;

    const endpoint =
      input.endpoint ?? process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;

    if (!endpoint) {
      console.warn(
        "DocIngestSkill: No Azure Document Intelligence endpoint configured. " +
          "Set input.endpoint or AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT env var.",
      );
      return { documents: [], totalPages: 0, confidence: 0 };
    }

    const credential = new DefaultAzureCredential();
    const client = new DocumentAnalysisClient(endpoint, credential);

    const documents: ExtractedDocument[] = [];

    for (const filePath of input.filePaths) {
      const fileBuffer = fs.readFileSync(filePath);
      const poller = await client.beginAnalyzeDocument(
        "prebuilt-layout",
        fileBuffer,
      );
      const result = await poller.pollUntilDone();

      const pages = result.pages?.length ?? 0;

      const text =
        result.content ??
        (result.pages ?? [])
          .flatMap((p) => p.lines ?? [])
          .map((l) => l.content)
          .join("\n");

      const tables: ExtractedTable[] = (result.tables ?? []).map((t) => ({
        rowCount: t.rowCount,
        columnCount: t.columnCount,
        cells: (t.cells ?? []).map((c) => ({
          row: c.rowIndex,
          column: c.columnIndex,
          text: c.content,
        })),
      }));

      const keyValuePairs = (result.keyValuePairs ?? [])
        .filter((kv) => kv.key?.content)
        .map((kv) => ({
          key: kv.key.content,
          value: kv.value?.content ?? "",
        }));

      const confidences = (result.pages ?? [])
        .flatMap((p) => p.words ?? [])
        .map((w) => w.confidence ?? 1)
        .filter((c) => c > 0);

      const confidence =
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : 0;

      documents.push({
        filePath,
        pages,
        text,
        tables,
        keyValuePairs,
        confidence,
      });
    }

    const totalPages = documents.reduce((sum, d) => sum + d.pages, 0);
    const overallConfidence =
      documents.length > 0
        ? documents.reduce((sum, d) => sum + d.confidence, 0) /
          documents.length
        : 0;

    return {
      documents,
      totalPages,
      confidence: overallConfidence,
    };
  }
}
