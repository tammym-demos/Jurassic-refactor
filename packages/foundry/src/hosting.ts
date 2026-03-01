import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HostingConfig {
  subscriptionId: string;
  resourceGroup: string;
  registryName: string;
  containerAppName: string;
  containerAppEnvName: string;
  imageName: string;
  imageTag: string;
  location: string;
  port: number;
  envVars?: Record<string, string>;
  cpu?: string;
  memory?: string;
}

export interface DeploymentResult {
  status: "success" | "failed";
  imageUri: string;
  appUrl?: string;
  error?: string;
  steps: DeploymentStep[];
}

export interface DeploymentStep {
  name: string;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  output?: string;
  error?: string;
}

type ExecFn = typeof execFileAsync;

export class HostingService {
  private exec: ExecFn;

  constructor(exec?: ExecFn) {
    this.exec = exec ?? execFileAsync;
  }

  async validatePrerequisites(config: HostingConfig): Promise<DeploymentStep> {
    const start = Date.now();
    try {
      await this.exec("az", ["version"]);
      await this.exec("az", [
        "account",
        "set",
        "--subscription",
        config.subscriptionId,
      ]);
      return {
        name: "validatePrerequisites",
        status: "success",
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: "validatePrerequisites",
        status: "failed",
        durationMs: Date.now() - start,
        error: message,
      };
    }
  }

  async buildAndPush(config: HostingConfig): Promise<DeploymentStep> {
    const start = Date.now();
    try {
      const { stdout } = await this.exec("az", [
        "acr",
        "build",
        "--registry",
        config.registryName,
        "--image",
        `${config.imageName}:${config.imageTag}`,
        ".",
      ]);
      return {
        name: "buildAndPush",
        status: "success",
        durationMs: Date.now() - start,
        output: stdout,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: "buildAndPush",
        status: "failed",
        durationMs: Date.now() - start,
        error: message,
      };
    }
  }

  async deployContainerApp(config: HostingConfig): Promise<DeploymentStep> {
    const start = Date.now();
    const imageUri = `${config.registryName}.azurecr.io/${config.imageName}:${config.imageTag}`;
    const args = [
      "containerapp",
      "create",
      "--name",
      config.containerAppName,
      "--resource-group",
      config.resourceGroup,
      "--environment",
      config.containerAppEnvName,
      "--image",
      imageUri,
      "--target-port",
      String(config.port),
      "--ingress",
      "external",
      "--cpu",
      config.cpu ?? "0.5",
      "--memory",
      config.memory ?? "1.0Gi",
    ];

    if (config.envVars) {
      const envPairs = Object.entries(config.envVars)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      args.push("--env-vars", envPairs);
    }

    try {
      const { stdout } = await this.exec("az", args);
      return {
        name: "deployContainerApp",
        status: "success",
        durationMs: Date.now() - start,
        output: stdout,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: "deployContainerApp",
        status: "failed",
        durationMs: Date.now() - start,
        error: message,
      };
    }
  }

  async configureIngress(config: HostingConfig): Promise<DeploymentStep> {
    const start = Date.now();
    try {
      const { stdout } = await this.exec("az", [
        "containerapp",
        "ingress",
        "enable",
        "--name",
        config.containerAppName,
        "--resource-group",
        config.resourceGroup,
        "--target-port",
        String(config.port),
        "--type",
        "external",
      ]);
      return {
        name: "configureIngress",
        status: "success",
        durationMs: Date.now() - start,
        output: stdout,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: "configureIngress",
        status: "failed",
        durationMs: Date.now() - start,
        error: message,
      };
    }
  }

  async getAppUrl(config: HostingConfig): Promise<string> {
    const { stdout } = await this.exec("az", [
      "containerapp",
      "show",
      "--name",
      config.containerAppName,
      "--resource-group",
      config.resourceGroup,
      "--query",
      "properties.configuration.ingress.fqdn",
      "--output",
      "tsv",
    ]);
    return `https://${stdout.trim()}`;
  }

  async deploy(config: HostingConfig): Promise<DeploymentResult> {
    const steps: DeploymentStep[] = [];
    const imageUri = `${config.registryName}.azurecr.io/${config.imageName}:${config.imageTag}`;

    const validateStep = await this.validatePrerequisites(config);
    steps.push(validateStep);
    if (validateStep.status === "failed") {
      return { status: "failed", imageUri, error: validateStep.error, steps };
    }

    const buildStep = await this.buildAndPush(config);
    steps.push(buildStep);
    if (buildStep.status === "failed") {
      return { status: "failed", imageUri, error: buildStep.error, steps };
    }

    const deployStep = await this.deployContainerApp(config);
    steps.push(deployStep);
    if (deployStep.status === "failed") {
      return { status: "failed", imageUri, error: deployStep.error, steps };
    }

    const ingressStep = await this.configureIngress(config);
    steps.push(ingressStep);
    if (ingressStep.status === "failed") {
      return { status: "failed", imageUri, error: ingressStep.error, steps };
    }

    try {
      const appUrl = await this.getAppUrl(config);
      return { status: "success", imageUri, appUrl, steps };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "failed", imageUri, error: message, steps };
    }
  }
}
