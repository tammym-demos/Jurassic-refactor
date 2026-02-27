## Revised Plan: Layer 1 SDD - Modernization Intelligence Layer (Copilot SDK + Microsoft Foundry)

**TL;DR:** Build a **Modernization Intelligence Layer** using the **GitHub Copilot SDK** (`@github/copilot-sdk`) for agent orchestration and **Microsoft Foundry (Azure AI Foundry)** for production hosting, model deployment, and evaluation. Artifacts are persisted to **Microsoft Fabric** for analytics and data intelligence, run metadata to **Cosmos DB**, and telemetry to **Application Insights**—all using **passwordless authentication** via `DefaultAzureCredential`. The system uses **four specialized agents** (Planning Agent + Implementation Agent + Stack Evaluation Agent + **Code Implementation Agent**) with separated duties and isolated context, hosted on Foundry with enterprise-grade model management. The first three agents produce intelligence artifacts; the **Code Implementation Agent** acts as a **code assistant** that implements the approved migration plan once artifacts are human-approved. **Fork-first workflow**: user forks the target repo, then **provides their fork location** (prompted or via `--fork-owner`); **all analysis happens on the fork**, never upstream.

---

### Multi-Agent Architecture

The system employs a **separation of concerns** pattern with specialized agents:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATOR (CLI)                                 │
│  Dispatches to appropriate agent based on command; manages agent lifecycle   │
└─────────────────────────────────────────────────────────────────────────────┘
         │                │                 │                  │
┌────────▼────────┐  ┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  PLANNING AGENT │  │ IMPLEMENTATION │  │ STACK EVALUATION│  │CODE IMPLEMENT. │
│                 │  │     AGENT      │  │     AGENT       │  │     AGENT      │
│ - Analysis      │  │ - Artifact gen │  │ - Stack review  │  │ - Code changes │
│ - Risk scoring  │  │ - Test scaffold│  │ - Migration eval│  │ - Refactoring  │
│ - Roadmap plan  │  │ - Doc stubs    │  │ - User Q&A      │  │ - Migration    │
│ - Dependencies  │  │ - PR creation  │  │ - Recommendations│ │ - Code assist  │
│                 │  │                │  │                 │  │                │
│ READ-ONLY       │  │ GATED WRITES   │  │ INTERACTIVE     │  │ HUMAN-APPROVED │
└─────────────────┘  └────────────────┘  └─────────────────┘  └────────────────┘
         │                                                         │
         │                    INTELLIGENCE ARTIFACTS                │
         └───────────────────────▼─────────────────────────────┘
                        HUMAN APPROVAL GATE
                               │
                     ┌─────────▼──────────┐
                     │ CODE IMPLEMENT.  │
                     │ (Executes Plan)  │
                     └───────────────────┘
```

#### Why Multi-Agent?

| Single Agent Problems | Multi-Agent Solutions |
|-----------------------|----------------------|
| Bloated context window | Each agent loads only relevant context |
| Confused responsibilities | Clear duty boundaries per agent |
| Risk of unintended writes | Planning agent is strictly read-only |
| No user interaction loop | Stack Evaluation agent has dialog capability |
| Monolithic failure modes | Isolated failures, graceful degradation |
| DIY model management | Foundry handles quotas, RBAC, model catalog |
| No production hosting | Foundry container-based hosted agents |
| Manual evaluation | Foundry built-in evaluation workflows |

---

### Agent Definitions

#### 1. Planning Agent (Read-Only)

**Purpose:** Analyzes the legacy codebase and produces intelligence artifacts.

| Aspect | Details |
|--------|---------|
| **Mode** | Read-only; cannot modify repository |
| **Context** | Repository structure, dependency graphs, historical data |
| **Skills** | `repo_snapshot`, `fw_include_graph`, `py_import_graph`, `gui_import_graph`, `git_churn`, `complexity_metrics`, `safety_path_analysis`, `risk_scoring`, `doc_coverage_analysis` |
| **Outputs** | `Manifest.json`, `RunLog.jsonl`, `DependencyGraph.json`, `RiskAssessment.json`, `DocCoverage.json` |
| **System Prompt Focus** | "You are a legacy system analyst. Your job is to understand system boundaries, identify risks, and map dependencies. You NEVER modify code." |

**Context Isolation:**
- Loads only source files + git history
- No access to implementation agent's scaffolds
- Cannot see user dialog from stack evaluation

---

#### 2. Implementation Agent (Gated Writes)

**Purpose:** Executes the modernization plan by generating artifacts and safe outputs.

| Aspect | Details |
|--------|---------|
| **Mode** | Gated writes; requires explicit approval + allowlist |
| **Context** | Planning artifacts, test templates, documentation templates |
| **Skills** | `plan_synthesis`, `test_scaffold`, `pr_writer`, `policy` |
| **Inputs** | Consumes `RiskAssessment.json`, `DependencyGraph.json`, `DocCoverage.json` from Planning Agent |
| **Outputs** | `ModernizationPlan.json`, `TestScaffold.json`, PR branches with tests/docs |
| **System Prompt Focus** | "You are a modernization implementer. You ONLY act on approved plans from the Planning Agent. You can generate test scaffolds and documentation, never production code." |

**Context Isolation:**
- Does NOT re-analyze source files (trusts Planning Agent)
- Cannot access raw git history directly
- Loads only planning artifacts as input

---

#### 3. Stack Evaluation Agent (Interactive)

**Purpose:** Reviews current technology stack, evaluates migration targets, engages user in clarifying dialog.

| Aspect | Details |
|--------|---------|
| **Mode** | Interactive; prompts user with questions |
| **Context** | Repository stack fingerprint, known technology profiles, migration patterns |
| **Skills** | `stack_fingerprint`, `migration_evaluator`, `user_dialog`, `stack_recommendation` |
| **Outputs** | `StackAnalysis.json`, `MigrationOptions.json`, `UserDecisions.json` |
| **System Prompt Focus** | "You are a technology advisor. Your job is to understand the current stack, research migration options, and ASK CLARIFYING QUESTIONS when requirements are ambiguous." |

**User Interaction Flow:**
```
User: "Evaluate migration options for this repo"
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stack Evaluation Agent                                       │
│ 1. Fingerprint current stack (languages, frameworks, deps)   │
│ 2. Identify potential migration targets                      │
│ 3. ASK CLARIFYING QUESTIONS:                                 │
│    - "What is the primary driver for modernization?"         │
│    - "Are there compliance requirements (HIPAA, SOC2, etc)?" │
│    - "What is the acceptable migration timeline?"            │
│    - "Is cloud-native/containerization a goal?"              │
│    - "What is the team's expertise? (rate 1-5 on X, Y, Z)"   │
│ 4. Score migration options based on answers                  │
│ 5. Present ranked recommendations with trade-offs            │
└─────────────────────────────────────────────────────────────┘
```

---

#### 4. Code Implementation Agent (Human-Approved Code Assistant)

**Purpose:** Implements the approved migration plan by making actual code changes. This agent acts as a **code assistant** that executes the modernization roadmap once artifacts and plans are human-approved.

| Aspect | Details |
|--------|---------|
| **Mode** | Code assistant; writes production code after human approval |
| **Prerequisite** | Requires explicit human approval of Planning + Stack Evaluation artifacts |
| **Context** | Approved `ModernizationPlan.json`, `MigrationOptions.json`, `UserDecisions.json`, target codebase |
| **Skills** | `code_refactor`, `migration_executor`, `dependency_upgrader`, `test_writer`, `code_reviewer`, `incremental_pr` |
| **Inputs** | Consumes approved artifacts from Planning, Implementation, and Stack Evaluation agents |
| **Outputs** | Actual code changes, refactored modules, upgraded dependencies, new tests, PR branches |
| **System Prompt Focus** | "You are a code implementation assistant. You execute the APPROVED modernization plan. You make incremental, testable code changes following the migration roadmap. You create PRs for human review before merge." |

**Human Approval Gate:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPROVAL WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Planning Agent produces: RiskAssessment, DependencyGraph, DocCoverage  │
│  2. Implementation Agent produces: ModernizationPlan, TestScaffold         │
│  3. Stack Evaluation Agent produces: StackAnalysis, MigrationOptions       │
│                                                                             │
│                    ▼ HUMAN REVIEWS ARTIFACTS ▼                              │
│                                                                             │
│  4. Human approves plan via:                                                │
│     - `artifacts/<runId>/APPROVED` marker file                             │
│     - CLI flag: `--plan-approved`                                          │
│     - GitHub PR approval on planning PR                                    │
│                                                                             │
│  5. Code Implementation Agent activates ONLY after approval                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Context Isolation:**
- Cannot run without approved artifacts (hard gate)
- Loads only approved planning artifacts + target source code
- Creates separate PR branch for each migration task
- Each PR requires human review before merge

**Code Change Capabilities:**
- Refactor code according to modernization plan
- Upgrade dependencies (e.g., Vue 2 → Vue 3, Python 2 → 3)
- Implement migration patterns from approved options
- Generate and run tests for changed code
- Create incremental PRs with clear scope

---

### Agent Communication Protocol

Agents communicate via **artifacts** (files), not direct messages:

```
Planning Agent ──writes──▶ RiskAssessment.json ◀──reads── Implementation Agent
                          DependencyGraph.json
                          DocCoverage.json

