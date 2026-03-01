# Safety Path Analysis

## Overview

Identifies safety-critical code paths such as interrupt handlers, watchdog timers, fail-safe mechanisms, and critical sections. Flags high-risk modification zones and feeds into RiskAssessment with a safety severity multiplier.

## Interfaces

### SafetyPathInput

```typescript
interface SafetyPathInput {
  repoPath: string;       // Local path to the repository
  filePaths?: string[];   // Optional subset of files to scan
}
```

### SafetyIndicator

```typescript
interface SafetyIndicator {
  type: "interrupt_handler" | "watchdog" | "fail_safe" | "critical_section" | "error_handler" | "signal_handler";
  pattern: string;            // Regex pattern that matched
  filePath: string;           // Relative file path
  line: number;               // 1-based line number
  context: string;            // Surrounding code snippet (±2 lines)
  severityMultiplier: number; // 1.0–5.0
}
```

### SafetyZone

```typescript
interface SafetyZone {
  filePath: string;
  startLine: number;
  endLine: number;
  indicators: SafetyIndicator[];
  aggregateSeverity: number;   // Max severity of contained indicators
  recommendation: string;      // Human-readable guidance
}
```

### SafetyPathOutput

```typescript
interface SafetyPathOutput {
  totalFilesScanned: number;
  safetyIndicators: SafetyIndicator[];
  safetyZones: SafetyZone[];
  highRiskFiles: string[];     // Files with zone severity > 3.0
}
```

## Behavior

- Implements the `Skill` interface with `name = "safety_path_analysis"`
- `execute()` walks the directory tree at `repoPath` scanning for safety-critical patterns
- Skips common directories: `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`
- Supports file types: `.c`, `.cpp`, `.h`, `.py`, `.ts`, `.js`
- If `filePaths` is provided, only those files are scanned instead of the full tree

## Safety Patterns

### C/C++
- `__interrupt` — interrupt handler (severity 4.0)
- `ISR(` — interrupt service routine (severity 4.0)
- `void *_Handler` — ARM-style interrupt handler (severity 3.5)
- `IWDG`, `WWDG` — watchdog timers (severity 4.5)
- `__disable_irq`, `__enable_irq` — critical sections (severity 5.0)
- `critical_section`, `mutex`, `semaphore` — concurrency primitives (severity 2.5–3.5)

### Python
- `signal.signal` — signal handler registration (severity 3.5)
- `atexit.register` — exit handler (severity 3.0)
- `sys.exit` — process termination (severity 2.5)

### General
- `fail_safe`, `emergency`, `shutdown`, `abort`, `panic` — safety-critical keywords (severity 3.0–4.5)

## Zone Grouping

- Indicators within 20 lines of each other in the same file are grouped into a single safety zone
- Aggregate severity is the maximum severity of all indicators in the zone
- Recommendations are generated based on aggregate severity:
  - ≥ 4.5: Critical safety zone — requires dedicated safety review
  - ≥ 3.5: High-risk safety zone — domain expert review recommended
  - ≥ 2.5: Moderate safety zone — ensure adequate test coverage
  - < 2.5: Low-risk zone — standard review process

## High-Risk File Detection

Files are flagged as high-risk when they contain at least one safety zone with aggregate severity greater than 3.0. The `highRiskFiles` list feeds into the RiskAssessment pipeline as a safety severity multiplier.
