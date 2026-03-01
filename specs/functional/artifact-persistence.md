# Artifact Persistence

**TL;DR:** Artifacts are persisted in a dual-mode storage system — local filesystem by default, Microsoft Fabric OneLake in the future. The `ArtifactStore` class (`packages/data/src/artifact-store.ts`) abstracts the storage backend behind a uniform interface. Schema validation via Ajv runs before every write.

## Storage Modes

The active storage mode is determined by the `JURASSIC_STORAGE_PROVIDER` environment variable:

| Mode      | Env Value | Status       | Description                                  |
| --------- | --------- | ------------ | -------------------------------------------- |
| **Local** | `local`   | ✅ Default   | Write JSON files to the local filesystem     |
| **Fabric**| `fabric`  | 🔮 Future    | Write to Microsoft Fabric OneLake via DLS Gen2 |

When `JURASSIC_STORAGE_PROVIDER` is unset, the system defaults to `local`.

## Local Storage Layout

Artifacts are organized by run ID and agent name:

```
artifacts/
└── <runId>/
    ├── planning/
    │   ├── Manifest.json
    │   ├── RunLog.jsonl
    │   ├── DependencyGraph.json
    │   ├── RiskAssessment.json
    │   ├── DocCoverage.json
    │   ├── StackAnalysis.json
    │   ├── MigrationOptions.json
    │   ├── UserDecisions.json
    │   ├── ModernizationPlan.json
    │   └── APPROVED                 ← Human-created marker file
    └── implementation/
        ├── ImplementationLog.json
        ├── TestScaffold.json
        └── Manifest.json
```

**Path formula:** `artifacts/<runId>/<agentName>/<artifactName>.json`

Directories are created on-demand via `fs.mkdir(dir, { recursive: true })`.

## ArtifactStore Interface

The `ArtifactStore` class (`packages/data/src/artifact-store.ts`) exposes four operations:

| Method          | Signature                                                                  | Description                                     |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `upload`        | `(runId, agentName, artifactName, data) → Promise<string>`                 | Serialize and persist an artifact; returns path  |
| `download`      | `(runId, agentName, artifactName) → Promise<unknown>`                      | Read and deserialize an artifact                 |
| `list`          | `(runId, agentName) → Promise<string[]>`                                   | List artifact names in an agent's directory      |
| `markApproved`  | `(runId) → Promise<void>`                                                  | Create the `APPROVED` marker file for a run      |

### Upload

```typescript
async upload(runId: string, agentName: string, artifactName: string, data: unknown): Promise<string>
```

1. Resolve directory: `artifacts/<runId>/<agentName>/`
2. Create directory recursively if it does not exist.
3. Serialize `data` as pretty-printed JSON (`JSON.stringify(data, null, 2)`).
4. Write to `<dir>/<artifactName>.json`.
5. Return the written file path.

> **Schema validation** happens upstream — the agent's `writeArtifact()` method validates against the Ajv schema before calling `upload()`. Invalid data never reaches the store.

### Download

```typescript
async download(runId: string, agentName: string, artifactName: string): Promise<unknown>
```

1. Resolve file path: `artifacts/<runId>/<agentName>/<artifactName>.json`.
2. Read file as UTF-8.
3. Parse and return the JSON content.

### List

```typescript
async list(runId: string, agentName: string): Promise<string[]>
```

1. Resolve directory: `artifacts/<runId>/<agentName>/`.
2. Read directory entries.
3. Filter to `.json` files and strip the extension.
4. Return empty array if the directory does not exist.

### markApproved

```typescript
async markApproved(runId: string): Promise<void>
```

1. Resolve directory: `artifacts/<runId>/`.
2. Create directory recursively if it does not exist.
3. Write an empty `APPROVED` file.

## Approval Workflow

The approval gate is a zero-byte marker file:

```
artifacts/<runId>/APPROVED
```

- The Planning Agent produces artifacts in `artifacts/<runId>/planning/`.
- A human reviews the planning artifacts and creates the `APPROVED` marker.
- The Orchestrator checks for the marker via `checkApproval()` before dispatching the Implementation Agent.
- The `--plan-approved` CLI flag or `skipApproval: true` option bypasses the file-system check entirely.

> See [`agents.md`](./agents.md) for the full approval sequence diagram.

## Schema Validation

All artifacts are validated before persistence:

1. Agent calls `BaseAgent.writeArtifact(name, data)`.
2. `writeArtifact()` loads the corresponding schema from `specs/schemas/<name>.schema.json`.
3. [Ajv](https://ajv.js.org/) validates `data` against the schema in strict mode.
4. If validation fails, an error is thrown and nothing is written.
5. If validation passes, `ArtifactStore.upload()` persists the data.

On read, `BaseAgent.readArtifact()` re-validates to catch corruption or manual edits.

## Future: Fabric OneLake Integration

When `JURASSIC_STORAGE_PROVIDER=fabric`, artifacts will be stored in Microsoft Fabric OneLake via the Azure Data Lake Storage Gen2 REST API.

**Planned behavior:**

- Authentication via `DefaultAzureCredential` → `getStorageToken()` from `@jurassic/auth` using scope `https://storage.azure.com/.default`.
- Lakehouse path: `<workspaceId>/<lakehouseId>/Files/artifacts/<runId>/<agentName>/<artifactName>.json`.
- Configuration via `packages/data/src/fabric-config.ts`.
- Same `ArtifactStore` interface — the mode switch is internal to the class.

**Not yet implemented.** All Fabric methods currently throw `Error('Fabric integration not yet configured')`.

## Environment Variables

| Variable                      | Required | Default   | Description                           |
| ----------------------------- | -------- | --------- | ------------------------------------- |
| `JURASSIC_STORAGE_PROVIDER`   | No       | `local`   | Storage backend: `local` or `fabric`  |
