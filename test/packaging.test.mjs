import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  LOCAL_MCP_SOURCE,
  MCP_ENDPOINT,
  SKILL_SHA256,
  SKILL_SOURCE_COMMIT,
  SKILL_VERSION,
  VERSION,
  build,
  check,
  expectedFiles,
} from "../scripts/build-packages.mjs";
import {
  ARTIFACT_DIRECTORY,
  INSTALL_MANIFEST,
  checkArtifacts,
  expectedArtifacts,
} from "../scripts/build-artifacts.mjs";
import {
  MANAGEMENT_API_URL,
  REMOTE_MCP_URL,
  QUICKSTART_URL,
  callTool,
  handleRequest,
  redactApiOutput,
  validateProjectRoot,
} from "../mcp/project-bootstrap.mjs";

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

test("local MCP initialization reports the packaged release version", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(response.result.serverInfo.version, VERSION);
  assert.equal(json("package.json").version, VERSION);
  assert.equal(VERSION, "4.1.3");
});

test("Claude skill carries marketplace metadata without changing the portable skill", () => {
  const portableSkill = readFileSync("skills/cohesivity/SKILL.md", "utf8");
  const claudeSkill = readFileSync("packages/claude/skills/cohesivity/SKILL.md", "utf8");
  assert.doesNotMatch(portableSkill, /^allowed-tools:/m);
  assert.match(claudeSkill, /^allowed-tools: Read, WebFetch, mcp__cohesivity, mcp__cohesivity-local$/m);
  assert.match(claudeSkill, new RegExp(`^version: ${VERSION}$`, "m"));
  assert.match(claudeSkill, /^author: Cohesivity <smj@cohesivity\.ai>$/m);
  assert.match(claudeSkill, /^license: MIT$/m);
  assert.match(claudeSkill, /^compatibility: Designed for Claude Code;/m);
  assert.match(claudeSkill, /^tags:\n  - backend\n  - infrastructure\n  - mcp\n  - database\n  - hosting$/m);
  assert.doesNotMatch(
    claudeSkill,
    /^metadata:\n  version:/m,
    "Claude skill must expose one unambiguous marketplace version",
  );
  assert.doesNotMatch(claudeSkill, /compare its `metadata\.version` frontmatter value/);
  for (const section of [
    "Overview",
    "Prerequisites",
    "Installation",
    "Output",
    "Examples",
    "Workflow",
    "Error handling",
    "Resources",
  ]) {
    assert.match(claudeSkill, new RegExp(`^## ${section}$`, "m"));
  }
  assert.match(claudeSkill, /^description: [^`]+$/m);
});

test("root remains an Agent Plugins 1.0 package with a Claude marketplace entry", () => {
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
    "cohesivity-local": {
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/mcp/project-bootstrap.mjs"],
    },
  });

  const rootClaudeMarketplace = json(".claude-plugin/marketplace.json");
  assert.equal(rootClaudeMarketplace.name, "cohesivity");
  assert.equal(
    rootClaudeMarketplace.description,
    "cohesivity.ai offers free agent native backend services. Annonymous account (no-signup) to get started through MCP or API. Hosting, postgres, email, storage, containers, LLMs, voice and third-party APIs. Includes free tiers and 5 USD/mo in AI and Search credits. topups through x402.",
  );
  assert.equal(rootClaudeMarketplace.plugins.length, 1);
  assert.equal(rootClaudeMarketplace.plugins[0].name, "cohesivity");
  assert.equal(rootClaudeMarketplace.plugins[0].source, "./packages/claude");
  assert.equal(
    rootClaudeMarketplace.plugins[0].description,
    "cohesivity.ai offers free agent native backend services. Annonymous account (no-signup) to get started through MCP or API. Hosting, postgres, email, storage, containers, LLMs, voice and third-party APIs. Includes free tiers and 5 USD/mo in AI and Search credits. topups through x402.",
  );
  assert.equal(existsSync(".claude-plugin/plugin.json"), false);

  for (const marker of [
    ".codex-plugin",
    ".mcp.json",
    "gemini-extension.json",
    "mcp_config.json",
    "openclaw.plugin.json",
  ]) {
    assert.equal(existsSync(marker), false, `unexpected root client marker: ${marker}`);
  }
});

test("canonical skill is pinned and every portable package copy is byte-identical", () => {
  const canonical = readFileSync("skills/cohesivity/SKILL.md");
  assert.equal(SKILL_SOURCE_COMMIT, "ce021d9d5cf6dadd4dce30d71c2d880b9c0f4c48");
  assert.equal(SKILL_VERSION, "fef5cc6c4e30");
  assert.equal(canonical.length, 23408);
  assert.equal(
    SKILL_SHA256,
    "c5903bc513c4e70d92a13ef7cb3ddd1a46cb7fb2692d06405bb1d6f39343824e",
  );
  assert.equal(
    createHash("sha256").update(canonical).digest("hex"),
    SKILL_SHA256,
  );
  assert.match(
    canonical.toString("utf8"),
    new RegExp(`^---\\nname: cohesivity\\n[\\s\\S]*?^metadata:\\n  version: "${SKILL_VERSION}"$`, "m"),
  );

  for (const path of [
    "packages/gemini/skills/cohesivity/SKILL.md",
    "packages/antigravity/skills/cohesivity/SKILL.md",
    "packages/openai/skills/cohesivity/SKILL.md",
    "packages/codex/plugins/cohesivity/skills/cohesivity/SKILL.md",
  ]) {
    assert.deepEqual(readFileSync(path), canonical, `${path} drifted from the canonical skill`);
  }
});

test("every skill documents exactly the five supported MCP tools and fails closed", async () => {
  const response = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const names = ["create_tenant", "claim_tenant", "tenant_status", "provision_resource", "give_feedback"];
  assert.deepEqual(response.result.tools.map((tool) => tool.name), names);
  for (const root of [
    ".",
    "packages/claude",
    "packages/gemini",
    "packages/antigravity",
    "packages/openai",
    "packages/codex/plugins/cohesivity",
  ]) {
    const skill = readFileSync(`${root}/skills/cohesivity/SKILL.md`, "utf8");
    const operations = skill.match(/^## Supported MCP operations\n([\s\S]*?)(?=^## )/m)?.[1];
    assert.ok(operations, `${root} is missing the supported operations boundary`);
    assert.deepEqual([...operations.matchAll(/^- `([^`]+)`: /gm)].map((match) => match[1]), names);
    assert.match(operations, /`tenant_status` is read-only/);
    assert.match(operations, /`create_tenant`, `claim_tenant`, and `provision_resource` still require `confirmed: true`/);
    assert.match(operations, /`give_feedback` is the exception to mutation confirmation/);
    assert.match(operations, /Exclude personal information and secrets/);
    assert.match(operations, /deployment, billing, credential rotation, and destruction, are not covered by these tools/);
    assert.match(operations, /use direct HTTP with the management key/);
    assert.match(skill, /npx --yes @cohesivity\/init@0\.8\.3/);
    assert.doesNotMatch(skill, /@cohesivity\/init@0\.6\.6/);
  }
});

