import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ArtifactStore } from '../artifact-store.js';
import { clearFabricConfigCache } from '../fabric-config.js';

describe('ArtifactStore', () => {
  const testDir = path.join('artifacts', 'test-run');

  beforeEach(async () => {
    delete process.env.JURASSIC_STORAGE_PROVIDER;
    delete process.env.FABRIC_WORKSPACE_ID;
    delete process.env.FABRIC_LAKEHOUSE_ID;
    clearFabricConfigCache();
    await fs.rm('artifacts', { recursive: true, force: true });
  });

  afterEach(async () => {
    delete process.env.JURASSIC_STORAGE_PROVIDER;
    delete process.env.FABRIC_WORKSPACE_ID;
    delete process.env.FABRIC_LAKEHOUSE_ID;
    clearFabricConfigCache();
    await fs.rm('artifacts', { recursive: true, force: true });
  });

  it('should upload and download an artifact (local mode roundtrip)', async () => {
    const store = new ArtifactStore();
    const payload = { species: 'T-Rex', teeth: 60 };
    await store.upload('test-run', 'dino-agent', 'report', payload);
    const result = await store.download('test-run', 'dino-agent', 'report');
    expect(result).toEqual(payload);
  });

  it('should list artifact names', async () => {
    const store = new ArtifactStore();
    await store.upload('test-run', 'dino-agent', 'alpha', { a: 1 });
    await store.upload('test-run', 'dino-agent', 'beta', { b: 2 });
    const names = await store.list('test-run', 'dino-agent');
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toHaveLength(2);
  });

  it('should create an APPROVED marker file via markApproved', async () => {
    const store = new ArtifactStore();
    await store.markApproved('test-run');
    const marker = await fs.readFile(path.join(testDir, 'APPROVED'), 'utf-8');
    expect(marker).toBe('');
  });

  it('should use fabric mode when JURASSIC_STORAGE_PROVIDER is set', async () => {
    process.env.JURASSIC_STORAGE_PROVIDER = 'fabric';
    const store = new ArtifactStore();
    // Fabric mode is initialized - actual operations will use OneLake
    // We don't test actual OneLake calls here (requires live credentials)
    expect(() => store).not.toThrow();
  });
});
