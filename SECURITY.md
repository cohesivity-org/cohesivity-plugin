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
- Local credentials stay in the project's gitignored `.cohesivity` file. The
  local MCP checks credential paths, uses fixed Cohesivity routes, and filters
  secrets from tool output. Remote OAuth and token storage belong to the client.
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
