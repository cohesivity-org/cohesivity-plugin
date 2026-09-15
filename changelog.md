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

## 2026-09-12 — Check the documented Node minimum in CI

The review of PR #13 identified that Node 24 alone cannot catch regressions in
the documented Node 18 minimum. The validation workflow now runs the full
package and test suite on both versions, independently, and CONTRIBUTING.md
explains that the older runtime is a compatibility target. No package or
runtime behavior changes.

The workflow YAML and both matrix values were checked locally; all 27 tests
and npm run check pass on Node 24.18.0. The local npx Node 18 attempt still
resolved Node 24, so it is not counted as Node 18 verification; the new GitHub
job must establish that result. git diff --check passes.

## 2026-09-15 — Accept MCP request metadata in v3

### Why

COH-276 reported that Codex sends `_meta` beside `name` and `arguments`, but
the local `tools/call` validator rejected it before dispatch. The same failure
was reproduced in v2.1.4, v3.0.3, and v3.0.4. The user chose separate patch
releases so npm can remain on v2 without inheriting v3's tool and confirmation
changes. This commit prepares v3.0.5; the v2 backport is separate.

### What changed

`mcp/project-bootstrap.mjs` accepts optional object-valued request `_meta`.
It rejects null, arrays, and primitives, does not pass metadata into tool
arguments or API calls, and does not return it in results. Tool names,
argument validation, and confirmation requirements are unchanged. Generated
wrappers and new v3.0.5 archives carry the fix; older releases are untouched.

README documents the metadata boundary. New tests cover successful bootstrap
with absent, empty, progress-token, and custom metadata; malformed metadata;
strict arguments; confirmation checks; and stdio dispatch in every package.

### CICD classification

Plugin release only, outside the Worker runtime. Installers receive the fix
when their immutable pins advance. This archive commit deliberately omits the
provisional manifest; the next commit stamps its URLs with this commit's SHA.

### Verification

Package/archive generation checks and syntax checks pass. On Node 24.18.0,
29 tests pass; only the immutable-source-commit test awaits the source stamp.
All 9 metadata and stdio tests pass on Node 18.20.8. The metadata regressions
failed before the fix. Tests use fake credentials and mocked HTTP, with no
live tenant creation or client installation. `git diff --check` passes.