Implementation Agent ──writes──▶ ModernizationPlan.json
                                 TestScaffold.json

Stack Evaluation Agent ──writes──▶ StackAnalysis.json
                                   MigrationOptions.json
                                   UserDecisions.json

                    ▼ HUMAN APPROVAL GATE ▼

Code Implementation Agent ◀──reads── ALL approved artifacts
                         ──writes──▶ Code changes (PRs)
                                     Refactored modules
                                     New/updated tests
```

| Rule | Rationale |
|------|-----------|
| No direct agent-to-agent calls | Maintains context isolation |
| Artifacts are the contract | Schema-validated handoff points |
| Human-in-the-loop for escalation | User approves plans before Implementation Agent acts |
| **Code changes require approval** | Code Implementation Agent blocked until artifacts approved |
| **Incremental PRs** | Code changes are small, reviewable PRs, not bulk commits |

---

### Enterprise Legacy System Challenges Addressed

Large enterprises operate mission-critical legacy systems with:

| Challenge | How This Agent System Addresses It |
|-----------|-----------------------------------|
| **10–30 year-old control logic** | Pinned SHA analysis; works on any repo age |
| **Sparse documentation** | `doc_coverage_analysis` skill flags undocumented code |
| **Proprietary DSLs** | Extensible parser registry for custom languages |
| **Cyclic dependencies** | Tarjan SCC detection in dependency graphs |
| **Safety-critical code paths** | `safety_path_analysis` skill identifies critical paths |
| **Institutional knowledge locked in engineers** | Extracts implicit knowledge into structured artifacts |
| **Unknown tech stack sprawl** | Stack Evaluation Agent fingerprints entire technology inventory |
| **Unclear migration paths** | `migration_evaluator` scores and ranks modernization options |
| **Ambiguous modernization requirements** | Stack Evaluation Agent **asks clarifying questions** to users |

**Why Modernization Stalls → How We Solve It:**

| Stall Reason | Solution |
|--------------|----------|
| Nobody understands system boundaries | `DependencyGraph.json` maps all boundaries |
| Risk is opaque | `RiskAssessment.json` with scored, evidenced risks |
| Test coverage is minimal | `TestScaffold.json` generates test entry points |
| Documentation is outdated | `DocCoverage.json` identifies gaps + generates stubs |
| Refactoring introduces operational risk | Read-only default; gated writes; full audit trail |
| **Stack migration options unclear** | `StackAnalysis.json` + `MigrationOptions.json` with scored paths |
| **Requirements are ambiguous** | Stack Evaluation Agent **asks clarifying questions** |
| **Decisions lack traceability** | `UserDecisions.json` captures all user inputs |

---

### Hybrid Platform Architecture

The system combines **GitHub Copilot SDK** for agent development with **Microsoft Foundry** for production operations:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        AZURE AI FOUNDRY (Hosting)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    Hosted Agent Container                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐│ │
│  │  │              COPILOT SDK AGENT RUNTIME                          ││ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐    ││ │
│  │  │  │  Planning   │ │Implementation│ │   Stack Evaluation     │    ││ │
│  │  │  │   Agent     │ │    Agent     │ │       Agent            │    ││ │
│  │  │  │ (read-only) │ │(gated writes)│ │   (interactive)        │    ││ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────────────────┘    ││ │
│  │  │                           ▲                                      ││ │
│  │  │                    Copilot SDK                                   ││ │
│  │  │                  (orchestration)                                 ││ │
│  │  └─────────────────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                      │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐│
│  │              FOUNDRY MODEL DEPLOYMENTS                                ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐            ││
│  │  │ GPT-4o   │  │ GPT-4o   │  │ Custom/Fine-tuned Model  │            ││
│  │  │ (main)   │  │ (backup) │  │ (optional)               │            ││
│  │  └──────────┘  └──────────┘  └──────────────────────────┘            ││
│  └───────────────────────────────────────────────────────────────────────┘│
│                                                                           │
│  Foundry provides: Quotas, RBAC, Evaluation, Telemetry, Container Mgmt   │
└───────────────────────────────────────────────────────────────────────────┘
```

#### Platform Responsibility Matrix

| Capability | Copilot SDK | Microsoft Foundry | GitHub MCP | Azure CLI | Owner |
|------------|-------------|-------------------|------------|-----------|-------|
| Agent orchestration | `CopilotClient`, sessions, skills | - | - | - | SDK |
| Skill registration | Native skill API | - | - | - | SDK |
| Multi-agent dispatch | Orchestrator | - | - | - | SDK |
| **Repo management** | - | - | `mcp_io_github_git_*` tools | - | GitHub MCP |
| **Fork/clone/branch** | - | - | `fork_repository`, `create_branch`, `push_files` | - | GitHub MCP |
| **PR creation** | - | - | `create_pull_request`, `update_pull_request` | - | GitHub MCP |
| **Production hosting** | - | Container-based hosted agents | - | `az containerapp` | Foundry + CLI |
| **Model deployment** | BYOM consumer | Model catalog, quotas | - | `az cognitiveservices` | CLI |
| **Agent evaluation** | - | Built-in evaluation workflows | - | `az ai` | CLI |
| **Telemetry/logging** | RunLog artifacts | Application Insights | - | `az monitor` | Both |
| **Quota management** | - | TPM, capacity planning | - | `az quota` | CLI |
| **Artifact storage** | - | - | - | Fabric OneLake API | Fabric |
| **Analytics/reporting** | - | - | - | Fabric Lakehouse/Power BI | Fabric |
| **Run metadata** | - | - | - | `az cosmosdb` | CLI |
| **Authentication** | - | - | - | `DefaultAzureCredential` | SDK |

---

### Architecture Change

| Before (standalone CLI) | After (Copilot SDK + Foundry + GitHub MCP) |
|-------------------------|--------------------------------------------|
| Custom orchestrator | Copilot runtime handles orchestration |
| Single monolithic agent | **4 specialized agents** with isolated context |
| `simple-git` for repo ops | **GitHub MCP** (`mcp_io_github_git_*` tools) |
| Custom CLI entry point | Agent invoked via Copilot SDK client |
| All logic in `packages/tools/` | Skills registered per-agent |
| No user interaction | **Stack Evaluation Agent asks clarifying questions** |
| Direct upstream access | **Fork-first**: clone/push to user's fork |
| DIY model management | **Azure CLI** (`az cognitiveservices`) for Foundry models |
| Local-only execution | **Azure CLI** (`az containerapp`) for Foundry hosting |
| Manual testing | **Azure CLI** (`az ai`) for Foundry evaluation |
| No code implementation | **Code Implementation Agent** executes approved plans |
| Local file storage | **Microsoft Fabric** for analytics-ready artifact storage |

---

### Azure Data Services + Microsoft Fabric

Artifacts are persisted to **Microsoft Fabric** for enterprise analytics; run metadata to **Cosmos DB**; telemetry to **Application Insights**.

