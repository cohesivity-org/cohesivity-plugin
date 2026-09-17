# Cohesivity agent plugin

Cohesivity packages one canonical Agent Skill together with a local project
bootstrap MCP server and the protected remote Cohesivity management MCP server.
The repository root remains an
[Agent Plugins 1.0](https://agent-plugins.org/) package. Generated native
wrappers live under `packages/`, and the root Claude marketplace manifest
points Claude Code at its self-contained wrapper instead of treating the
portable root as a Claude plugin.

## Local quickstart and optional account sign-in

The dependency-free **local `cohesivity-local` stdio MCP server** needs Node
18 or newer, Bash on a POSIX platform, and the dependencies required by the
quickstart, but no Cohesivity account. Its primary `create_tenant` tool accepts
an absolute project root and **runs the full `https://cohesivity.ai/quickstart.sh`
flow** there. This creates or reuses `.cohesivity`, installs or updates detected
client integrations and skills, and writes the quickstart's project guidance.
Approval must cover these effects, including user-level client configuration,
not just tenant creation. In Claude Code, the root must exactly match the
`CLAUDE_PROJECT_DIR` supplied by the client. It returns only non-secret tenant
metadata; all subprocess output is discarded, including on failure. Existing
incomplete, unsafe, or publicly readable credentials are rejected rather than
overwritten. A valid existing tenant still runs the quickstart's integration
and guidance steps.
The same server exposes fixed claim, status, and provision operations against
the Cohesivity Management API. Its provision tool accepts either one resource
or a resource list, so single and bulk provisioning share one tool. Those
operations read the project's `.cohesivity` management credential internally,
project allowlisted responses, and never expose either `coh_*` value. There is
no generic shell command or arbitrary HTTP proxy. Every mutating tool requires
literal `confirmed: true`, and Claude Code is instructed to prompt on every
such call even in permissive permission modes.

Tool-call requests accept optional object-valued `_meta` alongside `name` and
`arguments`, including Codex request metadata. Metadata is not forwarded to
the API or returned in tool results; it does not relax tool arguments or
confirmation requirements.

Node-less clients do not run this local component, and this package does not
claim or generate native binary support. When no MCP is available, the skill
pins the exact `@cohesivity/init@0.8.0` package instead of mutable
remote shell code. With the user's explicit authorization, either bootstrap
path can create a free ephemeral tenant that expires after 72 hours unless
claimed.

To create account-owned local tenants with no claim step, sign in explicitly
using the installed plugin's local entrypoint. From this source checkout:

```bash
node mcp/project-bootstrap.mjs login
node mcp/project-bootstrap.mjs logout
```

`login` prints a Cohesivity browser authorization URL to CLI stderr and waits
up to three minutes for a loopback callback. It uses authorization code + PKCE,
dynamic public-client registration, and account-required consent; guest grants
are rejected. It requests only tenant-creation permission. No browser action
is triggered by a tool call, and the default invocation without a subcommand
remains stdio MCP. Restart an existing MCP session only if its HOME/XDG
configuration differs from the CLI's.

Account tokens are stored outside the project in
`$XDG_CONFIG_HOME/cohesivity/mcp-auth.json`, or
`$HOME/.config/cohesivity/mcp-auth.json` when XDG_CONFIG_HOME is unset, with
private file and directory permissions. The local MCP refreshes expiring tokens
before running account bootstrap. Existing invalid, revoked, or guest
credentials fail closed; it never silently creates a guest tenant instead.
`logout` revokes the saved token family and deletes the local token file,
returning future new projects to guest bootstrap. If server revocation fails,
it still removes local auth and reports that limitation without exposing tokens.
It doesn't delete tenants, change existing project credentials, or revoke
independent grants saved in another client. Remote MCP sign-in and local sign-in
are independent.

Account bootstrap sends a private temporary auth-header file to quickstart,
never a token argument or environment variable. The file is deleted after the
script exits. A non-secret retry key is saved in the same protected user-state
directory per project root and saved OAuth client, so retries after a failed
quickstart use the same tenant-creation request. Do not delete this state to
retry an interrupted bootstrap.

Account storage operations serialize across local MCP processes, and overlapping
quickstarts for the same project are rejected. Locks are removed on ordinary
completion and failures. A forcibly terminated MCP process can leave
`mcp-auth.lock` in the user config directory or `.cohesivity-bootstrap.lock` in
the project. Only remove a leftover empty lock directory after confirming no
login, logout, or bootstrap process is still using it; retry keys and credential
files should stay intact.

The source MCP still exposes only `create_tenant`, `claim_tenant`, `tenant_status`,
and `provision_resource`; login/logout are CLI operations, not new tools.
The skill requires
agents to stop when another control-plane mutation has no supported tool,
rather than inventing a tool or bypassing MCP through HTTP, a CLI, or a script.

The **remote management MCP connection** at
`https://cohesivity.ai/mcp/manage` is different: its OAuth session belongs to
the MCP client and can use guest access or account sign-in. The account-scoped
grant can create the first tenant and manage current or future owned tenants;
an optional tenant chosen during consent is only a default, and ownership is
checked again on every tenant call. The endpoint returns an OAuth challenge to
compatible MCP clients. No package contains a bearer token, literal auth header,
client secret, or other credential. The remote server also requires literal
`confirmed: true` on every mutating tool.

Hosted `create_tenant` returns existing metadata plus
`credentials_file: { filename: ".cohesivity", content: "<exact .cohesivity file contents>" }`
in both `structuredContent` and the compatible text result. The existing OAuth
`mcp:tenants:create` scope, confirmation, and fresh account ownership or
guest-creation checks authorize this deliberate secret-bearing response. It
may enter model or client retained tool history. The calling agent writes the
content verbatim to the current project's `.cohesivity` with mode `0600` and
gitignores it. Never overwrite a different existing tenant, print credentials
in chat, logs, or source, or commit them. If the agent cannot write safely, it
must report that explicitly; the server cannot force a client filesystem write.
Other hosted tool outputs retain secret scrubbing; local MCP output remains
metadata-only.

The non-secret `credentials_download_url` remains an optional fallback for
clients with no writable workspace, not a prerequisite for coding clients.
Its protected `/mcp/tenants/:tenant_id/credentials` browser endpoint requires
the consent browser's guest cookie for its own still-ephemeral creation or
an account session that owns the claimed tenant. The URL and an MCP bearer
alone cannot download the file. Guest access ends after claim; reconnect with
the owning account.

The coordinated candidates are hosted/local plugin 4.0.1 and initializer
0.8.0. This guidance does not assert publication or deployment.

## Supported package surfaces

| Surface | Installable package root | Manifest and MCP artifact |
| --- | --- | --- |
| Agent Plugins 1.0 clients | repository root | `plugin.json`, `mcp.json` |
| Claude Code marketplace | repository root | `.claude-plugin/marketplace.json` pointing to `packages/claude/` |
| Claude Code plugin | `packages/claude/` | `.claude-plugin/plugin.json`, `.mcp.json` |
| Gemini CLI extension | `packages/gemini/` | `gemini-extension.json` |
| Google Antigravity plugin | `packages/antigravity/` | `plugin.json`, `mcp_config.json` |
| OpenAI/Codex native plugin | `packages/openai/` | `.codex-plugin/plugin.json`, `.mcp.json` |
| Codex marketplace | `packages/codex/` | `.agents/plugins/marketplace.json`, `plugins/cohesivity/` |

Every installable plugin root is self-contained: it includes
`skills/cohesivity/SKILL.md`, `mcp/project-bootstrap.mjs`, the appropriate dual
MCP configuration, and the license. The Claude wrapper adapts the canonical
skill with Claude Code marketplace metadata and section headings while keeping
the same operating rules. Other wrappers preserve the canonical skill bytes.
`packages/codex/` is a marketplace catalog whose self-contained plugin lives at
`plugins/cohesivity/`. The OpenAI and Codex packages intentionally have no
`.app.json`: this repository does not own a registered `plugin_asdk_app...` ID,
and inventing one would not create a valid ChatGPT app connection.

Use the repository root with clients that implement Agent Plugins 1.0,
including OpenClaw and Hermes. Use a `packages/<client>/` directory as the
source when a native client requires its own root marker. For example, from a
checkout:

```bash
claude plugin marketplace add ./
gemini extensions install ./packages/gemini
agy plugin install ./packages/antigravity
```

OpenAI plugin installation is marketplace-driven. `packages/openai/` is the
standalone native plugin root, while `packages/codex/` is a complete local
Codex marketplace that points at its nested copy. Both supply the skill, local
Node stdio tools, and the remote MCP server, not a registered app.

## OAuth and owner overrides

Agent Plugins 1.0 deliberately defines no portable OAuth field. Its
`mcp.json` declares the protected URL with Streamable HTTP transport and the
local server with stdio transport, so OAuth discovery, browser interaction,
and token storage belong to the client. Clients may leave the remote server
disconnected and continue using the skill and local bootstrap flow.

OpenClaw requires an owner/operator override to opt the bundled connection into
its OAuth credential store. Operator MCP config wins over the bundle entry with
the same name:

```bash
openclaw mcp set cohesivity '{"url":"https://cohesivity.ai/mcp/manage","transport":"streamable-http","auth":"oauth"}'
openclaw mcp login cohesivity
```

Hermes also keeps OAuth out of portable package data. Its portable adapter
qualifies the server name using discovered install identity, so first copy the
exact server name Hermes reports. Owner config replaces the whole bundle entry,
not individual fields; repeat the URL, auth mode, and any other desired native
fields in the override. Hermes treats a URL-only transport as Streamable HTTP;
its native `transport` field is only needed to opt into legacy `sse`:

```yaml
mcp_servers:
  <qualified-server-name>:
    url: https://cohesivity.ai/mcp/manage
    auth: oauth
```

Then run:

```bash
hermes mcp login <qualified-server-name>
```

Use that same reported name in both places. Owner `config.yaml` entries take
precedence over portable entries, so an incomplete override can discard the
bundle's URL or other settings instead of augmenting it.

## Antigravity filename collision

Agent Plugins and Antigravity both require a root file named `plugin.json`, but
the schemas are incompatible. Agent Plugins requires its 1.0 `$schema` and
allows portable metadata; Antigravity's published strict schema allows only
`name` and `description`. The Antigravity manifest therefore stays isolated at
`packages/antigravity/plugin.json`, and its remote MCP file uses Antigravity's
required `serverUrl` key. Do not copy that manifest over the repository root.

## Canonical skill, wrappers, and install artifacts

`skills/cohesivity/SKILL.md` is pinned byte-for-byte to
`cohesivity-org/cohesivity-skill@27e41382fdaa31e4d32d5019ab76083c20736688`:

- skill metadata version: `c098834bea25`
- size: 20,265 bytes
- SHA-256: `ccdc71a865d775709339869a1ae029f88a8f9d789e0cb6fde17e81fe60423d9c`

The root skill is the source for every generated wrapper copy. Rebuild and
validate with dependency-free Node commands:

```bash
npm run build
npm run check
npm test
```

`npm run build` removes stale root client markers, regenerates every wrapper in
a fixed order, copies the canonical skill and local MCP bytes unchanged, and
rebuilds the checked-in archives using the manifest's existing source stamp.
`npm run check` validates wrappers, archives, hashes, sizes, file inventories,
and tree digests without writing and fails on any stale or unexpected generated
artifact.

Current versioned installer inputs live under `artifacts/v4.0.1/`; existing
`artifacts/v4.0.0/` inputs remain immutable. Each client archive
uses sorted portable tar entries, fixed modes/owners/timestamps, and a
deterministic gzip stream. `install-manifest.v1.json` records each archive's
byte size and SHA-256 plus every contained file's size/SHA-256 and a canonical
tree digest. Installers fetch the manifest and archive through immutable
`raw.githubusercontent.com` commit URLs and verify size and SHA-256 before
extracting; no GitHub Release is required.

The source commit cannot be the commit that first introduces a manifest naming
itself. Release publication therefore uses a two-step stamp:

1. Rebuild wrappers and archives, then commit the source and the deterministic
   `*.tar.gz` files. Do not publish the provisional manifest from this step.
2. Run `SOURCE_COMMIT=<the-full-archive-commit> npm run artifacts`. Verify that
   only `install-manifest.v1.json` changed, then commit that stamped manifest.

The first commit is now the immutable raw source for every archive URL in the
second commit's manifest. `SOURCE_COMMIT` must be a full lowercase 40-character
Git commit; generation has no timestamp or implicit `HEAD` fallback, so the
stamp is deliberate and reproducible.

## Safety

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). It also
documents the consent, credential, and mutable live-documentation boundaries.
See [CONTRIBUTING.md](CONTRIBUTING.md) for account-free package verification.

Project credentials live in `.cohesivity`, which must remain gitignored.
Neither `coh_management_key` nor `coh_application_key` belongs in browser code,
logs, screenshots, chat, plugin manifests, or MCP configuration. Claiming a
tenant, provisioning paid resources, upgrading a plan, and provisioning a
managed agent remain explicit consent gates. The local MCP parses credentials
as data, never sources the file, rejects symlinked credential and `.gitignore`
files, and uses fixed named Management API routes only. In Claude Code it also
rejects a project root outside the client-supplied project directory.

## Docs

- Offerings and current API contracts: <https://cohesivity.ai/offerings/>
- Index: <https://cohesivity.ai/llms.txt>
- Pricing: <https://cohesivity.ai/pricing>

## License

MIT. See [LICENSE](LICENSE).
