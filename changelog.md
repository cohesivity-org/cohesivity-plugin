# Changelog

## 2026-09-12 — Add shared package verification and security reporting

### Why

Directory reviews exposed the absence of a plugin security-reporting policy
and automated package checks. Both are useful across clients; a directory's
scanner, root-manifest layout, or branding requirements are not reasons to
change the portable package or its operating instructions.

### What changed

- `SECURITY.md` reuses the existing private Cohesivity reporting address and
  documents credential, consent, archive-integrity, and mutable-doc boundaries.
- `.github/workflows/ci.yml` runs the existing package checks and tests with
  commit-pinned Actions, read-only permissions, and no application secrets. It
  fetches the source-stamped archive commit explicitly so squash merges do not
  break the immutable-byte comparison.
- `test/stdio.test.mjs` starts all six installable local MCP copies with an
  empty environment and temporary working directory, checks handshake, tool
  discovery, ping, parse errors and recovery, and checks for project writes.
- `CONTRIBUTING.md` and README document verification and shared source rules.

### CICD classification

Docs, tests, and CI metadata in the plugin repository; class D in the sibling
docs repository's `CICD.md`. No tenant-serving code, skill, generated package,
versioned archive, listing description, or runtime release changes. This CI
validates the plugin repository only and does not deploy Cohesivity.

### Verification

- `npm run check`: package wrappers and all current release artifacts match.
- `npm test`: 27 tests pass on Node 24.18.0, including six stdio process tests.
- Claude CLI validates the native plugin and root marketplace manifests.
- Workflow YAML parses; its archive-source fetch step succeeds locally.
- `git diff --check` passes. No live tenant or resource was created.
