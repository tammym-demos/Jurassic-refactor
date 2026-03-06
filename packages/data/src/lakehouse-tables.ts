/**
 * Lakehouse Tables for Microsoft Fabric
 *
 * Defines structured table schemas for Fabric Lakehouse. Tables are stored as
 * JSON Lines files in the Tables/ directory of OneLake, which Fabric can
 * auto-discover for querying via SQL endpoint or Power BI.
 *
 * Tables:
 * - runs: Top-level run metadata
 * - skill_invocations: Audit log of every skill call with inputs/outputs
 * - artifacts: Artifact metadata index
 * - evaluations: Evaluation results for regression tracking
 */

import { DataLakeServiceClient } from '@azure/storage-file-datalake';
import { DefaultAzureCredential } from '@azure/identity';
import { getFabricConfig } from './fabric-config.js';

/**
 * Run metadata record for the 'runs' table.
 */
export interface RunRecord {
  runId: string;
  startedAt: string; // ISO-8601
  completedAt?: string;
  agentName: 'planning' | 'implementation';
  status: 'running' | 'completed' | 'failed' | 'approved';
  repoUrl: string;
  branch: string;
  commitSha?: string;
  artifactCount: number;
  errorMessage?: string;
}

/**
 * Skill invocation audit record for the 'skill_invocations' table.
 */
export interface SkillInvocationRecord {
  runId: string;
  invocationId: string;
  skillName: string;
  startedAt: string; // ISO-8601
  completedAt: string;
  durationMs: number;
  status: 'success' | 'failed' | 'skipped';
  inputSummary: string; // Truncated/redacted input for audit
  outputSummary: string; // Truncated/redacted output for audit
  confidence?: number;
  errorMessage?: string;
}

/**
 * Artifact metadata record for the 'artifacts' table.
 */
export interface ArtifactRecord {
  runId: string;
  agentName: string;
  artifactName: string;
  schemaName: string;
  createdAt: string; // ISO-8601
  sizeBytes: number;
  path: string;
  validated: boolean;
  validationErrors?: string;
}

/**
 * Evaluation result record for the 'evaluations' table.
 */
export interface EvaluationRecord {
  runId: string;
  evaluatedAt: string; // ISO-8601
  status: 'pass' | 'fail' | 'warning';
  artifactCompleteness: number;
  schemaValidationRate: number;
  determinismScore: number;
  promptVersion?: string;
  modelName?: string;
  regressionDetected: boolean;
  details?: string;
}

type TableRecord = RunRecord | SkillInvocationRecord | ArtifactRecord | EvaluationRecord;

/**
 * Lakehouse table writer for Microsoft Fabric.
 *
 * Writes records as JSON Lines (.jsonl) to the Tables/ directory in OneLake.
 * Fabric auto-discovers these as tables for SQL querying.
 */
export class LakehouseTables {
  private credential = new DefaultAzureCredential();
  private client: DataLakeServiceClient | null = null;

  private getClient(): DataLakeServiceClient {
    if (!this.client) {
      const config = getFabricConfig();
      if (!config.workspaceId || !config.lakehouseId) {
        throw new Error('Fabric workspace and lakehouse IDs must be configured for table operations');
      }
      this.client = new DataLakeServiceClient(config.endpoint, this.credential);
    }
    return this.client;
  }

  private getTablePath(tableName: string): string {
    return `Tables/${tableName}/${tableName}.jsonl`;
  }

  private async appendToTable(tableName: string, record: TableRecord): Promise<void> {
    const config = getFabricConfig();
    const client = this.getClient();
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
    const filePath = this.getTablePath(tableName);
    const fileClient = fileSystemClient.getFileClient(filePath);

    const line = JSON.stringify(record) + '\n';
    const buffer = Buffer.from(line, 'utf-8');

    try {
      // Try to get existing file properties to append
      const properties = await fileClient.getProperties();
      const currentSize = properties.contentLength ?? 0;
      await fileClient.append(buffer, currentSize, buffer.length);
      await fileClient.flush(currentSize + buffer.length);
    } catch (error) {
      // File doesn't exist, create it
      if ((error as { statusCode?: number }).statusCode === 404) {
        await fileClient.create();
        await fileClient.append(buffer, 0, buffer.length);
        await fileClient.flush(buffer.length);
      } else {
        throw error;
      }
    }
  }

  /**
   * Write a run record to the 'runs' table.
   */
  async writeRun(record: RunRecord): Promise<void> {
    await this.appendToTable('runs', record);
  }

  /**
   * Write a skill invocation record to the 'skill_invocations' table.
   */
  async writeSkillInvocation(record: SkillInvocationRecord): Promise<void> {
    await this.appendToTable('skill_invocations', record);
  }

  /**
   * Write an artifact metadata record to the 'artifacts' table.
   */
  async writeArtifact(record: ArtifactRecord): Promise<void> {
    await this.appendToTable('artifacts', record);
  }

  /**
   * Write an evaluation record to the 'evaluations' table.
   */
  async writeEvaluation(record: EvaluationRecord): Promise<void> {
    await this.appendToTable('evaluations', record);
  }

  /**
   * Batch write multiple records to a table (more efficient for bulk inserts).
   */
  async batchWrite<T extends TableRecord>(tableName: string, records: T[]): Promise<void> {
    if (records.length === 0) return;

    const config = getFabricConfig();
    const client = this.getClient();
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
    const filePath = this.getTablePath(tableName);
    const fileClient = fileSystemClient.getFileClient(filePath);

    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const buffer = Buffer.from(lines, 'utf-8');

    try {
      const properties = await fileClient.getProperties();
      const currentSize = properties.contentLength ?? 0;
      await fileClient.append(buffer, currentSize, buffer.length);
      await fileClient.flush(currentSize + buffer.length);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        await fileClient.create();
        await fileClient.append(buffer, 0, buffer.length);
        await fileClient.flush(buffer.length);
      } else {
        throw error;
      }
    }
  }

  /**
   * Read all records from a table (for small tables / testing).
   */
  async readTable<T extends TableRecord>(tableName: string): Promise<T[]> {
    const config = getFabricConfig();
    const client = this.getClient();
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
    const filePath = this.getTablePath(tableName);
    const fileClient = fileSystemClient.getFileClient(filePath);

    try {
      const response = await fileClient.read();
      const content = await streamToString(response.readableStreamBody!);
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as T);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Initialize all tables (create empty files if they don't exist).
   */
  async initializeTables(): Promise<void> {
    const tableNames = ['runs', 'skill_invocations', 'artifacts', 'evaluations'];
    const config = getFabricConfig();
    const client = this.getClient();
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);

    for (const tableName of tableNames) {
      const dirPath = `Tables/${tableName}`;
      const filePath = `${dirPath}/${tableName}.jsonl`;
      const fileClient = fileSystemClient.getFileClient(filePath);

      try {
        await fileClient.getProperties();
        // File exists, skip
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) {
          // Create directory and empty file
          const dirClient = fileSystemClient.getDirectoryClient(dirPath);
          await dirClient.create().catch(() => {}); // Ignore if exists
          await fileClient.create();
          await fileClient.flush(0);
        } else {
          throw error;
        }
      }
    }
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// Export a singleton instance for convenience
export const lakehouseTables = new LakehouseTables();
