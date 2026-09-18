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

## 2026-09-16 — Stamp the immutable v4 install manifest

The v4.0.0 install manifest now identifies source/archive commit
`daaee4d68156b27c6fe4eeb38270562071b452ad` and hashes the six committed client
archives. The manifest SHA-256 is
`35fcef2844fe1a704776cf6dae94d863848bd7cc609a66f07cbe3b4349b71b8b`.
All 53 tests pass on both Node 18.20.8 and 24.18.0, including archive equality
against that immutable commit, secret scanning, package isolation, local
account flows, and generated-package consistency. `npm run check` and
`git diff --check` pass. This is the final client-plugin candidate metadata;
no tag, package publication, or deployment has run.

## 2026-09-17 — Ship hosted file handoff guidance

Plugin 4.0.1 carries skill `c098834bea25` from immutable mirror `27e41382`.
The hosted creation result now gives the calling agent file contents to save
directly; browser download is only a fallback. README and SECURITY explain
the narrow secret-bearing response, client-history exposure, private file
permissions, and unchanged local/other-tool redaction. All wrappers and new
v4.0.1 archives are regenerated; existing versioned artifacts are untouched.

This is a coordinated client release candidate, not a publication. Generated
package checks pass and 52/53 tests pass before immutable source stamping;
only the archive-commit comparison awaits this commit. The provisional
manifest is excluded and will be stamped and fully tested next.

## 2026-09-17 — Stamp the v4.0.1 install manifest

The manifest pins source/archive commit `e21b5c9b881477a020ca29bb7ef3223b4a8449ac`
with SHA-256 `fc42074cf01a9b0104f7cc3f9118a2d9718245c38177d9ffef45ce24f9817c12`.
All 53 tests pass on Node 18.20.8 and 24.18.0, including immutable archive
equality, package isolation, and secret scanning. Generated checks and
whitespace checks pass. No prior artifact, npm publication, or deployment is
changed by this candidate metadata commit.

## 2026-09-17 — Document direct MCP account connections

The source README now describes account consent without tenant selection and
requires explicit `tenant_id` for the three hosted tenant-specific tools. This
matches the coordinated Worker change in cohesivity#515; local helper behavior
is unchanged. Existing immutable artifacts and their pins are not rewritten.

This is a source documentation correction, not a new client release. All 53
tests, generated package/artifact checks, and whitespace checks pass on Node
24.18.0. No publication or deployment is performed.

## 2026-09-17 — Reuse local projects independently of account login

Plugin 4.0.2 validates existing project credentials under the bootstrap lock
and skips optional account state when reusing them, so expired or malformed
saved login cannot block integration and guidance updates. New projects keep
the existing fail-closed account behavior. Social-login provisioning accepts
IPv6 loopback callbacks while still rejecting non-loopback HTTP.

All wrappers and new v4.0.2 archives carry canonical skill `ac6c3a29928f` from
mirror `dea8889b43482b91723de57bac17c5f96d84204b`: Connect uses the available
identity automatically and never asks whether to sign in. Prior archives are
unchanged. The initializer fallback is 0.8.1; publish it before merging this
client release.

Both new behavior regressions failed before implementation. Generated checks
pass; 54/55 tests pass before source stamping, with only the immutable archive
comparison awaiting this commit. Real PostgreSQL and official MCP SDK checks
also verify existing-project reuse with expired saved auth. This source commit
excludes the provisional manifest; the next commit stamps and verifies it.

## 2026-09-17 — Stamp the v4.0.2 install manifest

Pin source/archive commit `9a0f1c86aa1db49bfddb9358c233ab82d538b554`.
The manifest SHA-256 is `d5634c7d8d1106cea11cb6620dda218f9727173e9ffd636843dc02142e5aaec4`.
All 55 tests pass, including comparison with the immutable archive commit,
local reuse regression, IPv6 callbacks, package isolation, and secret checks.
Generated package/artifact checks, syntax, and whitespace checks pass. Prior
versioned archives remain unchanged. This metadata commit does not deploy
the hosted service or publish the initializer.

## 2026-09-18 — Propagate skill PR #10 MCP-line removal, bump 4.0.3

Skill repo PR #10 (`bf7cd4e`) removed the stale "route every control-plane
mutation through a Cohesivity MCP tool" sentence from the canonical SKILL.md.
All six client packages still served the old text because they carry their own
copies. This release syncs them: five non-Claude copies get the canonical
verbatim, and the Claude-adapted copy gets the same nine targeted edits that
PR #10 applied (preserving its unique frontmatter and allowed-tools block).

