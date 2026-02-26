## Revised Plan: Layer 1 SDD - Modernization Intelligence Layer (Copilot SDK)

**TL;DR:** Build a **Modernization Intelligence Layer** using the GitHub Copilot SDK (`@github/copilot-sdk`). This is **not a code assistant**—it is an enterprise-grade analysis system that builds semantic understanding of legacy systems, produces risk intelligence, generates test scaffolding, and creates auditable modernization roadmaps. The agent registers custom analysis skills, leverages Copilot's built-in Git/file tools, and produces deterministic, schema-valid artifacts. **Fork-first workflow**: users fork the target repo and provide their GitHub username at runtime.

---

### Enterprise Legacy System Challenges Addressed

Large enterprises operate mission-critical legacy systems with:

| Challenge | How This Agent Addresses It |
|-----------|----------------------------|
| **10–30 year-old control logic** | Pinned SHA analysis; works on any repo age |
| **Sparse documentation** | `doc_coverage_analysis` skill flags undocumented code |
| **Proprietary DSLs** | Extensible parser registry for custom languages |
| **Cyclic dependencies** | Tarjan SCC detection in dependency graphs |
| **Safety-critical code paths** | `safety_path_analysis` skill identifies critical paths |
| **Institutional knowledge locked in engineers** | Extracts implicit knowledge into structured artifacts |

**Why Modernization Stalls → How We Solve It:**

| Stall Reason | Solution |
|--------------|----------|
| Nobody understands system boundaries | `DependencyGraph.json` maps all boundaries |
| Risk is opaque | `RiskAssessment.json` with scored, evidenced risks |
| Test coverage is minimal | `TestScaffold.json` generates test entry points |
| Documentation is outdated | `DocCoverage.json` identifies gaps + generates stubs |
| Refactoring introduces operational risk | Read-only default; gated writes; full audit trail |

---

### Architecture Change

| Before (standalone CLI) | After (Copilot SDK agent) |
|-------------------------|---------------------------|
| Custom orchestrator | Copilot runtime handles orchestration |
| `simple-git` for repo ops | Copilot's built-in Git tools |
| Custom CLI entry point | Agent invoked via Copilot SDK client |
| All logic in `packages/tools/` | Skills registered with SDK |
| Direct upstream access | **Fork-first**: clone/push to user's fork |

---

### Fork-First Workflow

All work targets a **user-owned fork** of the upstream repository. This ensures:
- No accidental writes to upstream
- Proper OSS contribution flow
- Each user controls their own GitHub resources

| Aspect | Value |
|--------|-------|
| **Upstream repo** | Read-only reference (e.g., `odriverobotics/ODrive`) |
| **Fork repo** | User's fork (e.g., `<username>/ODrive`) |
| **Fork owner** | Runtime parameter: `--fork-owner` or `GITHUB_FORK_OWNER` env var |
| **Fork URL** | Computed: `https://github.com/${forkOwner}/${repoName}` |

**User prerequisite:** Fork the target repo before running the agent.

---

### ODrive Repository Context (Validated)

| Attribute | Value |
|-----------|-------|
| **Upstream URL** | `https://github.com/odriverobotics/ODrive` |
| **Repo Name** | `ODrive` |
| **Default Branch** | `master` |
| **Baseline SHA** | `3a2e4dd1bfbda9e4c534d5c7d8428a99c361e783` (Jan 20, 2026 - most recent) |
| **Stress SHA** | `e2df8e9e74655144819a3734e2e99e1aa44d8bd7` (Apr 29, 2023 - v0.5.5 merge, feature-rich) |
| **Firmware Path** | `Firmware/**` (C/C++ - 62.2% of codebase) |
| **Tools Path** | `tools/**` (Python - 19.2%) |
| **GUI Path** | `GUI/**` (JavaScript 10.8% + Vue 4.0%) |
| **Docs Path** | `docs/**` |
| **Latest Release** | fw-v0.5.6 (May 9, 2023) |

---

### Artifacts Produced

| Artifact | Purpose | Enterprise Value |
|----------|---------|------------------|
| `Manifest.json` | Run metadata (runId, commitSha, timestamps) | Audit trail, reproducibility |
| `RunLog.jsonl` | Tool execution trace (start/stop, input/output hashes) | **Governance compliance**, action traceability |
| `DependencyGraph.json` | Include/import graphs for all language domains | System boundary discovery |
| `RiskAssessment.json` | Ranked risk items with scores, evidence, safety flags | **Risk intelligence** for stakeholders |
| `ModernizationPlan.json` | Phased improvement steps referencing risk IDs | Roadmap for transformation |
| `TestScaffold.json` | Generated test entry points + coverage gaps | **Test scaffolding** for minimal-coverage systems |
| `DocCoverage.json` | Documentation coverage analysis + generated stubs | Addresses sparse documentation |

