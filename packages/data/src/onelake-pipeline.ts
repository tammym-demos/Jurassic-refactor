/**
 * OneLake Data Pipeline for Microsoft Fabric
 *
 * Implements the OneLake data pipeline for receiving agent artifacts and
 * making them queryable for governance, audit, and risk visualization.
 *
 * Features:
 * - DFS endpoint validation
 * - Audit trail completeness verification
 * - Risk score analytics queries
 * - Cross-run governance views
 *
 * @see Issue #87 - OneLake Data Pipeline and Audit Trail Validation
 */

import { DataLakeServiceClient } from '@azure/storage-file-datalake';
import { DefaultAzureCredential, TokenCredential } from '@azure/identity';
import { getFabricConfig, FabricConfig } from './fabric-config.js';
import {
  type LakehouseTables as _LakehouseTables,
  RunRecord,
  SkillInvocationRecord,
  ArtifactRecord,
  EvaluationRecord,
  lakehouseTables,
} from './lakehouse-tables.js';

/**
 * Result of OneLake DFS endpoint validation.
 */
export interface DfsValidationResult {
  success: boolean;
  endpoint: string;
  workspaceAccessible: boolean;
  lakehouseAccessible: boolean;
  writeTestPassed: boolean;
  credentialType: string;
  errorMessage?: string;
  networkRequirements?: string[];
}

/**
 * Audit trail record representing the complete audit context for a run.
 */
export interface AuditTrailRecord {
  /** Who: Identity that ran the agent */
  identity: {
    principalId?: string;
    principalName?: string;
    tenantId?: string;
    source: 'azure-ad' | 'manifest' | 'environment';
  };
  /** What: Skills that were invoked */
  skillsInvoked: string[];
  /** When: Timestamps for key actions */
  timestamps: {
    runStarted: string;
    runCompleted?: string;
    approvedAt?: string;
  };
  /** Result: Success/failure status */
  result: {
    overallStatus: 'success' | 'failed' | 'partial';
    skillResults: Array<{ skill: string; status: string; errorMessage?: string }>;
  };
  /** Artifacts: Links to produced artifacts */
  artifacts: Array<{ name: string; path: string; validated: boolean }>;
  /** Approval: When/if plan was approved */
  approval?: {
    approved: boolean;
    approvedAt?: string;
    approvedBy?: string;
  };
}

/**
 * Risk score analytics result for a file.
 */
export interface FileRiskScore {
  filePath: string;
  riskScore: number;
  runId: string;
  evaluatedAt: string;
  factors: {
    churn: number;
    complexity: number;
    safetyPath: number;
    docCoverage: number;
    testCoverage: number;
  };
  safetyFlags?: string[];
}

/**
 * Risk trend data for tracking changes over time.
 */
export interface RiskTrend {
  filePath: string;
  dataPoints: Array<{
    runId: string;
    evaluatedAt: string;
    riskScore: number;
  }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  changeRate: number; // Per-run average change
}

/**
 * Cross-run governance view result.
 */
export interface GovernanceView {
  viewName: string;
  query: string;
  description: string;
  results: unknown[];
}

/**
 * Run summary for governance dashboards.
 */
export interface RunSummary {
  runId: string;
  startedAt: string;
  completedAt?: string;
  agentName: string;
  status: string;
  artifactCount: number;
  evaluationStatus?: 'pass' | 'fail' | 'warning';
}

/**
 * Skill performance metrics.
 */
export interface SkillPerformanceMetrics {
  skillName: string;
  totalInvocations: number;
  averageDurationMs: number;
  successRate: number;
  failureCount: number;
}

/**
 * OneLake Data Pipeline for artifact ingestion and governance.
 */
export class OneLakePipeline {
  private credential: TokenCredential;
  private client: DataLakeServiceClient | null = null;
  private config: FabricConfig;

  constructor(credential?: TokenCredential) {
    this.credential = credential ?? new DefaultAzureCredential();
    this.config = getFabricConfig();
  }

  private getClient(): DataLakeServiceClient {
    if (!this.client) {
      this.client = new DataLakeServiceClient(this.config.endpoint, this.credential);
    }
    return this.client;
  }

