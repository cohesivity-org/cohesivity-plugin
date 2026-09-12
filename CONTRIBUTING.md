# Contributing

## Choose the source file

The repository root is the portable Agent Plugins package. Native client
packages under `packages/` are generated from `scripts/build-packages.mjs`;
do not edit their copies directly or move a native manifest to the root for a
directory's layout requirement. Keep client-specific syntax in its adapter and
shared behavior in the canonical source.

The local MCP source is `mcp/project-bootstrap.mjs`. The canonical skill is
pinned to the upstream commit documented in [README.md](README.md); changes to
its operating instructions should be made upstream and then synced deliberately.
Never modify skill instructions just to change a catalog's display description.

## Verify a change

Use a branch or worktree. This repository has no npm dependencies and needs no
install step, account, or API key to run its checks:

```bash
npm run check
npm test
```

The test suite uses temporary directories and mocked API responses. It also
starts the local MCP from each installable package, checks its stdio handshake,
tool discovery, ping, and parse-error handling, and verifies that no project
files are created. These checks do not create tenants, provision resources, or
test an authenticated remote session. Native client installation and OAuth
testing are separate; do not claim them from these results.

CI runs the same checks on Node 24 with read-only repository permissions, no
application secrets, and commit-pinned Actions. The local MCP's documented
minimum remains Node 18; the CI build version does not change that minimum.

If a checkout lacks the immutable archive source commit needed by the tests,
fetch the `source.commit` named in
`artifacts/v<package-version>/install-manifest.v1.json`. CI does this explicitly,
because a squash merge can leave that source commit outside main's ancestry.

When generated package content changes, run `npm run build` and review the
result. Follow the README's two-step source-stamping procedure for a new
artifact release. Do not overwrite older release archives. Docs and test-only
changes do not require new package artifacts or a plugin version bump.

## Submit a change

Include the reason, affected clients, and actual verification results in the
PR. Append a change-sized entry to `changelog.md` before each commit. Keep
marketplace entry formatting in the destination repository rather than adding
marketplace-specific runtime code, dependencies, or policy exceptions here.

Use [SECURITY.md](SECURITY.md) for private vulnerability reports.