---

### Core Constraints

- **Fork-first** – all clone/push operations target user's fork, never upstream
- **Pinned SHA execution** – always runs on baseline or stress SHA, never drifts with upstream
- **Deterministic** – same SHA + profile = identical artifacts (stable IDs, stable ordering)
- **Read-only by default** – no repo modifications; writes gated behind explicit approval + allowlist (tests/docs/config only)
- **Schema-enforced contracts** – CI fails if any artifact is invalid
- **SDD approach** – specs + schemas land first (PR0, "red"), then implementations go green incrementally
- **Audit-first** – every tool invocation logged with inputs/outputs for compliance
- **Extensible parsers** – DSL registry allows adding proprietary language support

### Non-goals

- No firmware flashing/building
- No automatic refactors (intelligence layer, not refactoring tool)
- No ungated writes
- No direct code suggestions (this is not a code assistant)

---

### CLI Interface

| Argument | Env Var | Required | Description |
|----------|---------|----------|-------------|
| `--fork-owner` | `GITHUB_FORK_OWNER` | **Yes** | GitHub username or org owning the fork |
| `--repo` | - | Yes | Path to fixture JSON |
| `--profile` | - | No | Path to profile JSON (defaults from fixture) |
| `--ref` | - | No | SHA to analyze (defaults to baseline) |
| `--out` | - | No | Output directory (defaults to `artifacts/`) |
| `--enable-writes` | - | No | Enable gated write operations |

**Example invocations:**
```bash
# User "alice" analyzing ODrive
npx jurassic analyze --fork-owner alice --repo specs/repos/odrive.fixture.json

# Using env var
GITHUB_FORK_OWNER=bob npx jurassic analyze --repo specs/repos/odrive.fixture.json
```

---

### Steps

#### Phase 0: Project Scaffolding

1. **Initialize pnpm workspace** – `pnpm-workspace.yaml`, root `package.json` (engines: node >=20), `tsconfig.base.json`.

2. **Create package structure**  
   - `packages/agent/` – Copilot SDK agent definition, skill registration  
   - `packages/skills/` – custom analysis skills (fw_include_graph, risk_scoring, etc.)  
   - `packages/schemas/` – JSON schemas + Ajv validation  
   - `apps/cli/` – thin CLI wrapper that invokes the agent

3. **Install Copilot SDK** – `@github/copilot-sdk` + dependencies.

4. **Add dev tooling** – ESLint, Prettier, Vitest.

5. **Bootstrap CI** – `.github/workflows/ci.yml`.

---

#### Phase A: Constitution + Fixture (PR0)

6. **Create constitution** at `.specify/memory/constitution.md`  
   - Default READ-ONLY  
   - Fork-first required  
   - Writes require explicit gate  
   - Artifacts must validate schemas  
   - Artifacts must be deterministic  
   - Tool execution logged

7. **Create ODrive fixture** at `specs/repos/odrive.fixture.json`:
   ```json
   {
     "upstreamUrl": "https://github.com/odriverobotics/ODrive",
     "repoName": "ODrive",
     "defaultBranch": "master",
     "pinnedShas": {
       "baseline": "3a2e4dd1bfbda9e4c534d5c7d8428a99c361e783",
       "stress": "e2df8e9e74655144819a3734e2e99e1aa44d8bd7"
     },
     "profilePath": "specs/repos/odrive.profile.json"
   }
   ```
   **Note:** No `forkUrl` – computed at runtime from `--fork-owner` + `repoName`.

8. **Create ODrive profile** at `specs/repos/odrive.profile.json` – include/exclude globs, risk weights.

9. **Document prerequisites** in `README.md`:
   ```markdown
   ## Prerequisites
   1. Fork the target repo to your GitHub account
   2. Set `GITHUB_FORK_OWNER` env var or pass `--fork-owner <your-username>`
   ```

---

#### Phase B: Schemas + Artifacts Contract (PR0)