  /**
   * P1: Validate OneLake DFS endpoint accessibility.
   *
   * Tests:
   * - DFS endpoint is reachable
   * - Write access using DefaultAzureCredential
   * - Network/firewall requirements
   */
  async validateDfsEndpoint(): Promise<DfsValidationResult> {
    const result: DfsValidationResult = {
      success: false,
      endpoint: this.config.endpoint,
      workspaceAccessible: false,
      lakehouseAccessible: false,
      writeTestPassed: false,
      credentialType: 'DefaultAzureCredential',
      networkRequirements: [],
    };

    try {
      // Test 1: Workspace accessibility
      const client = this.getClient();
      const fileSystemClient = client.getFileSystemClient(this.config.workspaceId);

      // Try to list paths to test workspace access
      try {
        const iterator = fileSystemClient.listPaths({ path: this.config.lakehouseId });
        await iterator.next();
        result.workspaceAccessible = true;
      } catch (error) {
        const err = error as { statusCode?: number; message?: string };
        if (err.statusCode === 403) {
          result.networkRequirements?.push('Ensure Storage Blob Data Contributor role is assigned');
        } else if (err.statusCode === 404) {
          result.errorMessage = `Workspace ${this.config.workspaceId} not found`;
          return result;
        }
        throw error;
      }

      // Test 2: Lakehouse accessibility
      const lakehousePath = `${this.config.lakehouseId}/Files`;
      try {
        const iterator = fileSystemClient.listPaths({ path: lakehousePath });
        await iterator.next();
        result.lakehouseAccessible = true;
      } catch (error) {
        const err = error as { statusCode?: number };
        if (err.statusCode === 404) {
          result.errorMessage = `Lakehouse ${this.config.lakehouseId} not found`;
          return result;
        }
        throw error;
      }

      // Test 3: Write access
      const testFilePath = `${this.config.lakehouseId}/Files/.validation-test-${Date.now()}`;
      const testFileClient = fileSystemClient.getFileClient(testFilePath);
      try {
        await testFileClient.create();
        await testFileClient.append(Buffer.from('test'), 0, 4);
        await testFileClient.flush(4);
        result.writeTestPassed = true;
        // Clean up test file
        await testFileClient.delete().catch(() => {});
      } catch (error) {
        const err = error as { statusCode?: number };
        if (err.statusCode === 403) {
          result.networkRequirements?.push('Write access denied - verify Storage Blob Data Contributor role');
        }
        throw error;
      }

      result.success = result.workspaceAccessible && result.lakehouseAccessible && result.writeTestPassed;
      if (result.success) {
        result.networkRequirements = [
          'Outbound HTTPS (443) to onelake.dfs.fabric.microsoft.com',
          'Azure AD authentication endpoint access',
        ];
      }
    } catch (error) {
      result.errorMessage = (error as Error).message;
    }

    return result;
  }

  /**
   * P2: Ingest sample JSON artifacts for testing.
   *
   * Creates sample artifacts matching specs/schemas/ and uploads via DFS REST API.
   */
  async ingestTestArtifacts(runId: string): Promise<{ uploaded: string[]; errors: string[] }> {
    const uploaded: string[] = [];
    const errors: string[] = [];

    const sampleArtifacts = [
      {
        name: 'RiskAssessment',
        data: {
          items: [
            {
              filePath: 'src/main.ts',
              riskScore: 0.75,
              factors: {
                churn: 0.8,
                complexity: 0.7,
                safetyPath: 0.5,
                docCoverage: 0.9,
                testCoverage: 0.6,
              },
            },
          ],
        },
      },
      {
        name: 'RunLogEvent',
        data: {
          timestamp: new Date().toISOString(),
          skill: 'complexity_metrics',
          inputs: { files: ['src/main.ts'] },
          outputs: { complexity: 15 },
          durationMs: 1200,
          status: 'success',
        },
      },
      {
        name: 'Manifest',
        data: {
          runId,
          repoUrl: 'https://github.com/test/repo',
          profilePath: 'specs/repos/test.profile.json',
          startedAt: new Date().toISOString(),
          agent: 'planning' as const,
          status: 'completed' as const,
          artifactPaths: ['RiskAssessment.json', 'RunLogEvent.json'],
        },
      },
    ];

    for (const artifact of sampleArtifacts) {
      try {
        const filePath = `artifacts/${runId}/planning/${artifact.name}.json`;
        await this.writeArtifactFile(filePath, artifact.data);
        uploaded.push(artifact.name);
      } catch (error) {
        errors.push(`${artifact.name}: ${(error as Error).message}`);
      }
    }

    return { uploaded, errors };
  }

