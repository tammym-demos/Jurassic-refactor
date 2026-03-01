import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryService } from '../telemetry.js';

describe('TelemetryService', () => {
  beforeEach(() => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  });

  it('should be a no-op when no connection string is set', () => {
    const svc = new TelemetryService();
    // Should not throw
    svc.trackAgentEvent('agent', 'start');
    svc.trackSkillInvocation('skill', 100, true);
    svc.trackRunCompletion('run-1', 'agent', true, 500);
  });

  it('trackAgentEvent should not throw', () => {
    const svc = new TelemetryService();
    expect(() => svc.trackAgentEvent('agent', 'event', { key: 'val' })).not.toThrow();
  });

  it('trackSkillInvocation should not throw', () => {
    const svc = new TelemetryService();
    expect(() => svc.trackSkillInvocation('skill', 42, false)).not.toThrow();
  });

  it('trackRunCompletion should not throw', () => {
    const svc = new TelemetryService();
    expect(() => svc.trackRunCompletion('run-1', 'agent', true, 1000)).not.toThrow();
  });

  it('flush should resolve without error', async () => {
    const svc = new TelemetryService();
    await expect(svc.flush()).resolves.toBeUndefined();
  });
});
