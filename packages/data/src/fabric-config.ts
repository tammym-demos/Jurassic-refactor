import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FabricConfig {
  workspaceId: string;
  lakehouseId: string;
  endpoint: string;
}

// Default values from infra/data.config.json
const DEFAULT_WORKSPACE_ID = 'aac91a30-f5cd-4297-9394-14c5968f1748';
const DEFAULT_LAKEHOUSE_ID = '2bbfd781-0d8e-419a-954f-75d0565e056c';
const DEFAULT_ENDPOINT = 'https://onelake.dfs.fabric.microsoft.com';

let cachedConfig: FabricConfig | null = null;

function loadConfigFromFile(): Partial<FabricConfig> {
  try {
    // Try to load from infra/data.config.json relative to workspace root
    const configPaths = [
      path.join(process.cwd(), 'infra', 'data.config.json'),
      path.join(__dirname, '..', '..', '..', '..', 'infra', 'data.config.json'),
    ];
    
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        return config.fabric ?? {};
      }
    }
  } catch {
    // Ignore file read errors, fall back to defaults
  }
  return {};
}

export function getFabricConfig(): FabricConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const fileConfig = loadConfigFromFile();
  
  // Environment variables take precedence, then file config, then defaults
  const workspaceId = process.env.FABRIC_WORKSPACE_ID || fileConfig.workspaceId || DEFAULT_WORKSPACE_ID;
  const lakehouseId = process.env.FABRIC_LAKEHOUSE_ID || fileConfig.lakehouseId || DEFAULT_LAKEHOUSE_ID;
  const endpoint = process.env.FABRIC_ENDPOINT || fileConfig.endpoint || DEFAULT_ENDPOINT;
  
  cachedConfig = { workspaceId, lakehouseId, endpoint };
  return cachedConfig;
}

export function clearFabricConfigCache(): void {
  cachedConfig = null;
}