  private async writeArtifactFile(filePath: string, data: unknown): Promise<void> {
    const client = this.getClient();
    const fileSystemClient = client.getFileSystemClient(this.config.workspaceId);
    const fullPath = `${this.config.lakehouseId}/Files/${filePath}`;
    const fileClient = fileSystemClient.getFileClient(fullPath);

    const content = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(content, 'utf-8');

    await fileClient.create();
    await fileClient.append(buffer, 0, buffer.length);
    await fileClient.flush(buffer.length);
  }

  /**
   * P3: Build complete audit trail for a run.
   *
   * Gathers all audit information:
   * - Who: Identity from manifest or Azure AD
   * - What: Skills invoked (from RunLogEvent)
   * - When: Timestamps for all actions
   * - Result: Success/failure of each skill
   * - Artifacts: Links to produced artifacts
   * - Approval: When/if plan was approved
   */
  async buildAuditTrail(runId: string): Promise<AuditTrailRecord> {
    // Read skill invocations
    const skillInvocations = await lakehouseTables.readTable<SkillInvocationRecord>('skill_invocations');
    const runSkillInvocations = skillInvocations.filter((s) => s.runId === runId);

    // Read run record
    const runs = await lakehouseTables.readTable<RunRecord>('runs');
    const runRecord = runs.find((r) => r.runId === runId);

    // Read artifacts
    const artifacts = await lakehouseTables.readTable<ArtifactRecord>('artifacts');
    const runArtifacts = artifacts.filter((a) => a.runId === runId);

    // Check for APPROVED marker
    const approvalInfo = await this.checkApprovalStatus(runId);

    // Get identity from environment or Azure context
    const identity = await this.resolveIdentity();

    return {
      identity,
      skillsInvoked: runSkillInvocations.map((s) => s.skillName),
      timestamps: {
        runStarted: runRecord?.startedAt ?? new Date().toISOString(),
        runCompleted: runRecord?.completedAt,
        approvedAt: approvalInfo.approvedAt,
      },
      result: {
        overallStatus: this.determineOverallStatus(runRecord, runSkillInvocations),
        skillResults: runSkillInvocations.map((s) => ({
          skill: s.skillName,
          status: s.status,
          errorMessage: s.errorMessage,
        })),
      },
      artifacts: runArtifacts.map((a) => ({
        name: a.artifactName,
        path: a.path,
        validated: a.validated,
      })),
      approval: approvalInfo.approved
        ? {
            approved: true,
            approvedAt: approvalInfo.approvedAt,
          }
        : undefined,
    };
  }

  private async resolveIdentity(): Promise<AuditTrailRecord['identity']> {
    // Try to get identity from environment
    if (process.env.AZURE_CLIENT_ID) {
      return {
        principalId: process.env.AZURE_CLIENT_ID,
        tenantId: process.env.AZURE_TENANT_ID,
        source: 'environment',
      };
    }

    // Try to get token to extract identity
    try {
      const token = await this.credential.getToken('https://storage.azure.com/.default');
      if (token) {
        // Parse JWT to get claims (simplified - in production use a proper JWT library)
        const payload = token.token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        return {
          principalId: decoded.oid ?? decoded.sub,
          principalName: decoded.name ?? decoded.upn,
          tenantId: decoded.tid,
          source: 'azure-ad',
        };
      }
    } catch {
      // Fall through to manifest
    }

    return { source: 'manifest' };
  }

  private async checkApprovalStatus(runId: string): Promise<{ approved: boolean; approvedAt?: string }> {
    try {
      const client = this.getClient();
      const fileSystemClient = client.getFileSystemClient(this.config.workspaceId);
      const approvedPath = `${this.config.lakehouseId}/Files/artifacts/${runId}/APPROVED`;
      const fileClient = fileSystemClient.getFileClient(approvedPath);

      const properties = await fileClient.getProperties();
      return {
        approved: true,
        approvedAt: properties.lastModified?.toISOString(),
      };
    } catch {
      return { approved: false };
    }
  }