test("native wrapper package roots use each client's remote MCP shape", () => {
  const claudeManifest = json("packages/claude/.claude-plugin/plugin.json");
  assert.equal(existsSync("packages/claude/.claude-plugin/marketplace.json"), false);
  assert.equal(claudeManifest.skills, "./skills/");
  assert.equal(claudeManifest.mcpServers, "./.mcp.json");
  assert.equal(
    json("packages/claude/.mcp.json").mcpServers.cohesivity.url,
    endpoint,
  );
  assert.deepEqual(json("packages/claude/.mcp.json").mcpServers["cohesivity-local"], {
    type: "stdio",
    command: "node",
    args: ["${CLAUDE_PLUGIN_ROOT}/mcp/project-bootstrap.mjs"],
  });

  const geminiManifest = json("packages/gemini/gemini-extension.json");
  assert.deepEqual(Object.keys(geminiManifest).sort(), [
    "description",
    "mcpServers",
    "name",
    "version",
  ]);
  assert.equal(
    geminiManifest.mcpServers.cohesivity.url,
    endpoint,
  );
  assert.equal(geminiManifest.mcpServers.cohesivity.type, "http");
  assert.deepEqual(geminiManifest.mcpServers["cohesivity-local"], {
    command: "node",
    args: ["${extensionPath}${/}mcp${/}project-bootstrap.mjs"],
    cwd: "${extensionPath}",
  });

  const antigravityManifest = json("packages/antigravity/plugin.json");
  assert.deepEqual(Object.keys(antigravityManifest).sort(), ["description", "name"]);
  assert.match(antigravityManifest.name, /^[a-zA-Z0-9-_]+$/);
  assert.equal(
    json("packages/antigravity/mcp_config.json").mcpServers.cohesivity.serverUrl,
    endpoint,
  );
  assert.deepEqual(
    json("packages/antigravity/mcp_config.json").mcpServers["cohesivity-local"],
    {
      command: "node",
      args: ["${extensionPath}${/}mcp${/}project-bootstrap.mjs"],
      cwd: "${extensionPath}",
    },
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
  assert.deepEqual(json("packages/openai/.mcp.json")["cohesivity-local"], {
    type: "stdio",
    command: "node",
    args: ["./mcp/project-bootstrap.mjs"],
    cwd: ".",
  });

  const marketplace = json("packages/codex/.agents/plugins/marketplace.json");
  assert.deepEqual(marketplace.plugins[0].source, {
    source: "local",
    path: "./plugins/cohesivity",
  });
  assert.deepEqual(marketplace.plugins[0].policy, {
    installation: "AVAILABLE",
    authentication: "ON_USE",
    products: ["CODEX"],
  });
  assert.deepEqual(
    json("packages/codex/plugins/cohesivity/.mcp.json"),
    json("packages/openai/.mcp.json"),
  );
});

test("all packaged MCP definitions omit auth data and the public docs endpoint", () => {
  for (const path of [
    "mcp.json",
    "packages/claude/.mcp.json",
    "packages/gemini/gemini-extension.json",
    "packages/antigravity/mcp_config.json",
    "packages/openai/.mcp.json",
    "packages/codex/plugins/cohesivity/.mcp.json",
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
  checkArtifacts();
  const before = expectedFiles();

  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-plugin-packages-"));
  try {
    mkdirSync(join(temporaryRoot, "skills/cohesivity"), { recursive: true });
    cpSync("LICENSE", join(temporaryRoot, "LICENSE"));
    cpSync(
      "skills/cohesivity/SKILL.md",
      join(temporaryRoot, "skills/cohesivity/SKILL.md"),
    );
    mkdirSync(join(temporaryRoot, "mcp"), { recursive: true });
    cpSync(LOCAL_MCP_SOURCE, join(temporaryRoot, LOCAL_MCP_SOURCE));
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

test("local MCP source is byte-identical in every installable package", () => {
  const canonical = readFileSync(LOCAL_MCP_SOURCE);
  for (const path of [
    "packages/claude/mcp/project-bootstrap.mjs",
    "packages/gemini/mcp/project-bootstrap.mjs",
    "packages/antigravity/mcp/project-bootstrap.mjs",
    "packages/openai/mcp/project-bootstrap.mjs",
    "packages/codex/plugins/cohesivity/mcp/project-bootstrap.mjs",
  ]) {
    assert.deepEqual(readFileSync(path), canonical, `${path} drifted from the canonical local MCP`);
  }
});

test("gitignore append reopens the validated file without following or blocking", () => {
  const source = readFileSync(LOCAL_MCP_SOURCE, "utf8");
  assert.doesNotMatch(source, /openSync\(path, "a"\)/);
  assert.match(
    source,
    /fsConstants\.O_WRONLY\s*\|\s*fsConstants\.O_APPEND\s*\|\s*\(fsConstants\.O_NONBLOCK \?\? 0\)\s*\|\s*\(fsConstants\.O_NOFOLLOW \?\? 0\)/,
  );
});

test("create_tenant runs the fixed quickstart and returns only project metadata", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-project-root-"));
  const managementKey = "coh_man_1234567890abcdefghij";
  const applicationKey = "coh_app_abcdefghij1234567890";
  const requests = [];

  try {
    const fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      assert.equal(String(url), QUICKSTART_URL);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.match(options.headers["User-Agent"], /^cohesivity-project-bootstrap\//);
      return new Response("#!/bin/bash\n");
    };

    const output = await callTool(
      "create_tenant",
      { project_root: temporaryRoot, confirmed: true },
      { fetch, env: { HOME: temporaryRoot }, runQuickstart: async (_script, args, options) => {
        assert.deepEqual(args, []);
        assert.equal(options.cwd, temporaryRoot);
        writeFileSync(join(temporaryRoot, ".cohesivity"), `tenant_id=swift-fox-running\ncoh_management_key=${managementKey}\ncoh_application_key=${applicationKey}\nexpires_at=2026-08-13T00:00:00.000Z\ntenant_lifecycle=ephemeral\nruntime_profile=stable-v1\n`, { mode: 0o600 });
      } },
    );
    assert.deepEqual(output, {
      tenant_id: "swift-fox-running",
      expires_at: "2026-08-13T00:00:00.000Z",
      tenant_lifecycle: "ephemeral",
      runtime_profile: "stable-v1",
    });
    assert.equal(requests.length, 1);
    assert.match(readFileSync(join(temporaryRoot, ".gitignore"), "utf8"), /(?:^|\n)\.cohesivity(?:\n|$)/);
    const credentials = readFileSync(join(temporaryRoot, ".cohesivity"), "utf8");
    assert.match(credentials, new RegExp(`coh_management_key=${managementKey}`));
    assert.match(credentials, new RegExp(`coh_application_key=${applicationKey}`));
    assert.doesNotMatch(JSON.stringify(output), /coh_(?:man|app)_/);
    assert.doesNotMatch(JSON.stringify(output), new RegExp(managementKey));
    assert.doesNotMatch(JSON.stringify(output), new RegExp(applicationKey));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("local MCP creation, claim and provisioning fail before network or filesystem writes without explicit confirmation", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-confirmation-"));
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    throw new Error("network must not run");
  };
  try {
    for (const [name, argumentsValue] of [
      ["create_tenant", { project_root: temporaryRoot }],
      ["claim_tenant", { project_root: temporaryRoot }],
      ["provision_resource", { project_root: temporaryRoot, resource: "postgres" }],
    ]) {
      await assert.rejects(callTool(name, argumentsValue, { fetch }), /confirmed/);
    }
    assert.equal(fetches, 0);
    assert.equal(existsSync(join(temporaryRoot, ".cohesivity")), false);
    assert.equal(existsSync(join(temporaryRoot, ".gitignore")), false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("project root validation rejects traversal and unsafe roots", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-traversal-"));
  const project = join(temporaryRoot, "project");
  const otherProject = join(temporaryRoot, "other-project");
  mkdirSync(project);
  mkdirSync(otherProject);
  try {
    assert.equal(validateProjectRoot(project, project), project);
    assert.throws(
      () => validateProjectRoot(`${project}/../project`),
      /parent-directory traversal/,
    );
    assert.throws(() => validateProjectRoot("../project"), /absolute path/);
    assert.throws(() => validateProjectRoot("/"), /filesystem root/);
    assert.throws(
      () => validateProjectRoot(otherProject, project),
      /current Claude Code project directory/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("create_tenant rejects credential and gitignore symlinks before network or outside writes", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-symlink-"));
  const project = join(temporaryRoot, "project");
  const outside = join(temporaryRoot, "outside");
  mkdirSync(project);
  writeFileSync(outside, "unchanged\n");
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    throw new Error("network must not run");
  };

  try {
    symlinkSync(outside, join(project, ".gitignore"));
    await assert.rejects(
      callTool("create_tenant", { project_root: project, confirmed: true }, { fetch }),
      /\.gitignore must be a regular file/,
    );
    rmSync(join(project, ".gitignore"));
    symlinkSync(outside, join(project, ".cohesivity"));
    await assert.rejects(
      callTool("create_tenant", { project_root: project, confirmed: true }, { fetch }),
      /\.cohesivity must be a regular file/,
    );
    assert.equal(fetches, 0);
    assert.equal(readFileSync(outside, "utf8"), "unchanged\n");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("credential reads reject a FIFO without blocking the stdio server", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-fifo-"));
  const credential = join(temporaryRoot, ".cohesivity");
  const created = spawnSync("mkfifo", [credential], { encoding: "utf8" });
  assert.equal(created.status, 0, created.stderr);

  try {
    const moduleUrl = new URL("../mcp/project-bootstrap.mjs", import.meta.url).href;
    const program = `
      import { callTool } from ${JSON.stringify(moduleUrl)};
      try {
        await callTool("tenant_status", { project_root: ${JSON.stringify(temporaryRoot)} });
        process.exitCode = 2;
      } catch (error) {
        if (!/regular file/.test(error.message)) process.exitCode = 3;
      }
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
      env: { CLAUDE_PROJECT_DIR: temporaryRoot },
      timeout: 1_000,
    });
    assert.notEqual(result.error?.code, "ETIMEDOUT", "credential FIFO blocked the MCP process");
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("create_tenant appends an effective ignore rule after negation and leading whitespace", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-ignore-negation-"));
  const managementKey = "coh_man_1234567890abcdefghij";
  const applicationKey = "coh_app_abcdefghij1234567890";
  writeFileSync(join(temporaryRoot, ".gitignore"), ".cohesivity\n!.cohesivity\n .cohesivity\n");
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: temporaryRoot }).status, 0);

  const fetch = async () => new Response("#!/bin/bash\n");

  try {
    await callTool("create_tenant", { project_root: temporaryRoot, confirmed: true }, {
      fetch, env: { HOME: temporaryRoot }, runQuickstart: async () => {
        writeFileSync(join(temporaryRoot, ".cohesivity"), `tenant_id=swift-fox-running\ncoh_management_key=${managementKey}\ncoh_application_key=${applicationKey}\n`, { mode: 0o600 });
      },
    });
    const ignored = spawnSync("git", ["check-ignore", "-q", ".cohesivity"], {
      cwd: temporaryRoot,
      encoding: "utf8",
    });
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.match(readFileSync(join(temporaryRoot, ".gitignore"), "utf8"), / \.cohesivity\n\.cohesivity\n$/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("management tools use fixed API routes and redact credential-bearing responses", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-management-"));
  const managementKey = "coh_man_1234567890abcdefghij";
  const requests = [];
  writeFileSync(
    join(temporaryRoot, ".cohesivity"),
    `tenant_id=swift-fox-running\ncoh_management_key=${managementKey}\n`,
  );
  const responses = [
    { tenant_id: "swift-fox-running", approval_url: "https://cohesivity.ai/c/safe-handoff", wait: { auth_header: `Bearer ${managementKey}` } },
    { account: { tenant_id: "swift-fox-running", lifecycle: "ephemeral", owner_user_id: "private" }, authorization: `Bearer ${managementKey}` },
    { success: true, resource: "postgres", status: "active", credential: managementKey },
    { success: false, requested_count: 2, failed_count: 1, results: [{ resource: "postgres", success: true }, { resource: "redis", error: "failed", details: managementKey }] },
  ];
  const fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const document = responses.shift();
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(document),
    };
  };

  try {
    const outputs = [
      await callTool("claim_tenant", { project_root: temporaryRoot, confirmed: true }, { fetch }),
      await callTool("tenant_status", { project_root: temporaryRoot }, { fetch }),
      await callTool(
        "provision_resource",
        { project_root: temporaryRoot, resource: "postgres", configuration: { region: "apac" }, confirmed: true },
        { fetch },
      ),
      await callTool(
        "provision_resource",
        { project_root: temporaryRoot, resources: ["postgres", "redis"], confirmed: true },
        { fetch },
      ),
    ];
    assert.deepEqual(
      requests.map(({ url, options }) => [url, options.method]),
      [
        [`${MANAGEMENT_API_URL}claim/url`, "POST"],
        [`${MANAGEMENT_API_URL}status`, "GET"],
        [`${MANAGEMENT_API_URL}resources/postgres`, "POST"],
        [`${MANAGEMENT_API_URL}resources`, "POST"],
      ],
    );
    assert.equal("body" in requests[0].options, false);
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${managementKey}`);
    for (const { options } of requests) {
      assert.deepEqual(options.headers, {
        Accept: "application/json",
        Authorization: `Bearer ${managementKey}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        "User-Agent": `cohesivity-project-bootstrap/${VERSION}`,
      });
    }
    assert.deepEqual(JSON.parse(requests[2].options.body), { region: "apac" });
    assert.deepEqual(JSON.parse(requests[3].options.body), {
      resources: ["postgres", "redis"],
    });
    const serialized = JSON.stringify(outputs);
    assert.doesNotMatch(serialized, /coh_(?:man|app)_/);
    assert.doesNotMatch(serialized, /Bearer\s/i);
    assert.doesNotMatch(serialized, /owner_user_id|authorization|credential|details/);
    assert.equal(outputs[0].approval_url, "https://cohesivity.ai/c/safe-handoff");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("tenant status preserves the API resource_name without exposing resource details", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-status-projection-"));
  writeFileSync(
    join(temporaryRoot, ".cohesivity"),
    "tenant_id=swift-fox-running\ncoh_management_key=coh_man_1234567890abcdefghij\n",
  );
  const fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () =>
      JSON.stringify({
        resources: [
          {
            resource_name: "postgres",
            status: "active",
            credential: "coh_app_abcdefghij1234567890",
            deployment_url: "https://private.example/capability",
            connection_string: "postgresql://private.example/database",
            provider: { name: "private-provider", project_id: "private-project" },
            input: { arbitrary: { nested: "private-input" } },
          },
        ],
      }),
  });

  try {
    const output = await callTool(
      "tenant_status",
      { project_root: temporaryRoot },
      { fetch },
    );
    assert.deepEqual(output, {
      tenant_id: "swift-fox-running",
      status: { resources: [{ resource_name: "postgres", status: "active" }] },
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("MCP exposes only strict named tools and never a shell or generic API proxy", async () => {
  const response = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const tools = response.result.tools;
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "create_tenant",
      "claim_tenant",
      "tenant_status",
      "provision_resource",
      "give_feedback",
    ],
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object", `${tool.name} must declare an object input schema`);
    assert.equal(tool.inputSchema.additionalProperties ?? false, false);
    assert.doesNotMatch(tool.name, /shell|exec|request|fetch|proxy/i);
    if (tool.name === "tenant_status" || tool.name === "give_feedback") {
      assert.equal(tool.inputSchema.properties.confirmed, undefined);
      assert.equal(tool._meta, undefined);
    } else {
      const variants = tool.inputSchema.oneOf || [tool.inputSchema];
      for (const variant of variants) {
        assert.deepEqual(variant.properties.confirmed?.enum, [true], tool.name);
        assert.equal(variant.required.includes("confirmed"), true, tool.name);
      }
      assert.equal(tool._meta?.["anthropic/requiresUserInteraction"], true, tool.name);
    }
  }
  const provision = tools.find((tool) => tool.name === "provision_resource");
  assert.ok(
    provision.inputSchema.oneOf.some((variant) => variant.required?.includes("resources")),
    "provision_resource must declare its bulk input shape",
  );
  await assert.rejects(
    callTool("deprovision_resource", {}),
    /Unknown tool: deprovision_resource/,
  );
  await assert.rejects(
    callTool("bulk_provision_resources", {}),
    /Unknown tool: bulk_provision_resources/,
  );
  assert.deepEqual(redactApiOutput({ status: "ok", token: "hidden", message: "coh_man_123" }), {
    message: "[REDACTED]",
    status: "ok",
  });
  let nested = { message: "coh_man_1234567890abcdefghij" };
  for (let depth = 0; depth < 10; depth += 1) nested = { account: nested };
  assert.doesNotMatch(JSON.stringify(redactApiOutput(nested)), /coh_man_/);
});

function tarPaths(archive) {
  const tar = gunzipSync(archive);
  const paths = [];
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const path = header.subarray(0, 100).toString("utf8").replace(/\0.*$/u, "");
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/u, "").trim(), 8);
    paths.push(path);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return paths;
}

test("versioned archives and install manifest are deterministic, complete, and traversal-safe", () => {
  const manifest = json(INSTALL_MANIFEST);
  const sourceCommit = manifest.source.commit;
  assert.match(sourceCommit, /^[0-9a-f]{40}$/);
  const first = expectedArtifacts(sourceCommit);
  const second = expectedArtifacts(sourceCommit);
  assert.deepEqual([...first.keys()], [...second.keys()]);
  for (const [path, contents] of first) assert.deepEqual(second.get(path), contents, `${path} changed`);

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.packages.length, 6);
  for (const entry of manifest.packages) {
    const path = `${ARTIFACT_DIRECTORY}/${entry.archive}`;
    const archive = readFileSync(path);
    const published = spawnSync("git", ["show", `${sourceCommit}:${path}`], {
      encoding: "buffer",
    });
    assert.equal(
      published.status,
      0,
      `${entry.archive} is absent from the manifest's immutable source commit`,
    );
    assert.deepEqual(published.stdout, archive, `${entry.archive} differs at the immutable source commit`);
    assert.equal(archive.length, entry.size);
    assert.equal(createHash("sha256").update(archive).digest("hex"), entry.sha256);
    assert.equal(entry.immutable_url, `${manifest.source.immutable_base_url}/${entry.archive}`);
    assert.deepEqual(tarPaths(archive), entry.files.map((file) => file.path));
    for (const file of entry.files) {
      assert.equal(file.path.startsWith("/"), false);
      assert.equal(file.path.split("/").includes(".."), false);
    }
  }
});

test("every remote wrapper preserves the exact management MCP URL", () => {
  assert.equal(REMOTE_MCP_URL, endpoint);
  const serialized = [
    json("mcp.json"),
    json("packages/claude/.mcp.json"),
    json("packages/gemini/gemini-extension.json"),
    json("packages/antigravity/mcp_config.json"),
    json("packages/openai/.mcp.json"),
    json("packages/codex/plugins/cohesivity/.mcp.json"),
  ].map(JSON.stringify);
  for (const document of serialized) {
    assert.match(document, /https:\/\/cohesivity\.ai\/mcp\/manage/);
    assert.doesNotMatch(document, /https:\/\/cohesivity\.ai\/mcp"/);
  }
});

test("README documents the Hermes owner override without an unstable hash", () => {
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /@cohesivity\/init@0\.8\.3/);
  assert.match(readme, /Current versioned installer inputs live under `artifacts\/v4\.1\.3\/`/);
  assert.match(readme, /coordinated candidates are hosted\/local plugin 4\.1\.3 and initializer\n0\.8\.3/);
  assert.ok(readme.includes(SKILL_SOURCE_COMMIT));
  assert.ok(readme.includes(SKILL_VERSION));
  assert.ok(readme.includes(SKILL_SHA256));
  assert.doesNotMatch(readme, /curl\s+-fsSL[\s\S]*?\|\s*bash/);
  assert.match(readme, /claude plugin marketplace add \.\//);
  assert.doesNotMatch(readme, /claude plugin marketplace add \.\n/);
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
