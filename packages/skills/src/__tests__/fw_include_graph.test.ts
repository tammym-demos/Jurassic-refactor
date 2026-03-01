import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fwIncludeGraphSkill } from "../fw_include_graph.js";
import type { FwIncludeGraphOutput } from "../fw_include_graph.js";

describe("fw_include_graph skill", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "fw-graph-"));
    const fwDir = join(repoPath, "Firmware");
    await mkdir(fwDir, { recursive: true });

    await writeFile(join(fwDir, "main.c"), '#include "hal.h"\n');
    await writeFile(join(fwDir, "hal.h"), '#include "types.h"\n');
    await writeFile(join(fwDir, "types.h"), "// no includes\n");
    await writeFile(join(fwDir, "circular_a.h"), '#include "circular_b.h"\n');
    await writeFile(join(fwDir, "circular_b.h"), '#include "circular_a.h"\n');
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("has the correct skill name", () => {
    expect(fwIncludeGraphSkill.name).toBe("fw_include_graph");
  });

  it("finds all 5 firmware files", async () => {
    const result = (await fwIncludeGraphSkill.execute({
      repoPath,
    })) as FwIncludeGraphOutput;
    expect(result.nodes).toHaveLength(5);
    expect(result.stats.totalFiles).toBe(5);
  });

  it("detects correct number of edges", async () => {
    const result = (await fwIncludeGraphSkill.execute({
      repoPath,
    })) as FwIncludeGraphOutput;
    // main.c -> hal.h, hal.h -> types.h, circular_a.h -> circular_b.h, circular_b.h -> circular_a.h
    expect(result.edges).toHaveLength(4);
    expect(result.stats.totalIncludes).toBe(4);
  });

  it("detects the circular dependency between circular_a.h and circular_b.h", async () => {
    const result = (await fwIncludeGraphSkill.execute({
      repoPath,
    })) as FwIncludeGraphOutput;

    const cycleScc = result.sccs.filter((scc) => scc.length > 1);
    expect(cycleScc).toHaveLength(1);
    expect(cycleScc[0]).toHaveLength(2);

    const sorted = [...cycleScc[0]].sort();
    expect(sorted).toEqual(["circular_a.h", "circular_b.h"]);
  });

  it("non-circular files form single-node SCCs", async () => {
    const result = (await fwIncludeGraphSkill.execute({
      repoPath,
    })) as FwIncludeGraphOutput;

    const singleSccs = result.sccs.filter((scc) => scc.length === 1);
    // main.c, hal.h, types.h each in their own SCC
    expect(singleSccs).toHaveLength(3);
  });

  it("reports correct stats", async () => {
    const result = (await fwIncludeGraphSkill.execute({
      repoPath,
    })) as FwIncludeGraphOutput;

    expect(result.stats).toEqual({
      totalFiles: 5,
      totalIncludes: 4,
      cycleCount: 1,
    });
  });

  it("supports custom firmwareDir", async () => {
    const customDir = join(repoPath, "custom_fw");
    await mkdir(customDir, { recursive: true });
    await writeFile(join(customDir, "app.c"), "// empty\n");

    const result = (await fwIncludeGraphSkill.execute({
      repoPath,
      firmwareDir: "custom_fw",
    })) as FwIncludeGraphOutput;

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toBe("app.c");
    expect(result.edges).toHaveLength(0);
  });
});
