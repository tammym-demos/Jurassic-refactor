/**
 * Fabric IQ Integration for Modernization Intelligence
 *
 * Leverages Microsoft Fabric IQ to provide:
 * 1. **Ontology**: Unified business vocabulary for modernization concepts
 * 2. **Graph**: Relationship traversal for impact analysis and lineage
 * 3. **Data Agent**: Natural language queries over modernization data
 *
 * @see https://learn.microsoft.com/en-us/fabric/iq/overview
 */

import { DefaultAzureCredential } from "@azure/identity";
import { getFabricConfig } from "./fabric-config.js";

// ============================================================================
// ONTOLOGY DEFINITIONS - Business vocabulary for code modernization
// ============================================================================

/**
 * Entity types in the Modernization Ontology
 *
 * These define the core concepts that users and AI agents
 * can reason about using consistent terminology.
 */
export interface OntologyEntityType {
  name: string;
  description: string;
  properties: OntologyProperty[];
  identifierProperty: string;
}

export interface OntologyProperty {
  name: string;
  type: "string" | "number" | "boolean" | "datetime";
  description: string;
  required?: boolean;
}

export interface OntologyRelationship {
  name: string;
  description: string;
  sourceEntityType: string;
  targetEntityType: string;
  cardinality: "one-to-one" | "one-to-many" | "many-to-many" | "many-to-one";
}

export interface OntologyDefinition {
  name: string;
  description: string;
  entityTypes: OntologyEntityType[];
  relationships: OntologyRelationship[];
}

/**
 * The Modernization Ontology
 *
 * Defines the business vocabulary for code modernization:
 * - Run: An agent execution session
 * - Skill: A capability invoked during a run
 * - Artifact: A schema-validated output (plans, assessments, logs)
 * - File: A source file being analyzed
 * - RiskAssessment: Risk evaluation for a file
 */
