import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  MCP_ENDPOINT,
  SKILL_SHA256,
  SKILL_SOURCE_COMMIT,
  SKILL_VERSION,
  build,
  check,
  expectedFiles,
} from "../scripts/build-packages.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const endpoint = MCP_ENDPOINT;

const findKeys = (value, keys = []) => {
  if (Array.isArray(value)) {
    for (const child of value) findKeys(child, keys);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      findKeys(child, keys);
    }
  }
  return keys;
};

test("root is a pure Agent Plugins 1.0 package", () => {
  const manifest = json("plugin.json");
  assert.equal(
    manifest.$schema,
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  );
  assert.match(manifest.name, /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  assert.deepEqual(
    Object.keys(manifest).sort(),
    [
      "$schema",
      "author",
      "description",
      "homepage",
      "keywords",
      "license",
      "name",
      "repository",
      "version",
    ],
  );

  const mcp = json("mcp.json");
  assert.deepEqual(Object.keys(mcp).sort(), ["$schema", "mcpServers"]);
  assert.equal(
    mcp.$schema,
    "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  );
  assert.deepEqual(mcp.mcpServers, {
    cohesivity: { type: "streamable-http", url: endpoint },
  });

  for (const marker of [
    ".claude-plugin",
    ".codex-plugin",
    ".mcp.json",
    "gemini-extension.json",
    "mcp_config.json",
    "openclaw.plugin.json",
  ]) {
    assert.equal(existsSync(marker), false, `unexpected root client marker: ${marker}`);
  }
});

test("canonical skill is pinned and every package copy is byte-identical", () => {
  const canonical = readFileSync("skills/cohesivity/SKILL.md");
  assert.equal(SKILL_SOURCE_COMMIT, "58ee95ac648296e69cac36e7a3eb01f7958e1c1d");
  assert.equal(SKILL_VERSION, "4a7bd4890f4c");
  assert.equal(
    SKILL_SHA256,
    "83fc0733fa26a8d49499375427f33a279ad186531d1ac6301635034eb78eca88",
  );
  assert.equal(
    createHash("sha256").update(canonical).digest("hex"),
    SKILL_SHA256,
  );
  assert.match(
    canonical.toString("utf8"),
    new RegExp(`^---\\nname: cohesivity\\nversion: ${SKILL_VERSION}\\n`),
  );

  for (const path of [
    "packages/claude/skills/cohesivity/SKILL.md",
    "packages/gemini/skills/cohesivity/SKILL.md",
    "packages/antigravity/skills/cohesivity/SKILL.md",
    "packages/openai/skills/cohesivity/SKILL.md",
  ]) {
    assert.deepEqual(readFileSync(path), canonical, `${path} drifted from the canonical skill`);
  }
});

test("native wrapper package roots use each client's remote MCP shape", () => {
  const claudeManifest = json("packages/claude/.claude-plugin/plugin.json");
  assert.equal(claudeManifest.skills, "./skills/");
  assert.equal(claudeManifest.mcpServers, "./.mcp.json");
  assert.equal(
    json("packages/claude/.mcp.json").mcpServers.cohesivity.url,
    endpoint,
  );

  const geminiManifest = json("packages/gemini/gemini-extension.json");
  assert.deepEqual(Object.keys(geminiManifest).sort(), [
    "description",
    "mcpServers",
    "name",
    "version",
  ]);
  assert.equal(
    geminiManifest.mcpServers.cohesivity.httpUrl,
    endpoint,
  );

  const antigravityManifest = json("packages/antigravity/plugin.json");
  assert.deepEqual(Object.keys(antigravityManifest).sort(), ["description", "name"]);
  assert.match(antigravityManifest.name, /^[a-zA-Z0-9-_]+$/);
  assert.equal(
    json("packages/antigravity/mcp_config.json").mcpServers.cohesivity.serverUrl,
    endpoint,
  );

  const openAiManifest = json("packages/openai/.codex-plugin/plugin.json");
  assert.equal(openAiManifest.skills, "./skills/");
  assert.equal(openAiManifest.mcpServers, "./.mcp.json");
  assert.equal("apps" in openAiManifest, false);
  assert.equal(existsSync("packages/openai/.app.json"), false);
  assert.equal(
    json("packages/openai/.mcp.json").cohesivity.url,
    endpoint,
  );
});

test("all packaged MCP definitions omit auth data and the public docs endpoint", () => {
  for (const path of [
    "mcp.json",
    "packages/claude/.mcp.json",
    "packages/gemini/gemini-extension.json",
    "packages/antigravity/mcp_config.json",
    "packages/openai/.mcp.json",
  ]) {
    const contents = readFileSync(path, "utf8");
    const document = JSON.parse(contents);
    const keys = findKeys(document).map((key) => key.toLowerCase());
    assert.equal(keys.includes("headers"), false, `${path} contains headers`);
    assert.equal(keys.includes("auth"), false, `${path} contains auth`);
    assert.equal(keys.includes("oauth"), false, `${path} contains oauth`);
    assert.doesNotMatch(contents, /Authorization|Bearer\s/i);
    assert.doesNotMatch(contents, /"https:\/\/cohesivity\.ai\/mcp"/);
    assert.match(contents, /https:\/\/cohesivity\.ai\/mcp\/manage/);
  }
});

test("tracked generated artifacts are current and deterministic", () => {
  check();
  const before = expectedFiles();

  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-plugin-packages-"));
  try {
    mkdirSync(join(temporaryRoot, "skills/cohesivity"), { recursive: true });
    cpSync("LICENSE", join(temporaryRoot, "LICENSE"));
    cpSync(
      "skills/cohesivity/SKILL.md",
      join(temporaryRoot, "skills/cohesivity/SKILL.md"),
    );
    writeFileSync(join(temporaryRoot, ".mcp.json"), "stale client marker\n");

    build(temporaryRoot);
    check(temporaryRoot);
    const first = expectedFiles(temporaryRoot);
    build(temporaryRoot);
    const second = expectedFiles(temporaryRoot);

    assert.deepEqual([...first.keys()], [...second.keys()]);
    for (const [path, contents] of first) {
      assert.deepEqual(second.get(path), contents, `${path} changed across builds`);
    }
    assert.equal(existsSync(join(temporaryRoot, ".mcp.json")), false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  assert.deepEqual([...expectedFiles().keys()], [...before.keys()]);
});

test("README documents the Hermes owner override without an unstable hash", () => {
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /mcp_servers:\n  <qualified-server-name>:/);
  assert.match(readme, /url: https:\/\/cohesivity\.ai\/mcp\/manage/);
  assert.match(readme, /auth: oauth/);
  assert.match(readme, /hermes mcp login <qualified-server-name>/);
  assert.match(readme, /replaces the whole bundle entry/);
  assert.match(readme, /URL-only transport as Streamable HTTP/);
  assert.doesNotMatch(
    readme,
    /mcp_servers:\n  <qualified-server-name>:[\s\S]*?transport: streamable-http/,
  );
  assert.doesNotMatch(readme, /agent-plugin-cohesivity-[a-f0-9]+__cohesivity/);
});
