import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SkillInvocation {
  skillName: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface RunMetadata {
  runId: string;
  agentType: 'planning' | 'implementation';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  config: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  skillInvocations: SkillInvocation[];
  artifactPaths: string[];
}

export class RunMetadataService {
  private basePath: string;

  constructor(basePath: string = './run-metadata') {
    this.basePath = basePath;
  }

  async createRun(
    runId: string,
    agentType: 'planning' | 'implementation',
    config: Record<string, unknown>,
  ): Promise<RunMetadata> {
    const metadata: RunMetadata = {
      runId,
      agentType,
      status: 'running',
      config,
      startedAt: new Date().toISOString(),
      skillInvocations: [],
      artifactPaths: [],
    };
    await this.writeRun(metadata);
    return metadata;
  }

  async updateRunStatus(runId: string, status: RunMetadata['status']): Promise<void> {
    const metadata = await this.readRun(runId);
    metadata.status = status;
    await this.writeRun(metadata);
  }

  async recordSkillInvocation(runId: string, invocation: SkillInvocation): Promise<void> {
    const metadata = await this.readRun(runId);
    metadata.skillInvocations.push(invocation);
    await this.writeRun(metadata);
  }

  async finalizeRun(runId: string, artifactPaths: string[], success: boolean): Promise<void> {
    const metadata = await this.readRun(runId);
    metadata.status = success ? 'completed' : 'failed';
    metadata.completedAt = new Date().toISOString();
    metadata.artifactPaths = artifactPaths;
    await this.writeRun(metadata);
  }

  async getRun(runId: string): Promise<RunMetadata | null> {
    try {
      return await this.readRun(runId);
    } catch {
      return null;
    }
  }

  async listRuns(): Promise<RunMetadata[]> {
    try {
      const entries = await fs.readdir(this.basePath);
      const jsonFiles = entries.filter((e) => e.endsWith('.json'));
      const runs: RunMetadata[] = [];
      for (const file of jsonFiles) {
        const content = await fs.readFile(path.join(this.basePath, file), 'utf-8');
        runs.push(JSON.parse(content) as RunMetadata);
      }
      return runs;
    } catch {
      return [];
    }
  }

  private runFilePath(runId: string): string {
    return path.join(this.basePath, `${runId}.json`);
  }

  private async readRun(runId: string): Promise<RunMetadata> {
    const content = await fs.readFile(this.runFilePath(runId), 'utf-8');
    return JSON.parse(content) as RunMetadata;
  }

  private async writeRun(metadata: RunMetadata): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(this.runFilePath(metadata.runId), JSON.stringify(metadata, null, 2), 'utf-8');
  }
}