export const MODERNIZATION_ONTOLOGY: OntologyDefinition = {
  name: "ModernizationOntology",
  description: "Ontology for legacy code modernization intelligence - defines Runs, Skills, Artifacts, and Risk Assessments",

  entityTypes: [
    {
      name: "Run",
      description: "An agent execution session that analyzes or transforms code",
      identifierProperty: "runId",
      properties: [
        { name: "runId", type: "string", description: "Unique identifier for the run", required: true },
        { name: "agentName", type: "string", description: "Agent type: planning or implementation", required: true },
        { name: "status", type: "string", description: "Run status: running, completed, failed", required: true },
        { name: "startedAt", type: "datetime", description: "When the run started", required: true },
        { name: "completedAt", type: "datetime", description: "When the run completed" },
        { name: "repoUrl", type: "string", description: "Target repository URL" },
        { name: "branch", type: "string", description: "Git branch being analyzed" },
        { name: "artifactCount", type: "number", description: "Number of artifacts produced" },
      ],
    },
    {
      name: "Skill",
      description: "A reusable capability invoked during modernization (e.g., risk_scoring, complexity_metrics)",
      identifierProperty: "invocationId",
      properties: [
        { name: "invocationId", type: "string", description: "Unique invocation identifier", required: true },
        { name: "skillName", type: "string", description: "Name of the skill", required: true },
        { name: "status", type: "string", description: "Execution status: success, failed", required: true },
        { name: "durationMs", type: "number", description: "Execution time in milliseconds" },
        { name: "startedAt", type: "datetime", description: "Skill invocation start time", required: true },
        { name: "completedAt", type: "datetime", description: "Skill invocation end time" },
        { name: "errorMessage", type: "string", description: "Error details if failed" },
      ],
    },
    {
      name: "Artifact",
      description: "A schema-validated output produced by an agent (e.g., ModernizationPlan, RiskAssessment)",
      identifierProperty: "artifactId",
      properties: [
        { name: "artifactId", type: "string", description: "Unique artifact identifier", required: true },
        { name: "artifactName", type: "string", description: "Artifact type name", required: true },
        { name: "schemaName", type: "string", description: "JSON schema used for validation" },
        { name: "validated", type: "boolean", description: "Whether artifact passed schema validation" },
        { name: "sizeBytes", type: "number", description: "Artifact size in bytes" },
        { name: "createdAt", type: "datetime", description: "When artifact was created", required: true },
        { name: "path", type: "string", description: "Storage path in OneLake" },
      ],
    },
    {
      name: "File",
      description: "A source code file being analyzed for modernization",
      identifierProperty: "filePath",
      properties: [
        { name: "filePath", type: "string", description: "Relative path in repository", required: true },
        { name: "language", type: "string", description: "Programming language" },
        { name: "linesOfCode", type: "number", description: "Total lines of code" },
        { name: "complexity", type: "number", description: "Cyclomatic complexity score" },
        { name: "lastModified", type: "datetime", description: "Last modification date" },
      ],
    },
    {
      name: "RiskAssessment",
      description: "Risk evaluation for a file based on churn, complexity, coverage, and safety path",
      identifierProperty: "assessmentId",
      properties: [
        { name: "assessmentId", type: "string", description: "Unique assessment identifier", required: true },
        { name: "riskScore", type: "number", description: "Overall risk score (0-1)", required: true },
        { name: "churnFactor", type: "number", description: "Code churn risk factor" },
        { name: "complexityFactor", type: "number", description: "Complexity risk factor" },
        { name: "safetyPathFactor", type: "number", description: "Safety path coverage factor" },
        { name: "testCoverageFactor", type: "number", description: "Test coverage factor" },
        { name: "docCoverageFactor", type: "number", description: "Documentation coverage factor" },
        { name: "evaluatedAt", type: "datetime", description: "When assessment was created", required: true },
      ],
    },
    {
      name: "Evaluation",
      description: "Quality evaluation of an agent run (artifact completeness, schema validation, determinism)",
      identifierProperty: "evaluationId",
      properties: [
        { name: "evaluationId", type: "string", description: "Unique evaluation identifier", required: true },
        { name: "status", type: "string", description: "Evaluation result: pass, fail", required: true },
        { name: "artifactCompleteness", type: "number", description: "Percentage of expected artifacts produced" },
        { name: "schemaValidationRate", type: "number", description: "Percentage of artifacts passing schema validation" },
        { name: "determinismScore", type: "number", description: "Score indicating output consistency" },
        { name: "regressionDetected", type: "boolean", description: "Whether regression was detected" },
        { name: "evaluatedAt", type: "datetime", description: "When evaluation was performed", required: true },
      ],
    },
  ],

  relationships: [
    {
      name: "invokes",
      description: "A Run invokes one or more Skills during execution",
      sourceEntityType: "Run",
      targetEntityType: "Skill",
      cardinality: "one-to-many",
    },
    {
      name: "produces",
      description: "A Run produces one or more Artifacts as output",
      sourceEntityType: "Run",
      targetEntityType: "Artifact",
      cardinality: "one-to-many",
    },
    {
      name: "evaluates",
      description: "A RiskAssessment evaluates a File",
      sourceEntityType: "RiskAssessment",
      targetEntityType: "File",
      cardinality: "many-to-one",
    },
    {
      name: "hasEvaluation",
      description: "A Run has an Evaluation that measures its quality",
      sourceEntityType: "Run",
      targetEntityType: "Evaluation",
      cardinality: "one-to-one",
    },
    {
      name: "createdBy",
      description: "An Artifact was created by a Skill invocation",
      sourceEntityType: "Artifact",
      targetEntityType: "Skill",
      cardinality: "many-to-one",
    },
  ],
};

// ============================================================================
// DATA BINDINGS - Map ontology concepts to lakehouse tables
// ============================================================================

export interface DataBinding {
  entityType: string;
  tableName: string;
  columnMappings: Record<string, string>;
}

/**
 * Data bindings that connect ontology entity types to lakehouse tables
 */
