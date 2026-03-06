import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFabricConfig, clearFabricConfigCache } from '../fabric-config.js';

describe('fabric-config', () => {
  const originalWorkspaceId = process.env.FABRIC_WORKSPACE_ID;
  const originalLakehouseId = process.env.FABRIC_LAKEHOUSE_ID;
  const originalEndpoint = process.env.FABRIC_ENDPOINT;

  beforeEach(() => {
    delete process.env.FABRIC_WORKSPACE_ID;
    delete process.env.FABRIC_LAKEHOUSE_ID;
    delete process.env.FABRIC_ENDPOINT;
    clearFabricConfigCache();
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalWorkspaceId !== undefined) {
      process.env.FABRIC_WORKSPACE_ID = originalWorkspaceId;
    } else {
      delete process.env.FABRIC_WORKSPACE_ID;
    }
    if (originalLakehouseId !== undefined) {
      process.env.FABRIC_LAKEHOUSE_ID = originalLakehouseId;
    } else {
      delete process.env.FABRIC_LAKEHOUSE_ID;
    }
    if (originalEndpoint !== undefined) {
      process.env.FABRIC_ENDPOINT = originalEndpoint;
    } else {
      delete process.env.FABRIC_ENDPOINT;
    }
    clearFabricConfigCache();
  });

  it('should return default values when env vars are not set', () => {
    const config = getFabricConfig();
    expect(config.workspaceId).toBe('aac91a30-f5cd-4297-9394-14c5968f1748');
    expect(config.lakehouseId).toBe('2bbfd781-0d8e-419a-954f-75d0565e056c');
    expect(config.endpoint).toBe('https://onelake.dfs.fabric.microsoft.com');
  });

  it('should use environment variables when set', () => {
    process.env.FABRIC_WORKSPACE_ID = 'custom-workspace-id';
    process.env.FABRIC_LAKEHOUSE_ID = 'custom-lakehouse-id';
    process.env.FABRIC_ENDPOINT = 'https://custom.endpoint.com';
    clearFabricConfigCache();

    const config = getFabricConfig();
    expect(config.workspaceId).toBe('custom-workspace-id');
    expect(config.lakehouseId).toBe('custom-lakehouse-id');
    expect(config.endpoint).toBe('https://custom.endpoint.com');
  });

  it('should cache config values', () => {
    const config1 = getFabricConfig();
    process.env.FABRIC_WORKSPACE_ID = 'changed-workspace-id';
    const config2 = getFabricConfig();

    // Should return cached values, not the changed env var
    expect(config2.workspaceId).toBe(config1.workspaceId);
  });

  it('should refresh config after cache clear', () => {
    getFabricConfig(); // Populate cache
    process.env.FABRIC_WORKSPACE_ID = 'new-workspace-id';
    clearFabricConfigCache();

    const config = getFabricConfig();
    expect(config.workspaceId).toBe('new-workspace-id');
  });

  it('should allow partial env var overrides', () => {
    process.env.FABRIC_WORKSPACE_ID = 'override-workspace';
    clearFabricConfigCache();

    const config = getFabricConfig();
    expect(config.workspaceId).toBe('override-workspace');
    expect(config.lakehouseId).toBe('2bbfd781-0d8e-419a-954f-75d0565e056c'); // Default
    expect(config.endpoint).toBe('https://onelake.dfs.fabric.microsoft.com'); // Default
  });
});
