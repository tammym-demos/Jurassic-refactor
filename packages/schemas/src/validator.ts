import AjvModule from "ajv";
import type { ValidateFunction, ErrorObject } from "ajv";
import addFormatsModule from "ajv-formats";

// CJS/ESM interop - ajv exports its constructor as .default
const Ajv = AjvModule.default ?? AjvModule;
const addFormats = (addFormatsModule.default ?? addFormatsModule) as (
  ajv: InstanceType<typeof Ajv>,
) => void;
import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** All recognized artifact schema names. */
export type ArtifactName =
  | "Manifest"
  | "RunLogEvent"
  | "DependencyGraph"
  | "RiskAssessment"
  | "DocCoverage"
  | "StackAnalysis"
  | "MigrationOptions"
  | "UserDecisions"
  | "ModernizationPlan"
  | "ImplementationLog"
  | "TestScaffold";

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[] | null;
}

const SCHEMAS_DIR = join(__dirname, "..", "..", "..", "specs", "schemas");

let ajvInstance: InstanceType<typeof Ajv> | null = null;
const validators = new Map<string, ValidateFunction>();

function getAjv(): InstanceType<typeof Ajv> {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false });
    addFormats(ajvInstance);
    loadSchemas(ajvInstance);
  }
  return ajvInstance;
}

function loadSchemas(ajv: InstanceType<typeof Ajv>): void {
  const files = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith(".schema.json"));
  for (const file of files) {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), "utf-8"));
    const name = basename(file, ".schema.json");
    const validate = ajv.compile(schema);
    validators.set(name, validate);
  }
}

/**
 * Validate artifact data against its JSON schema.
 * @returns true if valid, throws with detailed errors if invalid.
 */
export function validateArtifact(schemaName: ArtifactName, data: unknown): boolean {
  const ajv = getAjv();
  const validate = validators.get(schemaName);

  if (!validate) {
    const available = Array.from(validators.keys()).join(", ");
    throw new Error(`Unknown schema "${schemaName}". Available: ${available}`);
  }

  const valid = validate(data);
  if (!valid) {
    const errorText = ajv.errorsText(validate.errors, { separator: "; " });
    throw new Error(`Validation failed for ${schemaName}: ${errorText}`);
  }

  return true;
}

/**
 * Validate artifact data without throwing — returns a result object.
 */
export function validateArtifactSafe(schemaName: ArtifactName, data: unknown): ValidationResult {
  getAjv();
  const validate = validators.get(schemaName);

  if (!validate) {
    return {
      valid: false,
      errors: [{ message: `Unknown schema: ${schemaName}` } as ErrorObject],
    };
  }

  const valid = validate(data) as boolean;
  return { valid, errors: valid ? null : (validate.errors ?? null) };
}

/**
 * Get the list of all loaded schema names.
 */
export function getSchemaNames(): string[] {
  getAjv();
  return Array.from(validators.keys());
}
