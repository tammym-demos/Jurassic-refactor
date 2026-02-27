## Revised Plan: Layer 1 SDD - Modernization Intelligence Layer (Copilot SDK + Microsoft Foundry)

**TL;DR:** Build a **Modernization Intelligence Layer** using the **GitHub Copilot SDK** (`@github/copilot-sdk`) for agent orchestration and **Microsoft Foundry (Azure AI Foundry)** for production hosting, model deployment, and evaluation. Artifacts are persisted to **Microsoft Fabric** for analytics and data intelligence, run metadata to **Cosmos DB**, and telemetry to **Application Insights**—all using **passwordless authentication** via `DefaultAzureCredential`. The system uses **two specialized agents** (**Planning Agent** + **Implementation Agent**) with separated duties and isolated context, hosted on Foundry with enterprise-grade model management. The **Planning Agent** analyzes any user-provided repository, evaluates the technology stack, asks clarifying questions, and produces intelligence artifacts with migration recommendations. The **Implementation Agent** executes the approved migration plan by making actual code changes. **Fork-first workflow**: user forks the target repo, then **provides their fork location** (prompted or via `--fork-owner`); **all analysis happens on the fork**, never upstream.

---

### Two-Agent Architecture

The system employs a **separation of concerns** pattern with two specialized agents:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER WORKFLOW                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    1. User provides forked repo
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PLANNING AGENT                                      │
│                       (Read-Only + Interactive)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Scan repository structure and file inventory                              │
│  • Detect technology stack (languages, frameworks, dependencies)             │
│  • Build dependency graphs (include/import analysis)                         │
│  • Assess risks (complexity, churn, safety-critical paths)                   │
│  • ASK CLARIFYING QUESTIONS about migration goals                            │
│  • Recommend migration architecture based on findings + user input           │
│  • Generate intelligence artifacts for user review                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    2. Artifacts produced for review
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HUMAN REVIEWS & APPROVES                                │
│          (StackAnalysis, RiskAssessment, ModernizationPlan, etc.)           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    3. User accepts plan (approval gate)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION AGENT                                   │
│                     (Full Code Changes After Approval)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Execute approved modernization plan                                       │
│  • Refactor code according to migration architecture                         │
│  • Upgrade dependencies (e.g., Vue 2 → Vue 3, Python 2 → 3)                  │
│  • Generate and run tests for changed code                                   │
│  • Create incremental PRs with clear scope for human review                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Why Two Agents?

| Single Agent Problems | Two-Agent Solutions |
|-----------------------|---------------------|
| Mixed read/write responsibilities | Clear separation: Planning reads, Implementation writes |
| Risk of unintended writes during analysis | Planning Agent is strictly read-only |
| No checkpoint for human review | Artifacts serve as approval gate between agents |
| Bloated context window | Each agent loads only relevant context |
| No user interaction during analysis | Planning Agent asks clarifying questions |
| Code changes without approval | Implementation Agent blocked until plan approved |
| DIY model management | Foundry handles quotas, RBAC, model catalog |
| No production hosting | Foundry container-based hosted agents |

---

### Agent Definitions

#### 1. Planning Agent (Read-Only + Interactive)

**Purpose:** Analyzes any user-provided repository, evaluates the technology stack, asks clarifying questions about migration goals, and produces intelligence artifacts with migration recommendations.

| Aspect | Details |
|--------|---------|
| **Mode** | Read-only + Interactive; cannot modify repository but engages user in dialog |
| **Context** | Repository structure, file inventory, dependency graphs, git history, user responses |
| **Skills** | `repo_snapshot`, `stack_fingerprint`, `dependency_graph`, `git_churn`, `complexity_metrics`, `safety_path_analysis`, `risk_scoring`, `doc_coverage_analysis`, `user_dialog`, `migration_recommender`, `plan_synthesis` |
| **Outputs** | `Manifest.json`, `RunLog.jsonl`, `StackAnalysis.json`, `DependencyGraph.json`, `RiskAssessment.json`, `DocCoverage.json`, `UserDecisions.json`, `ModernizationPlan.json` |
| **System Prompt Focus** | "You are a legacy system analyst and technology advisor. Your job is to understand any codebase the user provides, identify risks, map dependencies, evaluate the technology stack, and ASK CLARIFYING QUESTIONS to recommend a migration architecture. You NEVER modify code." |

