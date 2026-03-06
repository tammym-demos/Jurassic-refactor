import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FabricConfig {
  workspaceId: string;
  lakehouseId: string;
  endpoint: string;
}

// Default values from infra/data.config.json (jcdemo workspace / cms_lakehouse)
const DEFAULT_WORKSPACE_ID = 'da35acf0-cf50-4977-ba4d-3b14155cc434';
const DEFAULT_LAKEHOUSE_ID = '61d96c84-c43a-48a1-9fe2-5cc79772bc63';
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
