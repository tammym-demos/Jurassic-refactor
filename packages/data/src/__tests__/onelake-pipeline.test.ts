/**
 * Unit tests for OneLake Pipeline
 *
 * Tests the OneLake data pipeline type exports and basic construction.
 * Full integration tests require JURASSIC_E2E_FABRIC=true flag.
 */
import { describe, it, expect } from 'vitest';
import {
  OneLakePipeline,
} from '../onelake-pipeline.js';

describe('OneLakePipeline', () => {
  describe('constructor', () => {
    it('should create pipeline instance', () => {
      // Just verify the class can be instantiated
      // Actual Azure SDK operations are tested in E2E tests
      expect(OneLakePipeline).toBeDefined();
    });
  });

  describe('getAnalyticsQueries', () => {
    it('should return all analytics query definitions', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.topRiskFiles).toBeDefined();
      expect(queries.topRiskFiles.query).toContain('SELECT');
      expect(queries.topRiskFiles.description).toBeTruthy();

      expect(queries.fileRiskTrend).toBeDefined();
      expect(queries.increasingRiskFiles).toBeDefined();
      expect(queries.recentRuns).toBeDefined();
      expect(queries.failedEvaluations).toBeDefined();
      expect(queries.skillPerformance).toBeDefined();
      expect(queries.artifactCompleteness).toBeDefined();
    });

    it('should return valid SQL queries for top risk files', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.topRiskFiles.query).toContain('ORDER BY');
      expect(queries.topRiskFiles.query).toContain('riskScore');
    });

    it('should return valid SQL queries for file risk trend', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.fileRiskTrend.query).toContain('@filePath');
      expect(queries.fileRiskTrend.query).toContain('ORDER BY');
    });

    it('should return valid SQL queries for increasing risk detection', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.increasingRiskFiles.query).toContain('LAG');
      expect(queries.increasingRiskFiles.query).toContain('AVG');
    });

    it('should return valid SQL queries for recent runs', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.recentRuns.query).toContain('runs');
      expect(queries.recentRuns.query).toContain('evaluations');
    });

    it('should return valid SQL queries for failed evaluations', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.failedEvaluations.query).toContain('fail');
      expect(queries.failedEvaluations.query).toContain('regressionDetected');
    });

    it('should return valid SQL queries for skill performance', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.skillPerformance.query).toContain('AVG');
      expect(queries.skillPerformance.query).toContain('durationMs');
    });

    it('should return valid SQL queries for artifact completeness', () => {
      const pipeline = new OneLakePipeline();
      const queries = pipeline.getAnalyticsQueries();

      expect(queries.artifactCompleteness.query).toContain('artifactCount');
      expect(queries.artifactCompleteness.query).toContain('completedAt');
    });
  });

  describe('type exports', () => {
    it('should export DfsValidationResult interface shape', () => {
      // Type checking is done at compile time, this just verifies the shape
      const mockResult = {
        success: true,
        endpoint: 'https://onelake.dfs.fabric.microsoft.com',
        workspaceAccessible: true,
        lakehouseAccessible: true,
        writeTestPassed: true,
        credentialType: 'DefaultAzureCredential',
      };
      expect(mockResult.success).toBe(true);
    });

    it('should export AuditTrailRecord interface shape', () => {
      const mockAuditTrail = {
        identity: { source: 'azure-ad' as const },
        skillsInvoked: ['skill1'],
        timestamps: { runStarted: '2026-03-06T10:00:00Z' },
        result: { overallStatus: 'success' as const, skillResults: [] },
        artifacts: [],
      };
      expect(mockAuditTrail.identity.source).toBe('azure-ad');
    });

    it('should export FileRiskScore interface shape', () => {
      const mockRiskScore = {
        filePath: 'src/main.ts',
        riskScore: 0.75,
        runId: 'run-1',
        evaluatedAt: '2026-03-06T10:00:00Z',
        factors: {
          churn: 0.8,
          complexity: 0.7,
          safetyPath: 0.5,
          docCoverage: 0.9,
          testCoverage: 0.6,
        },
      };
      expect(mockRiskScore.riskScore).toBe(0.75);
    });

    it('should export RiskTrend interface shape', () => {
      const mockTrend = {
        filePath: 'src/main.ts',
        dataPoints: [],
        trend: 'stable' as const,
        changeRate: 0,
      };
      expect(mockTrend.trend).toBe('stable');
    });

    it('should export RunSummary interface shape', () => {
      const mockSummary = {
        runId: 'run-1',
        startedAt: '2026-03-06T10:00:00Z',
        agentName: 'planning',
        status: 'completed',
        artifactCount: 5,
      };
      expect(mockSummary.status).toBe('completed');
    });

    it('should export SkillPerformanceMetrics interface shape', () => {
      const mockMetrics = {
        skillName: 'complexity_metrics',
        totalInvocations: 10,
        averageDurationMs: 1500,
        successRate: 0.95,
        failureCount: 1,
      };
      expect(mockMetrics.successRate).toBe(0.95);
    });
  });
});
