# Jurassic Modernization Agent

**Modernization Intelligence Layer** — A 2-agent system for legacy codebase analysis and migration using GitHub Copilot SDK and Microsoft Azure AI Foundry.

## Overview

This system uses two specialized agents:

- **Planning Agent** (read-only, interactive): Analyzes any codebase, evaluates the technology stack, asks clarifying questions, and produces intelligence artifacts with migration recommendations.
- **Implementation Agent** (full code changes): Executes the approved migration plan by making actual code changes, creating incremental PRs for human review.

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

6. Create Microsoft Fabric workspace with Lakehouse (or use `azd up`)
7. Set `FABRIC_WORKSPACE_ID` env var
8. Set `FABRIC_LAKEHOUSE_ID` env var

### Azure Data Services Setup

9. Create Cosmos DB account (or use `azd up` to provision)
10. Set `AZURE_COSMOS_ENDPOINT` env var
11. Create Application Insights (or use `azd up` to provision)
12. Set `APPLICATIONINSIGHTS_CONNECTION_STRING` env var

### Authentication

13. Authenticate with `az login` (for DefaultAzureCredential)
14. Ensure you have required RBAC roles (see below)
15. Grant Fabric workspace access to your identity

### Quick Start (recommended)

```bash
azd up  # Provisions Azure resources (Cosmos DB, App Insights, Container Apps)
# Fabric workspace must be created manually in the Fabric portal
```

## Usage

```bash
# Planning Agent: analyze and evaluate with interactive Q&A
npx jurassic plan --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive

# Implementation Agent: execute approved plan with code changes
npx jurassic implement --fork-owner alice --repo specs/repos/odrive.fixture.json --plan-approved --enable-writes

# Full pipeline: plan → user review → implement
npx jurassic full-pipeline --fork-owner alice --repo specs/repos/odrive.fixture.json --interactive --enable-writes
```

## Required RBAC Roles

| Resource | Role |
|----------|------|
| AI Foundry Project | `Cognitive Services User` |
| Microsoft Fabric Workspace | `Contributor` |
| OneLake (Fabric) | `Storage Blob Data Contributor` |
| Cosmos DB | `Cosmos DB Built-in Data Contributor` |
| Application Insights | `Monitoring Metrics Publisher` |
| Container Registry | `AcrPush` |

## Architecture

See [Layer 1 SDD Plan](.github/prompts/plan-layer1SddLegacyRefactorAgent.prompt.md) for full architecture documentation.

## License

See [LICENSE](LICENSE).
