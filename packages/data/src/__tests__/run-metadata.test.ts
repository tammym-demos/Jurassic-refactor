import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { RunMetadataService } from '../run-metadata.js';
import type { SkillInvocation } from '../run-metadata.js';

describe('RunMetadataService', () => {
  const testDir = './test-run-metadata';
  let service: RunMetadataService;

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    service = new RunMetadataService(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create a run metadata file', async () => {
    const run = await service.createRun('run-1', 'planning', { model: 'gpt-4' });
    expect(run.runId).toBe('run-1');
    expect(run.agentType).toBe('planning');
    expect(run.status).toBe('running');
    expect(run.config).toEqual({ model: 'gpt-4' });
    expect(run.skillInvocations).toEqual([]);
    expect(run.artifactPaths).toEqual([]);

    const stored = await service.getRun('run-1');
    expect(stored).toEqual(run);
  });

  it('should update run status', async () => {
    await service.createRun('run-2', 'implementation', {});
    await service.updateRunStatus('run-2', 'cancelled');

    const run = await service.getRun('run-2');
    expect(run?.status).toBe('cancelled');
  });

  it('should record skill invocations', async () => {
    await service.createRun('run-3', 'planning', {});
    const invocation: SkillInvocation = {
      skillName: 'code-review',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:05Z',
      durationMs: 5000,
      success: true,
      input: { file: 'main.ts' },
      output: { issues: 0 },
    };
    await service.recordSkillInvocation('run-3', invocation);

    const run = await service.getRun('run-3');
    expect(run?.skillInvocations).toHaveLength(1);
    expect(run?.skillInvocations[0]).toEqual(invocation);
  });

  it('should finalize a run with completedAt and artifactPaths', async () => {
    await service.createRun('run-4', 'implementation', {});
    await service.finalizeRun('run-4', ['/artifacts/plan.json'], true);

    const run = await service.getRun('run-4');
    expect(run?.status).toBe('completed');
    expect(run?.completedAt).toBeDefined();
    expect(run?.artifactPaths).toEqual(['/artifacts/plan.json']);
  });

  it('should finalize a failed run', async () => {
    await service.createRun('run-5', 'planning', {});
    await service.finalizeRun('run-5', [], false);

    const run = await service.getRun('run-5');
    expect(run?.status).toBe('failed');
    expect(run?.completedAt).toBeDefined();
  });

  it('should return null for a non-existent run', async () => {
    const run = await service.getRun('does-not-exist');
    expect(run).toBeNull();
  });

  it('should list all runs', async () => {
    await service.createRun('run-a', 'planning', {});
    await service.createRun('run-b', 'implementation', {});

    const runs = await service.listRuns();
    expect(runs).toHaveLength(2);
    const ids = runs.map((r) => r.runId).sort();
    expect(ids).toEqual(['run-a', 'run-b']);
  });

  it('should return empty array when listing runs with no directory', async () => {
    const emptyService = new RunMetadataService('./nonexistent-dir');
    const runs = await emptyService.listRuns();
    expect(runs).toEqual([]);
  });
});
