import { createHash } from "node:crypto";

export interface PromptVersion {
  promptId: string;
  version: string;
  hash: string;
  text: string;
  createdAt: string;
  description: string;
}

export interface PromptComparisonResult {
  v1: PromptVersion;
  v2: PromptVersion;
  hashChanged: boolean;
  textDiff: { added: number; removed: number };
}

export interface PromptAuditEntry {
  promptId: string;
  version: string;
  action: 'registered' | 'evaluated' | 'promoted' | 'deprecated';
  actor: string;
  timestamp: string;
  details?: string;
}

export interface ABTestResult {
  promptId: string;
  versionA: string;
  versionB: string;
  winner: string;
  scoreA: number;
  scoreB: number;
  sampleSize: number;
  details: string;
}

export class PromptRegistry {
  private versions: Map<string, Map<string, PromptVersion>> = new Map();
  private auditTrail: PromptAuditEntry[] = [];
  private abTests: Map<string, ABTestResult[]> = new Map();
  private promotedVersions: Map<string, string> = new Map();

  register(
    promptId: string,
    version: string,
    text: string,
    description: string,
  ): PromptVersion {
    const hash = createHash("sha256").update(text).digest("hex");
    const entry: PromptVersion = {
      promptId,
      version,
      hash,
      text,
      createdAt: new Date().toISOString(),
      description,
    };

    let promptVersions = this.versions.get(promptId);
    if (!promptVersions) {
      promptVersions = new Map();
      this.versions.set(promptId, promptVersions);
    }
    promptVersions.set(version, entry);

    this.recordAudit({
      promptId,
      version,
      action: 'registered',
      actor: 'system',
      details: description,
    });

    return entry;
  }

  getVersion(promptId: string, version: string): PromptVersion | undefined {
    return this.versions.get(promptId)?.get(version);
  }

  listVersions(promptId: string): PromptVersion[] {
    const promptVersions = this.versions.get(promptId);
    if (!promptVersions) return [];
    return Array.from(promptVersions.values());
  }

  compareVersions(
    promptId: string,
    v1: string,
    v2: string,
  ): PromptComparisonResult | undefined {
    const ver1 = this.getVersion(promptId, v1);
    const ver2 = this.getVersion(promptId, v2);
    if (!ver1 || !ver2) return undefined;

    const lines1 = ver1.text.split("\n");
    const lines2 = ver2.text.split("\n");
    const set1 = new Set(lines1);
    const set2 = new Set(lines2);

    const added = lines2.filter((line) => !set1.has(line)).length;
    const removed = lines1.filter((line) => !set2.has(line)).length;

    return {
      v1: ver1,
      v2: ver2,
      hashChanged: ver1.hash !== ver2.hash,
      textDiff: { added, removed },
    };
  }

  recordAudit(entry: Omit<PromptAuditEntry, 'timestamp'>): void {
    this.auditTrail.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  getAuditTrail(promptId?: string): PromptAuditEntry[] {
    if (promptId) {
      return this.auditTrail.filter((e) => e.promptId === promptId);
    }
    return [...this.auditTrail];
  }

  promote(promptId: string, version: string, actor: string): void {
    const ver = this.getVersion(promptId, version);
    if (!ver) {
      throw new Error(`Version ${version} not found for prompt ${promptId}`);
    }
    this.promotedVersions.set(promptId, version);
    this.recordAudit({
      promptId,
      version,
      action: 'promoted',
      actor,
      details: `Version ${version} promoted to production`,
    });
  }

  deprecate(promptId: string, version: string, actor: string): void {
    const ver = this.getVersion(promptId, version);
    if (!ver) {
      throw new Error(`Version ${version} not found for prompt ${promptId}`);
    }
    if (this.promotedVersions.get(promptId) === version) {
      this.promotedVersions.delete(promptId);
    }
    this.recordAudit({
      promptId,
      version,
      action: 'deprecated',
      actor,
      details: `Version ${version} deprecated`,
    });
  }

  recordABTest(result: ABTestResult): void {
    let tests = this.abTests.get(result.promptId);
    if (!tests) {
      tests = [];
      this.abTests.set(result.promptId, tests);
    }
    tests.push(result);
  }

  getABTests(promptId: string): ABTestResult[] {
    return this.abTests.get(promptId) ?? [];
  }

  getActiveVersion(promptId: string): PromptVersion | undefined {
    const promoted = this.promotedVersions.get(promptId);
    if (promoted) {
      return this.getVersion(promptId, promoted);
    }
    const versions = this.listVersions(promptId);
    return versions.length > 0 ? versions[versions.length - 1] : undefined;
  }
}
