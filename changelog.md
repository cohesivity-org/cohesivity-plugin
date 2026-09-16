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

## 2026-09-15 — Stamp the v3.0.5 installer manifest

The v3.0.5 manifest points to archive source commit
`49e9458`. No archive or source bytes changed during stamping.
All 30 tests, including immutable archive comparison, and `npm run check`
pass on both Node 18.20.8 and Node 24.18.0. This completes the plugin artifact
release; advancing the shell installer pin remains a separate change.

## 2026-09-16 — Prepare v3.0.6 four-tool skill guidance

### Why

The skill must describe the four tools the MCP actually exposes and stop when
another control-plane mutation has no supported tool. This prepares the
user-approved guidance update without changing MCP tool behavior.

### What changed

The canonical skill now matches immutable upstream commit
`1c65e6d1bf4690d7ee3b046bcd8251387b4f701b`, metadata version `d309e051978d`:
16,060 bytes, SHA-256
`10b03850ecd87564b457d2df0fcb1a5e6cf3ae205fb695c27114be6c95018e59`.
It names the four supported tools, forbids bypassing unavailable mutations,
and pins the coordinated initializer 0.7.1 candidate. README records that both
releases remain pending review. Package and MCP version metadata advance to
3.0.6; generated wrappers and six new archives carry the pinned skill. Older
artifacts and MCP implementation remain unchanged apart from the version.

Regression tests verify the new version and skill pin, exact four-tool guidance,
read-only status, mutation confirmation, unsupported-operation boundary, and
initializer fallback across all six installable packages.

### CICD classification

Plugin artifact candidate only, outside the Worker runtime; class D guidance
and packaging metadata under the sibling `CICD.md`. No runtime or front-door
deployment. This first commit excludes the provisional manifest; the next
commit stamps archive URLs with this source commit. Nothing is published.

### Verification

The public raw skill URL matches the supplied generated file byte-for-byte.
The four release regressions failed before the update and pass afterward.
`npm run check` passes on Node 18.20.8 and 24.18.0. Full tests on both versions
pass 30 of 31: only the existing immutable-source comparison fails because
the new archives are not committed yet. The test is unchanged and will be
rerun after stamping. Older artifact bytes match `origin/main`, and
`git diff --check` passes. Tests use mocked HTTP and create no live tenants.

## 2026-09-16 — Stamp the v3.0.6 installer manifest

The v3.0.6 manifest names archive source commit
`699114f27bb1c258eb824c2f3cd67f17776d7f96`. Stamping changed no source or
archive bytes. The manifest is 9,400 bytes with SHA-256
`a295d7b318077a935ae9b0469916f8213a8cdf27b8c9bf7ee604d3007ca06495`.

`npm run check` and all 31 tests now pass on Node 18.20.8 and 24.18.0,
including the unchanged immutable-source comparison. All 77 older artifact
files match `origin/main` byte-for-byte, the MCP source differs only in
`SERVER_VERSION`, and `git diff --check` passes. This is a local plugin
artifact candidate, with no runtime deployment or publication; initializer
0.7.1 and core quickstart pin updates remain separate, unreleased work.

## 2026-09-16 — Add quickstart bootstrap and optional account login

### Why

Local creation must run the complete quickstart flow, while users can choose
guest projects or account-owned projects without a separate claim step.
Account credentials must remain outside both project files and MCP results.

### What changed

`mcp/project-bootstrap.mjs` now downloads the fixed quickstart URL and runs
Bash in the validated project root with bounded execution, a restricted
environment, and discarded subprocess output. It preserves private credential
validation and rejects concurrent quickstarts for one project. CLI login uses
account-required PKCE and a loopback callback; private account state supports
serialized refresh, revocation/logout, and persistent bootstrap retry keys.
Quickstart receives a temporary private authorization-header file rather than
a token argument. Invalid account state never falls back to guest creation.

Single-resource provisioning now accepts absent configuration for the eleven
offerings that have no configuration fields, while still rejecting supplied
fields. Full quickstart side effects and independent local/hosted account
connections are documented in README and SECURITY.

Plugin/server version 4.0.0 and all six package surfaces carry generated skill
`7f2fbc207f1d`, pinned to mirror commit
`cb3b6be6ad8a0e9ce27fef5a1fb30ead39430981`. New v4 archives are deterministic;
older versioned artifacts are untouched. The provisional manifest is excluded
from this source commit and will be stamped with its immutable archive commit.

### CICD classification

Client plugin release under the sibling CICD playbook, coordinated with the
Worker access-mode change and initializer 0.8.0. No deployment, release tag,
or npm publication is performed by this commit.

### Verification

New quickstart, login, filesystem, callback, token-refresh concurrency, and
single-provision regressions pass. Package consistency checks pass. On Node
18.20.8 and 24.18.0, 52 of 53 tests pass before source stamping; only the
unchanged immutable-archive comparison awaits this commit. The final stamped
manifest will be tested on both versions before delivery. Older artifact
bytes match origin/main and whitespace checks pass. Network and client
installation effects are mocked; no real login or tenant creation was run.