export const DATA_BINDINGS: DataBinding[] = [
  {
    entityType: "Run",
    tableName: "runs",
    columnMappings: {
      runId: "runId",
      agentName: "agentName",
      status: "status",
      startedAt: "startedAt",
      completedAt: "completedAt",
      repoUrl: "repoUrl",
      branch: "branch",
      artifactCount: "artifactCount",
    },
  },
  {
    entityType: "Skill",
    tableName: "skill_invocations",
    columnMappings: {
      invocationId: "invocationId",
      skillName: "skillName",
      status: "status",
      durationMs: "durationMs",
      startedAt: "startedAt",
      completedAt: "completedAt",
      errorMessage: "errorMessage",
    },
  },
  {
    entityType: "Artifact",
    tableName: "artifacts",
    columnMappings: {
      artifactId: "artifactId",
      artifactName: "artifactName",
      schemaName: "schemaName",
      validated: "validated",
      sizeBytes: "sizeBytes",
      createdAt: "createdAt",
      path: "path",
    },
  },
  {
    entityType: "Evaluation",
    tableName: "evaluations",
    columnMappings: {
      evaluationId: "evaluationId",
      status: "status",
      artifactCompleteness: "artifactCompleteness",
      schemaValidationRate: "schemaValidationRate",
      determinismScore: "determinismScore",
      regressionDetected: "regressionDetected",
      evaluatedAt: "evaluatedAt",
    },
  },
];

// ============================================================================
// DATA AGENT - Natural language query interface
// ============================================================================

/**
 * Example queries for the Fabric Data Agent
 *
 * These help the agent understand how to translate natural language
 * into SQL/KQL queries against our lakehouse tables.
 */
export interface DataAgentExample {
  question: string;
  query: string;
  description: string;
}

export const DATA_AGENT_EXAMPLES: DataAgentExample[] = [
  {
    question: "Which files have the highest risk scores?",
    query: `SELECT filePath, riskScore, churnFactor, complexityFactor, testCoverageFactor
            FROM risk_scores
            ORDER BY riskScore DESC
            LIMIT 10`,
    description: "Returns top 10 highest risk files with their risk factors",
  },
  {
    question: "Show me all runs from the last 7 days",
    query: `SELECT runId, agentName, status, startedAt, artifactCount
            FROM runs
            WHERE startedAt >= DATEADD(day, -7, GETDATE())
            ORDER BY startedAt DESC`,
    description: "Returns recent agent runs with their status",
  },
  {
    question: "Which skills take the longest to execute?",
    query: `SELECT skillName, 
                   AVG(durationMs) as avgDuration,
                   COUNT(*) as totalInvocations,
                   SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as successRate
            FROM skill_invocations
            GROUP BY skillName
            ORDER BY avgDuration DESC`,
    description: "Returns skill performance metrics sorted by average duration",
  },
  {
    question: "Show runs where the evaluation failed",
    query: `SELECT r.runId, r.agentName, r.startedAt, e.status, e.artifactCompleteness, e.regressionDetected
            FROM runs r
            JOIN evaluations e ON r.runId = e.runId
            WHERE e.status = 'fail' OR e.regressionDetected = true
            ORDER BY r.startedAt DESC`,
    description: "Returns runs with failed evaluations or detected regressions",
  },
  {
    question: "What artifacts were produced in run X?",
    query: `SELECT artifactName, schemaName, validated, sizeBytes, createdAt
            FROM artifacts
            WHERE runId = @runId
            ORDER BY createdAt`,
    description: "Returns all artifacts for a specific run",
  },
  {
    question: "Which files have increasing risk over time?",
    query: `WITH RiskTrend AS (
              SELECT filePath, riskScore, evaluatedAt,
                     LAG(riskScore) OVER (PARTITION BY filePath ORDER BY evaluatedAt) as prevScore
              FROM risk_scores
            )
            SELECT filePath, 
                   AVG(riskScore - COALESCE(prevScore, riskScore)) as avgIncrease
            FROM RiskTrend
            GROUP BY filePath
            HAVING AVG(riskScore - COALESCE(prevScore, riskScore)) > 0.05
            ORDER BY avgIncrease DESC`,
    description: "Returns files with consistently increasing risk scores",
  },
  {
    question: "Show the complete audit trail for run X",
    query: `SELECT 'run' as type, runId, agentName as name, startedAt as timestamp, status
            FROM runs WHERE runId = @runId
            UNION ALL
            SELECT 'skill' as type, runId, skillName as name, startedAt as timestamp, status
            FROM skill_invocations WHERE runId = @runId
            UNION ALL
            SELECT 'artifact' as type, runId, artifactName as name, createdAt as timestamp, 
                   CASE WHEN validated THEN 'validated' ELSE 'invalid' END as status
            FROM artifacts WHERE runId = @runId
            ORDER BY timestamp`,
    description: "Returns complete timeline of events for a run (audit trail)",
  },
];