  private determineOverallStatus(
    runRecord: RunRecord | undefined,
    skillInvocations: SkillInvocationRecord[],
  ): 'success' | 'failed' | 'partial' {
    if (runRecord?.status === 'failed') return 'failed';
    if (runRecord?.status === 'completed') {
      const failedSkills = skillInvocations.filter((s) => s.status === 'failed');
      if (failedSkills.length === 0) return 'success';
      if (failedSkills.length < skillInvocations.length) return 'partial';
      return 'failed';
    }
    return 'partial';
  }

  /**
   * P4: Risk Score Analytics Queries
   */

  /**
   * Query: Get top N highest-risk files across all runs.
   */
  async getTopRiskFiles(limit: number = 10): Promise<FileRiskScore[]> {
    // In production, this would be a KQL/SQL query against Fabric
    // For now, we aggregate from the artifacts we can read
    const artifacts = await lakehouseTables.readTable<ArtifactRecord>('artifacts');
    const riskArtifacts = artifacts.filter((a) => a.schemaName === 'RiskAssessment.schema.json');

    const allRiskScores: FileRiskScore[] = [];

    for (const artifact of riskArtifacts) {
      try {
        const data = await this.readArtifactFile(artifact.path);
        const riskAssessment = data as { items: FileRiskScore[] };
        for (const item of riskAssessment.items ?? []) {
          allRiskScores.push({
            ...item,
            runId: artifact.runId,
            evaluatedAt: artifact.createdAt,
          });
        }
      } catch {
        // Skip unreadable artifacts
      }
    }

    // Sort by risk score descending and take top N
    return allRiskScores.sort((a, b) => b.riskScore - a.riskScore).slice(0, limit);
  }

  /**
   * Query: Track risk score changes for a specific file across runs.
   */
  async getFileRiskTrend(filePath: string): Promise<RiskTrend> {
    const artifacts = await lakehouseTables.readTable<ArtifactRecord>('artifacts');
    const riskArtifacts = artifacts.filter((a) => a.schemaName === 'RiskAssessment.schema.json');

    const dataPoints: RiskTrend['dataPoints'] = [];

    for (const artifact of riskArtifacts) {
      try {
        const data = await this.readArtifactFile(artifact.path);
        const riskAssessment = data as { items: Array<{ filePath: string; riskScore: number }> };
        const fileRisk = riskAssessment.items?.find((i) => i.filePath === filePath);
        if (fileRisk) {
          dataPoints.push({
            runId: artifact.runId,
            evaluatedAt: artifact.createdAt,
            riskScore: fileRisk.riskScore,
          });
        }
      } catch {
        // Skip unreadable artifacts
      }
    }

    // Sort by date
    dataPoints.sort((a, b) => new Date(a.evaluatedAt).getTime() - new Date(b.evaluatedAt).getTime());

    // Calculate trend
    const trend = this.calculateTrend(dataPoints.map((d) => d.riskScore));

    return {
      filePath,
      dataPoints,
      ...trend,
    };
  }

  /**
   * Query: Find files with increasing risk scores over time.
   */
  async getFilesWithIncreasingRisk(): Promise<RiskTrend[]> {
    // Get all unique file paths from risk assessments
    const artifacts = await lakehouseTables.readTable<ArtifactRecord>('artifacts');
    const riskArtifacts = artifacts.filter((a) => a.schemaName === 'RiskAssessment.schema.json');

    const filePathSet = new Set<string>();
    for (const artifact of riskArtifacts) {
      try {
        const data = await this.readArtifactFile(artifact.path);
        const riskAssessment = data as { items: Array<{ filePath: string }> };
        for (const item of riskAssessment.items ?? []) {
          filePathSet.add(item.filePath);
        }
      } catch {
        // Skip unreadable artifacts
      }
    }

    // Get trends for all files and filter for increasing
    const trends: RiskTrend[] = [];
    for (const filePath of filePathSet) {
      const trend = await this.getFileRiskTrend(filePath);
      if (trend.trend === 'increasing') {
        trends.push(trend);
      }
    }

    // Sort by change rate descending
    return trends.sort((a, b) => b.changeRate - a.changeRate);
  }

