import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class ArtifactStore {
  private mode: 'local' | 'fabric';

  constructor() {
    this.mode = (process.env.JURASSIC_STORAGE_PROVIDER ?? 'local') as 'local' | 'fabric';
  }

  async upload(runId: string, agentName: string, artifactName: string, data: unknown): Promise<string> {
    if (this.mode === 'fabric') {
      throw new Error('Fabric integration not yet configured');
    }
    const dir = path.join('artifacts', runId, agentName);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${artifactName}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  }

  async download(runId: string, agentName: string, artifactName: string): Promise<unknown> {
    if (this.mode === 'fabric') {
      throw new Error('Fabric integration not yet configured');
    }
    const filePath = path.join('artifacts', runId, agentName, `${artifactName}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  async list(runId: string, agentName: string): Promise<string[]> {
    if (this.mode === 'fabric') {
      throw new Error('Fabric integration not yet configured');
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
      throw new Error('Fabric integration not yet configured');
    }
    const dir = path.join('artifacts', runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'APPROVED'), '', 'utf-8');
  }
}
