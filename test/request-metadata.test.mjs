import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { handleRequest, MANAGEMENT_API_URL } from "../mcp/project-bootstrap.mjs";

test("tools/call accepts optional request metadata without forwarding or returning it", async () => {
  for (const metadata of [undefined, {}, { progressToken: 42 }, { progressToken: "codex-call", "client/context": { trace: "metadata-only-marker" } }]) {
    const projectRoot = mkdtempSync(join(tmpdir(), "cohesivity-metadata-"));
    let fetches = 0;
    try {
      const params = { name: "create_tenant", arguments: { project_root: projectRoot, confirmed: true } };
      if (metadata !== undefined) params._meta = metadata;
      const response = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params }, {
        fetch: async (url, options) => {
          fetches++;
          assert.equal(String(url), `${MANAGEMENT_API_URL}genesis?format=json`);
          assert.equal(options.method, "POST");
          assert.doesNotMatch(JSON.stringify(options), /_meta|progressToken|metadata-only-marker/);
          return {
            ok: true,
            status: 201,
            url: String(url),
            headers: new Headers({ "content-type": "application/json" }),
            text: async () => JSON.stringify({
              tenant_id: "metadata-test-tenant",
              coh_management_key: "coh_man_1234567890abcdefghij",
              coh_application_key: "coh_app_abcdefghij1234567890",
              expires_at: "2026-10-01T00:00:00.000Z",
              tenant_lifecycle: "ephemeral",
              runtime_profile: "v1-01",
            }),
          };
        },
      });
      assert.equal(response.result.isError, undefined, JSON.stringify(response));
      assert.equal(response.result.structuredContent.tenant_id, "metadata-test-tenant");
      assert.equal(fetches, 1);
      assert.ok(existsSync(join(projectRoot, ".cohesivity")));
      assert.doesNotMatch(JSON.stringify(response), /_meta|progressToken|metadata-only-marker|coh_man_|coh_app_/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }
});

test("tools/call rejects non-object metadata before side effects", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "cohesivity-invalid-metadata-"));
  let fetches = 0;
  try {
    for (const metadata of [null, [], "metadata", 42, true]) {
      const response = await handleRequest({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "create_tenant", arguments: { project_root: projectRoot, confirmed: true }, _meta: metadata },
      }, { fetch: async () => { fetches++; throw new Error("unexpected network call"); } });
      assert.equal(response.result.isError, true);
      assert.equal(response.result.content[0].text, "_meta must be an object.");
    }
    assert.equal(fetches, 0);
    assert.deepEqual(readdirSync(projectRoot), []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("request metadata does not relax tool arguments or confirmation", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "cohesivity-metadata-boundary-"));
  let fetches = 0;
  try {
    for (const [params, error] of [
      [{ name: "create_tenant", arguments: { project_root: projectRoot, confirmed: true }, _meta: {}, extra: true }, "Unexpected argument: extra."],
      [{ name: "create_tenant", arguments: { project_root: projectRoot, confirmed: true, _meta: {} }, _meta: {} }, "Unexpected argument: _meta."],
      [{ name: "create_tenant", arguments: { project_root: projectRoot }, _meta: { confirmed: true } }, "Missing required argument: confirmed."],
      [{ name: "create_tenant", arguments: { project_root: projectRoot, confirmed: false }, _meta: {} }, "confirmed must be true after explicit user authorization."],
    ]) {
      const response = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params }, {
        fetch: async () => { fetches++; throw new Error("unexpected network call"); },
      });
      assert.equal(response.result.isError, true);
      assert.equal(response.result.content[0].text, error);
    }
    assert.equal(fetches, 0);
    assert.deepEqual(readdirSync(projectRoot), []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
