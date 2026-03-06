/**
 * Unit tests for Fabric IQ Integration
 */
import { describe, it, expect } from "vitest";
import {
  FabricIQClient,
  MODERNIZATION_ONTOLOGY,
  DATA_BINDINGS,
  DATA_AGENT_EXAMPLES,
  DATA_AGENT_INSTRUCTIONS,
} from "../fabric-iq.js";

describe("FabricIQClient", () => {
  describe("getOntologyDefinition", () => {
    it("should return the modernization ontology", () => {
      const client = new FabricIQClient();
      const ontology = client.getOntologyDefinition();

      expect(ontology.name).toBe("ModernizationOntology");
      expect(ontology.entityTypes.length).toBe(6);
      expect(ontology.relationships.length).toBe(5);
    });

    it("should include all core entity types", () => {
      const client = new FabricIQClient();
      const ontology = client.getOntologyDefinition();
      const entityNames = ontology.entityTypes.map((e) => e.name);

      expect(entityNames).toContain("Run");
      expect(entityNames).toContain("Skill");
      expect(entityNames).toContain("Artifact");
      expect(entityNames).toContain("File");
      expect(entityNames).toContain("RiskAssessment");
      expect(entityNames).toContain("Evaluation");
    });

    it("should have valid identifier properties for each entity type", () => {
      const client = new FabricIQClient();
      const ontology = client.getOntologyDefinition();

      for (const entityType of ontology.entityTypes) {
        const idProp = entityType.properties.find(
          (p) => p.name === entityType.identifierProperty,
        );
        expect(idProp).toBeDefined();
        expect(idProp?.required).toBe(true);
      }
    });
  });

  describe("getDataBindings", () => {
    it("should return bindings for lakehouse tables", () => {
      const client = new FabricIQClient();
      const bindings = client.getDataBindings();

      expect(bindings.length).toBeGreaterThan(0);
      expect(bindings.some((b) => b.tableName === "runs")).toBe(true);
      expect(bindings.some((b) => b.tableName === "skill_invocations")).toBe(true);
      expect(bindings.some((b) => b.tableName === "artifacts")).toBe(true);
    });

    it("should map entity types to table names", () => {
      const client = new FabricIQClient();
      const bindings = client.getDataBindings();

      const runBinding = bindings.find((b) => b.entityType === "Run");
      expect(runBinding?.tableName).toBe("runs");
      expect(runBinding?.columnMappings.runId).toBe("runId");
    });
  });

  describe("getDataAgentExamples", () => {
    it("should return example queries", () => {
      const client = new FabricIQClient();
      const examples = client.getDataAgentExamples();

      expect(examples.length).toBeGreaterThan(5);
      expect(examples[0].question).toBeTruthy();
      expect(examples[0].query).toBeTruthy();
      expect(examples[0].description).toBeTruthy();
    });

    it("should include risk-related queries", () => {
      const client = new FabricIQClient();
      const examples = client.getDataAgentExamples();

      const riskQuery = examples.find((e) =>
        e.question.toLowerCase().includes("risk"),
      );
      expect(riskQuery).toBeDefined();
    });
  });

  describe("getDataAgentInstructions", () => {
    it("should return domain-specific instructions", () => {
      const client = new FabricIQClient();
      const instructions = client.getDataAgentInstructions();

      expect(instructions).toContain("Modernization Intelligence");
      expect(instructions).toContain("riskScore");
      expect(instructions).toContain("Skills");
    });
  });

  describe("exportOntologyJson", () => {
    it("should export valid JSON", () => {
      const client = new FabricIQClient();
      const json = client.exportOntologyJson();

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should include schema reference", () => {
      const client = new FabricIQClient();
      const json = client.exportOntologyJson();
      const parsed = JSON.parse(json);

      expect(parsed.$schema).toContain("ontology");
    });

    it("should include entity types and relationships", () => {
      const client = new FabricIQClient();
      const json = client.exportOntologyJson();
      const parsed = JSON.parse(json);

      expect(parsed.entityTypes.length).toBe(6);
      expect(parsed.relationships.length).toBe(5);
      expect(parsed.dataBindings.length).toBeGreaterThan(0);
    });
  });

  describe("exportDataAgentConfig", () => {
    it("should export valid JSON", () => {
      const client = new FabricIQClient();
      const json = client.exportDataAgentConfig();

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should include data sources and instructions", () => {
      const client = new FabricIQClient();
      const json = client.exportDataAgentConfig();
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe("Modernization Intelligence Agent");
      expect(parsed.dataSources.length).toBeGreaterThan(0);
      expect(parsed.instructions).toBeTruthy();
      expect(parsed.exampleQueries.length).toBeGreaterThan(0);
    });
  });

  describe("generateOntologyDiagram", () => {
    it("should generate valid Mermaid ER diagram", () => {
      const client = new FabricIQClient();
      const diagram = client.generateOntologyDiagram();

      expect(diagram).toContain("erDiagram");
      expect(diagram).toContain("Run");
      expect(diagram).toContain("Skill");
      expect(diagram).toContain("invokes");
    });

    it("should include all entity types", () => {
      const client = new FabricIQClient();
      const diagram = client.generateOntologyDiagram();

      expect(diagram).toContain("Run {");
      expect(diagram).toContain("Skill {");
      expect(diagram).toContain("Artifact {");
      expect(diagram).toContain("File {");
      expect(diagram).toContain("RiskAssessment {");
      expect(diagram).toContain("Evaluation {");
    });

    it("should include relationship cardinality symbols", () => {
      const client = new FabricIQClient();
      const diagram = client.generateOntologyDiagram();

      // One-to-many: ||--o{
      expect(diagram).toContain("||--o{");
      // One-to-one: ||--||
      expect(diagram).toContain("||--||");
    });
  });
});

describe("MODERNIZATION_ONTOLOGY", () => {
  it("should have unique entity type names", () => {
    const names = MODERNIZATION_ONTOLOGY.entityTypes.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have unique relationship names", () => {
    const names = MODERNIZATION_ONTOLOGY.relationships.map((r) => r.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have relationships referencing valid entity types", () => {
    const entityNames = new Set(
      MODERNIZATION_ONTOLOGY.entityTypes.map((e) => e.name),
    );

    for (const rel of MODERNIZATION_ONTOLOGY.relationships) {
      expect(entityNames.has(rel.sourceEntityType)).toBe(true);
      expect(entityNames.has(rel.targetEntityType)).toBe(true);
    }
  });
});

describe("DATA_BINDINGS", () => {
  it("should bind to valid entity types", () => {
    const entityNames = new Set(
      MODERNIZATION_ONTOLOGY.entityTypes.map((e) => e.name),
    );

    for (const binding of DATA_BINDINGS) {
      expect(entityNames.has(binding.entityType)).toBe(true);
    }
  });
});

describe("DATA_AGENT_EXAMPLES", () => {
  it("should have SQL queries in all examples", () => {
    for (const example of DATA_AGENT_EXAMPLES) {
      expect(example.query.toUpperCase()).toMatch(/SELECT|WITH/);
    }
  });
});
