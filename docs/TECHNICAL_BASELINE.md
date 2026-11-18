# NEXUS³ — Technical Baseline

## Current scaffold

The current Google AI Studio contribution uses:
- React and TypeScript for the interface.
- Vite for development and frontend bundling.
- Tailwind CSS v4 for styling.
- Express for the HTTP server and JSON API.
- SQLite through Node's built-in `node:sqlite` module for local persistence.
- Google GenAI SDK for direct Gemini API calls when a server-side key is configured.
- Manual Relay packets for ChatGPT, Claude, and Gemini Web workflows.

A PWA manifest and conservative app-shell service worker are being added on the integration branch.

## Current application modules

- Missions and workflow stages.
- DECOMPOSER for mission subtasks.
- MEMORY for decision records (ADR).
- PROOF & REPAIR for code checks and repair workflow.
- GOVERN for routing policy, budget limits, DLP scanning, and audit records.

## Important distinctions

- Gemini has a direct API adapter, but it only works when a valid server-side key and supported model are configured.
- ChatGPT and Claude are not direct API integrations in the current scaffold; their initial workflow is manual Relay.
- GitHub repository access from an AI development tool is separate from an in-app GitHub integration.
- A PWA app shell does not imply full offline synchronization of API-backed data.

## Runtime and persistence

The server imports `node:sqlite`; use a compatible Node.js runtime and pin the tested version before release. SQLite stores data on the server filesystem, so persistence and backup behavior depend on the deployment host and its storage guarantees.

## Decisions still requiring founder approval

1. Production backend/database and persistent storage.
2. Authentication and role/permission model.
3. AI provider adapter design, model selection, and secret handling.
4. GitHub authorization model and branch/PR workflow.
5. Offline data and synchronization conflict strategy.
6. Hosting, monitoring, backup, and release workflow.

## Validation status

The Gemini scaffold and the documentation have been inspected through GitHub. The integration branch has not yet been installed, built, or tested in a local runtime. Security remediation is required before public deployment.
