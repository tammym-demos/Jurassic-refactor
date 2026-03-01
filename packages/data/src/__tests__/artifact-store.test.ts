import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ArtifactStore } from '../artifact-store.js';

describe('ArtifactStore', () => {
  const testDir = path.join('artifacts', 'test-run');

  beforeEach(async () => {
    delete process.env.JURASSIC_STORAGE_PROVIDER;
    await fs.rm('artifacts', { recursive: true, force: true });
  });

  afterEach(async () => {
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

  it('should throw in fabric mode', async () => {
    process.env.JURASSIC_STORAGE_PROVIDER = 'fabric';
    const store = new ArtifactStore();
    await expect(store.upload('r', 'a', 'n', {})).rejects.toThrow('Fabric integration not yet configured');
    await expect(store.download('r', 'a', 'n')).rejects.toThrow('Fabric integration not yet configured');
    await expect(store.list('r', 'a')).rejects.toThrow('Fabric integration not yet configured');
    await expect(store.markApproved('r')).rejects.toThrow('Fabric integration not yet configured');
  });
});