  private calculateTrend(scores: number[]): { trend: RiskTrend['trend']; changeRate: number } {
    if (scores.length < 2) {
      return { trend: 'stable', changeRate: 0 };
    }

    // Calculate average change per step
    let totalChange = 0;
    for (let i = 1; i < scores.length; i++) {
      totalChange += scores[i] - scores[i - 1];
    }
    const changeRate = totalChange / (scores.length - 1);

    // Determine trend based on change rate
    const threshold = 0.02; // 2% change threshold
    if (changeRate > threshold) {
      return { trend: 'increasing', changeRate };
    } else if (changeRate < -threshold) {
      return { trend: 'decreasing', changeRate };
    }
    return { trend: 'stable', changeRate };
  }

  private async readArtifactFile(path: string): Promise<unknown> {
    const client = this.getClient();
    const fileSystemClient = client.getFileSystemClient(this.config.workspaceId);

    // Handle both relative and full paths
    const fullPath = path.startsWith(this.config.lakehouseId)
      ? path
      : `${this.config.lakehouseId}/Files/${path}`;

    const fileClient = fileSystemClient.getFileClient(fullPath);
    const response = await fileClient.read();

    const chunks: Buffer[] = [];
    for await (const chunk of response.readableStreamBody!) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(content);
  }

  /**
   * P5: Cross-Run Governance Views
   */

