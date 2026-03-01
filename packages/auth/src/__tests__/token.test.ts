import { describe, it, expect } from "vitest";
import { Scopes } from "../token.js";

describe("Scopes", () => {
  it("defines cognitive services scope", () => {
    expect(Scopes.cognitiveServices).toBe("https://cognitiveservices.azure.com/.default");
  });

  it("defines cosmos DB scope", () => {
    expect(Scopes.cosmosDb).toBe("https://cosmos.azure.com/.default");
  });

  it("defines storage scope", () => {
    expect(Scopes.storage).toBe("https://storage.azure.com/.default");
  });
});
