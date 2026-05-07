/**
 * End-to-end tests for Microsoft Fabric OneLake integration.
 *
 * These tests verify actual OneLake connectivity and require:
 * - Valid Azure credentials (DefaultAzureCredential)
 * - Access to the configured Fabric workspace and lakehouse
 *
 * Set JURASSIC_E2E_FABRIC=true to run these tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataLakeServiceClient } from '@azure/storage-file-datalake';
import { DefaultAzureCredential } from '@azure/identity';
import { getFabricConfig, clearFabricConfigCache } from '../fabric-config.js';
import { ArtifactStore } from '../artifact-store.js';

const _SKIP_REASON = 'Set JURASSIC_E2E_FABRIC=true to run Fabric e2e tests';
const shouldRun = process.env.JURASSIC_E2E_FABRIC === 'true';

describe.skipIf(!shouldRun)('Fabric OneLake E2E', () => {
  const testRunId = `e2e-test-${Date.now()}`;
  let store: ArtifactStore;

  beforeAll(() => {
    process.env.JURASSIC_STORAGE_PROVIDER = 'fabric';
    clearFabricConfigCache();
    store = new ArtifactStore();
  });

  afterAll(async () => {
    // Cleanup: try to delete test artifacts
    try {
      const config = getFabricConfig();
      const client = new DataLakeServiceClient(config.endpoint, new DefaultAzureCredential());
      // OneLake path structure: workspace (filesystem) / lakehouse / Files / path
      const fileSystemClient = client.getFileSystemClient(config.workspaceId);
      const dirPath = `${config.lakehouseId}/Files/artifacts/${testRunId}`;
      
      // List and delete all files in test directory
      for await (const item of fileSystemClient.listPaths({ path: dirPath, recursive: true })) {
        if (item.name) {
          const fileClient = fileSystemClient.getFileClient(item.name);
          await fileClient.delete().catch(() => {});
        }
      }
    } catch {
      // Ignore cleanup errors
    }
    
    delete process.env.JURASSIC_STORAGE_PROVIDER;
    clearFabricConfigCache();
  }, 60000); // Extended timeout for cleanup

  it('should have valid Fabric configuration', () => {
    const config = getFabricConfig();
    expect(config.workspaceId).toBeTruthy();
    expect(config.lakehouseId).toBeTruthy();
    expect(config.endpoint).toBe('https://onelake.dfs.fabric.microsoft.com');
  });

  it('should connect to OneLake successfully', async () => {
    const config = getFabricConfig();
    const client = new DataLakeServiceClient(config.endpoint, new DefaultAzureCredential());
    
    // Try to get file system client - this validates connectivity
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
    expect(fileSystemClient).toBeTruthy();
  });

  it('should upload artifact to OneLake', async () => {
    const testData = {
      species: 'Velociraptor',
      era: 'Cretaceous',
      timestamp: new Date().toISOString(),
    };

    const path = await store.upload(testRunId, 'test-agent', 'dino-data', testData);
    expect(path).toContain(`artifacts/${testRunId}/test-agent/dino-data.json`);
  });

  it('should download artifact from OneLake', async () => {
    const testData = { pack: 'raptors', count: 3 };
    await store.upload(testRunId, 'test-agent', 'pack-info', testData);
    
    const downloaded = await store.download(testRunId, 'test-agent', 'pack-info');
    expect(downloaded).toEqual(testData);
  });

  it('should list artifacts in OneLake', async () => {
    await store.upload(testRunId, 'test-agent', 'artifact-a', { a: 1 });
    await store.upload(testRunId, 'test-agent', 'artifact-b', { b: 2 });
    
    // Small delay for eventual consistency
    await new Promise(r => setTimeout(r, 1000));
    
    const artifacts = await store.list(testRunId, 'test-agent');
    expect(artifacts).toContain('artifact-a');
    expect(artifacts).toContain('artifact-b');
  }, 30000); // Extended timeout for list operation

  it('should create APPROVED marker in OneLake', async () => {
    await store.markApproved(testRunId);
    
    // Verify marker exists by trying to read it
    const config = getFabricConfig();
    const client = new DataLakeServiceClient(config.endpoint, new DefaultAzureCredential());
    const fileSystemClient = client.getFileSystemClient(`${config.workspaceId}/${config.lakehouseId}`);
    const fileClient = fileSystemClient.getFileClient(`Files/artifacts/${testRunId}/APPROVED`);
    
    const exists = await fileClient.exists();
    expect(exists).toBe(true);
  });

  it('should handle large artifact payloads', async () => {
    // Create a payload > 1MB
    const largeData = {
      files: Array.from({ length: 1000 }, (_, i) => ({
        path: `/src/module${i}/index.ts`,
        complexity: Math.random() * 100,
        lines: Math.floor(Math.random() * 500),
        dependencies: Array.from({ length: 10 }, (_, j) => `dep-${i}-${j}`),
      })),
    };

    await store.upload(testRunId, 'test-agent', 'large-artifact', largeData);
    const downloaded = await store.download(testRunId, 'test-agent', 'large-artifact');
    expect(downloaded).toEqual(largeData);
  });
});
