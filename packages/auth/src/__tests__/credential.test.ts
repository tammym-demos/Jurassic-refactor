import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectEnvironment, getCredential } from "../credential.js";

describe("detectEnvironment", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'local' by default", () => {
    expect(detectEnvironment()).toBe("local");
  });

  it("returns 'github-actions' when GITHUB_ACTIONS is set", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    expect(detectEnvironment()).toBe("github-actions");
  });

  it("returns 'container-apps' when CONTAINER_APP_NAME is set", () => {
    vi.stubEnv("CONTAINER_APP_NAME", "my-app");
    expect(detectEnvironment()).toBe("container-apps");
  });
});

describe("getCredential", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a credential object", () => {
    const cred = getCredential();
    expect(cred).toBeDefined();
    expect(typeof cred.getToken).toBe("function");
  });
});