**Workflow:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLANNING AGENT WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1: DISCOVERY (Automatic)                                              │
│  ─────────────────────────────                                               │
│  1. Clone/checkout user's fork at specified SHA                              │
│  2. Scan repository structure and file inventory                             │
│  3. Detect technology stack (languages, frameworks, dependencies)            │
│  4. Build dependency graphs (include/import analysis per language)           │
│  5. Analyze git history for churn hotspots                                   │
│  6. Compute complexity metrics                                               │
│  7. Identify safety-critical code paths                                      │
│  8. Assess documentation coverage                                            │
│                                                                              │
│  PHASE 2: USER DIALOG (Interactive)                                          │
│  ─────────────────────────────────                                           │
│  9. Present stack analysis findings to user                                  │
│  10. ASK CLARIFYING QUESTIONS based on discovered stack:                     │
│      - "What is the primary driver for modernization?"                       │
│      - "What is the target platform/architecture?"                           │
│      - "Are there compliance requirements?"                                  │
│      - "What is the acceptable migration timeline?"                          │
│      - Stack-specific: "Target Python version?", "Vue 3 or alternatives?"    │
│  11. Capture user responses in UserDecisions.json                            │
│                                                                              │
│  PHASE 3: RECOMMENDATION (Synthesis)                                         │
│  ────────────────────────────────────                                        │
│  12. Score risk items based on all analysis + user constraints               │
│  13. Generate migration architecture recommendations                         │
│  14. Synthesize ModernizationPlan.json with phased approach                  │
│  15. Validate all artifacts against schemas                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Non-Interactive Mode (CI/Automation):**
- PHASE 1 (Discovery) runs fully
- PHASE 2 (User Dialog) skipped — no UserDecisions.json produced
- PHASE 3 (Recommendation) skipped — no ModernizationPlan.json produced
- Produces: `StackAnalysis.json`, `DependencyGraph.json`, `RiskAssessment.json`, `DocCoverage.json`

**Context Isolation:**
- Loads only source files + git history from user's fork
- No access to Implementation Agent's code changes
- Cannot execute any write operations on the repository

---

#### 2. Implementation Agent (Full Code Changes After Approval)

**Purpose:** Executes the approved migration plan by making actual code changes. This agent acts as a code assistant that implements the modernization roadmap once artifacts are human-approved.

| Aspect | Details |
|--------|---------|
| **Mode** | Full code changes; writes production code after human approval |
| **Prerequisite** | Requires explicit human approval of Planning Agent artifacts |
| **Context** | Approved `ModernizationPlan.json`, `UserDecisions.json`, `RiskAssessment.json`, target codebase |
| **Skills** | `code_refactor`, `dependency_upgrader`, `test_writer`, `test_scaffold`, `doc_generator`, `incremental_pr`, `policy` |
| **Inputs** | Consumes approved artifacts from Planning Agent |
| **Outputs** | Actual code changes, refactored modules, upgraded dependencies, new tests, documentation, PR branches |
| **System Prompt Focus** | "You are a code implementation assistant. You execute the APPROVED modernization plan. You make incremental, testable code changes following the migration roadmap. You create PRs for human review before merge." |

