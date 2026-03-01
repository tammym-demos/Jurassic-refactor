import { getCredential } from "@jurassic/auth";

/** BYOM model configuration for Azure AI Foundry. */
export interface ModelConfig {
  /** Azure AI Foundry project endpoint (e.g., https://<project>.services.ai.azure.com). */
  projectEndpoint: string;
  /** Model deployment name (e.g., "gpt-4o"). */
  deploymentName: string;
  /** Fallback deployment name if primary is unavailable. */
  fallbackDeploymentName?: string;
  /** API version for the model endpoint. */
  apiVersion: string;
}

const DEFAULT_API_VERSION = "2024-12-01-preview";
const DEFAULT_DEPLOYMENT = "gpt-4o";

/**
 * Load model configuration from environment variables or fixture config.
 * Uses DefaultAzureCredential for authentication (no API keys).
 */
export function getModelConfig(overrides?: Partial<ModelConfig>): ModelConfig {
  const projectEndpoint =
    overrides?.projectEndpoint ?? process.env.AZURE_AI_PROJECT_ENDPOINT;

  if (!projectEndpoint) {
    throw new Error(
      "AZURE_AI_PROJECT_ENDPOINT is required. Set it in your environment or fixture config.",
    );
  }

  return {
    projectEndpoint,
    deploymentName: overrides?.deploymentName ?? DEFAULT_DEPLOYMENT,
    fallbackDeploymentName: overrides?.fallbackDeploymentName,
    apiVersion: overrides?.apiVersion ?? DEFAULT_API_VERSION,
  };
}

/**
 * Get a credential suitable for authenticating with Azure AI Foundry.
 * Re-exports the auth package credential for convenience.
 */
export { getCredential as getFoundryCredential };
