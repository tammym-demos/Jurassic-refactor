import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModelConfig } from "../model-config.js";

describe("getModelConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when AZURE_AI_PROJECT_ENDPOINT is not set", () => {
    expect(() => getModelConfig()).toThrow("AZURE_AI_PROJECT_ENDPOINT is required");
  });

  it("returns config from environment variable", () => {
    vi.stubEnv("AZURE_AI_PROJECT_ENDPOINT", "https://my-project.services.ai.azure.com");
    const config = getModelConfig();
    expect(config.projectEndpoint).toBe("https://my-project.services.ai.azure.com");
    expect(config.deploymentName).toBe("gpt-4o");
    expect(config.apiVersion).toBe("2024-12-01-preview");
  });

  it("accepts overrides", () => {
    const config = getModelConfig({
      projectEndpoint: "https://test.services.ai.azure.com",
      deploymentName: "gpt-4o-mini",
      fallbackDeploymentName: "gpt-4o",
    });
    expect(config.projectEndpoint).toBe("https://test.services.ai.azure.com");
    expect(config.deploymentName).toBe("gpt-4o-mini");
    expect(config.fallbackDeploymentName).toBe("gpt-4o");
  });
});