#### Data Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Azure Data Layer                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Microsoft Fabric   │  │     Cosmos DB       │  │ Application Insights│ │
│  │  ─────────────────  │  │  ─────────────────  │  │  ─────────────────  │ │
│  │  • Artifact lakehouse│ │  • Run metadata     │  │  • Agent telemetry  │ │
│  │  • Analysis datasets │  │  • Skill invocations│  │  • Performance metrics│
│  │  • Migration metrics │  │  • Session state    │  │  • Error traces     │ │
│  │  • Code change history│ │  • Evaluation runs  │  │  • Custom events    │ │
│  │  • Power BI reports  │  │  • Approval status  │  │  • Distributed trace│ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  Fabric provides: OneLake, Lakehouse, Notebooks, Power BI, Data Pipelines │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Data Services Matrix

| Service | Purpose | Data Stored | Access Method |
|---------|---------|-------------|---------------|
| **Microsoft Fabric Lakehouse** | Artifact persistence + analytics | JSON artifacts, analysis results, migration history | Fabric REST API / OneLake SDK |
| **Microsoft Fabric Notebooks** | Data exploration | Ad-hoc analysis of artifacts, trend analysis | PySpark / SQL |
| **Power BI (via Fabric)** | Dashboards | Migration progress, risk trends, code churn | DirectQuery / Import |
| **Cosmos DB** | Run metadata | Session state, skill logs, approval status | `az cosmosdb sql` |
| **Application Insights** | Telemetry | Traces, metrics, custom events | `az monitor app-insights` |
| **Azure Key Vault** | Secrets | Service principal creds (if not using managed identity) | `az keyvault secret` |

#### Why Microsoft Fabric?

| Capability | Benefit for Modernization Intelligence |
|------------|---------------------------------------|
| **OneLake** | Single copy of artifacts; no data duplication |
| **Lakehouse** | Schema-on-read for evolving artifact formats |
| **PySpark Notebooks** | Data scientists can analyze migration patterns |
| **Power BI integration** | Executive dashboards for migration progress |
| **Data Pipelines** | Automate artifact ingestion and transformation |
| **Semantic Models** | Consistent metrics across all reports |
| **Real-time Analytics** | Stream agent telemetry for live monitoring |

#### Data Persistence Configuration

```typescript
// packages/data/src/fabric-config.ts
import { DefaultAzureCredential } from '@azure/identity';
import { CosmosClient } from '@azure/cosmos';

const credential = new DefaultAzureCredential();

// Fabric Lakehouse via OneLake APIs
export const fabricConfig = {
  workspaceId: process.env.FABRIC_WORKSPACE_ID!,
  lakehouseId: process.env.FABRIC_LAKEHOUSE_ID!,
  onelakePath: `https://onelake.dfs.fabric.microsoft.com/${process.env.FABRIC_WORKSPACE_ID}/${process.env.FABRIC_LAKEHOUSE_ID}/Files`,
  credential
};

// Cosmos DB for run metadata
export const cosmosClient = new CosmosClient({
  endpoint: process.env.AZURE_COSMOS_ENDPOINT!,
  aadCredentials: credential
});

