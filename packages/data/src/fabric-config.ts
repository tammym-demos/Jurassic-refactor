export interface FabricConfig {
  workspaceId: string;
  lakehouseId: string;
  endpoint: string;
}

export function getFabricConfig(): FabricConfig {
  const workspaceId = process.env.FABRIC_WORKSPACE_ID ?? '';
  const lakehouseId = process.env.FABRIC_LAKEHOUSE_ID ?? '';
  const endpoint = process.env.FABRIC_ENDPOINT ?? 'https://onelake.dfs.fabric.microsoft.com';
  return { workspaceId, lakehouseId, endpoint };
}
