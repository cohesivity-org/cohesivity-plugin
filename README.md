# Cohesivity agent plugin

Cohesivity packages one canonical Agent Skill together with the protected
Cohesivity management MCP server. The repository root is a pure
[Agent Plugins 1.0](https://agent-plugins.org/) package; generated native
wrappers live under `packages/` so client-specific markers never change how the
portable root is detected.

## Two independent ways to use it

The **skill/bootstrap flow** needs no Cohesivity account. With the user's
agreement, the skill can create a free ephemeral tenant that expires after 72
hours unless claimed. This remains available when the bundled MCP server is
disconnected.

The **remote management MCP connection** at
`https://cohesivity.ai/mcp/manage` is different: it requires Cohesivity sign-in
and a claimed tenant. The endpoint returns an OAuth challenge to compatible MCP
clients. No package contains a bearer token, literal auth header, client secret,
or other credential.

## Supported package surfaces

| Surface | Installable package root | Manifest and MCP artifact |
| --- | --- | --- |
| Agent Plugins 1.0 clients | repository root | `plugin.json`, `mcp.json` |
| Claude Code plugin/marketplace | `packages/claude/` | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json` |
| Gemini CLI extension | `packages/gemini/` | `gemini-extension.json` |
| Google Antigravity plugin | `packages/antigravity/` | `plugin.json`, `mcp_config.json` |
| OpenAI native plugin | `packages/openai/` | `.codex-plugin/plugin.json`, `.mcp.json` |

Every package root is self-contained: it includes
`skills/cohesivity/SKILL.md`, the appropriate MCP configuration, and the
license. The OpenAI package intentionally has no `.app.json`: this repository
does not own a registered `plugin_asdk_app...` ID, and inventing one would not
create a valid ChatGPT app connection.

Use the repository root with clients that implement Agent Plugins 1.0,
including OpenClaw and Hermes. Use a `packages/<client>/` directory as the
source when a native client requires its own root marker. For example, from a
checkout:

```bash
claude plugin marketplace add ./packages/claude
gemini extensions install ./packages/gemini
agy plugin install ./packages/antigravity
```

OpenAI plugin installation is marketplace-driven; point the marketplace entry
at `packages/openai/`. That package supplies a skill and a remote MCP server,
not a registered app.

## OAuth and owner overrides

Agent Plugins 1.0 deliberately defines no portable OAuth field. Its
`mcp.json` contains only the protected URL and Streamable HTTP transport, so
OAuth discovery, browser interaction, and token storage belong to the client.
Clients may leave that server disconnected and continue using the local skill
and ephemeral bootstrap flow.

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

## Canonical skill and generated artifacts

`skills/cohesivity/SKILL.md` is pinned byte-for-byte to
`cohesivity-org/cohesivity-skill@58ee95ac648296e69cac36e7a3eb01f7958e1c1d`:

- skill version: `4a7bd4890f4c`
- SHA-256: `83fc0733fa26a8d49499375427f33a279ad186531d1ac6301635034eb78eca88`

The root skill is the source for every generated wrapper copy. Rebuild and
validate with dependency-free Node commands:

```bash
npm run build
npm run check
npm test
```

`npm run build` removes stale root client markers, regenerates every wrapper in
a fixed order, copies the canonical skill bytes unchanged, and validates all
known manifest/MCP structures. `npm run check` performs the same validation
without writing and fails on any stale or unexpected generated artifact.

## Safety

Project credentials live in `.cohesivity`, which must remain gitignored.
Neither `coh_management_key` nor `coh_application_key` belongs in browser code,
logs, screenshots, chat, plugin manifests, or MCP configuration. Claiming a
tenant, provisioning paid resources, upgrading a plan, and provisioning a
managed agent remain explicit consent gates.

## Docs

- Offerings and current API contracts: <https://cohesivity.ai/offerings/>
- Index: <https://cohesivity.ai/llms.txt>
- Pricing: <https://cohesivity.ai/pricing>

## License

MIT. See [LICENSE](LICENSE).