**Human Approval Gate:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPROVAL WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Planning Agent produces artifacts:                                       │
│     - StackAnalysis.json                                                     │
│     - RiskAssessment.json                                                    │
│     - DependencyGraph.json                                                   │
│     - ModernizationPlan.json                                                 │
│     - UserDecisions.json                                                     │
│                                                                              │
│                    ▼ HUMAN REVIEWS ARTIFACTS ▼                               │
│                                                                              │
│  2. Human approves plan via:                                                 │
│     - `artifacts/<runId>/APPROVED` marker file                               │
│     - CLI flag: `--plan-approved`                                            │
│     - GitHub PR approval on planning PR                                      │
│                                                                              │
│  3. Implementation Agent activates ONLY after approval                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation Workflow:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      IMPLEMENTATION AGENT WORKFLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Load approved ModernizationPlan.json                                     │
│  2. For each migration task in plan:                                         │
│     a. Create feature branch                                                 │
│     b. Make code changes according to task                                   │
│     c. Generate/update tests for changed code                                │
│     d. Update documentation                                                  │
│     e. Create PR with clear scope and description                            │
│     f. Wait for human review before proceeding to next task                  │
│  3. Log all changes to RunLog.jsonl                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Context Isolation:**
- Cannot run without approved artifacts (hard gate)
- Loads only approved planning artifacts + target source code
- Creates separate PR branch for each migration task
- Each PR requires human review before merge

**Code Change Capabilities:**
- Refactor code according to modernization plan
- Upgrade dependencies (e.g., Vue 2 → Vue 3, Python 2 → 3, .NET Framework → .NET 8)
- Implement migration patterns from approved architecture
- Generate and run tests for changed code
- Generate documentation stubs
- Create incremental PRs with clear scope

---

### Agent Communication Protocol

Agents communicate via **artifacts** (files), not direct messages:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARTIFACT FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Planning Agent ──writes──▶ StackAnalysis.json                               │
│                             DependencyGraph.json                             │
│                             RiskAssessment.json                              │
│                             DocCoverage.json                                 │
│                             UserDecisions.json                               │
│                             ModernizationPlan.json                           │
│                                                                              │
│                      ▼ HUMAN APPROVAL GATE ▼                                 │
│                                                                              │
│  Implementation Agent ◀──reads── ALL approved artifacts                      │
│                       ──writes──▶ Code changes (PRs)                         │
│                                   Refactored modules                         │
│                                   New/updated tests                          │
│                                   Documentation                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Rule | Rationale |
|------|-----------|
| No direct agent-to-agent calls | Maintains context isolation |
| Artifacts are the contract | Schema-validated handoff points |
| Human-in-the-loop approval | User reviews and approves plan before Implementation Agent acts |
| **Code changes require approval** | Implementation Agent blocked until artifacts approved |
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
| **Unknown tech stack sprawl** | Planning Agent fingerprints entire technology inventory |
| **Unclear migration paths** | Planning Agent researches and recommends modernization options |
| **Ambiguous modernization requirements** | Planning Agent **asks clarifying questions** to users |

**Why Modernization Stalls → How We Solve It:**

| Stall Reason | Solution |
|--------------|----------|
| Nobody understands system boundaries | `DependencyGraph.json` maps all boundaries |
| Risk is opaque | `RiskAssessment.json` with scored, evidenced risks |
| Test coverage is minimal | `TestScaffold.json` generates test entry points |
| Documentation is outdated | `DocCoverage.json` identifies gaps + generates stubs |
| Refactoring introduces operational risk | Read-only default; gated writes; full audit trail |
| **Stack migration options unclear** | `StackAnalysis.json` + `MigrationOptions.json` with scored paths |
| **Requirements are ambiguous** | Planning Agent **asks clarifying questions** |
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
│  │  │  ┌────────────────────────────────┐ ┌──────────────────────────┐││ │
│  │  │  │          Planning Agent        │ │   Implementation Agent   │││ │
│  │  │  │  (read-only, interactive Q&A)  │ │   (full code changes)    │││ │
│  │  │  │  Analysis + Stack Evaluation   │ │   Executes approved plan │││ │
│  │  │  └────────────────────────────────┘ └──────────────────────────┘││ │
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
| Single monolithic agent | **2 specialized agents** with isolated context |
| `simple-git` for repo ops | **GitHub MCP** (`mcp_io_github_git_*` tools) |
| Custom CLI entry point | Agent invoked via Copilot SDK client |
| All logic in `packages/tools/` | Skills registered per-agent |
| No user interaction | **Planning Agent asks clarifying questions** |
| Direct upstream access | **Fork-first**: clone/push to user's fork |
| DIY model management | **Azure CLI** (`az cognitiveservices`) for Foundry models |
| Local-only execution | **Azure CLI** (`az containerapp`) for Foundry hosting |
| Manual testing | **Azure CLI** (`az ai`) for Foundry evaluation |
| No code implementation | **Implementation Agent** executes approved plans with full code changes |
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
| `StackAnalysis.json` | Current technology fingerprint (languages, frameworks, deps) | **Stack visibility** for decision makers |
| `MigrationOptions.json` | Evaluated migration targets with scores + trade-offs | **Migration intelligence** |
| `UserDecisions.json` | Captured user responses to clarifying questions | **Decision audit trail** |
| `ModernizationPlan.json` | Phased improvement steps referencing risk IDs | Roadmap for transformation |

