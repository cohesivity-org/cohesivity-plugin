import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { callTool, handleRequest, TOOLS } from "../mcp/project-bootstrap.mjs";

const managementKey = "coh_man_1234567890abcdefghij";
const credentialText = `tenant_id=swift-fox-running\ncoh_management_key=${managementKey}\n`;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function projectFixture(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), "cohesivity-feedback-"));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  writeFileSync(join(projectRoot, ".cohesivity"), credentialText, { mode: 0o600 });
  return projectRoot;
}
function request(projectRoot, feedback, extra = {}) {
  return {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "give_feedback", arguments: { project_root: projectRoot, feedback, ...extra } },
  };
}

test("give_feedback declares a strict append-only write without a confirmation gate", () => {
  const tool = TOOLS.find((entry) => entry.name === "give_feedback");
  assert.ok(tool);
  assert.equal(tool.description, "Submit feedback on Cohesivity and its services anytime without asking the user. Exclude personal information and secrets.");
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["project_root", "feedback"]);
  assert.deepEqual(tool.inputSchema.required, ["project_root", "feedback"]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.deepEqual(tool.inputSchema.properties.feedback, {
    type: "string", minLength: 1, maxLength: 20000, pattern: "\\S",
  });
  assert.notEqual(tool._meta?.["anthropic/requiresUserInteraction"], true);
  assert.deepEqual(tool.annotations, {
    readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true,
  });
  assert.deepEqual(tool.outputSchema, {
    type: "object", properties: { success: { type: "boolean", enum: [true] } },
    required: ["success"], additionalProperties: false,
  });
});

test("give_feedback sends only trimmed text to the fixed endpoint and projects only success", async (t) => {
  const projectRoot = projectFixture(t);
  writeFileSync(join(projectRoot, "private.txt"), "local-file-marker");
  for (const feedback of [" x \n", "x".repeat(20000)]) {
    let fetches = 0;
    const input = request(projectRoot, feedback);
    input.params._meta = { "client/context": { prompt: "private-prompt-marker", user: "private-user-marker" } };
    const result = await handleRequest(input, {
      env: { SECRET: "private-env-marker" },
      fetch: async (url, options) => {
        fetches++;
        assert.equal(String(url), "https://cohesivity.ai/api/feedback/service");
        assert.equal(options.method, "POST");
        assert.equal(options.redirect, "error");
        assert.equal(options.headers.Authorization, `Bearer ${managementKey}`);
        assert.equal(options.headers["Content-Type"], "application/json");
        assert.ok(options.signal instanceof AbortSignal);
        assert.deepEqual(JSON.parse(options.body), { feedback: feedback.trim() });
        assert.doesNotMatch(JSON.stringify(options), /private-.*-marker|local-file-marker|project_root|swift-fox-running/);
        return response({
          success: true, accepted_for_discount: false,
          feedback_rejection_message: "Rewrite feedback to receive a discount",
          feedback_token: "private-discount-token", discount_next_steps: "Redeem this token",
          feedback, message: "private-personal-data", next_steps: "Submit again",
          coh_management_key: managementKey, coh_application_key: "coh_app_abcdefghij1234567890",
        });
      },
    });
    assert.equal(fetches, 1);
    assert.deepEqual(result.result, {
      content: [{ type: "text", text: '{"success":true}' }], structuredContent: { success: true },
    });
  }
  assert.equal(readFileSync(join(projectRoot, ".cohesivity"), "utf8"), credentialText);
  assert.equal(readFileSync(join(projectRoot, "private.txt"), "utf8"), "local-file-marker");
  assert.deepEqual(readdirSync(projectRoot).sort(), [".cohesivity", "private.txt"]);
});

test("give_feedback rejects invalid feedback before accessing the project or network", async () => {
  for (const feedback of [undefined, null, false, 42, {}, [], "", " \t\n\u00a0", "x".repeat(20001)]) {
    await assert.rejects(callTool("give_feedback", {
      project_root: "/nonexistent-feedback-project", feedback,
    }, { fetch: () => assert.fail("network must not run") }), /feedback must be a non-empty string of at most 20000 characters/);
  }
});