10. **Create JSON schemas** under `specs/schemas/`:
    - `Manifest.schema.json`
    - `RunLogEvent.schema.json`
    - `DependencyGraph.schema.json`
    - `RiskAssessment.schema.json`
    - `ModernizationPlan.schema.json`
    - `TestScaffold.schema.json`
    - `DocCoverage.schema.json`

11. **Create artifacts contract** at `specs/functional/artifacts.md`.

12. **Add schema validator** at `packages/schemas/src/validator.ts` using Ajv.

13. **Add failing acceptance tests** (red baseline).

---

#### Phase C: Copilot SDK Agent Setup (PR1)

14. **Create agent definition** at `packages/agent/src/index.ts`:
    - Initialize Copilot SDK client
    - Configure tool permissions (enable Git, file system; disable writes by default)
    - Register custom skills
    - Define agent behavior/system prompt for legacy code analysis

15. **Create skill registration** at `packages/agent/src/skills/index.ts`:
    - Export all custom skills with metadata (name, description, parameters schema)

16. **Add agent spec** at `specs/functional/agent.md` – describes agent behavior, skill inventory, permission model.

---

#### Phase D: Custom Skills (PR1–PR3)

Each skill is a function registered with the Copilot SDK:

17. **repo_snapshot skill** (PR1)  
    - Spec: `specs/functional/skills/repo_snapshot.md`  
    - Impl: `packages/skills/src/repo_snapshot.ts`  
    - **Fork-aware**: Receives `forkOwner` parameter, computes fork URL  
    - Uses Copilot's built-in Git tools to clone/checkout pinned SHA from fork  
    - Adds upstream as read-only remote  
    - Returns file index + commit SHA

18. **fw_include_graph skill** (PR1)  
    - Spec: `specs/functional/skills/fw_include_graph.md`  
    - Impl: `packages/skills/src/fw_include_graph.ts`  
    - Parses `#include` in `Firmware/**`, builds graph, detects SCCs  
    - Uses Copilot's file read tools for source access

19. **py_import_graph skill** (PR1)  
    - Spec: `specs/functional/skills/py_import_graph.md`  
    - Impl: `packages/skills/src/py_import_graph.ts`

20. **gui_import_graph skill** (PR1)  
    - Spec: `specs/functional/skills/gui_import_graph.md`  
    - Impl: `packages/skills/src/gui_import_graph.ts`

21. **git_churn skill** (PR2)  
    - Spec: `specs/functional/skills/git_churn.md`  
    - Impl: `packages/skills/src/git_churn.ts`  
    - Uses Copilot's Git tools to fetch commit history

22. **complexity_metrics skill** (PR2)  
    - Spec: `specs/functional/skills/complexity_metrics.md`  
    - Impl: `packages/skills/src/complexity_metrics.ts`

23. **risk_scoring skill** (PR2)  
    - Spec: `specs/functional/skills/risk_scoring.md`  
    - Impl: `packages/skills/src/risk_scoring.ts`

24. **plan_synthesis skill** (PR3)  
    - Spec: `specs/functional/skills/plan_synthesis.md`  
    - Impl: `packages/skills/src/plan_synthesis.ts`

25. **safety_path_analysis skill** (PR2)  
    - Spec: `specs/functional/skills/safety_path_analysis.md`  
    - Impl: `packages/skills/src/safety_path_analysis.ts`  
    - Identifies safety-critical code paths (interrupt handlers, watchdogs, fail-safes)  
    - Flags high-risk modification zones  
    - Feeds into RiskAssessment with safety severity multiplier

26. **doc_coverage_analysis skill** (PR3)  
    - Spec: `specs/functional/skills/doc_coverage_analysis.md`  
    - Impl: `packages/skills/src/doc_coverage_analysis.ts`  
    - Scans for undocumented public APIs, missing READMEs, stale comments  
    - Produces `DocCoverage.json` with coverage percentages + gap list  
    - Generates documentation stub templates

27. **test_scaffold skill** (PR3)  
    - Spec: `specs/functional/skills/test_scaffold.md`  
    - Impl: `packages/skills/src/test_scaffold.ts`  
    - Identifies testable entry points (exported functions, API endpoints)  
    - Maps existing test coverage (if any)  
    - Produces `TestScaffold.json` with test file templates + priority ranking

28. **dsl_parser_registry** (PR1)  
    - Spec: `specs/functional/skills/dsl_parser_registry.md`  
    - Impl: `packages/skills/src/dsl_parser_registry.ts`  
    - Extensible registry for proprietary DSL parsers  
    - Default parsers: C/C++ includes, Python imports, JS/Vue imports  
    - Plugin interface for enterprise-specific languages

