import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DataLakeServiceClient } from '@azure/storage-file-datalake';
import { DefaultAzureCredential } from '@azure/identity';
import { getFabricConfig } from './fabric-config.js';
import { sanitize } from './sanitize.js';

export class ArtifactStore {
  private mode: 'local' | 'fabric';

  constructor() {
    this.mode = (process.env.JURASSIC_STORAGE_PROVIDER ?? 'local') as 'local' | 'fabric';
  }

  private getDataLakeClient(): DataLakeServiceClient {
    const config = getFabricConfig();
    if (!config.workspaceId || !config.lakehouseId) {
      throw new Error(
        'Fabric environment variables FABRIC_WORKSPACE_ID and FABRIC_LAKEHOUSE_ID must be set when using fabric storage provider',
      );
    }
    return new DataLakeServiceClient(config.endpoint, new DefaultAzureCredential());
  }

  private fabricFilePath(runId: string, agentName: string, artifactName: string): string {
    return `artifacts/${runId}/${agentName}/${artifactName}.json`;
  }

  private getFabricFileClient(filePath: string) {
    const config = getFabricConfig();
    const client = this.getDataLakeClient();
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
    return fileSystemClient.getFileClient(`Files/${filePath}`);
  }

  async upload(runId: string, agentName: string, artifactName: string, data: unknown): Promise<string> {
    const sanitized = sanitize(data);
    const content = JSON.stringify(sanitized, null, 2);

    if (this.mode === 'fabric') {
      const filePath = this.fabricFilePath(runId, agentName, artifactName);
      const fileClient = this.getFabricFileClient(filePath);
      await fileClient.create();
      await fileClient.append(content, 0, content.length);
      await fileClient.flush(content.length);
      return `Files/${filePath}`;
    }

    const dir = path.join('artifacts', runId, agentName);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${artifactName}.json`);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  async download(runId: string, agentName: string, artifactName: string): Promise<unknown> {
    if (this.mode === 'fabric') {
      const filePath = this.fabricFilePath(runId, agentName, artifactName);
      const fileClient = this.getFabricFileClient(filePath);
      const response = await fileClient.read();
      const body = await streamToString(response.readableStreamBody!);
      return JSON.parse(body);
    }

    const filePath = path.join('artifacts', runId, agentName, `${artifactName}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  async list(runId: string, agentName: string): Promise<string[]> {
    if (this.mode === 'fabric') {
      const config = getFabricConfig();
      const client = this.getDataLakeClient();
      const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
      const dirPath = `Files/artifacts/${runId}/${agentName}`;
      const names: string[] = [];
      try {
        for await (const item of fileSystemClient.listPaths({ path: dirPath })) {
          const name = item.name ?? '';
          if (name.endsWith('.json')) {
            names.push(name.split('/').pop()!.replace(/\.json$/, ''));
          }
        }
      } catch {
        return [];
      }
      return names;
    }

    const dir = path.join('artifacts', runId, agentName);
    try {
      const entries = await fs.readdir(dir);
      return entries
        .filter((e) => e.endsWith('.json'))
        .map((e) => e.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  async markApproved(runId: string): Promise<void> {
    if (this.mode === 'fabric') {
      const fileClient = this.getFabricFileClient(`artifacts/${runId}/APPROVED`);
      await fileClient.create();
      await fileClient.flush(0);
      return;
    }

    const dir = path.join('artifacts', runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'APPROVED'), '', 'utf-8');
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}
