# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to
[accounts@cohesivity.ai](mailto:accounts@cohesivity.ai), the same contact used
by the Cohesivity skill and initializer. Include the plugin version or commit,
the client and package path, the observed impact, and minimal reproduction
steps.

Do not open a public issue for an unpatched vulnerability. Do not send live
management or application keys, OAuth tokens, claim links, tenant data, or an
unredacted `.cohesivity` file. If a credential may have been exposed, stop
using it and include only a redacted identifier in the report.

## Scope and trust boundaries

This policy covers the portable plugin, native client packages, bundled skill,
local MCP server, and package generators. Reports about the hosted API or
remote MCP can use the same private contact.

- Local MCP mutations require literal `confirmed: true`. This is a code-level
  input check, not proof of human consent: the calling agent must obtain the
  user's authorization for the exact action. Claude's interaction marker adds
  a client-specific prompt; other clients need their own approval controls.
- Tenant credentials stay in the project's gitignored `.cohesivity` file. The
  local MCP rejects unsafe or incomplete credential paths and requires private
  credential permissions before and after quickstart. It uses fixed Cohesivity
  routes and filters secrets from tool output.
- `create_tenant` downloads and runs the full mutable Cohesivity quickstart,
  including detected client installations and project guidance. This is a
  broader trust boundary than an API call; the package hash does not cover the
  downloaded script or its installation dependencies. The initial script GET
  is HTTPS-only to the fixed URL, rejects redirects, has a 1 MiB streaming
  limit and a 30-second deadline. Bash receives the script on stdin with a
  validated project cwd, no argument interpolation, and no startup files.
  stdout/stderr are discarded; a three-minute deadline kills and reaps the
  subprocess group. A failure may leave a tenant or some integrations created;
  retry after fixing the cause rather than deleting credential or retry state.
- The subprocess receives only HOME, PATH, XDG_CONFIG_HOME, XDG_DATA_HOME,
  XDG_CACHE_HOME, CODEX_HOME, and HERMES_HOME when set (PATH has a system default).
  Arbitrary host secrets, BASH_ENV, shell options and runtime injection variables
  are not forwarded. The authorized script can still read user files and run
  executables on that PATH; it is not a sandbox.
- Optional local CLI login uses fixed Cohesivity OAuth endpoints, PKCE, random
  state, account-required consent, and an exact loopback callback. Account
  access and refresh tokens stay in a user-owned mode-0600 `mcp-auth.json`
  under the Cohesivity config directory, outside the project. New directories
  use mode 0700; existing owned directories may be readable but must not be
  group/world-writable. Symlinked state paths, shared token-file permissions,
  invalid tokens and guest grants fail closed.
  Refresh uses the stored public client; there is no fallback to guest while
  account credentials are present. Bootstrap passes auth through a temporary
  mode-0600 header file, removes it after execution, and persists a non-secret
  per-project retry key outside project credentials. Neither CLI nor MCP output
  includes tokens. Refresh and auth storage changes share a cross-process lock
  with a bounded wait, and a separate project lock rejects overlapping
  quickstarts. Locks are never stolen automatically after a process crash.
  `logout` attempts server-side token-family revocation and removes local auth
  even when that request fails, reporting the limitation without exposing the
  response. It does not remove independent remote-client OAuth credentials.
  Remote OAuth storage belongs to its client.
- Package hashes verify the downloaded bytes against the selected source
  commit. They do not certify the code as safe or establish trust in a publisher.
- The bundled skill deliberately reads mutable live API documentation. Those
  pages can change independently of an installed package or its review. The
  package hash does not cover them, and approval checks do not remove this
  dependency. Review live instructions against the user's request and the
  bundled consent rules before acting.

## Updates and verification

Report issues in any version. Fixes are delivered through new reviewed
versions; existing versioned archives are not rewritten as a security fix.
Package checks and tests are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
Passing those checks is not a third-party security audit or marketplace approval.