/**
 * Data Agent instructions for the Modernization Intelligence domain
 */
export const DATA_AGENT_INSTRUCTIONS = `
You are a Data Agent for the Jurassic Modernization Intelligence system.
You help users query and understand legacy code modernization data.

DOMAIN KNOWLEDGE:
- Runs: Agent execution sessions (planning or implementation agents)
- Skills: Reusable capabilities like risk_scoring, complexity_metrics, code_refactor
- Artifacts: Schema-validated outputs like ModernizationPlan, RiskAssessment, ImplementationLog
- Risk Scores: Per-file risk evaluation based on churn, complexity, test coverage, and safety path

KEY METRICS:
- riskScore: 0-1 scale where higher = more risk (needs attention first)
- artifactCompleteness: 0-1 scale of expected vs actual artifacts
- determinismScore: 0-1 scale of output consistency across runs
- durationMs: Skill execution time in milliseconds

COMMON QUESTIONS:
- Risk analysis: "highest risk files", "files with increasing risk", "risk trend for X"
- Run history: "recent runs", "failed runs", "runs for repo X"
- Skill performance: "slowest skills", "skill success rate", "skill failures"
- Audit trail: "what happened in run X", "who ran the agent", "when was X analyzed"

When asked about risk, always consider multiple factors (churn, complexity, coverage).
When asked about trends, compare across multiple runs over time.
`;

// ============================================================================
// FABRIC IQ CLIENT
// ============================================================================

export interface FabricIQConfig {
  workspaceId: string;
  lakehouseId: string;
  endpoint: string;
}

/**
 * Fabric IQ Client
 *
 * Provides programmatic access to Fabric IQ features:
 * - Ontology creation and management
 * - Data binding configuration
 * - Data agent setup
 */
export class FabricIQClient {
  private credential: DefaultAzureCredential;
  private config: FabricIQConfig;

  constructor(config?: Partial<FabricIQConfig>) {
    this.credential = new DefaultAzureCredential();
    const fabricConfig = getFabricConfig();
    this.config = {
      workspaceId: config?.workspaceId ?? fabricConfig.workspaceId,
      lakehouseId: config?.lakehouseId ?? fabricConfig.lakehouseId,
      endpoint: config?.endpoint ?? "https://api.fabric.microsoft.com/v1",
    };
  }

  /**
   * Get the ontology definition for export/display
   */
  getOntologyDefinition(): OntologyDefinition {
    return MODERNIZATION_ONTOLOGY;
  }

  /**
   * Get data bindings for lakehouse tables
   */
  getDataBindings(): DataBinding[] {
    return DATA_BINDINGS;
  }

  /**
   * Get example queries for data agent configuration
   */
  getDataAgentExamples(): DataAgentExample[] {
    return DATA_AGENT_EXAMPLES;
  }

  /**
   * Get data agent instructions
   */
  getDataAgentInstructions(): string {
    return DATA_AGENT_INSTRUCTIONS;
  }

