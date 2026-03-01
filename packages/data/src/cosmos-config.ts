export interface CosmosConfig {
  endpoint: string;
  databaseId: string;
  containerId: string;
}

export function getCosmosConfig(): CosmosConfig {
  return {
    endpoint: process.env.COSMOS_ENDPOINT ?? '',
    databaseId: process.env.COSMOS_DATABASE_ID ?? 'jurassic',
    containerId: process.env.COSMOS_CONTAINER_ID ?? 'runs',
  };
}
