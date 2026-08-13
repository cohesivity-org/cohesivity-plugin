import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
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
import { Writable } from "node:stream";
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
  QUICKSTART_URL,
  REMOTE_MCP_URL,
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
});

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
    "cohesivity-local": {
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/mcp/project-bootstrap.mjs"],
    },
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
  assert.equal(SKILL_SOURCE_COMMIT, "8f6dd3322c6d3e50a592b1cdf0d4490b4f2b95a9");
  assert.equal(SKILL_VERSION, "8bc93e4d05f8");
  assert.equal(
    SKILL_SHA256,
    "1f240ebcbf57a0dca22915d604644643382cf0b084447fcdf4b03ed46864a707",
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
    "packages/claude/skills/cohesivity/SKILL.md",
    "packages/gemini/skills/cohesivity/SKILL.md",
    "packages/antigravity/skills/cohesivity/SKILL.md",
    "packages/openai/skills/cohesivity/SKILL.md",
    "packages/codex/plugins/cohesivity/skills/cohesivity/SKILL.md",
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

test("create_tenant validates the root, uses argv execution, and omits every secret", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-project-root-"));
  const managementKey = "coh_man_1234567890abcdefghij";
  const applicationKey = "coh_app_abcdefghij1234567890";
  let invocation;
  let suppliedScript = Buffer.alloc(0);

  try {
    const spawn = (command, args, options) => {
      invocation = { command, args, options };
      const child = new EventEmitter();
      child.stdin = new Writable({
        write(chunk, _encoding, callback) {
          suppliedScript = Buffer.concat([suppliedScript, Buffer.from(chunk)]);
          callback();
        },
        final(callback) {
          writeFileSync(
            join(temporaryRoot, ".cohesivity"),
            [
              "tenant_id=swift-fox-running",
              `coh_management_key=${managementKey}`,
              `coh_application_key=${applicationKey}`,
              "expires_at=2026-08-13T00:00:00.000Z",
              "tenant_lifecycle=ephemeral",
              "runtime_profile=stable-v1",
              "",
            ].join("\n"),
          );
          callback();
          queueMicrotask(() => child.emit("close", 0, null));
        },
      });
      return child;
    };
    const fetch = async (url, options) => {
      assert.equal(url, QUICKSTART_URL);
      assert.match(options.headers["User-Agent"], /^cohesivity-project-bootstrap\//);
      const script = Buffer.from("#!/usr/bin/env bash\nexit 0\n");
      return {
        ok: true,
        url: QUICKSTART_URL,
        headers: new Headers({ "content-length": String(script.length) }),
        arrayBuffer: async () => script,
      };
    };

    const output = await callTool(
      "create_tenant",
      { project_root: temporaryRoot },
      { fetch, spawn },
    );
    assert.deepEqual(output, {
      tenant_id: "swift-fox-running",
      expires_at: "2026-08-13T00:00:00.000Z",
      tenant_lifecycle: "ephemeral",
      runtime_profile: "stable-v1",
    });
    assert.deepEqual(invocation, {
      command: "bash",
      args: ["-s", "--", "--no-plugin"],
      options: {
        cwd: temporaryRoot,
        env: process.env,
        shell: false,
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      },
    });
    assert.match(suppliedScript.toString("utf8"), /^#!\/usr\/bin\/env bash/);
    assert.doesNotMatch(JSON.stringify(output), /coh_(?:man|app)_/);
    assert.doesNotMatch(JSON.stringify(output), new RegExp(managementKey));
    assert.doesNotMatch(JSON.stringify(output), new RegExp(applicationKey));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("project root validation rejects traversal and unsafe roots", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-traversal-"));
  const project = join(temporaryRoot, "project");
  mkdirSync(project);
  try {
    assert.equal(validateProjectRoot(project), project);
    assert.throws(
      () => validateProjectRoot(`${project}/../project`),
      /parent-directory traversal/,
    );
    assert.throws(() => validateProjectRoot("../project"), /absolute path/);
    assert.throws(() => validateProjectRoot("/"), /filesystem root/);
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
    { success: true, resource: "postgres", status: "suspended", details: managementKey },
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
      await callTool("claim_tenant", { project_root: temporaryRoot }, { fetch }),
      await callTool("tenant_status", { project_root: temporaryRoot }, { fetch }),
      await callTool(
        "provision_resource",
        { project_root: temporaryRoot, resource: "postgres", configuration: { region: "apac" } },
        { fetch },
      ),
      await callTool(
        "deprovision_resource",
        { project_root: temporaryRoot, resource: "postgres" },
        { fetch },
      ),
      await callTool(
        "bulk_provision_resources",
        { project_root: temporaryRoot, resources: ["postgres", "redis"] },
        { fetch },
      ),
    ];
    assert.deepEqual(
      requests.map(({ url, options }) => [url, options.method]),
      [
        [`${MANAGEMENT_API_URL}claim/url`, "POST"],
        [`${MANAGEMENT_API_URL}status`, "GET"],
        [`${MANAGEMENT_API_URL}resources/postgres`, "POST"],
        [`${MANAGEMENT_API_URL}resources/postgres`, "DELETE"],
        [`${MANAGEMENT_API_URL}resources`, "POST"],
      ],
    );
    assert.equal("body" in requests[0].options, false);
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${managementKey}`);
    assert.deepEqual(JSON.parse(requests[2].options.body), { region: "apac" });
    assert.deepEqual(JSON.parse(requests[4].options.body), {
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
      "deprovision_resource",
      "bulk_provision_resources",
    ],
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object", `${tool.name} must declare an object input schema`);
    assert.equal(tool.inputSchema.additionalProperties ?? false, false);
    assert.doesNotMatch(tool.name, /shell|exec|request|fetch|proxy/i);
  }
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