  /**
   * Export ontology as JSON for Fabric IQ import
   *
   * This generates a JSON file that can be imported into
   * Fabric IQ to create the Modernization Ontology.
   */
  exportOntologyJson(): string {
    const ontology = this.getOntologyDefinition();
    const bindings = this.getDataBindings();

    const exportData = {
      $schema: "https://fabric.microsoft.com/schemas/ontology/v1",
      name: ontology.name,
      description: ontology.description,
      entityTypes: ontology.entityTypes.map((et) => ({
        name: et.name,
        description: et.description,
        identifierProperty: et.identifierProperty,
        properties: et.properties.map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required ?? false,
        })),
      })),
      relationships: ontology.relationships.map((r) => ({
        name: r.name,
        description: r.description,
        source: r.sourceEntityType,
        target: r.targetEntityType,
        cardinality: r.cardinality,
      })),
      dataBindings: bindings.map((b) => ({
        entityType: b.entityType,
        source: {
          type: "lakehouse",
          workspaceId: this.config.workspaceId,
          lakehouseId: this.config.lakehouseId,
          tableName: b.tableName,
        },
        columnMappings: b.columnMappings,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export Data Agent configuration as JSON
   */
  exportDataAgentConfig(): string {
    const config = {
      name: "Modernization Intelligence Agent",
      description: "Natural language interface for querying code modernization data",
      dataSources: [
        {
          type: "lakehouse",
          workspaceId: this.config.workspaceId,
          lakehouseId: this.config.lakehouseId,
          tables: ["runs", "skill_invocations", "artifacts", "evaluations", "risk_scores"],
        },
      ],
      instructions: DATA_AGENT_INSTRUCTIONS,
      exampleQueries: DATA_AGENT_EXAMPLES.map((e) => ({
        question: e.question,
        query: e.query,
      })),
    };

    return JSON.stringify(config, null, 2);
  }

  /**
   * Generate a Mermaid diagram of the ontology
   */
  generateOntologyDiagram(): string {
    const ontology = this.getOntologyDefinition();

    const lines = [
      "erDiagram",
      "    %% Modernization Intelligence Ontology",
      "",
    ];

    // Add entity types with key properties
    for (const et of ontology.entityTypes) {
      const keyProps = et.properties
        .filter((p) => p.required || p.name === et.identifierProperty)
        .slice(0, 4)
        .map((p) => `        ${p.type} ${p.name}`)
        .join("\n");

      lines.push(`    ${et.name} {`);
      lines.push(keyProps);
      lines.push("    }");
      lines.push("");
    }

    // Add relationships
    for (const rel of ontology.relationships) {
      let cardSymbol: string;
      if (rel.cardinality === "one-to-many") {
        cardSymbol = "||--o{";
      } else if (rel.cardinality === "many-to-one") {
        cardSymbol = "}o--||";
      } else if (rel.cardinality === "many-to-many") {
        cardSymbol = "}o--o{";
      } else {
        cardSymbol = "||--||";
      }

      lines.push(`    ${rel.sourceEntityType} ${cardSymbol} ${rel.targetEntityType} : "${rel.name}"`);
    }

    return lines.join("\n");
  }

  /**
   * Display ontology summary for debugging/verification
   */
  displayOntologySummary(): void {
    const ontology = this.getOntologyDefinition();

    console.log(`\n📊 ${ontology.name}`);
    console.log(`   ${ontology.description}\n`);

    console.log("Entity Types:");
    for (const et of ontology.entityTypes) {
      console.log(`  • ${et.name}: ${et.description}`);
      console.log(`    Properties: ${et.properties.map((p) => p.name).join(", ")}`);
    }

    console.log("\nRelationships:");
    for (const rel of ontology.relationships) {
      console.log(`  • ${rel.sourceEntityType} --[${rel.name}]--> ${rel.targetEntityType}`);
    }

    console.log("\nData Bindings:");
    for (const binding of DATA_BINDINGS) {
      console.log(`  • ${binding.entityType} → ${binding.tableName}`);
    }
  }
}

// Export singleton instance
export const fabricIQClient = new FabricIQClient();