// Artifact upload to Fabric Lakehouse
export async function uploadToFabric(runId: string, artifactName: string, content: string) {
  const path = `artifacts/${runId}/${artifactName}`;
  // Use OneLake Data Lake Storage Gen2 compatible APIs
  const response = await fetch(`${fabricConfig.onelakePath}/${path}?resource=file`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${await getToken()}`,
      'Content-Type': 'application/json'
    },
    body: content
  });
  return response.ok;
}

async function getToken() {
  const tokenResponse = await credential.getToken('https://storage.azure.com/.default');
  return tokenResponse.token;
}
```

---

### Authentication Strategy

All Azure services use **passwordless authentication** via `DefaultAzureCredential`. No API keys or secrets in code.

#### Authentication Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DefaultAzureCredential Chain                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Environment Variables    → Service Principal (CI/CD pipelines)          │
│     AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID                  │
│                                                                             │
│  2. Workload Identity        → Kubernetes/AKS pods                          │
│     Federated token from OIDC provider                                      │
│                                                                             │
│  3. Managed Identity         → Azure Container Apps (production)            │
│     System-assigned or user-assigned                                        │
│                                                                             │
│  4. Azure CLI                → Local development                            │
│     `az login` credentials                                                  │
│                                                                             │
│  5. Visual Studio Code       → VS Code Azure extension                      │
│     Signed-in user credentials                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Environment-Specific Authentication

| Environment | Auth Method | Setup |
|-------------|-------------|-------|
| **Local dev** | Azure CLI | `az login` before running agent |
| **GitHub Actions** | Workload Identity | OIDC federation with Azure AD |
| **Container Apps** | Managed Identity | System-assigned MI enabled |
| **AKS** | Workload Identity | Service account annotation |

#### Required Role Assignments

| Resource | Role | Purpose |
|----------|------|---------|
| **AI Foundry Project** | `Cognitive Services User` | Model inference |
| **Microsoft Fabric Workspace** | `Contributor` | Lakehouse read/write |
| **OneLake (Fabric)** | `Storage Blob Data Contributor` | Artifact upload via DLS Gen2 API |
| **Cosmos DB** | `Cosmos DB Built-in Data Contributor` | Metadata read/write |
| **Application Insights** | `Monitoring Metrics Publisher` | Telemetry write |
| **Key Vault** (optional) | `Key Vault Secrets User` | Secret read (if needed) |
| **Container Registry** | `AcrPush` | Image push for hosting |

#### Authentication Code Pattern

```typescript
// packages/auth/src/credential.ts
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';

/**
 * Returns the appropriate credential based on environment.
 * DefaultAzureCredential automatically selects the best available method.
 */
export function getCredential() {
  // In production Container Apps, prefer explicit Managed Identity
  if (process.env.AZURE_CONTAINER_APP_NAME) {
    return new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID);
  }
  // Elsewhere, use credential chain (CLI, env vars, VS Code, etc.)
  return new DefaultAzureCredential();
}

/**
 * Get bearer token for Foundry model access
 */
export async function getModelToken(): Promise<string> {
  const credential = getCredential();
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return token.token;
}
```

#### GitHub Actions OIDC Setup

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

permissions:
  id-token: write  # Required for OIDC
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Azure Login (Workload Identity)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      
      - name: Run agent tests
        run: pnpm test
        env:
          AZURE_AI_PROJECT_ENDPOINT: ${{ vars.AZURE_AI_PROJECT_ENDPOINT }}
```

---

### Fork-First Workflow

**All analysis and operations happen on the user's forked repository**, never on upstream. This ensures:
- User is authenticated to their own repository (standard GitHub auth)
- No accidental reads/writes to upstream
- Proper OSS contribution flow
- Each user controls their own GitHub resources

#### User Setup Flow

1. **User forks** the target repo on GitHub (e.g., forks `odriverobotics/ODrive` to `<username>/ODrive`)
2. **Agent prompts user** for their fork location at startup:
   ```
   Enter your forked repository (owner/repo): myusername/ODrive
   ```
   Or provide via CLI flag/env var:
   - `--fork-owner <username>` or `--repo <owner/repo>`
   - `GITHUB_FORK_OWNER` env var
3. **All operations target the fork** – file reads, analysis, branch creation, PRs

| Aspect | Value |
|--------|-------|
| **Analysis target** | User's fork (`<username>/<RepoName>`) – NOT upstream |
| **Upstream repo** | Referenced only for documentation (e.g., `odriverobotics/ODrive`) |
| **Fork repo** | User's fork (e.g., `<username>/ODrive`) |
| **Fork owner** | Runtime parameter: `--fork-owner` or `GITHUB_FORK_OWNER` env var |
| **Fork URL** | Computed: `https://github.com/${forkOwner}/${repoName}` |
| **Authentication** | User's GitHub token authenticates to their fork |

**User prerequisite:** Fork the target repo before running the agent.

#### Interactive Prompt (if not provided via CLI)

```typescript
// On agent startup, if fork location not provided:
const forkRepo = await promptUser({
  message: 'Enter your forked repository (owner/repo):',
  validate: (input) => /^[\w-]+\/[\w.-]+$/.test(input) || 'Format: owner/repo',
  examples: ['myusername/ODrive', 'contoso/legacy-app']
});
```

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

#### Planning Agent Artifacts

| Artifact | Purpose | Enterprise Value |
|----------|---------|------------------|
| `Manifest.json` | Run metadata (runId, commitSha, timestamps) | Audit trail, reproducibility |
| `RunLog.jsonl` | Tool execution trace (start/stop, input/output hashes) | **Governance compliance**, action traceability |
| `DependencyGraph.json` | Include/import graphs for all language domains | System boundary discovery |
| `RiskAssessment.json` | Ranked risk items with scores, evidence, safety flags | **Risk intelligence** for stakeholders |
| `DocCoverage.json` | Documentation coverage analysis + generated stubs | Addresses sparse documentation |

#### Implementation Agent Artifacts

| Artifact | Purpose | Enterprise Value |
|----------|---------|------------------|
| `ModernizationPlan.json` | Phased improvement steps referencing risk IDs | Roadmap for transformation |
| `TestScaffold.json` | Generated test entry points + coverage gaps | **Test scaffolding** for minimal-coverage systems |

#### Stack Evaluation Agent Artifacts

| Artifact | Purpose | Enterprise Value |
|----------|---------|------------------|
| `StackAnalysis.json` | Current technology fingerprint (languages, frameworks, deps) | **Stack visibility** for decision makers |
| `MigrationOptions.json` | Evaluated migration targets with scores + trade-offs | **Migration intelligence** |
| `UserDecisions.json` | Captured user responses to clarifying questions | **Decision audit trail** |

---

### Core Constraints

- **Multi-agent isolation** – each agent has separate context; no cross-agent memory bleed
- **Planning Agent is read-only** – cannot modify repository; analysis only
- **Implementation Agent requires Planning artifacts** – does not re-analyze; trusts planning output
- **Stack Evaluation Agent is interactive** – must ask clarifying questions before recommendations
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
- No agent-to-agent direct communication (artifacts only)

---

### CLI Interface

#### Commands (Multi-Agent Dispatch)

| Command | Agent | Description |
|---------|-------|-------------|
| `analyze` | Planning Agent | Analyze codebase, produce intelligence artifacts |
| `implement` | Implementation Agent | Generate scaffolds/docs from planning artifacts |
| `evaluate-stack` | Stack Evaluation Agent | Interactive stack review with user Q&A |
| `full-pipeline` | All Agents | Run complete pipeline: analyze → evaluate → implement |

#### Global Arguments

| Argument | Env Var | Required | Description |
|----------|---------|----------|-------------|
| `--fork-owner` | `GITHUB_FORK_OWNER` | **Yes** | GitHub username or org owning the fork |
| `--repo` | - | Yes | Path to fixture JSON |
| `--profile` | - | No | Path to profile JSON (defaults from fixture) |
| `--ref` | - | No | SHA to analyze (defaults to baseline) |
| `--out` | - | No | Output directory (defaults to `artifacts/`) |
| `--enable-writes` | - | No | Enable gated write operations (Implementation Agent only) |
| `--interactive` | - | No | Enable user prompts (Stack Evaluation Agent) |

**Example invocations:**
```bash
# Planning Agent: analyze ODrive
npx jurassic analyze --fork-owner alice --repo specs/repos/odrive.fixture.json

# Stack Evaluation Agent: interactive stack review
npx jurassic evaluate-stack --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive

# Implementation Agent: generate scaffolds from existing plan
npx jurassic implement --fork-owner alice --repo specs/repos/odrive.fixture.json --enable-writes

# Full pipeline with all agents
npx jurassic full-pipeline --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive
```

---

### Steps

#### Phase 0: Project Scaffolding

1. **Initialize pnpm workspace** – `pnpm-workspace.yaml`, root `package.json` (engines: node >=20), `tsconfig.base.json`.

2. **Create package structure**  
   - `packages/agents/` – Multi-agent system (Copilot SDK)  
   - `packages/skills/` – custom analysis skills (fw_include_graph, risk_scoring, etc.)  
   - `packages/schemas/` – JSON schemas + Ajv validation  
   - `packages/foundry/` – Foundry integration (model config, hosting, evaluation)  
   - `packages/auth/` – Azure authentication (DefaultAzureCredential wrapper)  
   - `packages/data/` – Azure data services (Microsoft Fabric, Cosmos DB, App Insights)  
   - `apps/cli/` – thin CLI wrapper that invokes the agent

3. **Install Copilot SDK** – `@github/copilot-sdk` + dependencies.

4. **Install Azure SDKs**:
   - `@azure/identity` – DefaultAzureCredential for passwordless auth
   - `@azure/cosmos` – Run metadata and session state
   - `@azure/monitor-opentelemetry` – Application Insights telemetry
   - (Fabric uses OneLake DLS Gen2 compatible APIs via fetch)

5. **Configure Microsoft Foundry**:
   - Create Foundry project via `azd init` or MCP tools
   - Deploy model(s) to Foundry (GPT-4o recommended)
   - Configure BYOM (Bring Your Own Model) for Copilot SDK
   - Set up `DefaultAzureCredential` for model access
   - Store Foundry config in `infra/foundry.config.json`

6. **Configure Azure Data Services + Microsoft Fabric**:
   - Create Microsoft Fabric workspace with Lakehouse for artifact persistence
   - Create Cosmos DB account for run metadata
   - Create Application Insights for telemetry
   - Assign RBAC roles to developer identities (Fabric Contributor, OneLake Storage access)
   - Store data config in `infra/data.config.json`

7. **Add dev tooling** – ESLint, Prettier, Vitest.

8. **Bootstrap CI** – `.github/workflows/ci.yml` with OIDC for Azure auth.

---

#### Phase A: Constitution + Fixture (PR0)

9. **Create constitution** at `.specify/memory/constitution.md`  
   - Default READ-ONLY  
   - Fork-first required  
   - Writes require explicit gate  
   - Artifacts must validate schemas  
   - Artifacts must be deterministic  
   - Tool execution logged
   - **Foundry model usage required** (no direct OpenAI API calls)
   - **BYOM via DefaultAzureCredential** (no API keys in code)
   - **Passwordless auth required** (no secrets in code)

10. **Create ODrive fixture** at `specs/repos/odrive.fixture.json`:
   ```json
   {
     "upstreamUrl": "https://github.com/odriverobotics/ODrive",
     "repoName": "ODrive",
     "defaultBranch": "master",
     "pinnedShas": {
       "baseline": "3a2e4dd1bfbda9e4c534d5c7d8428a99c361e783",
       "stress": "e2df8e9e74655144819a3734e2e99e1aa44d8bd7"
     },
     "profilePath": "specs/repos/odrive.profile.json",
     "foundry": {
       "projectEndpoint": "${AZURE_AI_PROJECT_ENDPOINT}",
       "modelDeployment": "gpt-4o",
       "evaluationEnabled": true
     }
   }
   ```
   **Note:** No `forkUrl` – computed at runtime from `--fork-owner` + `repoName`. Foundry config uses env vars.

11. **Create ODrive profile** at `specs/repos/odrive.profile.json` – include/exclude globs, risk weights.

12. **Document prerequisites** in `README.md`:
   ```markdown
   ## Prerequisites
   
   ### GitHub Setup (Fork the target repo first!)
   1. **Fork the target repo** to your GitHub account on GitHub.com
   2. The agent will prompt you for your fork location at startup:
      ```
      Enter your forked repository (owner/repo): myusername/ODrive
      ```
   3. Or set `GITHUB_FORK_OWNER` env var / pass `--fork-owner <your-username>` to skip prompt
   
   > **Important:** All analysis happens on YOUR FORK, not the upstream repo.
   > You must have push access to the fork for the agent to create branches/PRs.
   
   ### Azure AI Setup
   4. Create Azure AI Foundry project and deploy GPT-4o model
   5. Set `AZURE_AI_PROJECT_ENDPOINT` env var
   
   ### Microsoft Fabric Setup
   5. Create Microsoft Fabric workspace with Lakehouse (or use `azd up`)
   6. Set `FABRIC_WORKSPACE_ID` env var
   7. Set `FABRIC_LAKEHOUSE_ID` env var
   
   ### Azure Data Services Setup
   8. Create Cosmos DB account (or use `azd up` to provision)
   9. Set `AZURE_COSMOS_ENDPOINT` env var
   10. Create Application Insights (or use `azd up` to provision)
   11. Set `APPLICATIONINSIGHTS_CONNECTION_STRING` env var
   
   ### Authentication
   12. Authenticate with `az login` (for DefaultAzureCredential)
   13. Ensure you have required RBAC roles (see Authentication Strategy)
   14. Grant Fabric workspace access to your identity
   
   ### Quick Start (recommended)
   Run `azd up` to provision Azure resources (Cosmos DB, App Insights, Container Apps).
   Fabric workspace must be created manually in the Fabric portal.
   ```

---

#### Phase B: Schemas + Artifacts Contract (PR0)

13. **Create JSON schemas** under `specs/schemas/`:
    
    **Planning Agent Artifacts:**
    - `Manifest.schema.json`
    - `RunLogEvent.schema.json`
    - `DependencyGraph.schema.json`
    - `RiskAssessment.schema.json`
    - `DocCoverage.schema.json`
    
    **Implementation Agent Artifacts:**
    - `ModernizationPlan.schema.json`
    - `TestScaffold.schema.json`
    
    **Stack Evaluation Agent Artifacts:**
    - `StackAnalysis.schema.json` – technology inventory (languages, frameworks, versions)
    - `MigrationOptions.schema.json` – scored migration paths with trade-offs
    - `UserDecisions.schema.json` – captured user responses to clarifying questions

14. **Create artifacts contract** at `specs/functional/artifacts.md`.

15. **Add schema validator** at `packages/schemas/src/validator.ts` using Ajv.

16. **Add failing acceptance tests** (red baseline).

---

#### Phase C: Multi-Agent Setup (PR1)

17. **Create agent base** at `packages/agents/src/base.ts`:
    - Base agent class with common SDK initialization
    - Context isolation enforcement
    - Artifact I/O helpers

18. **Create Planning Agent** at `packages/agents/src/planning/index.ts`:
    - Initialize Copilot SDK client with read-only permissions
    - Register analysis skills (repo_snapshot, *_include_graph, risk_scoring, etc.)
    - System prompt: legacy analysis focus, explicitly read-only
    - Cannot access Implementation Agent artifacts

19. **Create Implementation Agent** at `packages/agents/src/implementation/index.ts`:
    - Initialize Copilot SDK client with gated write permissions
    - Register generation skills (plan_synthesis, test_scaffold, pr_writer)
    - Requires Planning Agent artifacts as input
    - System prompt: scaffolding focus, no direct analysis

20. **Create Stack Evaluation Agent** at `packages/agents/src/stack-evaluation/index.ts`:
    - Initialize Copilot SDK client with interactive mode
    - Register stack skills (stack_fingerprint, migration_evaluator, user_dialog)
    - System prompt: technology advisor, asks clarifying questions
    - User dialog capability for gathering requirements

21. **Create orchestrator** at `packages/agents/src/orchestrator.ts`:
    - Dispatches commands to appropriate agent
    - Manages artifact handoffs between agents
    - Enforces agent isolation boundaries

22. **Add multi-agent spec** at `specs/functional/multi-agent.md`:
    - Documents agent responsibilities
    - Context isolation rules
    - Artifact communication protocol

---

#### Phase D: Custom Skills (PR1–PR3)

Each skill is a function registered with the Copilot SDK:

23. **repo_snapshot skill** (PR1)  
    - Spec: `specs/functional/skills/repo_snapshot.md`  
    - Impl: `packages/skills/src/repo_snapshot.ts`  
    - **Fork-aware**: Receives `forkOwner` parameter, computes fork URL  
    - Uses GitHub MCP tools (`mcp_io_github_git_fork_repository`, `mcp_io_github_git_get_file_contents`) to clone/checkout pinned SHA from fork  
    - Adds upstream as read-only remote  
    - Returns file index + commit SHA

24. **fw_include_graph skill** (PR1)  
    - Spec: `specs/functional/skills/fw_include_graph.md`  
    - Impl: `packages/skills/src/fw_include_graph.ts`  
    - Parses `#include` in `Firmware/**`, builds graph, detects SCCs  
    - Uses GitHub MCP (`mcp_io_github_git_get_file_contents`) for source access

25. **py_import_graph skill** (PR1)  
    - Spec: `specs/functional/skills/py_import_graph.md`  
    - Impl: `packages/skills/src/py_import_graph.ts`

26. **gui_import_graph skill** (PR1)  
    - Spec: `specs/functional/skills/gui_import_graph.md`  
    - Impl: `packages/skills/src/gui_import_graph.ts`

27. **git_churn skill** (PR2)  
    - Spec: `specs/functional/skills/git_churn.md`  
    - Impl: `packages/skills/src/git_churn.ts`  
    - Uses GitHub MCP tools (`mcp_io_github_git_list_commits`) to fetch commit history

28. **complexity_metrics skill** (PR2)  
    - Spec: `specs/functional/skills/complexity_metrics.md`  
    - Impl: `packages/skills/src/complexity_metrics.ts`

29. **risk_scoring skill** (PR2)  
    - Spec: `specs/functional/skills/risk_scoring.md`  
    - Impl: `packages/skills/src/risk_scoring.ts`

30. **plan_synthesis skill** (PR3)  
    - Spec: `specs/functional/skills/plan_synthesis.md`  
    - Impl: `packages/skills/src/plan_synthesis.ts`

31. **safety_path_analysis skill** (PR2)  
    - Spec: `specs/functional/skills/safety_path_analysis.md`  
    - Impl: `packages/skills/src/safety_path_analysis.ts`  
    - Identifies safety-critical code paths (interrupt handlers, watchdogs, fail-safes)  
    - Flags high-risk modification zones  
    - Feeds into RiskAssessment with safety severity multiplier

32. **doc_coverage_analysis skill** (PR3)  
    - Spec: `specs/functional/skills/doc_coverage_analysis.md`  
    - Impl: `packages/skills/src/doc_coverage_analysis.ts`  
    - Scans for undocumented public APIs, missing READMEs, stale comments  
    - Produces `DocCoverage.json` with coverage percentages + gap list  
    - Generates documentation stub templates

33. **test_scaffold skill** (PR3)  
    - Spec: `specs/functional/skills/test_scaffold.md`  
    - Impl: `packages/skills/src/test_scaffold.ts`  
    - Identifies testable entry points (exported functions, API endpoints)  
    - Maps existing test coverage (if any)  
    - Produces `TestScaffold.json` with test file templates + priority ranking

34. **dsl_parser_registry** (PR1)  
    - Spec: `specs/functional/skills/dsl_parser_registry.md`  
    - Impl: `packages/skills/src/dsl_parser_registry.ts`  
    - Extensible registry for proprietary DSL parsers  
    - Default parsers: C/C++ includes, Python imports, JS/Vue imports  
    - Plugin interface for enterprise-specific languages

---

#### Phase D-2: Stack Evaluation Agent Skills (PR2)

35. **stack_fingerprint skill** (PR2)  
    - Spec: `specs/functional/skills/stack_fingerprint.md`  
    - Impl: `packages/skills/src/stack_fingerprint.ts`  
    - Detects languages, frameworks, build tools, package managers  
    - Identifies runtime dependencies and versions  
    - Produces technology inventory with confidence scores

36. **migration_evaluator skill** (PR2)  
    - Spec: `specs/functional/skills/migration_evaluator.md`  
    - Impl: `packages/skills/src/migration_evaluator.ts`  
    - Maintains catalog of known migration paths (e.g., Vue 2→3, Python 2→3, .NET Framework→.NET 8)  
    - Scores migration options based on: effort, risk, ecosystem support, team expertise  
    - Cross-references with current stack fingerprint

37. **user_dialog skill** (PR2)  
    - Spec: `specs/functional/skills/user_dialog.md`  
    - Impl: `packages/skills/src/user_dialog.ts`  
    - **Core interactive capability**  
    - Presents structured questions to user (multi-choice, scale, free-text)  
    - Validates and captures responses  
    - Question categories:
      - **Business drivers**: "What is driving this modernization?" (compliance, performance, maintainability, cost)
      - **Constraints**: "What is the acceptable downtime during migration?"
      - **Expertise**: "Rate your team's familiarity with X (1-5)"
      - **Timeline**: "What is your target completion date?"
      - **Budget**: "Is there budget for retraining or external consultants?"
    - Stores responses in `UserDecisions.json`

38. **stack_recommendation skill** (PR3)  
    - Spec: `specs/functional/skills/stack_recommendation.md`  
    - Impl: `packages/skills/src/stack_recommendation.ts`  
    - Synthesizes stack fingerprint + migration options + user decisions  
    - Produces ranked recommendations with pros/cons  
    - Highlights risks and prerequisites for each option

---

#### Phase E: Agent Workflows (PR1–PR3)

39. **Create Planning Agent workflow** at `packages/agents/src/planning/workflow.ts`:
    - Orchestrates analysis skills in sequence
    - Writes artifacts to `artifacts/<runId>/planning/`
    - Emits RunLog events
    - Validates schemas at end
    - Strictly read-only execution

40. **Create Stack Evaluation workflow** at `packages/agents/src/stack-evaluation/workflow.ts`:
    - Runs stack fingerprinting
    - Presents clarifying questions to user via `user_dialog` skill
    - Waits for user responses (interactive mode)
    - Evaluates migration options based on responses
    - Writes artifacts to `artifacts/<runId>/stack-evaluation/`

41. **Create Implementation Agent workflow** at `packages/agents/src/implementation/workflow.ts`:
    - Loads Planning Agent artifacts as input
    - Generates test scaffolds and documentation
    - Handles gated PR creation
    - Writes artifacts to `artifacts/<runId>/implementation/`

42. **Create CLI wrapper** at `apps/cli/src/index.ts`:
    - Multi-command dispatcher (analyze, evaluate-stack, implement, execute-migration, full-pipeline)
    - **Prompts user for fork location** if not provided via CLI/env:
      ```
      Enter your forked repository (owner/repo): myusername/ODrive
      ```
    - **Parses `--fork-owner` or `--repo`**, validates format, computes fork URL
    - All operations target the user's fork (analysis, branch creation, PRs)
    - Routes to appropriate agent via orchestrator
    - Handles `--interactive` flag for Stack Evaluation Agent
    - Handles `--plan-approved` flag for Code Implementation Agent

43. **Add e2e tests** – run twice on baseline SHA, assert determinism for each agent.

---

#### Phase F: Policy Gate + PR Writer (PR4)

44. **Create policy skill** at `packages/skills/src/policy.ts`:
    - Enforces read-only default
    - Checks for gate file + `--enable-writes` + CI env before allowing writes
    - Validates agent permissions (only Implementation Agent can write)

45. **Create PR writer skill** at `packages/skills/src/pr_writer.ts`:
    - **Fork-aware**: Receives `forkOwner` parameter, pushes to user's fork only
    - Uses **GitHub MCP** tools: `mcp_io_github_git_create_branch`, `mcp_io_github_git_push_files`, `mcp_io_github_git_create_pull_request`
    - Allowed outputs: tests under `tools/`, docs under `docs/`, lint/config
    - Generates PR description referencing artifact IDs + risk items
    - Includes Stack Evaluation conclusions if available

46. **Add policy + pr-writer specs**.

47. **Add gate tests** – without gate: fails; with gate: writes only allowlisted paths.

---

#### Phase G: CI Finalization (PR4)

48. **Finalize CI** at `.github/workflows/ci.yml`:
    - Install Copilot CLI + deps
    - Configure Foundry connection (via Workload Identity or service principal)
    - Run unit tests for all agents
    - Run e2e for each agent individually
    - Run e2e for full-pipeline
    - Schema validation for all artifact types
    - Determinism check per agent
    - Upload artifacts

49. **Add manual approval workflow** for write operations.

---

#### Phase H: Foundry Hosting + Evaluation (PR5)

50. **Create Foundry model configuration** at `packages/foundry/src/model-config.ts`:
    - BYOM configuration for Copilot SDK
    - `DefaultAzureCredential` for authentication
    - Model endpoint from Foundry project
    - Fallback model configuration
    ```typescript
    import { DefaultAzureCredential } from '@azure/identity';
    
    export const modelConfig = {
      model: process.env.FOUNDRY_MODEL_DEPLOYMENT || 'gpt-4o',
      provider: {
        endpoint: process.env.AZURE_AI_PROJECT_ENDPOINT,
        bearerToken: async () => {
          const credential = new DefaultAzureCredential();
          const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
          return token.token;
        }
      }
    };
    ```

51. **Create Dockerfile** at `infra/Dockerfile`:
    - Multi-stage build for Node.js agent
    - Copies agent code + skills
    - Exposes agent endpoint
    - Health check endpoint

52. **Create Foundry hosting workflow** at `packages/foundry/src/hosting.ts`:
    - Containerize agent using Azure CLI (`az acr build`)
    - Push to Azure Container Registry (`az acr push`)
    - Deploy as Foundry hosted agent (`az containerapp create/update`)
    - Configure agent endpoints via `az containerapp ingress`

53. **Create evaluation workflow** at `packages/foundry/src/evaluation.ts`:
    - Test suite for agent quality
    - Uses Azure CLI (`az ai evaluation run`, `az monitor metrics`)
    - Evaluates: accuracy, safety, relevance
    - Produces `EvaluationReport.json`

54. **Add Foundry specs**:
    - `specs/functional/foundry-hosting.md`
    - `specs/functional/foundry-evaluation.md`
    - `specs/functional/byom.md`
    - `specs/schemas/EvaluationReport.schema.json`

55. **Add `azd` configuration** at `azure.yaml`:
    ```yaml
    name: jurassic-modernization-agent
    services:
      agent:
        project: ./apps/cli
        language: ts
        host: containerapp
    infra:
      provider: bicep
    ```

56. **Create Bicep infrastructure** under `infra/`:
    - `main.bicep` – orchestrates all resources
    - `foundry-project.bicep` – AI Foundry project
    - `model-deployment.bicep` – GPT-4o deployment with quota
    - `container-registry.bicep` – ACR for agent images
    - `container-app.bicep` – hosted agent deployment
    - `cosmos-db.bicep` – Cosmos DB for run metadata
    - `app-insights.bicep` – Application Insights for telemetry
    > **Note:** Microsoft Fabric workspace/Lakehouse is provisioned manually via the Fabric portal and referenced via `FABRIC_WORKSPACE_ID` / `FABRIC_LAKEHOUSE_ID` environment variables.

---

#### Phase I: Azure Data Services + Authentication (PR5)

57. **Create authentication package** at `packages/auth/`:
    - `packages/auth/src/credential.ts` – `DefaultAzureCredential` wrapper
    - `packages/auth/src/token.ts` – Token acquisition helpers for different scopes
    - Environment detection (local dev, GitHub Actions, Container Apps)
    - Managed Identity support for production deployments

58. **Create data package** at `packages/data/`:
    - `packages/data/src/fabric-config.ts` – Microsoft Fabric OneLake client initialization
    - `packages/data/src/cosmos-config.ts` – Cosmos DB client initialization
    - `packages/data/src/artifact-store.ts` – Artifact persistence operations:
      - `uploadArtifact(runId, artifactName, content)` – Upload to Fabric Lakehouse
      - `downloadArtifact(runId, artifactName)` – Retrieve from Fabric Lakehouse
      - `listRunArtifacts(runId)` – List all artifacts for a run
      - `markApproved(runId)` – Create APPROVED marker for Code Implementation Agent
    - `packages/data/src/telemetry.ts` – Application Insights integration:
      - `trackAgentEvent(eventName, properties)` – Custom events
      - `trackSkillInvocation(skillName, duration, success)` – Skill metrics
      - `trackRunCompletion(runId, agentType, success)` – Run tracking

59. **Create run metadata service** at `packages/data/src/run-metadata.ts`:
    - Cosmos DB operations for run metadata
    - `createRun(runId, agentType, config)` – Initialize run record
    - `updateRunStatus(runId, status)` – Update run state
    - `recordSkillInvocation(runId, skillName, input, output)` – Log skill calls
    - `finalizeRun(runId, artifacts, success)` – Complete run record

60. **Add data service specs**:
    - `specs/functional/artifact-persistence.md`
    - `specs/functional/telemetry.md`
    - `specs/functional/authentication.md`
    - Document RBAC requirements for each service

61. **Update agents to use data services**:
    - Planning Agent: Upload artifacts to Fabric Lakehouse after analysis
    - Implementation Agent: Download Planning artifacts, upload Implementation artifacts
    - Stack Evaluation Agent: Persist user decisions and recommendations
    - Code Implementation Agent: Check for APPROVED marker, download approved artifacts, upload code changes
    - All agents: Track telemetry via Application Insights

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
│           └── index.ts          # Multi-command dispatcher, routes to agents
├── packages/
│   ├── agents/                   # Multi-agent system
│   │   ├── package.json
│   │   └── src/
│   │       ├── base.ts           # Base agent class, common SDK init
│   │       ├── orchestrator.ts   # Agent dispatcher, artifact handoff
│   │       ├── planning/         # PLANNING AGENT (read-only analysis)
│   │       │   ├── index.ts      # Agent definition + skill registration
│   │       │   └── workflow.ts   # Analysis orchestration
│   │       ├── implementation/   # IMPLEMENTATION AGENT (gated writes)
│   │       │   ├── index.ts      # Agent definition + skill registration
│   │       │   └── workflow.ts   # Scaffold generation orchestration
│   │       ├── stack-evaluation/ # STACK EVALUATION AGENT (interactive)
│   │       │   ├── index.ts      # Agent definition + skill registration
│   │       │   └── workflow.ts   # Interactive stack review workflow
│   │       └── code-implementation/ # CODE IMPLEMENTATION AGENT (human-approved code assistant)
│   │           ├── index.ts      # Agent definition + skill registration
│   │           ├── workflow.ts   # Code migration orchestration
│   │           └── approval-gate.ts # Checks APPROVED marker before execution
│   ├── skills/
│   │   ├── package.json
│   │   └── src/
│   │       ├── repo_snapshot.ts        # Fork-aware: accepts forkOwner
│   │       ├── dsl_parser_registry.ts  # Extensible DSL parser registry
│   │       ├── fw_include_graph.ts     # [Planning Agent]
│   │       ├── py_import_graph.ts      # [Planning Agent]
│   │       ├── gui_import_graph.ts     # [Planning Agent]
│   │       ├── git_churn.ts            # [Planning Agent]
│   │       ├── complexity_metrics.ts   # [Planning Agent]
│   │       ├── safety_path_analysis.ts # [Planning Agent]
│   │       ├── risk_scoring.ts         # [Planning Agent]
│   │       ├── doc_coverage_analysis.ts# [Planning Agent]
│   │       ├── stack_fingerprint.ts    # [Stack Evaluation Agent]
│   │       ├── migration_evaluator.ts  # [Stack Evaluation Agent]
│   │       ├── user_dialog.ts          # [Stack Evaluation Agent] - interactive Q&A
│   │       ├── stack_recommendation.ts # [Stack Evaluation Agent]
│   │       ├── test_scaffold.ts        # [Implementation Agent]
│   │       ├── plan_synthesis.ts       # [Implementation Agent]
│   │       ├── policy.ts               # [Implementation Agent]
│   │       ├── pr_writer.ts            # [Implementation Agent] Fork-aware
│   │       ├── code_refactor.ts        # [Code Implementation Agent]
│   │       ├── migration_executor.ts   # [Code Implementation Agent]
│   │       ├── dependency_upgrader.ts  # [Code Implementation Agent]
│   │       ├── test_writer.ts          # [Code Implementation Agent]
│   │       ├── code_reviewer.ts        # [Code Implementation Agent]
│   │       └── incremental_pr.ts       # [Code Implementation Agent] Fork-aware
│   ├── foundry/                  # NEW: Microsoft Foundry integration
│   │   ├── package.json
│   │   └── src/
│   │       ├── model-config.ts   # BYOM configuration for Copilot SDK
│   │       ├── hosting.ts        # Container deployment to Foundry
│   │       └── evaluation.ts     # Agent evaluation workflow
│   ├── auth/                     # NEW: Azure authentication
│   │   ├── package.json
│   │   └── src/
│   │       ├── credential.ts     # DefaultAzureCredential wrapper
│   │       └── token.ts          # Token acquisition for services
│   ├── data/                     # NEW: Azure data services + Fabric
│   │   ├── package.json
│   │   └── src/
│   │       ├── fabric-config.ts  # Microsoft Fabric OneLake client
│   │       ├── cosmos-config.ts  # Cosmos DB client
│   │       ├── artifact-store.ts # Artifact persistence operations
│   │       └── telemetry.ts      # Application Insights integration
│   └── schemas/
│       ├── package.json
│       └── src/
│           └── validator.ts
├── specs/
│   ├── repos/
│   │   ├── odrive.fixture.json   # upstreamUrl + repoName + Foundry config
│   │   └── odrive.profile.json
│   ├── schemas/
│   │   ├── Manifest.schema.json
│   │   ├── RunLogEvent.schema.json
│   │   ├── DependencyGraph.schema.json
│   │   ├── RiskAssessment.schema.json
│   │   ├── ModernizationPlan.schema.json
│   │   ├── TestScaffold.schema.json
│   │   ├── DocCoverage.schema.json
│   │   ├── StackAnalysis.schema.json       # NEW: Stack Evaluation
│   │   ├── MigrationOptions.schema.json    # NEW: Stack Evaluation
│   │   ├── UserDecisions.schema.json       # NEW: Stack Evaluation
│   │   └── EvaluationReport.schema.json    # NEW: Foundry evaluation
│   └── functional/
│       ├── artifacts.md
│       ├── multi-agent.md        # NEW: Multi-agent architecture spec
│       ├── planning-agent.md     # NEW: Planning Agent behavior
│       ├── implementation-agent.md # NEW: Implementation Agent behavior
│       ├── stack-evaluation-agent.md # NEW: Stack Evaluation Agent behavior
│       ├── foundry-hosting.md    # NEW: Foundry hosting spec
│       ├── foundry-evaluation.md # NEW: Foundry evaluation spec
│       ├── byom.md               # NEW: BYOM configuration spec
│       ├── analyze.md
│       ├── policy.md
│       ├── pr-writer.md
│       ├── ci.md
│       └── skills/
│           ├── repo_snapshot.md
│           ├── fw_include_graph.md
│           ├── stack_fingerprint.md  # NEW
│           ├── migration_evaluator.md# NEW
│           ├── user_dialog.md        # NEW
│           ├── stack_recommendation.md # NEW
│           └── ...
├── infra/                        # NEW: Azure infrastructure
│   ├── main.bicep                # Orchestrates all resources
│   ├── foundry-project.bicep     # AI Foundry project
│   ├── model-deployment.bicep    # GPT-4o deployment with quota
│   ├── container-registry.bicep  # ACR for agent images
│   ├── container-app.bicep       # Hosted agent deployment
│   ├── Dockerfile                # Multi-stage Node.js agent build
│   └── foundry.config.json       # Foundry project configuration
├── azure.yaml                    # NEW: azd configuration
├── pnpm-workspace.yaml
├── package.json
├── README.md                     # Documents fork prerequisite + Foundry setup
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
| **Planning Agent** | `analyze` produces 5 artifacts (Manifest, RunLog, DependencyGraph, RiskAssessment, DocCoverage) |
| **Implementation Agent** | `implement` produces 2 artifacts (ModernizationPlan, TestScaffold) |
| **Stack Evaluation Agent** | `evaluate-stack` produces 3 artifacts (StackAnalysis, MigrationOptions, UserDecisions) |
| **Full Pipeline** | `full-pipeline` produces all **10 artifacts** |
| Schema validation | Vitest tests with `validateArtifact()` for all artifact types |
| Determinism | Two runs per agent, compare artifacts |
| Agent isolation | Planning Agent cannot access Implementation artifacts |
| Gated writes | Implementation Agent fails without `--enable-writes` |
| **User dialog works** | Stack Evaluation Agent prompts user and captures responses |
| CI green | GitHub Actions passes |
| Safety paths identified | `RiskAssessment.json` contains safety-critical flags |
| Test scaffolds generated | `TestScaffold.json` contains test entry points |
| Doc coverage analyzed | `DocCoverage.json` identifies documentation gaps |
| Stack fingerprint accurate | `StackAnalysis.json` correctly identifies tech stack |
| Migration options scored | `MigrationOptions.json` contains ranked migration paths |
| **Foundry connection** | `azd env get-values` returns `AZURE_AI_PROJECT_ENDPOINT` |
| **Model deployment** | Foundry model responds to test prompt |
| **BYOM working** | Copilot SDK uses Foundry model via `DefaultAzureCredential` |
| **Container build** | `docker build` succeeds, image pushed to ACR |
| **Hosted agent deploy** | Foundry `agent_get` returns agent status |
| **Evaluation passes** | `EvaluationReport.json` shows acceptable scores |

---

### Decisions

| Decision | Rationale |
|----------|-----------|
| **Multi-agent architecture** | Separates concerns, isolates context, enables specialized behaviors |
| **Planning Agent (read-only)** | Analysis should never accidentally modify code |
| **Implementation Agent (gated)** | Writes require explicit approval + artifact handoff |
| **Stack Evaluation Agent (interactive)** | Migration decisions require human input; agent asks clarifying questions |
| **Artifact-based communication** | No direct agent-to-agent calls; schema-validated handoffs |
| **User dialog capability** | Enterprise decisions require gathering requirements interactively |
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
| **Custom skills per agent** | Each agent loads only the skills it needs |
| **GitHub MCP tools** | Leverage GitHub MCP for all repo operations: `mcp_io_github_git_*` |
| **Skill-based architecture** | Each analysis capability is a registered skill, composable |
| **Thin CLI wrapper** | CLI just invokes orchestrator, orchestrator dispatches to agents |
| **DSL parser registry** | Extensible for proprietary enterprise languages |
| **Safety path analysis** | Critical for industrial/aerospace/energy legacy systems |
| **Test scaffold generation** | Addresses minimal test coverage in legacy systems |
| **Doc coverage analysis** | Extracts institutional knowledge, identifies gaps |
| **Stack fingerprinting** | Automated detection of current technology inventory |
| **Migration evaluation** | Systematic comparison of modernization options |
| **Audit-first logging** | Every action logged for enterprise governance compliance |
| **Baseline SHA**: `3a2e4dd` | Most recent commit (Jan 2026), includes CI/actions updates |
| **Stress SHA**: `e2df8e9` | v0.5.5 merge with substantial code changes, good for comparison testing |
| **Tarjan SCC** | O(V+E) for include graph cycle detection |
| **Stable ID**: `sha256(normalizedPath:type:toolVersion)` | Ensures determinism |
| **Copilot SDK + Foundry hybrid** | SDK for orchestration, Foundry for hosting/models/evaluation |
| **BYOM via DefaultAzureCredential** | No API keys in code; uses managed identity |
| **Foundry model deployments** | Enterprise-grade quota, RBAC, monitoring |
| **Microsoft Fabric for artifacts** | Lakehouse analytics; Power BI integration; PySpark notebooks; OneLake API |
| **Cosmos DB for run metadata** | Schema-flexible; low-latency queries; geo-redundancy |
| **Application Insights for telemetry** | Integrated Azure monitoring; custom metrics; distributed tracing |
| **Passwordless auth everywhere** | `DefaultAzureCredential` chain; no secrets rotation burden |
| **RBAC for data access** | Least-privilege; auditable; no shared keys |
| **Foundry hosted agents** | Production-ready container hosting with auto-scaling |
| **Foundry evaluation** | Built-in quality assurance for agent responses |
| **azd for deployment** | Consistent, repeatable infrastructure provisioning |
| **Code Implementation Agent** | Human-approved code assistant; executes migration after artifacts approved |
| **Human approval gate** | Safety mechanism; no code changes without explicit human review of plan |
| **Incremental PRs** | Code changes delivered as small, reviewable PRs; maintains human control |
| **Bicep for IaC** | Type-safe Azure resource definitions |

---

### PR Sequence

| PR | Contents | Merge Criteria |
|----|----------|----------------|
| **PR0** | Constitution, fixture (with Foundry config), profile, all 11 schemas, artifacts contract, multi-agent spec, failing harness, README | Spec suite exists, contracts defined |
| **PR1** | Multi-agent foundation (base, orchestrator), Planning Agent + workflow, `repo_snapshot` (fork-aware), `dsl_parser_registry`, dependency graph skills, CLI with multi-command dispatch, BYOM config | Planning Agent produces Manifest + RunLog + DependencyGraph using Foundry model |
| **PR2** | Stack Evaluation Agent + workflow, `stack_fingerprint`, `migration_evaluator`, `user_dialog`, `complexity_metrics`, `safety_path_analysis`, `risk_scoring` | Stack Evaluation Agent produces StackAnalysis + MigrationOptions + UserDecisions; user dialog works |
| **PR3** | Implementation Agent + workflow, `doc_coverage_analysis`, `test_scaffold`, `plan_synthesis`, `stack_recommendation` | All 10 artifacts produced, deterministic |
| **PR4** | Policy gate, `pr_writer` (fork-aware), CI finalization, full-pipeline command | Ungated writes impossible; all agents work in sequence |
| **PR5** | Foundry hosting (Dockerfile, ACR push, hosted agent deploy), Foundry evaluation workflow, Bicep infrastructure, `azure.yaml` | Agent deployed to Foundry, evaluation passes |

---

### Definition of Done (Layer 1)

Layer 1 is complete when:
- **Multi-agent architecture** is implemented with 3 specialized agents (Planning, Implementation, Stack Evaluation)
- **Agent isolation** is enforced (each agent has separate context, no cross-agent memory bleed)
- All Layer 1 specs exist and are enforced by CI
- Fork-first workflow is documented and enforced (CLI requires `--fork-owner`)
- **Planning Agent**: `analyze` on pinned ODrive SHA produces 5 artifacts (Manifest, RunLog, DependencyGraph, RiskAssessment, DocCoverage)
- **Implementation Agent**: `implement` produces 2 artifacts (ModernizationPlan, TestScaffold)
- **Stack Evaluation Agent**: `evaluate-stack` produces 3 artifacts (StackAnalysis, MigrationOptions, UserDecisions)
- **Full Pipeline**: `full-pipeline` produces all **10 artifacts**
- **User Dialog**: Stack Evaluation Agent asks clarifying questions before making recommendations
- Artifacts are schema-valid and deterministic
- RunLog provides tool-by-tool traceability for **audit/governance compliance**
- Safety-critical code paths are identified and flagged in RiskAssessment
- Test scaffolds are generated for minimal-coverage codebases
- Documentation gaps are identified with coverage percentages
- Stack fingerprint correctly identifies technology inventory
- Migration options are ranked with trade-offs based on user input
- PR generation is human-gated, fork-only, and limited to safe changes (tests/docs/config)
- **Foundry integration complete**:
  - BYOM configured with `DefaultAzureCredential`
  - Model deployed to Foundry with appropriate quota
  - Agent containerized and deployed to Foundry hosted agents
  - Evaluation workflow produces `EvaluationReport.json`
  - Infrastructure defined in Bicep, deployable via `azd up`
- **Azure Data Services + Microsoft Fabric complete**:
  - Artifacts persisted to Microsoft Fabric Lakehouse after each run
  - Run metadata stored in Cosmos DB for audit trail
  - Telemetry flowing to Application Insights
  - All data access uses `DefaultAzureCredential` (passwordless)
- **Authentication complete**:
  - Local dev works via `az login`
  - GitHub Actions uses Workload Identity (OIDC)
  - Container Apps uses Managed Identity
  - No API keys or secrets in code
  - RBAC roles documented and assigned
- **Code Implementation Agent ready**: human-approved artifacts trigger code assistant for migration execution
