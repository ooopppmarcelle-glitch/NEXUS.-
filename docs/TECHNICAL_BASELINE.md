# NEXUS³ — Technical Baseline (Provisional)

## Current implementation

The first application shell uses:
- Vite for local development and production bundling.
- React for the responsive command-center interface.
- Plain CSS for the initial visual system.
- A web app manifest and a minimal service worker for app-shell caching.

## Why this baseline

This is a small, familiar frontend foundation that can run in a browser, be installed as a PWA on supported devices, and remain easy to inspect. It avoids selecting a backend before the product's data model, permissions, and provider-integration requirements are specified.

## Current limitations

- Mission data is held in browser memory only; it is not persisted.
- No authentication, database, API, or user accounts are connected.
- Gemini, Claude, and other model providers are represented as roles only; no provider API is called.
- GitHub is not yet integrated into the application itself.
- Offline support is an initial app-shell cache, not full offline data synchronization.
- The external font stylesheet requires a network connection; system fallbacks are provided.

## Decisions still requiring founder approval

1. Backend and database selection.
2. Authentication and role/permission model.
3. AI provider adapter design and secret handling.
4. GitHub authorization model and branch/PR workflow.
5. Persistent offline data and synchronization conflict strategy.
6. Hosting and release workflow.

## Validation status

The files have been committed to a feature branch and checked through GitHub file retrieval. A local dependency installation, production build, browser test, accessibility review, and PWA install/offline test have not yet been run. This baseline must not be described as production-ready.
