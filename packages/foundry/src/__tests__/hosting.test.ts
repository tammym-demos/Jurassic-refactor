import { describe, it, expect, vi, beforeEach } from "vitest";
import { HostingService, HostingConfig } from "../hosting.js";

function makeConfig(overrides?: Partial<HostingConfig>): HostingConfig {
  return {
    subscriptionId: "sub-123",
    resourceGroup: "rg-test",
    registryName: "myregistry",
    containerAppName: "my-app",
    containerAppEnvName: "my-env",
    imageName: "agent",
    imageTag: "latest",
    location: "eastus",
    port: 8080,
    ...overrides,
  };
}

describe("HostingService", () => {
  let mockExec: ReturnType<typeof vi.fn>;
  let service: HostingService;

  beforeEach(() => {
    mockExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    service = new HostingService(mockExec as never);
  });

  it("buildAndPush constructs correct az command", async () => {
    const config = makeConfig();
    const step = await service.buildAndPush(config);

    expect(step.status).toBe("success");
    expect(step.name).toBe("buildAndPush");
    expect(mockExec).toHaveBeenCalledWith("az", [
      "acr",
      "build",
      "--registry",
      "myregistry",
      "--image",
      "agent:latest",
      ".",
    ]);
  });

  it("deployContainerApp uses correct parameters", async () => {
    const config = makeConfig({ cpu: "1.0", memory: "2.0Gi" });
    const step = await service.deployContainerApp(config);

    expect(step.status).toBe("success");
    expect(mockExec).toHaveBeenCalledWith("az", expect.arrayContaining([
      "containerapp",
      "create",
      "--name",
      "my-app",
      "--resource-group",
      "rg-test",
      "--environment",
      "my-env",
      "--image",
      "myregistry.azurecr.io/agent:latest",
      "--cpu",
      "1.0",
      "--memory",
      "2.0Gi",
    ]));
  });

  it("configureIngress sets port correctly", async () => {
    const config = makeConfig({ port: 3000 });
    const step = await service.configureIngress(config);

    expect(step.status).toBe("success");
    expect(mockExec).toHaveBeenCalledWith("az", [
      "containerapp",
      "ingress",
      "enable",
      "--name",
      "my-app",
      "--resource-group",
      "rg-test",
      "--target-port",
      "3000",
      "--type",
      "external",
    ]);
  });

  it("deploy orchestrates all steps in order", async () => {
    mockExec.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("show")) {
        return Promise.resolve({ stdout: "my-app.azurecontainerapps.io", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const config = makeConfig();
    const result = await service.deploy(config);

    expect(result.status).toBe("success");
    expect(result.appUrl).toBe("https://my-app.azurecontainerapps.io");
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.name)).toEqual([
      "validatePrerequisites",
      "buildAndPush",
      "deployContainerApp",
      "configureIngress",
    ]);
    result.steps.forEach((s) => expect(s.status).toBe("success"));
  });

  it("deployment stops on step failure", async () => {
    mockExec
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // az version
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // az account set
      .mockRejectedValueOnce(new Error("ACR build failed")); // buildAndPush fails

    const config = makeConfig();
    const result = await service.deploy(config);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("ACR build failed");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].name).toBe("validatePrerequisites");
    expect(result.steps[1].name).toBe("buildAndPush");
    expect(result.steps[1].status).toBe("failed");
  });

  it("getAppUrl extracts FQDN from az output", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "my-app.azurecontainerapps.io\n",
      stderr: "",
    });

    const config = makeConfig();
    const url = await service.getAppUrl(config);

    expect(url).toBe("https://my-app.azurecontainerapps.io");
    expect(mockExec).toHaveBeenCalledWith("az", [
      "containerapp",
      "show",
      "--name",
      "my-app",
      "--resource-group",
      "rg-test",
      "--query",
      "properties.configuration.ingress.fqdn",
      "--output",
      "tsv",
    ]);
  });

  it("validatePrerequisites checks az CLI", async () => {
    mockExec.mockRejectedValueOnce(new Error("az not found"));

    const config = makeConfig();
    const step = await service.validatePrerequisites(config);

    expect(step.status).toBe("failed");
    expect(step.name).toBe("validatePrerequisites");
    expect(step.error).toBe("az not found");
  });
});