#### Implementation Agent Artifacts

| Artifact | Purpose | Enterprise Value |
|----------|---------|------------------|
| `ImplementationLog.json` | Record of code changes with references to plan | Change traceability |
| `TestScaffold.json` | Generated test entry points + coverage gaps | **Test scaffolding** for minimal-coverage systems |
| `CodeChanges/` | Actual code modifications (PRs, branches) | Migration deliverables |

---

### Core Constraints

- **Two-agent isolation** – Planning Agent and Implementation Agent have separate contexts; no cross-agent memory bleed
- **Planning Agent is read-only** – cannot modify repository; performs analysis, stack evaluation, and interactive Q&A
- **Planning Agent is interactive** – asks clarifying questions to gather user requirements before producing recommendations
- **Implementation Agent requires approved Planning artifacts** – does not re-analyze; trusts planning output
- **Implementation Agent makes full code changes** – executes approved modernization plan with actual code modifications
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
- No automatic refactors without user approval
- No ungated writes (Implementation Agent requires approved plan)
- No agent-to-agent direct communication (artifacts only)

---

### CLI Interface

#### Commands (2-Agent Dispatch)

| Command | Agent | Description |
|---------|-------|-------------|
| `plan` | Planning Agent | Analyze codebase, evaluate stack, ask clarifying questions, produce plan artifacts |
| `implement` | Implementation Agent | Execute approved plan with full code changes |
| `full-pipeline` | Both Agents | Run complete pipeline: plan → user review → implement |

#### Global Arguments

| Argument | Env Var | Required | Description |
|----------|---------|----------|-------------|
| `--fork-owner` | `GITHUB_FORK_OWNER` | **Yes** | GitHub username or org owning the fork |
| `--repo` | - | Yes | Path to fixture JSON |
| `--profile` | - | No | Path to profile JSON (defaults from fixture) |
| `--ref` | - | No | SHA to analyze (defaults to baseline) |
| `--out` | - | No | Output directory (defaults to `artifacts/`) |
| `--enable-writes` | - | No | Enable code change operations (Implementation Agent) |
| `--interactive` | - | No | Enable interactive Q&A during planning |
| `--plan-approved` | - | No | Signal that plan artifacts are approved for implementation |