---

#### Phase E: Analyze Workflow (PR1–PR3)

29. **Create analyze workflow** at `packages/agent/src/workflows/analyze.ts`:
    - Orchestrates skill execution in sequence via Copilot runtime
    - Writes artifacts to `artifacts/<runId>/`
    - Emits RunLog events
    - Validates schemas at end

30. **Create CLI wrapper** at `apps/cli/src/index.ts`:
    - Thin wrapper calling `copilot-sdk` client with analyze workflow
    - **Parses `--fork-owner`**, validates required, computes fork URL
    - Args: `--fork-owner`, `--repo`, `--profile`, `--out`, `--ref`

31. **Add e2e tests** – run twice on baseline SHA, assert determinism.

---

#### Phase F: Policy Gate + PR Writer (PR4)

32. **Create policy skill** at `packages/skills/src/policy.ts`:
    - Enforces read-only default
    - Checks for gate file + `--enable-writes` + CI env before allowing writes

33. **Create PR writer skill** at `packages/skills/src/pr_writer.ts`:
    - **Fork-aware**: Receives `forkOwner` parameter, pushes to user's fork only
    - Uses Copilot's Git tools to create branch, commits
    - Allowed outputs: tests under `tools/`, docs under `docs/`, lint/config
    - Generates PR description referencing artifact IDs + risk items

34. **Add policy + pr-writer specs**.

35. **Add gate tests** – without gate: fails; with gate: writes only allowlisted paths.

---

#### Phase G: CI Finalization (PR4)

36. **Finalize CI** at `.github/workflows/ci.yml`:
    - Install Copilot CLI + deps
    - Run unit tests
    - Run e2e analyze on baseline SHA (uses CI fork or test account)
    - Schema validation
    - Determinism check
    - Upload artifacts

37. **Add manual approval workflow** for write operations.

---

### Project Structure

```
Jurassic-refactor/
├── .specify/
│   └── memory/
│       └── constitution.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   └── cli/
│       ├── package.json
│       └── src/
│           └── index.ts          # Parses --fork-owner, invokes agent
├── packages/
│   ├── agent/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts          # Agent definition + SDK client
│   │       ├── skills/
│   │       │   └── index.ts      # Skill registration
│   │       └── workflows/
│   │           └── analyze.ts    # Analyze orchestration
│   ├── skills/
│   │   ├── package.json
│   │   └── src/
│   │       ├── repo_snapshot.ts  # Fork-aware: accepts forkOwner
│   │       ├── dsl_parser_registry.ts  # Extensible DSL parser registry
│   │       ├── fw_include_graph.ts
│   │       ├── py_import_graph.ts
│   │       ├── gui_import_graph.ts
│   │       ├── git_churn.ts
│   │       ├── complexity_metrics.ts
│   │       ├── safety_path_analysis.ts  # Safety-critical code path detection
│   │       ├── risk_scoring.ts
│   │       ├── doc_coverage_analysis.ts  # Documentation gap analysis
│   │       ├── test_scaffold.ts  # Test entry point generation
│   │       ├── plan_synthesis.ts
│   │       ├── policy.ts
│   │       └── pr_writer.ts      # Fork-aware: pushes to user's fork
│   └── schemas/
│       ├── package.json
│       └── src/
│           └── validator.ts
├── specs/
│   ├── repos/
│   │   ├── odrive.fixture.json   # upstreamUrl + repoName (no forkUrl)
│   │   └── odrive.profile.json
│   ├── schemas/
│   │   ├── Manifest.schema.json
│   │   ├── RunLogEvent.schema.json
│   │   ├── DependencyGraph.schema.json
│   │   ├── RiskAssessment.schema.json
│   │   ├── ModernizationPlan.schema.json
│   │   ├── TestScaffold.schema.json
│   │   └── DocCoverage.schema.json
│   └── functional/
│       ├── artifacts.md
│       ├── agent.md
│       ├── analyze.md
│       ├── policy.md
│       ├── pr-writer.md
│       ├── ci.md
│       └── skills/
│           ├── repo_snapshot.md
│           ├── fw_include_graph.md
│           └── ...
├── pnpm-workspace.yaml
├── package.json
├── README.md                     # Documents fork prerequisite
└── tsconfig.base.json
```

---

### Verification

