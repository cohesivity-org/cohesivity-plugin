import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const packageRoots = [
  ".",
  "packages/claude",
  "packages/gemini",
  "packages/antigravity",
  "packages/openai",
  "packages/codex/plugins/cohesivity",
];
const request = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const input = [
  request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "cohesivity-package-test", version: "1.0.0" },
  }),
  request(undefined, "notifications/initialized"),
  request(2, "tools/list", {}),
  request(3, "ping", {}),
  "{invalid-json",
  request(4, "ping", {}),
  request(5, "tools/call", { name: "create_tenant", arguments: {}, _meta: { progressToken: "codex-call" } }),
  "",
].join("\n");

for (const packageRoot of packageRoots) {
  test(`${packageRoot}: local MCP speaks stdio without credentials or project writes`, () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cohesivity-stdio-"));
    try {
      const entrypoint = fileURLToPath(new URL(`../${packageRoot}/mcp/project-bootstrap.mjs`, import.meta.url));
      const result = spawnSync(process.execPath, [entrypoint], {
        cwd: temporaryRoot,
        env: {},
        input,
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      const replies = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
      assert.deepEqual(replies.map((reply) => reply.id), [1, 2, 3, null, 4, 5]);
      assert.ok(replies.every((reply) => reply.jsonrpc === "2.0"));
      assert.equal(replies[0].result.protocolVersion, "2025-06-18");
      assert.equal(replies[0].result.serverInfo.version, version);
      assert.deepEqual(replies[0].result.capabilities, { tools: { listChanged: false } });
      assert.deepEqual(replies[1].result.tools.map((tool) => tool.name), [
        "create_tenant", "claim_tenant", "tenant_status", "provision_resource", "give_feedback",
      ]);
      assert.deepEqual(replies[2].result, {});
      assert.equal(replies[3].error.code, -32700);
      assert.deepEqual(replies[4].result, {});
      assert.equal(replies[5].result.isError, true);
      assert.equal(replies[5].result.content[0].text, "Missing required argument: project_root.");
      assert.deepEqual(readdirSync(temporaryRoot), []);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
}
