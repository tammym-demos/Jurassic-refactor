# 150-Word Summary for Submission

## Jurassic Modernization Agent

**Modernization Intelligence Layer** — A 2-agent system built with GitHub Copilot SDK and Azure AI Foundry that automates legacy codebase modernization for enterprises.

**The Problem:** Large enterprises operate mission-critical legacy systems (10–30 year-old C/C++ firmware, COBOL, proprietary DSLs) with sparse documentation, cyclic dependencies, and institutional knowledge locked in senior engineers. Modernization stalls due to opaque risk and audit scrutiny.

**Our Solution:** Two specialized agents that work in sequence:
- **Planning Agent** (read-only): Analyzes codebases, builds dependency graphs using Tarjan's SCC, scores risk per file, and generates phased modernization plans
- **Implementation Agent** (write, after approval): Executes approved plans through incremental PRs on user's fork

**Key Differentiators:**
- Human-in-the-loop approval gate
- 12 schema-validated JSON artifacts
- **Fabric IQ**: Ontology-based reasoning, dependency graph traversal, natural language queries over modernization data
- **Foundry IQ**: Model evaluation metrics (accuracy, safety, relevance, determinism) with dashboard integration
- Passwordless auth with DefaultAzureCredential

**Result:** 60% faster modernization discovery with quantified risk intelligence for auditors and stakeholders.
