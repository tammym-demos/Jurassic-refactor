import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LakehouseTables,
  RunRecord,
  SkillInvocationRecord,
  ArtifactRecord,
  EvaluationRecord,
} from '../lakehouse-tables.js';

// Mock the Azure SDK
vi.mock('@azure/storage-file-datalake', () => ({
  DataLakeServiceClient: vi.fn().mockImplementation(() => ({
    getFileSystemClient: vi.fn().mockReturnValue({
      getFileClient: vi.fn().mockReturnValue({
        create: vi.fn().mockResolvedValue(undefined),
        append: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        getProperties: vi.fn().mockRejectedValue({ statusCode: 404 }),
        read: vi.fn().mockResolvedValue({
          readableStreamBody: {
            [Symbol.asyncIterator]: async function* () {
              yield Buffer.from('');
            },
          },
        }),
      }),
      getDirectoryClient: vi.fn().mockReturnValue({
        create: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

describe('LakehouseTables', () => {
  let tables: LakehouseTables;

  beforeEach(() => {
    vi.clearAllMocks();
    tables = new LakehouseTables();
  });

  describe('writeRun', () => {
    it('should write a run record to the runs table', async () => {
      const record: RunRecord = {
        runId: 'test-run-123',
        startedAt: '2026-03-06T10:00:00Z',
        agentName: 'planning',
        status: 'running',
        repoUrl: 'https://github.com/test/repo',
        branch: 'main',
        artifactCount: 0,
      };

      await expect(tables.writeRun(record)).resolves.not.toThrow();
    });
  });

  describe('writeSkillInvocation', () => {
    it('should write a skill invocation record', async () => {
      const record: SkillInvocationRecord = {
        runId: 'test-run-123',
        invocationId: 'inv-001',
        skillName: 'complexity_metrics',
        startedAt: '2026-03-06T10:00:00Z',
        completedAt: '2026-03-06T10:00:05Z',
        durationMs: 5000,
        status: 'success',
        inputSummary: '{"file": "src/main.ts"}',
        outputSummary: '{"complexity": 15}',
        confidence: 0.95,
      };

      await expect(tables.writeSkillInvocation(record)).resolves.not.toThrow();
    });
  });

  describe('writeArtifact', () => {
    it('should write an artifact metadata record', async () => {
      const record: ArtifactRecord = {
        runId: 'test-run-123',
        agentName: 'planning',
        artifactName: 'DependencyGraph',
        schemaName: 'DependencyGraph.schema.json',
        createdAt: '2026-03-06T10:05:00Z',
        sizeBytes: 12345,
        path: 'artifacts/test-run-123/planning/DependencyGraph.json',
        validated: true,
      };

      await expect(tables.writeArtifact(record)).resolves.not.toThrow();
    });
  });

  describe('writeEvaluation', () => {
    it('should write an evaluation record', async () => {
      const record: EvaluationRecord = {
        runId: 'test-run-123',
        evaluatedAt: '2026-03-06T10:10:00Z',
        status: 'pass',
        artifactCompleteness: 1.0,
        schemaValidationRate: 1.0,
        determinismScore: 0.98,
        modelName: 'gpt-4o',
        regressionDetected: false,
      };

      await expect(tables.writeEvaluation(record)).resolves.not.toThrow();
    });
  });

  describe('batchWrite', () => {
    it('should write multiple records in a batch', async () => {
      const records: SkillInvocationRecord[] = [
        {
          runId: 'test-run-123',
          invocationId: 'inv-001',
          skillName: 'skill1',
          startedAt: '2026-03-06T10:00:00Z',
          completedAt: '2026-03-06T10:00:01Z',
          durationMs: 1000,
          status: 'success',
          inputSummary: '{}',
          outputSummary: '{}',
        },
        {
          runId: 'test-run-123',
          invocationId: 'inv-002',
          skillName: 'skill2',
          startedAt: '2026-03-06T10:00:01Z',
          completedAt: '2026-03-06T10:00:02Z',
          durationMs: 1000,
          status: 'success',
          inputSummary: '{}',
          outputSummary: '{}',
        },
      ];

      await expect(tables.batchWrite('skill_invocations', records)).resolves.not.toThrow();
    });

    it('should handle empty array gracefully', async () => {
      await expect(tables.batchWrite('skill_invocations', [])).resolves.not.toThrow();
    });
  });

  describe('readTable', () => {
    it('should return empty array for non-existent table', async () => {
      const records = await tables.readTable('runs');
      expect(records).toEqual([]);
    });
  });

  describe('initializeTables', () => {
    it('should create table directories and files', async () => {
      await expect(tables.initializeTables()).resolves.not.toThrow();
    });
  });
});
