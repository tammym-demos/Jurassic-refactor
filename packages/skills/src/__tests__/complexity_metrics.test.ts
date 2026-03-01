import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ComplexityMetricsSkill } from "../complexity_metrics.js";

describe("ComplexityMetricsSkill", () => {
  let tmpDir: string;
  let skill: ComplexityMetricsSkill;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "complexity-metrics-test-"),
    );
    skill = new ComplexityMetricsSkill();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("analyzes a simple file with one function", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "simple.ts"),
      `function greet(name: string): string {
  return "hello " + name;
}
`,
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.totalFiles).toBe(1);
    expect(result.files[0].functions).toHaveLength(1);
    expect(result.files[0].functions[0].name).toBe("greet");
    expect(result.files[0].functions[0].cyclomaticComplexity).toBe(1);
    expect(result.files[0].functions[0].loc).toBeGreaterThan(0);
  });

  it("analyzes a file with multiple functions", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "multi.ts"),
      `function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

function multiply(a: number, b: number): number {
  return a * b;
}
`,
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.files[0].functions).toHaveLength(3);
    const names = result.files[0].functions.map((f) => f.name);
    expect(names).toContain("add");
    expect(names).toContain("subtract");
    expect(names).toContain("multiply");
  });

  it("computes higher complexity for nested conditions", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "complex.ts"),
      `function complex(x: number, y: number): string {
  if (x > 0) {
    if (y > 0) {
      return "both positive";
    } else if (y === 0) {
      return "x positive, y zero";
    } else {
      return "x positive, y negative";
    }
  } else if (x === 0) {
    return "x zero";
  }
  return "x negative";
}
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "simple.ts"),
      `function simple(x: number): number {
  return x + 1;
}
`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    const complexFile = result.files.find((f) => f.filePath === "complex.ts");
    const simpleFile = result.files.find((f) => f.filePath === "simple.ts");

    expect(complexFile).toBeDefined();
    expect(simpleFile).toBeDefined();
    expect(
      complexFile!.functions[0].cyclomaticComplexity,
    ).toBeGreaterThan(simpleFile!.functions[0].cyclomaticComplexity);
    expect(complexFile!.functions[0].maxNestingDepth).toBeGreaterThan(
      simpleFile!.functions[0].maxNestingDepth,
    );
  });

  it("handles an empty file", async () => {
    fs.writeFileSync(path.join(tmpDir, "empty.ts"), "");

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.totalFiles).toBe(1);
    expect(result.files[0].loc).toBe(0);
    expect(result.files[0].functions).toHaveLength(0);
    expect(result.files[0].blankLines).toBe(1); // empty string splits to one empty line
  });

  it("counts comments and blank lines", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "commented.ts"),
      `// This is a comment
/* Block comment */
function foo() {
  // inline comment
  return 1;
}

`,
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.files[0].commentLines).toBeGreaterThanOrEqual(3);
    expect(result.files[0].blankLines).toBeGreaterThanOrEqual(1);
  });

  it("supports multiple languages", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "module.js"),
      `function jsFunc() {
  if (true) {
    return 1;
  }
  return 0;
}
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "script.py"),
      `def py_func(x):
    if x > 0:
        return x
    return 0
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "main.c"),
      `int main(int argc, char** argv) {
  if (argc > 1) {
    return 0;
  }
  return 1;
}
`,
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.totalFiles).toBe(3);

    const jsFile = result.files.find((f) => f.filePath === "module.js");
    const pyFile = result.files.find((f) => f.filePath === "script.py");
    const cFile = result.files.find((f) => f.filePath === "main.c");

    expect(jsFile).toBeDefined();
    expect(jsFile!.functions).toHaveLength(1);
    expect(jsFile!.functions[0].name).toBe("jsFunc");

    expect(pyFile).toBeDefined();
    expect(pyFile!.functions).toHaveLength(1);
    expect(pyFile!.functions[0].name).toBe("py_func");

    expect(cFile).toBeDefined();
    expect(cFile!.functions).toHaveLength(1);
    expect(cFile!.functions[0].name).toBe("main");
  });

  it("ranks hotspots by cyclomatic complexity descending", async () => {
    // Create functions with varying complexity
    fs.writeFileSync(
      path.join(tmpDir, "hotspots.ts"),
      `function low() {
  return 1;
}

function medium(x: number) {
  if (x > 0) {
    return x;
  } else if (x < 0) {
    return -x;
  }
  return 0;
}

function high(a: number, b: number, c: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        return a + b + c;
      } else if (c === 0) {
        return a + b;
      }
    } else if (b === 0) {
      return a;
    }
  } else if (a === 0 && b === 0) {
    for (let i = 0; i < c; i++) {
      if (i % 2 === 0) {
        return i;
      }
    }
  }
  return 0;
}
`,
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.hotspots.length).toBeGreaterThanOrEqual(3);
    // Hotspots should be sorted descending by complexity
    for (let i = 1; i < result.hotspots.length; i++) {
      expect(result.hotspots[i - 1].cyclomaticComplexity).toBeGreaterThanOrEqual(
        result.hotspots[i].cyclomaticComplexity,
      );
    }
    // The most complex function should be first
    expect(result.hotspots[0].name).toBe("high");
  });

  it("has name complexity_metrics", () => {
    expect(skill.name).toBe("complexity_metrics");
  });

  it("filters by filePaths when provided", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "included.ts"),
      `function included() { return 1; }
`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "excluded.ts"),
      `function excluded() { return 2; }
`,
    );

    const result = await skill.execute({
      repoPath: tmpDir,
      filePaths: ["included.ts"],
    });

    expect(result.totalFiles).toBe(1);
    expect(result.files[0].filePath).toBe("included.ts");
  });
});