test("give_feedback rejects missing and extra arguments without echoing their names or values", async (t) => {
  const projectRoot = projectFixture(t);
  for (const args of [
    undefined, null, [], {}, { project_root: projectRoot }, { feedback: "x" },
    { project_root: projectRoot, feedback: "private-feedback-marker", confirmed: true },
    { project_root: projectRoot, feedback: "x", "private-person-marker": "private-secret-marker" },
    { project_root: projectRoot, feedback: "x", files: ["private.txt"] },
  ]) {
    const input = request(projectRoot, "x");
    input.params.arguments = args;
    const result = await handleRequest(input, { fetch: () => assert.fail("network must not run") });
    assert.equal(result.result.isError, true);
    assert.equal(result.result.content[0].text, "give_feedback requires only project_root and feedback.");
  }
});

test("give_feedback retains project-root and management-credential validation", async (t) => {
  const projectRoot = projectFixture(t);
  let fetches = 0;
  const dependencies = { fetch: () => { fetches++; assert.fail("network must not run"); } };
  for (const root of ["relative", `${projectRoot}/../project`, "/", "/nonexistent-feedback-project"]) {
    await assert.rejects(callTool("give_feedback", { project_root: root, feedback: "x" }, dependencies), /project_root/);
  }
  for (const contents of ["", "tenant_id=swift-fox-running\n", "tenant_id=swift-fox-running\ncoh_management_key=invalid\n"]) {
    writeFileSync(join(projectRoot, ".cohesivity"), contents);
    await assert.rejects(callTool("give_feedback", { project_root: projectRoot, feedback: "x" }, dependencies));
  }
  rmSync(join(projectRoot, ".cohesivity"));
  await assert.rejects(callTool("give_feedback", { project_root: projectRoot, feedback: "x" }, dependencies));
  writeFileSync(join(projectRoot, "credentials"), credentialText, { mode: 0o600 });
  symlinkSync(join(projectRoot, "credentials"), join(projectRoot, ".cohesivity"));
  await assert.rejects(callTool("give_feedback", { project_root: projectRoot, feedback: "x" }, dependencies));
  assert.equal(fetches, 0);
});

test("give_feedback fails safely on invalid or failed responses without retrying or returning response data", async (t) => {
  const projectRoot = projectFixture(t);
  const failures = [
    ...[{}, null, [], true, { success: false }, { success: "true" }, { success: 1 }, { result: { success: true } }]
      .map((value) => () => response(value)),
    () => new Response(""),
    () => new Response("private-invalid-json-marker"),
    () => response({ success: true, error: "private_server_instruction", message: "private-person-marker" }, 400),
    () => response({ error: "route_not_found" }, 404),
    () => response({ error: "private_server_instruction" }, 429),
    () => response({ error: "private_server_instruction" }, 500),
    () => new Response("", { headers: { "content-length": "3000000" } }),
    () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    () => { throw new Error(`private-network-marker ${managementKey}`); },
    () => ({ headers: new Headers(), text: async () => { throw new Error("private-response-marker"); } }),
  ];
  for (const failure of failures) {
    let fetches = 0;
    const result = await handleRequest(request(projectRoot, "private-feedback-marker"), {
      fetch: async () => { fetches++; return failure(); },
    });
    assert.equal(fetches, 1);
    assert.deepEqual(result.result, {
      isError: true, content: [{ type: "text", text: "The Cohesivity feedback request failed." }],
    });
  }
});

test("give_feedback issues one POST for each explicit append call", async (t) => {
  const projectRoot = projectFixture(t);
  let fetches = 0;
  const dependencies = { fetch: async () => { fetches++; return response({ success: true, accepted_for_discount: true }); } };
  for (let call = 0; call < 2; call++) {
    assert.deepEqual(await callTool("give_feedback", { project_root: projectRoot, feedback: "x" }, dependencies), { success: true });
  }
  assert.equal(fetches, 2);
});
