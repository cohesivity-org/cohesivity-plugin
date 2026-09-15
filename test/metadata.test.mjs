import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { handleRequest } from "../mcp/project-bootstrap.mjs";

const request = (params) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params });

test("tools/call accepts metadata without forwarding or reflecting it", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "cohesivity-metadata-"));
  writeFileSync(join(projectRoot, ".cohesivity"), "tenant_id=swift-fox-running\ncoh_management_key=coh_man_1234567890abcdefghij\n");
  const calls = [];
  const dependencies = {
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ account: { tenant_id: "swift-fox-running", lifecycle: "ephemeral" } }) };
    },
  };
  try {
    const params = { name: "tenant_status", arguments: { project_root: projectRoot } };
    const baseline = await handleRequest(request(params), dependencies);
    assert.equal(baseline.result.isError, undefined);
    for (const metadata of [{}, { progressToken: "metadata-marker", "example.com/context": { nested: [1, true, null] } }]) {
      const response = await handleRequest(request({ ...params, _meta: metadata }), dependencies);
      assert.deepEqual(response, baseline);
      assert.deepEqual(calls.at(-1), calls[0]);
      assert.doesNotMatch(JSON.stringify(response), /metadata-marker|example\.com/);
      assert.doesNotMatch(JSON.stringify(calls.at(-1)), /metadata-marker|example\.com/);
    }
    assert.equal(calls.length, 3);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("tools/call rejects malformed metadata before tool execution", async () => {
  for (const metadata of [null, [], [1], "metadata-marker", 42, true, false]) {
    const response = await handleRequest(request({ name: "tenant_status", arguments: {}, _meta: metadata }), {
      fetch: () => assert.fail("malformed metadata must not execute the tool"),
    });
    assert.equal(response.result.isError, true);
    assert.equal(response.result.content[0].text, "_meta must be an object.");
  }
});

test("tools/call metadata leaves argument and envelope validation strict", async () => {
  for (const params of [
    { name: "tenant_status", arguments: { project_root: "/tmp", _meta: {} } },
    { name: "tenant_status", arguments: { project_root: "/tmp", unexpected: true } },
    { name: "tenant_status", arguments: [] },
    { name: "tenant_status", arguments: "invalid" },
    { name: "tenant_status", arguments: {}, unexpected: true },
    { name: "tenant_status" },
    { name: 42, arguments: {} },
    { name: "unknown_tool", arguments: {} },
  ]) {
    const baseline = await handleRequest(request(params));
    const response = await handleRequest(request({ ...params, _meta: {} }));
    assert.equal(baseline.result.isError, true);
    assert.deepEqual(response, baseline);
  }
});

for (const path of [
  "mcp/project-bootstrap.mjs",
  "packages/claude/mcp/project-bootstrap.mjs",
  "packages/gemini/mcp/project-bootstrap.mjs",
  "packages/antigravity/mcp/project-bootstrap.mjs",
  "packages/openai/mcp/project-bootstrap.mjs",
  "packages/codex/plugins/cohesivity/mcp/project-bootstrap.mjs",
]) {
  test(`stdio metadata validation preserves tool errors in ${path}`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "cohesivity-metadata-stdio-"));
    const params = { name: "tenant_status", arguments: { project_root: "relative-root" } };
    const inputs = [
      request(params),
      request({ ...params, _meta: {} }),
      request({ ...params, _meta: { progressToken: 7, "example.com/context": "metadata-marker" } }),
      request({ ...params, _meta: null }),
      request({ ...params, _meta: [] }),
      request({ ...params, arguments: { ...params.arguments, _meta: {} }, _meta: {} }),
    ];
    try {
      const child = spawnSync(process.execPath, [resolve(path)], {
        cwd,
        input: inputs.map((input) => JSON.stringify(input)).join("\n") + "\n",
        encoding: "utf8",
        timeout: 10000,
      });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stderr, "");
      const responses = child.stdout.trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(responses.length, inputs.length);
      assert.equal(responses[0].result.isError, true);
      assert.match(responses[0].result.content[0].text, /absolute/);
      assert.deepEqual(responses[1], responses[0]);
      assert.deepEqual(responses[2], responses[0]);
      for (const response of responses.slice(3, 5)) {
        assert.equal(response.result.isError, true);
        assert.equal(response.result.content[0].text, "_meta must be an object.");
      }
      assert.equal(responses[5].result.isError, true);
      assert.match(responses[5].result.content[0].text, /Unexpected argument: _meta/);
      assert.doesNotMatch(child.stdout, /metadata-marker/);
      assert.deepEqual(readdirSync(cwd), []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
