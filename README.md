# Cohesivity plugin

The Cohesivity agent skill, packaged as a Claude Code plugin.

Agent-provisioned backend infrastructure via [Cohesivity](https://cohesivity.ai). One
API provisions Postgres, Redis, object and vector storage, hosting, auth and social
login, realtime, an agent-native email inbox, a managed browser, and AI model APIs.
The agent provisions on the user's behalf, so there is no per-vendor console and no
keys for the user to copy by hand.

A fresh tenant is **ephemeral**: free, no signup, and it expires after 72 hours unless
the user claims it. Anything that spends money or creates durable state is a consent
gate that surfaces a URL for the user to approve.

## Which repo is which

Two repos publish the same skill for different channels. Neither is generated from the
other.

| Repo | Channel | Shape |
| --- | --- | --- |
| [`cohesivity-skill`](https://github.com/cohesivity-org/cohesivity-skill) | `npx skills add`, the `@cohesivity/init` npm package, `cohesivity.ai/skill.md` | The canonical skill, versioned by a content hash |
| **`cohesivity-plugin`** (this repo) | Claude Code plugin marketplaces | The same skill in plugin layout: semver, plugin manifests, and the section structure marketplaces require |

If you just want the skill, use `cohesivity-skill`. This repo exists because plugin
marketplaces require a `plugin.json`, a `marketplace.json`, a semver `version`, and a
fixed section layout that the canonical file deliberately does not carry.

## Layout

```
.claude-plugin/plugin.json          plugin manifest
.claude-plugin/marketplace.json     marketplace manifest
skills/cohesivity/SKILL.md          the skill
skills/cohesivity/references/       per-resource rules, troubleshooting
```

`SKILL.md` carries the stable core. Per-resource detail sits in `references/`, and
API-level detail (endpoints, parameters, limits, pricing) lives in the live docs, which
are the source of truth and change independently of this repo.

## Install

Add this repo as a plugin marketplace in Claude Code, or install the skill directly:

```bash
npx skills add cohesivity-org/cohesivity-skill
```

## Requirements

A shell with `curl`, `grep`, `mktemp`, and `ln`, plus outbound HTTPS to
`cohesivity.ai`. No account, CLI, or cloud console is required.

## Safety

Credentials land in `.cohesivity` in the project root. The bootstrap refuses to run
unless that file is already gitignored, and it validates every expected field before
installing anything. `coh_*` keys are server-side only and never belong in client
code. Claiming a tenant, provisioning paid resources, upgrading a plan, and
provisioning a managed agent are consent gates the agent must not cross on its own.

## Docs

- Per-resource API and limits: <https://cohesivity.ai/offerings/>
- Index: <https://cohesivity.ai/llms.txt>
- Pricing: <https://cohesivity.ai/pricing>

## License

MIT. See [LICENSE](LICENSE).
