# Cohesivity agent plugin

Cohesivity packages one canonical Agent Skill together with a local project
bootstrap MCP server and the protected remote Cohesivity management MCP server.
The repository root is a pure
[Agent Plugins 1.0](https://agent-plugins.org/) package; generated native
wrappers live under `packages/` so client-specific markers never change how the
portable root is detected.

## Local bootstrap and remote OAuth are independent

The dependency-free **local `cohesivity-local` stdio MCP server** needs Node
18 or newer but no Cohesivity account. Its primary `create_tenant` tool accepts
an absolute project root, fetches the canonical quickstart, and executes it in
that directory with `--no-plugin`. It returns only non-secret tenant metadata.
The same server exposes fixed claim, status, provision, deprovision, and bulk
provision operations against the Cohesivity Management API. Those operations
read the project's `.cohesivity` management credential internally, project
allowlisted responses, and never expose either `coh_*` value. There is no
generic shell command or arbitrary HTTP proxy.

Node-less clients do not run this local component. They retain the documented
quickstart fallback from the skill:

```bash
curl -fsSL https://cohesivity.ai/quickstart.sh | bash
```

This package does not claim or generate native binary support. With the user's
agreement, either bootstrap path can create a free ephemeral tenant that
expires after 72 hours unless claimed.

The **remote management MCP connection** at
`https://cohesivity.ai/mcp/manage` is different: it requires Cohesivity sign-in
but it can be authorized before the account owns a tenant. The account-scoped
grant can create the first tenant and manage current or future owned tenants;
an optional tenant chosen during consent is only a default, and ownership is
checked again on every tenant call. The endpoint returns an OAuth challenge to
compatible MCP clients. No package contains a bearer token, literal auth header,
client secret, or other credential.

## Supported package surfaces

| Surface | Installable package root | Manifest and MCP artifact |
| --- | --- | --- |
| Agent Plugins 1.0 clients | repository root | `plugin.json`, `mcp.json` |
| Claude Code plugin/marketplace | `packages/claude/` | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json` |
| Gemini CLI extension | `packages/gemini/` | `gemini-extension.json` |
| Google Antigravity plugin | `packages/antigravity/` | `plugin.json`, `mcp_config.json` |
| OpenAI/Codex native plugin | `packages/openai/` | `.codex-plugin/plugin.json`, `.mcp.json` |
| Codex marketplace | `packages/codex/` | `.agents/plugins/marketplace.json`, `plugins/cohesivity/` |

Every installable plugin root is self-contained: it includes
`skills/cohesivity/SKILL.md`, `mcp/project-bootstrap.mjs`, the appropriate dual
MCP configuration, and the license. `packages/codex/` is a marketplace catalog
whose self-contained plugin lives at `plugins/cohesivity/`. The OpenAI and
Codex packages intentionally have no `.app.json`: this repository does not own
a registered `plugin_asdk_app...` ID, and inventing one would not create a
valid ChatGPT app connection.

Use the repository root with clients that implement Agent Plugins 1.0,
including OpenClaw and Hermes. Use a `packages/<client>/` directory as the
source when a native client requires its own root marker. For example, from a
checkout:

```bash
claude plugin marketplace add ./packages/claude
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
disconnected and continue using the skill and local ephemeral bootstrap flow.

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
`cohesivity-org/cohesivity-skill@f97e0d2ac8a653b7d54d1bb6e70aee78a8887e60`:

- skill metadata version: `84fbece3c00b`
- SHA-256: `3b0d9cda6167263cb35a4e3b54ed455113318a1b24cb5e341f26843456b0b589`

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

Versioned installer inputs live under `artifacts/v2.1.4/`. Each client archive
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

Project credentials live in `.cohesivity`, which must remain gitignored.
Neither `coh_management_key` nor `coh_application_key` belongs in browser code,
logs, screenshots, chat, plugin manifests, or MCP configuration. Claiming a
tenant, provisioning paid resources, upgrading a plan, and provisioning a
managed agent remain explicit consent gates. The local MCP parses credentials
as data, never sources the file, rejects symlinked credential files, and uses
fixed named Management API routes only.

## Docs

- Offerings and current API contracts: <https://cohesivity.ai/offerings/>
- Index: <https://cohesivity.ai/llms.txt>
- Pricing: <https://cohesivity.ai/pricing>

## License

MIT. See [LICENSE](LICENSE).