**Example invocations:**
```bash
# Planning Agent: analyze and evaluate ODrive with interactive Q&A
npx jurassic plan --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive

# Implementation Agent: execute approved plan with code changes
npx jurassic implement --fork-owner alice --repo specs/repos/odrive.fixture.json --plan-approved --enable-writes

# Full pipeline: plan → user review → implement
npx jurassic full-pipeline --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive --enable-writes

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
    - `StackAnalysis.schema.json` – technology inventory (languages, frameworks, versions)
    - `MigrationOptions.schema.json` – scored migration paths with trade-offs
    - `UserDecisions.schema.json` – captured user responses to clarifying questions
    - `ModernizationPlan.schema.json` – phased improvement steps
    
    **Implementation Agent Artifacts:**
    - `ImplementationLog.schema.json` – record of code changes
    - `TestScaffold.schema.json`

14. **Create artifacts contract** at `specs/functional/artifacts.md`.

15. **Add schema validator** at `packages/schemas/src/validator.ts` using Ajv.

16. **Add failing acceptance tests** (red baseline).

---

#### Phase C: 2-Agent Setup (PR1)

17. **Create agent base** at `packages/agents/src/base.ts`:
    - Base agent class with common SDK initialization
    - Context isolation enforcement
    - Artifact I/O helpers

18. **Create Planning Agent** at `packages/agents/src/planning/index.ts`:
    - Initialize Copilot SDK client with read-only permissions
    - Register ALL analysis skills: repo_snapshot, *_include_graph, risk_scoring, stack_fingerprint, migration_evaluator, user_dialog
    - Interactive capability for gathering user requirements via clarifying questions
    - Produces ALL plan artifacts (analysis + stack evaluation + migration plan)
    - System prompt: legacy analysis + technology advisor, read-only, interactive Q&A
    - Cannot modify repository; artifacts only

19. **Create Implementation Agent** at `packages/agents/src/implementation/index.ts`:
    - Initialize Copilot SDK client with full write permissions
    - Register implementation skills: code_refactor, migration_executor, test_writer, pr_writer, dependency_upgrader
    - Requires APPROVED Planning Agent artifacts as input
    - Makes actual code changes to implement the approved plan
    - System prompt: code implementation focus, executes approved plans

20. **Create orchestrator** at `packages/agents/src/orchestrator.ts`:
    - Dispatches commands to appropriate agent (plan → Planning, implement → Implementation)
    - Manages artifact handoffs between agents
    - Enforces approval gate between planning and implementation

21. **Add 2-agent spec** at `specs/functional/agents.md`:
    - Documents agent responsibilities
    - Context isolation rules
    - Artifact communication protocol
    - Approval workflow

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

#### Phase D-2: Planning Agent Interactive Skills (PR2)

These skills enable the Planning Agent's interactive capability:

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
    - Orchestrates ALL analysis + stack evaluation skills in sequence
    - Presents clarifying questions to user via `user_dialog` skill (interactive mode)
    - Waits for user responses before producing recommendations
    - Writes ALL plan artifacts to `artifacts/<runId>/planning/`
    - Emits RunLog events
    - Validates schemas at end
    - Strictly read-only execution (no repo modifications)

40. **Create Implementation Agent workflow** at `packages/agents/src/implementation/workflow.ts`:
    - Checks for APPROVED marker before proceeding
    - Loads Planning Agent artifacts as input
    - Executes code changes based on approved `ModernizationPlan.json`
    - Runs code refactoring, dependency upgrades, test generation
    - Creates PRs with incremental changes
    - Writes artifacts to `artifacts/<runId>/implementation/`

41. **Create CLI wrapper** at `apps/cli/src/index.ts`:
    - 2-command dispatcher (plan, implement, full-pipeline)
    - **Prompts user for fork location** if not provided via CLI/env:
      ```
      Enter your forked repository (owner/repo): myusername/ODrive
      ```
    - **Parses `--fork-owner` or `--repo`**, validates format, computes fork URL
    - All operations target the user's fork (analysis, branch creation, PRs)
    - Routes to appropriate agent via orchestrator
    - Handles `--interactive` flag for Planning Agent Q&A
    - Handles `--plan-approved` flag for Implementation Agent

42. **Add e2e tests** – run twice on baseline SHA, assert determinism for each agent.

---

#### Phase F: Policy Gate + PR Writer (PR4)

44. **Create policy skill** at `packages/skills/src/policy.ts`:
    - Enforces read-only default
    - Checks for gate file + `--enable-writes` + CI env before allowing writes
    - Validates agent permissions (only Implementation Agent can write)

45. **Create PR writer skill** at `packages/skills/src/pr_writer.ts`:
    - **Fork-aware**: Receives `forkOwner` parameter, pushes to user's fork only
    - Uses **GitHub MCP** tools: `mcp_io_github_git_create_branch`, `mcp_io_github_git_push_files`, `mcp_io_github_git_create_pull_request`
    - Creates PRs with code changes from approved modernization plan
    - Generates PR description referencing artifact IDs + risk items
    - Includes Planning Agent recommendations in PR body

46. **Add policy + pr-writer specs**.

47. **Add gate tests** – without gate: fails; with gate: writes only allowlisted paths.

---

#### Phase G: CI Finalization (PR4)

48. **Finalize CI** at `.github/workflows/ci.yml`:
    - Install Copilot CLI + deps
    - Configure Foundry connection (via Workload Identity or service principal)
    - Run unit tests for both agents
    - Run e2e for Planning Agent
    - Run e2e for Implementation Agent (with mock approval)
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
      - `markApproved(runId)` – Create APPROVED marker for Implementation Agent
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
    - Planning Agent: Upload ALL plan artifacts to Fabric Lakehouse (analysis + stack evaluation + user decisions + migration plan)
    - Implementation Agent: Check for APPROVED marker, download approved artifacts, execute code changes, upload implementation artifacts
    - Both agents: Track telemetry via Application Insights

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
│   ├── agents/                   # 2-Agent system
│   │   ├── package.json
│   │   └── src/
│   │       ├── base.ts           # Base agent class, common SDK init
│   │       ├── orchestrator.ts   # Agent dispatcher, artifact handoff, approval gate
│   │       ├── planning/         # PLANNING AGENT (read-only, interactive)
│   │       │   ├── index.ts      # Agent definition + skill registration
│   │       │   └── workflow.ts   # Analysis + stack evaluation + Q&A orchestration
│   │       └── implementation/   # IMPLEMENTATION AGENT (full code changes)
│   │           ├── index.ts      # Agent definition + skill registration
│   │           ├── workflow.ts   # Code change orchestration
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
│   │       ├── stack_fingerprint.ts    # [Planning Agent] - stack detection
│   │       ├── migration_evaluator.ts  # [Planning Agent] - migration scoring
│   │       ├── user_dialog.ts          # [Planning Agent] - interactive Q&A
│   │       ├── stack_recommendation.ts # [Planning Agent] - recommendations
│   │       ├── plan_synthesis.ts       # [Planning Agent] - modernization plan
│   │       ├── code_refactor.ts        # [Implementation Agent]
│   │       ├── migration_executor.ts   # [Implementation Agent]
│   │       ├── dependency_upgrader.ts  # [Implementation Agent]
│   │       ├── test_writer.ts          # [Implementation Agent]
│   │       ├── test_scaffold.ts        # [Implementation Agent]
│   │       ├── policy.ts               # [Implementation Agent]
│   │       ├── pr_writer.ts            # [Implementation Agent] Fork-aware
│   │       └── incremental_pr.ts       # [Implementation Agent] Fork-aware
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
│       ├── agents.md             # NEW: 2-Agent architecture spec
│       ├── planning-agent.md     # NEW: Planning Agent behavior (analysis + stack eval + Q&A)
│       ├── implementation-agent.md # NEW: Implementation Agent behavior (full code changes)
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
| **Planning Agent** | `plan` produces ALL plan artifacts (Manifest, RunLog, DependencyGraph, RiskAssessment, DocCoverage, StackAnalysis, MigrationOptions, UserDecisions, ModernizationPlan) |
| **Implementation Agent** | `implement` executes approved plan with full code changes |
| **Full Pipeline** | `full-pipeline` produces ALL artifacts + code changes |
| Schema validation | Vitest tests with `validateArtifact()` for all artifact types |
| Determinism | Two runs per agent, compare artifacts |
| Agent isolation | Planning Agent cannot access Implementation artifacts |
| Gated writes | Implementation Agent requires approved plan |  
| **User dialog works** | Planning Agent prompts user and captures responses during interactive Q&A |
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
| **2-agent architecture** | Simplifies system; Planning Agent handles all analysis + user interaction; Implementation Agent executes approved plans |
| **Planning Agent (read-only, interactive)** | Analysis + stack evaluation + user Q&A in one agent; never modifies repository |
| **Implementation Agent (full code changes)** | Executes approved modernization plan with actual code modifications |  
| **Artifact-based communication** | No direct agent-to-agent calls; schema-validated handoffs |
| **User dialog in Planning Agent** | Enterprise decisions require gathering requirements interactively |
| **Human approval gate** | Safety mechanism; no code changes without explicit human review of plan |
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
| **Human approval gate** | Safety mechanism; no code changes without explicit human review of plan |
| **Incremental PRs** | Code changes delivered as small, reviewable PRs; maintains human control |
| **Bicep for IaC** | Type-safe Azure resource definitions |

---

### PR Sequence

| PR | Contents | Merge Criteria |
|----|----------|----------------|
| **PR0** | Constitution, fixture (with Foundry config), profile, all schemas, artifacts contract, 2-agent spec, failing harness, README | Spec suite exists, contracts defined |
| **PR1** | 2-Agent foundation (base, orchestrator), Planning Agent + workflow (with interactive Q&A), `repo_snapshot` (fork-aware), `dsl_parser_registry`, all analysis skills, CLI with 2-command dispatch, BYOM config | Planning Agent produces ALL plan artifacts using Foundry model |
| **PR2** | Planning Agent interactive skills: `stack_fingerprint`, `migration_evaluator`, `user_dialog`, `stack_recommendation`, `plan_synthesis` | Planning Agent asks clarifying questions and produces ModernizationPlan |
| **PR3** | Implementation Agent + workflow, code change skills: `code_refactor`, `migration_executor`, `dependency_upgrader`, `test_writer`, `test_scaffold`, `pr_writer` | Implementation Agent executes approved plan with code changes |
| **PR4** | Policy gate, approval workflow, CI finalization, full-pipeline command | Ungated changes impossible; both agents work in sequence |
| **PR5** | Foundry hosting (Dockerfile, ACR push, hosted agent deploy), Foundry evaluation workflow, Bicep infrastructure, `azure.yaml` | Agent deployed to Foundry, evaluation passes |

---

### Definition of Done (Layer 1)

Layer 1 is complete when:
- **2-Agent architecture** is implemented with Planning Agent and Implementation Agent
- **Agent isolation** is enforced (each agent has separate context, no cross-agent memory bleed)
- All Layer 1 specs exist and are enforced by CI
- Fork-first workflow is documented and enforced (CLI requires `--fork-owner`)
- **Planning Agent**: `plan` on pinned ODrive SHA produces ALL plan artifacts (Manifest, RunLog, DependencyGraph, RiskAssessment, DocCoverage, StackAnalysis, MigrationOptions, UserDecisions, ModernizationPlan)
- **Planning Agent Interactive**: Asks clarifying questions and captures user responses before making recommendations
- **Implementation Agent**: `implement` executes approved plan with full code changes (refactoring, dependency upgrades, test generation, PRs)
- **Full Pipeline**: `full-pipeline` produces all artifacts + code changes
- **User Dialog**: Planning Agent asks clarifying questions during interactive Q&A mode
- Artifacts are schema-valid and deterministic
- RunLog provides tool-by-tool traceability for **audit/governance compliance**
- Safety-critical code paths are identified and flagged in RiskAssessment
- Test scaffolds are generated for minimal-coverage codebases
- Documentation gaps are identified with coverage percentages
- Stack fingerprint correctly identifies technology inventory
- Migration options are ranked with trade-offs based on user input
- Code changes are delivered as incremental, reviewable PRs
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
- **Implementation Agent ready**: Executes approved modernization plans with full code changes
