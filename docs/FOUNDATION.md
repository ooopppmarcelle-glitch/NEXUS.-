# NEXUS³ — Product Foundation

## Vision
NEXUS³ transforms complex ideas and problems into real solutions that are structured, testable, verifiable, and able to evolve. It coordinates human direction and contributions from multiple AI systems. Its value is reliable execution and verification of project work, not simply aggregating chatbot conversations.

## Ambition and first priority
- Ambition: multi-domain, with a worldwide audience in mind.
- First implementation priority: software development.
- Approach: establish reliable foundations and a narrow MVP before expanding to other domains.

## Foundational principles
### MEMORY
Maintain durable, project-scoped context: goals, constraints, decisions, artifacts, and unresolved questions. Memory must be inspectable and correctable.

### DECOMPOSER
Break a goal into missions and tasks with clear dependencies, owners, inputs, outputs, and acceptance criteria.

### PROOF
Attach verifiable evidence to completion claims: test results, review records, build output, deployment status, or other relevant artifacts.

### REPAIR
When a check fails, record the failure, identify its scope, create a corrective mission, and verify the correction.

### EVOLVE
Use reviewed feedback and project history to improve the product without silently changing approved requirements.

### GOVERN
Preserve human authority, role-based permissions, approval gates, auditability, and safe handling of external integrations.

## MVP scope
1. Creator command center showing project health, active missions, pending approvals, and recent activity.
2. Project and mission management.
3. Project memory, decision logs, and attached artifacts.
4. Mission contracts defining objective, scope, constraints, deliverables, and acceptance criteria.
5. AI contribution records with provider, task, status, and output references.
6. Git workflow support, including branch, commit, and pull-request references where authorized.
7. Validation records for tests, builds, reviews, and deployments.
8. Audit trail for important actions and decisions.

## Explicit non-goals for the first MVP
- Unrestricted autonomous access to user accounts or repositories.
- Guarantees of correctness.
- Automatic merging or deployment without configured permissions and approval rules.
- Real-time multi-agent behavior before provider integrations and failure handling are tested.
- Broad non-software domain modules before the software workflow is reliable.

## Human authority
The founder remains the final decision-maker for product direction, scope changes, sensitive permissions, and release approval. AI agents may propose, research, implement, and review within assigned permissions; they do not silently override approved decisions.

## Quality bar
A feature is not complete merely because code exists. Completion requires requirements and acceptance criteria, implementation, relevant tests, recorded results, review of security and failure states, and an explicit status.

Use these statuses consistently: proposed, in progress, blocked, in review, verified, and released.

## Open architecture decisions
Resolve and document these before treating them as implementation assumptions:
- Frontend framework and PWA strategy.
- Backend and database.
- Authentication and authorization.
- Provider integration strategy and secret management.
- GitHub integration permissions and webhook model.
- Job orchestration, retries, and timeouts.
- Observability, audit retention, and deployment strategy.

Each decision must include options considered, selection, rationale, trade-offs, and validation steps.