| Check | Method |
|-------|--------|
| Fork owner required | CLI fails without `--fork-owner` or env var |
| Fork URL computed | Logs show `https://github.com/<user>/ODrive` |
| Unit tests | `pnpm test` |
| Copilot CLI available | `copilot --version` |
| E2E analyze | Agent invoked via SDK, produces **7 artifacts** |
| Schema validation | Vitest tests with `validateArtifact()` |
| Determinism | Two runs, compare artifacts |
| Gated writes | Attempt write without gate → rejected |
| CI green | GitHub Actions passes |
| Safety paths identified | `RiskAssessment.json` contains safety-critical flags |
| Test scaffolds generated | `TestScaffold.json` contains test entry points |
| Doc coverage analyzed | `DocCoverage.json` identifies documentation gaps |

---

### Decisions

| Decision | Rationale |
|----------|-----------|
| **Modernization Intelligence Layer** | Not a code assistant—produces risk intelligence, not code suggestions |
| **Fork-first mandatory** | Prevents accidental writes to upstream; proper OSS contribution flow |
| **No hardcoded fork URL** | Agent is reusable across users |
| **CLI arg + env var for fork owner** | Flexibility: CLI for one-off, env for CI/scripts |
| **Fork is user prerequisite** | Agent doesn't auto-fork; user controls their GitHub resources |
| **`repoName` in fixture** | Allows fork URL construction without parsing upstream URL |
| **Copilot SDK (TypeScript)** | Official SDK, same engine as Copilot CLI, handles orchestration |
| **Node 20 LTS** | Stable, matches GH Actions runners |
| **Vitest** | Fast native ESM/TS support |
| **pnpm workspaces** | Clean CLI/core separation |
| **Ajv** | Industry-standard JSON Schema validator |
| **Custom skills** | Analysis logic (include graphs, risk scoring) is domain-specific |
| **Built-in Git tools** | Leverage Copilot's Git operations for clone/checkout/commit |
| **Skill-based architecture** | Each analysis capability is a registered skill, composable |
| **Thin CLI wrapper** | CLI just invokes the agent, Copilot handles the rest |
| **DSL parser registry** | Extensible for proprietary enterprise languages |
| **Safety path analysis** | Critical for industrial/aerospace/energy legacy systems |
| **Test scaffold generation** | Addresses minimal test coverage in legacy systems |
| **Doc coverage analysis** | Extracts institutional knowledge, identifies gaps |
| **Audit-first logging** | Every action logged for enterprise governance compliance |
| **Baseline SHA**: `3a2e4dd` | Most recent commit (Jan 2026), includes CI/actions updates |
| **Stress SHA**: `e2df8e9` | v0.5.5 merge with substantial code changes, good for comparison testing |
| **Tarjan SCC** | O(V+E) for include graph cycle detection |
| **Stable ID**: `sha256(normalizedPath:type:toolVersion)` | Ensures determinism |

---

### PR Sequence

| PR | Contents | Merge Criteria |
|----|----------|----------------|
| **PR0** | Constitution, fixture, profile, all 7 schemas, artifacts contract, failing harness, README | Spec suite exists, contracts defined |
| **PR1** | Copilot SDK agent setup, `repo_snapshot` (fork-aware), `dsl_parser_registry`, `fw_include_graph`, `py_import_graph`, `gui_import_graph`, analyze workflow, CLI with `--fork-owner` | E2E works, Manifest + RunLog + DependencyGraph validate |
| **PR2** | `git_churn`, `complexity_metrics`, `safety_path_analysis`, `risk_scoring` | Stable top-K risk list with safety flags |
| **PR3** | `doc_coverage_analysis`, `test_scaffold`, `plan_synthesis` | All 7 artifacts produced, deterministic |
| **PR4** | Policy gate, `pr_writer` (fork-aware), CI finalization | Ungated writes impossible |

---

### Definition of Done (Layer 1)

Layer 1 is complete when:
- All Layer 1 specs exist and are enforced by CI
- Fork-first workflow is documented and enforced (CLI requires `--fork-owner`)
- `analyze` on pinned ODrive SHA produces all **7 artifacts**
- Artifacts are schema-valid and deterministic
- RunLog provides tool-by-tool traceability for **audit/governance compliance**
- Safety-critical code paths are identified and flagged in RiskAssessment
- Test scaffolds are generated for minimal-coverage codebases
- Documentation gaps are identified with coverage percentages
- PR generation is human-gated, fork-only, and limited to safe changes (tests/docs/config)
- **Not a code assistant**: produces intelligence artifacts, not code suggestions
