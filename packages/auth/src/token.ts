import type { TokenCredential } from "@azure/identity";
import { getCredential } from "./credential.js";

/** Well-known Azure service scopes. */
export const Scopes = {
  cognitiveServices: "https://cognitiveservices.azure.com/.default",
  cosmosDb: "https://cosmos.azure.com/.default",
  storage: "https://storage.azure.com/.default",
} as const;

/**
 * Acquire an access token for Azure AI Foundry model endpoints.
 */
export async function getModelToken(credential?: TokenCredential): Promise<string> {
  const cred = credential ?? getCredential();
  const token = await cred.getToken(Scopes.cognitiveServices);
  if (!token) throw new Error("Failed to acquire token for Cognitive Services");
  return token.token;
}

/**
 * Acquire an access token for Cosmos DB.
 */
export async function getCosmosToken(credential?: TokenCredential): Promise<string> {
  const cred = credential ?? getCredential();
  const token = await cred.getToken(Scopes.cosmosDb);
  if (!token) throw new Error("Failed to acquire token for Cosmos DB");
  return token.token;
}

/**
 * Acquire an access token for Azure Storage (OneLake / Fabric DLS Gen2).
 */
export async function getStorageToken(credential?: TokenCredential): Promise<string> {
  const cred = credential ?? getCredential();
  const token = await cred.getToken(Scopes.storage);
  if (!token) throw new Error("Failed to acquire token for Azure Storage");
  return token.token;
}
