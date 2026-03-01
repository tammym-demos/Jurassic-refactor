import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SafetyPathAnalysisSkill } from "../safety_path_analysis.js";

describe("SafetyPathAnalysisSkill", () => {
  let tmpDir: string;
  let skill: SafetyPathAnalysisSkill;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "safety-path-analysis-test-"),
    );
    skill = new SafetyPathAnalysisSkill();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has name safety_path_analysis", () => {
    expect(skill.name).toBe("safety_path_analysis");
  });

  it("detects C interrupt handler", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "irq.c"),
      'void __interrupt timer_isr(void) {\n  count++;\n}\n',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.safetyIndicators.length).toBeGreaterThanOrEqual(1);
    const irq = result.safetyIndicators.find(
      (i) => i.type === "interrupt_handler",
    );
    expect(irq).toBeDefined();
    expect(irq!.filePath).toBe("irq.c");
    expect(irq!.line).toBe(1);
    expect(irq!.severityMultiplier).toBeGreaterThanOrEqual(3.5);
  });

  it("detects watchdog pattern", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "wdt.c"),
      'void setup(void) {\n  IWDG->KR = 0xCCCC;\n  WWDG->CR = 0x7F;\n}\n',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    const watchdogs = result.safetyIndicators.filter(
      (i) => i.type === "watchdog",
    );
    expect(watchdogs.length).toBe(2);
    expect(watchdogs[0].severityMultiplier).toBe(4.5);
  });

  it("detects Python signal handler", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "handler.py"),
      'import signal\nsignal.signal(signal.SIGTERM, cleanup)\n',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    const sig = result.safetyIndicators.find(
      (i) => i.type === "signal_handler",
    );
    expect(sig).toBeDefined();
    expect(sig!.filePath).toBe("handler.py");
    expect(sig!.line).toBe(2);
  });

  it("groups nearby indicators into zones", async () => {
    const lines = [
      "void init(void) {",
      "  __disable_irq();",
      "  mutex lock;",
      "  // setup code",
      "  __enable_irq();",
      "}",
      "",
      // 50 blank lines to force separation
      ...Array(50).fill(""),
      "void other(void) {",
      "  abort();",
      "}",
    ];
    fs.writeFileSync(path.join(tmpDir, "zones.c"), lines.join("\n"));

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.safetyZones.length).toBe(2);
    // First zone should contain disable_irq, mutex, enable_irq
    const firstZone = result.safetyZones.find((z) => z.startLine <= 5);
    expect(firstZone).toBeDefined();
    expect(firstZone!.indicators.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty results for empty directory", async () => {
    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.totalFilesScanned).toBe(0);
    expect(result.safetyIndicators).toEqual([]);
    expect(result.safetyZones).toEqual([]);
    expect(result.highRiskFiles).toEqual([]);
  });

  it("calculates aggregate severity correctly", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "critical.c"),
      'void isr(void) {\n  __disable_irq();\n  mutex m;\n  __enable_irq();\n}\n',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.safetyZones.length).toBe(1);
    // __disable_irq and __enable_irq have severity 5.0
    expect(result.safetyZones[0].aggregateSeverity).toBe(5.0);
  });

  it("filters to high-risk files only", async () => {
    // High-risk file (severity 5.0)
    fs.writeFileSync(
      path.join(tmpDir, "danger.c"),
      'void f(void) {\n  __disable_irq();\n}\n',
    );
    // Low-risk file (severity 2.5)
    fs.writeFileSync(
      path.join(tmpDir, "mild.c"),
      'void g(void) {\n  mutex m;\n}\n',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    // highRiskFiles threshold is > 3.0
    expect(result.highRiskFiles).toContain("danger.c");
    expect(result.highRiskFiles).not.toContain("mild.c");
  });

  it("skips node_modules and .git directories", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "dep.c"),
      "__disable_irq();\n",
    );
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".git", "hook.c"),
      "__disable_irq();\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "main.c"),
      'int main() { return 0; }\n',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.totalFilesScanned).toBe(1);
    expect(result.safetyIndicators.length).toBe(0);
  });
});