SERVER_VERSION bumps to 4.0.3. Skill pins updated to source commit `bf7cd4e`
and SHA-256 `be4adbeb2df3eea431f59ef59a7da4bc598e97fbf9f534ed58fda80dc4bd580e`.
v4.0.3 archives and install manifest generated from plugin commit `cb38404`.
Prior versioned archives remain unchanged.

## 2026-09-18 — Add the give_feedback tool

Local MCP 4.1.0 adds `give_feedback` using the existing authenticated feedback
endpoint. It accepts a project root and nonempty feedback text, does not ask
for confirmation, and instructs agents to exclude personal information and
secrets. Only trimmed feedback is sent; no files, prompts, or extra context are
attached. Successful submissions return only `{success:true}`. Failed requests
return a fixed error and are never retried automatically. Creation, claim,
and provisioning approval checks remain intact.

Sync skill `3042cb861101` from mirror `9ff9e4e5`, regenerate all client wrappers,
and build new 4.1.0 archives. The canonical guidance documents the hosted
`mcp:feedback:write` permission and initializer 0.8.3 fallback. Prior immutable
artifacts are unchanged; publish the initializer before merging this release.

Seven feedback regressions failed before implementation. On Node 18.20.8 and
24.18.0, 61 of 62 tests pass before source stamping; only the immutable archive
comparison awaits this source commit. Generated checks, syntax, and whitespace
checks pass. The provisional install manifest is excluded and will be stamped
and fully verified in the next commit. No real feedback, npm publication, or
backend deployment was performed.

## 2026-09-18 — Stamp the 4.1.0 install manifest

The install manifest pins immutable source/archive commit
`14c8f6bb1bef1fbcdbdbfcd16be43778d3cf61d2`. Its 9,400 bytes have SHA-256
`c3c435061a392af1c39f222eaf895ea48a42a5fa4652d343d7f6df1ec400553f`.
All 62 tests now pass on Node 18.20.8 and 24.18.0, including archive equality,
secret scanning, five-tool stdio discovery in every package, and feedback
privacy/approval checks. Generated checks and whitespace checks pass. Older
artifacts remain unchanged; this candidate is not an npm or backend release.

## 2026-09-18 — Preserve discount eligibility during service feedback

Plugin 4.1.1 sends `give_feedback` to `/api/feedback/service`. The existing
storage handler appends normally, but this route does not mint or consume
the one-time billing discount. On an older backend it fails with a fixed
error instead of falling back to the discount endpoint. This avoids losing
a discount token that MCP intentionally does not expose.

Sync canonical skill `5969c65d81bb` from mirror `2d75c54a`, retain all prior
immutable artifacts, and generate new 4.1.1 archives. Correct stale README
installer/version/artifact references found during review and add assertions
against their recurrence. The minimal tool description and consent gates
are unchanged.

The route and documentation regressions failed before correction. Generated
checks, syntax, and whitespace pass. On Node 18.20.8 and 24.18.0, 61/62 tests
pass before source stamping; the sole pending check is archive equality
against this source commit. No npm publication, merge, or deploy ran.

## 2026-09-18 — Stamp the 4.1.1 install manifest

The 9,400-byte manifest pins source/archive commit
`fc3192fc1245ceabac0d17c936bdc215d287f7db` and has SHA-256
`79802ff46dde9bf1af9fa3c069825268865624ff6c8418ea9f47872e981a6b4b`.
All 62 tests pass on Node 18.20.8 and 24.18.0, including immutable source
equality, service-only feedback, and package consistency. Generated checks
pass and prior archives are untouched. No release is performed here.

## 2026-09-18 — Soften the feedback confirmation wording

Plugin 4.1.2 changes the shared tool description to "no user confirmation is
needed" and syncs skill `3a6cd8662a3b` from mirror `f9aeec2e`. The feedback
contract, privacy guidance, and consent behavior are unchanged. New archives
preserve all earlier immutable release bytes.

The description assertions failed before the wording change. Generated and
whitespace checks pass. On Node 18.20.8 and 24.18.0, 61/62 tests pass before
source stamping; only immutable archive equality awaits this commit. No
publication or deployment is performed.
