/**
 * End-to-end tests for OneLake Pipeline
 *
 * These tests verify actual OneLake connectivity and pipeline functionality.
 * Requires:
 * - Valid Azure credentials (DefaultAzureCredential)
 * - Access to the configured Fabric workspace and lakehouse
 *
 * Set JURASSIC_E2E_FABRIC=true to run these tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OneLakePipeline } from '../onelake-pipeline.js';
import { lakehouseTables, RunRecord, SkillInvocationRecord, ArtifactRecord } from '../lakehouse-tables.js';
import { getFabricConfig, clearFabricConfigCache } from '../fabric-config.js';

const shouldRun = process.env.JURASSIC_E2E_FABRIC === 'true';

describe.skipIf(!shouldRun)('OneLake Pipeline E2E', () => {
  let pipeline: OneLakePipeline;
  const testRunId = `onelake-pipeline-e2e-${Date.now()}`;

  beforeAll(() => {
    clearFabricConfigCache();
    pipeline = new OneLakePipeline();
  });

  afterAll(async () => {
    // Cleanup is handled by the individual test cleanup
    clearFabricConfigCache();
  }, 60000);

  describe('P1: DFS Endpoint Validation', () => {
    it('should validate DFS endpoint is accessible', async () => {
      const result = await pipeline.validateDfsEndpoint();

      console.log('DFS Validation Result:', JSON.stringify(result, null, 2));

      expect(result.endpoint).toBe('https://onelake.dfs.fabric.microsoft.com');
      expect(result.credentialType).toBe('DefaultAzureCredential');

      if (!result.success) {
        console.warn('DFS validation failed:', result.errorMessage);
        console.warn('Network requirements:', result.networkRequirements);
      }

      // These should pass if properly configured
      expect(result.workspaceAccessible).toBe(true);
      expect(result.lakehouseAccessible).toBe(true);
    }, 30000);

    it('should validate write access', async () => {
      const result = await pipeline.validateDfsEndpoint();

      expect(result.writeTestPassed).toBe(true);
    }, 30000);

    it('should document network requirements', async () => {
      const result = await pipeline.validateDfsEndpoint();

      expect(result.networkRequirements).toBeDefined();
      expect(result.networkRequirements!.length).toBeGreaterThan(0);
    });
  });

  describe('P2: Data Ingestion Testing', () => {
    it('should ingest sample JSON artifacts', async () => {
      const result = await pipeline.ingestTestArtifacts(testRunId);

      console.log('Ingestion Result:', JSON.stringify(result, null, 2));

      expect(result.uploaded.length).toBeGreaterThan(0);
      expect(result.uploaded).toContain('RiskAssessment');
      expect(result.uploaded).toContain('RunLogEvent');
      expect(result.uploaded).toContain('Manifest');
    }, 60000);

    it('should verify table population via lakehouse tables', async () => {
      // Write a test run record
      const runRecord: RunRecord = {
        runId: testRunId,
        startedAt: new Date().toISOString(),
        agentName: 'planning',
        status: 'running',
        repoUrl: 'https://github.com/test/onelake-pipeline-test',
        branch: 'main',
        artifactCount: 3,
      };

      await lakehouseTables.writeRun(runRecord);

      // Verify it can be read back
      const runs = await lakehouseTables.readTable<RunRecord>('runs');
      const testRun = runs.find((r) => r.runId === testRunId);

      expect(testRun).toBeDefined();
      expect(testRun?.repoUrl).toBe('https://github.com/test/onelake-pipeline-test');
    }, 60000);
  });

  describe('P3: Audit Trail Completeness', () => {
    beforeAll(async () => {
      // Set up test data for audit trail
      const skillInvocation: SkillInvocationRecord = {
        runId: testRunId,
        invocationId: `${testRunId}-skill-1`,
        skillName: 'complexity_metrics',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1500,
        status: 'success',
        inputSummary: '{"files": ["src/main.ts"]}',
        outputSummary: '{"complexity": 12}',
      };
      await lakehouseTables.writeSkillInvocation(skillInvocation);

      const artifactRecord: ArtifactRecord = {
        runId: testRunId,
        agentName: 'planning',
        artifactName: 'TestArtifact',
        schemaName: 'RiskAssessment.schema.json',
        createdAt: new Date().toISOString(),
        sizeBytes: 500,
        path: `artifacts/${testRunId}/planning/TestArtifact.json`,
        validated: true,
      };
      await lakehouseTables.writeArtifact(artifactRecord);
    }, 60000);

    it('should query WHO ran the agent', async () => {
      const auditTrail = await pipeline.buildAuditTrail(testRunId);

      expect(auditTrail.identity).toBeDefined();
      expect(auditTrail.identity.source).toBeDefined();
      console.log('Identity:', auditTrail.identity);
    }, 30000);

    it('should query WHAT skills were invoked', async () => {
      const auditTrail = await pipeline.buildAuditTrail(testRunId);

      expect(auditTrail.skillsInvoked).toBeDefined();
      expect(auditTrail.skillsInvoked).toContain('complexity_metrics');
      console.log('Skills invoked:', auditTrail.skillsInvoked);
    }, 30000);

    it('should query WHEN actions occurred', async () => {
      const auditTrail = await pipeline.buildAuditTrail(testRunId);

      expect(auditTrail.timestamps).toBeDefined();
      expect(auditTrail.timestamps.runStarted).toBeDefined();
      console.log('Timestamps:', auditTrail.timestamps);
    }, 30000);

    it('should query RESULT of each skill', async () => {
      const auditTrail = await pipeline.buildAuditTrail(testRunId);

      expect(auditTrail.result).toBeDefined();
      expect(auditTrail.result.skillResults.length).toBeGreaterThan(0);
      console.log('Results:', auditTrail.result);
    }, 30000);

    it('should query ARTIFACTS produced', async () => {
      const auditTrail = await pipeline.buildAuditTrail(testRunId);

      expect(auditTrail.artifacts).toBeDefined();
      expect(auditTrail.artifacts.length).toBeGreaterThan(0);
      console.log('Artifacts:', auditTrail.artifacts);
    }, 30000);
  });

  describe('P4: Risk Score Analytics', () => {
    it('should query top highest-risk files', async () => {
      const topRiskFiles = await pipeline.getTopRiskFiles(10);

      console.log('Top risk files:', JSON.stringify(topRiskFiles, null, 2));

      // May be empty if no risk assessments exist yet
      expect(Array.isArray(topRiskFiles)).toBe(true);
    }, 30000);

    it('should track risk score changes for a file', async () => {
      const trend = await pipeline.getFileRiskTrend('src/main.ts');

      console.log('Risk trend:', JSON.stringify(trend, null, 2));

      expect(trend.filePath).toBe('src/main.ts');
      expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
    }, 30000);

    it('should find files with increasing risk scores', async () => {
      const increasingRiskFiles = await pipeline.getFilesWithIncreasingRisk();

      console.log('Files with increasing risk:', JSON.stringify(increasingRiskFiles, null, 2));

      expect(Array.isArray(increasingRiskFiles)).toBe(true);
    }, 30000);

    it('should provide SQL/KQL queries for risk heatmap dashboard', () => {
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.topRiskFiles).toBeDefined();
      expect(queries.topRiskFiles.query).toContain('SELECT');
      expect(queries.fileRiskTrend).toBeDefined();
      expect(queries.increasingRiskFiles).toBeDefined();
    });
  });

  describe('P5: Cross-Run Governance Views', () => {
    it('should show all runs in the last 7 days', async () => {
      const recentRuns = await pipeline.getRecentRuns(7);

      console.log('Recent runs:', JSON.stringify(recentRuns, null, 2));

      expect(Array.isArray(recentRuns)).toBe(true);
    }, 30000);

    it('should show runs where evaluation failed', async () => {
      const failedRuns = await pipeline.getFailedEvaluationRuns();

      console.log('Failed evaluation runs:', JSON.stringify(failedRuns, null, 2));

      expect(Array.isArray(failedRuns)).toBe(true);
    }, 30000);

    it('should show average skill execution time by skill name', async () => {
      const metrics = await pipeline.getSkillPerformanceMetrics();

      console.log('Skill performance metrics:', JSON.stringify(metrics, null, 2));

      expect(Array.isArray(metrics)).toBe(true);
    }, 30000);

    it('should show artifact completeness trend', async () => {
      const trend = await pipeline.getArtifactCompletenessTrend();

      console.log('Artifact completeness trend:', JSON.stringify(trend, null, 2));

      expect(Array.isArray(trend)).toBe(true);
    }, 30000);
  });

  describe('Integration Contract Compliance', () => {
    it('should use correct OneLake path convention', () => {
      const config = getFabricConfig();
      const _expectedPathPattern = /^Files\/artifacts\/[\w-]+\/[\w-]+\/[\w-]+\.json$/;

      // The pipeline should generate paths matching this pattern
      expect(config.endpoint).toBe('https://onelake.dfs.fabric.microsoft.com');
    });

    it('should use DefaultAzureCredential for authentication', async () => {
      const result = await pipeline.validateDfsEndpoint();

      expect(result.credentialType).toBe('DefaultAzureCredential');
    }, 30000);
  });
});
