# Jurassic Modernization Agent — Presentation Deck

## Slide 1: Business Value Proposition

### Problem
Enterprises operate mission-critical legacy systems (10–30 years old) with:
- Sparse documentation and cyclic dependencies
- Institutional knowledge locked in senior engineers
- High modernization risk and audit scrutiny

### Solution: Modernization Intelligence Layer
A **2-agent system** using GitHub Copilot SDK + Azure AI Foundry that:
- **Planning Agent** (read-only): Builds dependency graphs, scores risk, generates phased plans
- **Implementation Agent** (write, after approval): Executes plans via incremental PRs

### Value
- **60% faster** modernization discovery
- **Risk quantification** for auditors and stakeholders
- **Human-in-the-loop** — no code changes without approval
- **Full audit trail** in Microsoft Fabric

---

## Slide 2: Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│  Planning Agent  │         │   Human Review   │         │ Implementation Agent │
│   (read-only)    │────────▶│   & Approval     │────────▶│  (write after appr.) │
└──────────────────┘         └──────────────────┘         └──────────────────────┘
        │                                                           │
        ▼                                                           ▼
┌───────────────────┐                                    ┌──────────────────────┐
│ 12 JSON Artifacts │                                    │  Incremental PRs     │
│ (Schema-Validated)│                                    │  on User's Fork      │
└───────────────────┘                                    └──────────────────────┘
```

### Azure Integrations
| Service | Purpose |
|---------|---------|
| **GitHub Copilot SDK** | Agent runtime + tool orchestration |
| **Azure AI Foundry** | GPT-4o BYOM + Foundry IQ evaluation |
| **Microsoft Fabric** | OneLake artifact persistence + audit |
| **Application Insights** | Telemetry + distributed tracing |
| **Document Intelligence** | PDF/legacy doc ingestion |
| **Azure AI Search** | RAG pipeline for documentation |

### Security
- `DefaultAzureCredential` only (no API keys)
- `disableLocalAuth: true` on all resources
- PII redaction before persistence
- Fork-first (never touches upstream)

---

## GitHub Repository

**Link:** https://github.com/your-org/jurassic-refactor

---

## Team

- [Your Name] — [Role]
- [Team Member 2] — [Role]
- [Team Member 3] — [Role]
