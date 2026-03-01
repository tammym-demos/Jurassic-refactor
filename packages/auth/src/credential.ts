import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";

export type Environment = "local" | "github-actions" | "container-apps";

/**
 * Detect the current runtime environment.
 */
export function detectEnvironment(): Environment {
  if (process.env.GITHUB_ACTIONS === "true") {
    return "github-actions";
  }
  if (process.env.CONTAINER_APP_NAME) {
    return "container-apps";
  }
  return "local";
}

/**
 * Get an Azure TokenCredential appropriate for the current environment.
 * In production (Container Apps), uses ManagedIdentityCredential directly.
 * Otherwise, uses DefaultAzureCredential which chains multiple credential types.
 */
export function getCredential(): TokenCredential {
  const env = detectEnvironment();

  if (env === "container-apps" && process.env.AZURE_CLIENT_ID) {
    return new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID);
  }

  return new DefaultAzureCredential();
}
