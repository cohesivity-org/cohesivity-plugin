# Changelog

## 2026-09-15 — Accept MCP request metadata in the v2 release line

### Why
COH-276 identified local `tools/call` failures when clients include the standard
optional `params._meta` object. The strict envelope rejected that field before
dispatch. This patch stays on the released v2 line so npm users retain its six
tools and existing confirmation behavior; the v3 patch is separate.

### What changed
- Accept object-valued request metadata and reject null, arrays, and primitives.
- Keep metadata out of tool arguments, outgoing requests, and tool results.
- Preserve exact argument validation and regenerate all six packages as 2.1.5.
- Add new deterministic 2.1.5 archives without changing older release assets.
  The provisional manifest is deliberately excluded from this archive commit.

### CICD classification
Runtime-candidate for the local plugin only. No hosted runtime or front-door
deployment under `docs/CICD.md`; no workflow, skill, or adapter changes.

### Verification
- New regression tests failed on the unpatched envelope validation.
- Node 24 and Node 18: all 24 tests pass; package and artifact checks pass.
- Stdio metadata coverage passes for every installable package copy.
- `git diff --check` passes; prior versioned assets are unchanged.
- The archive-source Git/URL check is deferred until the archive commit exists.
  The next commit stamps that SHA and repeats the full checks.

### Rollback
Keep installers pinned to the existing 2.1.4 manifest. Release archives remain
immutable; this branch does not publish npm or change any installed client.

Refs COH-276.