  /**
   * View: All runs in the last N days with their status.
   */
  async getRecentRuns(days: number = 7): Promise<RunSummary[]> {
    const runs = await lakehouseTables.readTable<RunRecord>('runs');
    const evaluations = await lakehouseTables.readTable<EvaluationRecord>('evaluations');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return runs
      .filter((r) => new Date(r.startedAt) >= cutoff)
      .map((r) => {
        const evaluation = evaluations.find((e) => e.runId === r.runId);
        return {
          runId: r.runId,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          agentName: r.agentName,
          status: r.status,
          artifactCount: r.artifactCount,
          evaluationStatus: evaluation?.status,
        };
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * View: Runs where evaluation failed (regression detection).
   */
  async getFailedEvaluationRuns(): Promise<Array<RunSummary & { evaluationDetails?: string }>> {
    const runs = await lakehouseTables.readTable<RunRecord>('runs');
    const evaluations = await lakehouseTables.readTable<EvaluationRecord>('evaluations');

    const failedEvaluations = evaluations.filter((e) => e.status === 'fail' || e.regressionDetected);

    return failedEvaluations.map((e) => {
      const run = runs.find((r) => r.runId === e.runId);
      return {
        runId: e.runId,
        startedAt: run?.startedAt ?? e.evaluatedAt,
        completedAt: run?.completedAt,
        agentName: run?.agentName ?? 'unknown',
        status: run?.status ?? 'unknown',
        artifactCount: run?.artifactCount ?? 0,
        evaluationStatus: e.status,
        evaluationDetails: e.details,
      };
    });
  }

  /**
   * View: Average skill execution time by skill name (performance monitoring).
   */
  async getSkillPerformanceMetrics(): Promise<SkillPerformanceMetrics[]> {
    const skillInvocations = await lakehouseTables.readTable<SkillInvocationRecord>('skill_invocations');

    // Group by skill name
    const skillGroups = new Map<string, SkillInvocationRecord[]>();
    for (const invocation of skillInvocations) {
      const group = skillGroups.get(invocation.skillName) ?? [];
      group.push(invocation);
      skillGroups.set(invocation.skillName, group);
    }

    // Calculate metrics for each skill
    const metrics: SkillPerformanceMetrics[] = [];
    for (const [skillName, invocations] of skillGroups) {
      const totalDuration = invocations.reduce((sum, i) => sum + i.durationMs, 0);
      const failures = invocations.filter((i) => i.status === 'failed');

      metrics.push({
        skillName,
        totalInvocations: invocations.length,
        averageDurationMs: Math.round(totalDuration / invocations.length),
        successRate: (invocations.length - failures.length) / invocations.length,
        failureCount: failures.length,
      });
    }

    // Sort by average duration descending
    return metrics.sort((a, b) => b.averageDurationMs - a.averageDurationMs);
  }

  /**
   * View: Artifact completeness trend over time.
   */
  async getArtifactCompletenessTrend(): Promise<
    Array<{ runId: string; completedAt: string; artifactCount: number; completenessScore: number }>
  > {
    const runs = await lakehouseTables.readTable<RunRecord>('runs');
    const evaluations = await lakehouseTables.readTable<EvaluationRecord>('evaluations');

    // Expected artifact count per agent type
    const expectedArtifacts = {
      planning: 6, // Manifest, DependencyGraph, RiskAssessment, StackAnalysis, ModernizationPlan, DocCoverage
      implementation: 4, // Manifest, ImplementationLog, TestScaffold, PRs
    };

    return runs
      .filter((r) => r.completedAt)
      .map((r) => {
        const expected = expectedArtifacts[r.agentName] ?? 5;
        const evaluation = evaluations.find((e) => e.runId === r.runId);
        return {
          runId: r.runId,
          completedAt: r.completedAt!,
          artifactCount: r.artifactCount,
          completenessScore: evaluation?.artifactCompleteness ?? r.artifactCount / expected,
        };
      })
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  }

  /**
   * Generate SQL/KQL query strings for use in Fabric SQL endpoint or KQL database.
   */
  getAnalyticsQueries(): Record<string, { query: string; description: string }> {
    return {
      topRiskFiles: {
        description: 'Top 10 highest-risk files across all runs',
        query: `
SELECT TOP 10
  r.filePath,
  r.riskScore,
  r.runId,
  r.evaluatedAt,
  r.factors
FROM risk_assessments r
ORDER BY r.riskScore DESC`,
      },
      fileRiskTrend: {
        description: 'Risk score changes for a specific file across runs',
        query: `
SELECT
  r.runId,
  r.evaluatedAt,
  r.riskScore
FROM risk_assessments r
WHERE r.filePath = @filePath
ORDER BY r.evaluatedAt ASC`,
      },
      increasingRiskFiles: {
        description: 'Files with increasing risk scores (trend detection)',
        query: `
WITH RiskChanges AS (
  SELECT
    filePath,
    riskScore,
    evaluatedAt,
    LAG(riskScore) OVER (PARTITION BY filePath ORDER BY evaluatedAt) as prevScore
  FROM risk_assessments
)
SELECT
  filePath,
  AVG(riskScore - prevScore) as avgChange
FROM RiskChanges
WHERE prevScore IS NOT NULL
GROUP BY filePath
HAVING AVG(riskScore - prevScore) > 0.02
ORDER BY avgChange DESC`,
      },
      recentRuns: {
        description: 'All runs in the last 7 days with status',
        query: `
SELECT
  r.runId,
  r.startedAt,
  r.completedAt,
  r.agentName,
  r.status,
  r.artifactCount,
  e.status as evaluationStatus
FROM runs r
LEFT JOIN evaluations e ON r.runId = e.runId
WHERE r.startedAt >= DATEADD(day, -7, GETDATE())
ORDER BY r.startedAt DESC`,
      },
      failedEvaluations: {
        description: 'Runs where evaluation failed (regression detection)',
        query: `
SELECT
  r.runId,
  r.startedAt,
  r.agentName,
  r.status,
  e.status as evaluationStatus,
  e.details,
  e.regressionDetected
FROM runs r
JOIN evaluations e ON r.runId = e.runId
WHERE e.status = 'fail' OR e.regressionDetected = 1
ORDER BY r.startedAt DESC`,
      },
      skillPerformance: {
        description: 'Average skill execution time by skill name',
        query: `
SELECT
  skillName,
  COUNT(*) as totalInvocations,
  AVG(durationMs) as avgDurationMs,
  CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as successRate,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failureCount
FROM skill_invocations
GROUP BY skillName
ORDER BY avgDurationMs DESC`,
      },
      artifactCompleteness: {
        description: 'Artifact completeness trend over time',
        query: `
SELECT
  r.runId,
  r.completedAt,
  r.artifactCount,
  e.artifactCompleteness
FROM runs r
LEFT JOIN evaluations e ON r.runId = e.runId
WHERE r.completedAt IS NOT NULL
ORDER BY r.completedAt ASC`,
      },
    };
  }
}

// Export singleton instance
export const onelakePipeline = new OneLakePipeline();
