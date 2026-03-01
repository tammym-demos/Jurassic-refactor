// Approval gate - checks APPROVED marker before Implementation Agent proceeds

import * as fs from "node:fs";
import * as path from "node:path";

export class ApprovalGate {
  /**
   * Check whether an APPROVED marker file exists in the given artifact directory.
   * Returns approved: true if the file exists, false otherwise.
   */
  static check(artifactDir: string): { approved: boolean; markerPath: string; error?: string } {
    const markerPath = path.join(artifactDir, "APPROVED");
    try {
      if (fs.existsSync(markerPath)) {
        return { approved: true, markerPath };
      }
      return {
        approved: false,
        markerPath,
        error: `APPROVED marker not found at ${markerPath}. Run approval step first.`,
      };
    } catch (err) {
      return {
        approved: false,
        markerPath,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
