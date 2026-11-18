# NEXUS³ — Initial Security Review

**Status: BLOCKED for public deployment.** This is a source-level review, not a penetration test.

## High-priority findings

### 1. API routes have no authentication or authorization middleware
The Express server exposes workspace data and mutation endpoints without a user identity or role check. The current routes include mission creation and transitions, decision creation/status changes, governance policy updates, relay import, DLP scans, and proof execution.

**Required before public hosting:** implement authentication, enforce server-side authorization for every route, and ensure founder-only actions cannot be invoked by an unauthenticated caller. Hiding controls in the UI is not an access-control mechanism.

### 2. Proof execution must not be treated as a secure hostile-code sandbox
The proof runner uses Node's `vm` module to execute supplied JavaScript after transpilation. Node's documentation explicitly warns that `node:vm` is not a security mechanism. A context timeout is not a substitute for process/container isolation.

**Mitigation applied on `feat/chatgpt-backend-security`:** in-process execution has been removed from `server/proofRunner.ts`. PROOF now performs DLP scanning and static transpilation only; it never executes submitted source or test code, and it never reports a test run as passed. Runtime execution remains unavailable until a separate, disposable, resource-limited isolation boundary is implemented and reviewed. This is a fail-closed mitigation, not a completed sandbox.

## Additional checks required

- Add CSRF protections or an equivalent origin/session strategy for browser-authenticated mutations.
- Add rate limits and request-size limits per route and per user.
- Validate all request bodies and enum values at the server boundary.
- Review error responses to avoid exposing stack traces or internal configuration.
- Confirm secret scanning and redaction behavior with tests; DLP detection is not a complete secret-management control.
- Pin a supported Node.js version and verify the `node:sqlite` runtime.
- Verify the configured Gemini model identifier and API behavior with a real, controlled test.
- Define SQLite persistence, backup, restore, and concurrent-write behavior for the intended host.
- Add automated dependency, type, build, and security checks.

## Release gate

Do not deploy this version to a public URL or enter real personal, confidential, or credential data until the high-priority findings are fixed and independently verified.
