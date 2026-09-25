import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { callTool, handleRequest, login, logout, runQuickstartProcess, secureEnvironment, validateOAuthCallback } from "../mcp/project-bootstrap.mjs";

const script = "#!/bin/bash\necho mocked quickstart\n";
const accessToken = `mcp_at_${"a".repeat(43)}`;
const refreshToken = `mcp_rt_${"r".repeat(43)}`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "cohesivity-local-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project ; $(must-not-run)");
  const home = join(root, "home");
  mkdirSync(project); mkdirSync(home);
  return { root, project, home, env: { HOME: home, PATH: "/usr/bin:/bin", SECRET: "never-forward", BASH_ENV: "/malicious" } };
}
function credentials(project, lifecycle = "ephemeral") {
  writeFileSync(join(project, ".cohesivity"), `tenant_id=swift-fox-running\ncoh_management_key=coh_man_1234567890abcdefghij\ncoh_application_key=coh_app_abcdefghij1234567890\ntenant_lifecycle=${lifecycle}\nruntime_profile=stable-v1\n`, { mode: 0o600 });
}
const response = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const RESOURCE = "https://cohesivity.ai/mcp";
const RETIRED_RESOURCE = "https://cohesivity.ai/mcp/manage";
const tokenResponse = (extra = {}) => ({ access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 600, principal_type: "account", resource: RESOURCE, ...extra });
function authFile(home, extra = {}) {
  const directory = join(home, ".config", "cohesivity");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "mcp-auth.json");
  writeFileSync(path, JSON.stringify({ ...tokenResponse(), expires_at: Date.now() + 600000, client_id: "local-client", ...extra }), { mode: 0o600 });
  return path;
}

test("create runs the full fixed quickstart without leaking environment or script output", async (t) => {
  const { project, env } = fixture(t);
  let runs = 0;
  const result = await callTool("create_tenant", { project_root: project, confirmed: true }, {
    env,
    fetch: async (url, options) => {
      assert.equal(String(url), "https://cohesivity.ai/quickstart.sh");
      assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, undefined);
      return new Response(script);
    },
    runQuickstart: async (text, args, options) => {
      runs++;
      assert.equal(text, script); assert.deepEqual(args, []);
      assert.equal(options.cwd, project);
      assert.deepEqual(options.env, { HOME: env.HOME, PATH: env.PATH });
      credentials(project);
      return { stdout: accessToken, stderr: refreshToken };
    },
  });
  assert.equal(runs, 1);
  assert.deepEqual(result, { tenant_id: "swift-fox-running", tenant_lifecycle: "ephemeral", runtime_profile: "stable-v1" });
  assert.match(readFileSync(join(project, ".gitignore"), "utf8"), /\.cohesivity/);
});

test("quickstart rejects oversized, redirected, failed and incomplete executions safely", async (t) => {
  for (const scenario of ["oversized", "streaming", "redirect", "http", "spawn", "incomplete", "permissions"]) {
    const { project, env } = fixture(t);
    let runs = 0;
    const result = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_tenant", arguments: { project_root: project, confirmed: true } } }, {
      env,
      fetch: async () => {
        if (scenario === "oversized") return new Response(script, { headers: { "content-length": "2000000" } });
        if (scenario === "streaming") return new Response("x".repeat(1024 * 1024 + 1));
        if (scenario === "http") return new Response(accessToken, { status: 403 });
        if (scenario === "redirect") { const result = new Response(script); Object.defineProperty(result, "url", { value: "https://evil.example/script" }); return result; }
        return new Response(script);
      },
      runQuickstart: async () => {
        runs++;
        if (scenario === "spawn") throw new Error(accessToken);
        if (scenario === "incomplete") writeFileSync(join(project, ".cohesivity"), "tenant_id=swift-fox-running\n", { mode: 0o600 });
        if (scenario === "permissions") { credentials(project); chmodSync(join(project, ".cohesivity"), 0o644); }
      },
    });
    assert.equal(result.result.isError, true, scenario);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(accessToken));
    if (["oversized", "streaming", "redirect", "http"].includes(scenario)) assert.equal(runs, 0);
  }
});

test("an existing incomplete credential file is never replaced", async (t) => {
  const { project, env } = fixture(t);
  writeFileSync(join(project, ".cohesivity"), "tenant_id=swift-fox-running\n", { mode: 0o600 });
  await assert.rejects(callTool("create_tenant", { project_root: project, confirmed: true }, { env, fetch: () => assert.fail("network") }));
});

test("an existing complete tenant still runs integration and guidance steps", async (t) => {
  const { project, env } = fixture(t);
  credentials(project);
  const before = readFileSync(join(project, ".cohesivity"), "utf8");
  let runs = 0;
  await callTool("create_tenant", { project_root: project, confirmed: true }, {
    env, fetch: async () => new Response(script), runQuickstart: async () => { runs++; },
  });
  assert.equal(runs, 1);
  assert.equal(readFileSync(join(project, ".cohesivity"), "utf8"), before);
});

test("account bootstrap refreshes privately and reuses its idempotency key after failure", async (t) => {
  const { project, home, env } = fixture(t);
  const path = authFile(home, { expires_at: 1 });
  const keys = [];
  const headers = [];
  let refreshes = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const promise = callTool("create_tenant", { project_root: project, confirmed: true }, {
      env,
      fetch: async (url, options) => {
        if (String(url) === "https://cohesivity.ai/oauth/token") {
          refreshes++;
          assert.equal(options.body.get("grant_type"), "refresh_token");
          assert.equal(options.body.get("resource"), RESOURCE);
          return response(tokenResponse());
        }
        return new Response(script);
      },
      runQuickstart: async (_text, args, options) => {
        assert.equal(args[0], "--account-auth-file"); assert.equal(args[2], "--idempotency-key");
        const header = args[1]; headers.push(header); keys.push(args[3]);
        assert.ok(!header.startsWith(project));
        assert.equal(statSync(header).mode & 0o777, 0o600);
        assert.equal(readFileSync(header, "utf8"), `Authorization: Bearer ${accessToken}\n`);
        assert.doesNotMatch(JSON.stringify(options.env), new RegExp(accessToken));
        if (attempt === 0) throw new Error("failed after server created tenant");
        credentials(project, "claimed");
      },
    });
    if (attempt === 0) await assert.rejects(promise);
    else assert.equal((await promise).tenant_lifecycle, "claimed");
  }
  assert.equal(refreshes, 1); assert.equal(keys[0], keys[1]);
  assert.ok(headers.every((path) => !existsSync(path)));
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.doesNotMatch(readFileSync(join(project, ".cohesivity"), "utf8"), new RegExp(keys[0]));
});

test("invalid, guest, symlinked and exposed stored account auth never falls back to guest", async (t) => {
  for (const scenario of ["malformed", "guest", "symlink", "permissions", "refresh", "directory"]) {
    const { project, home, env } = fixture(t);
    const path = authFile(home, scenario === "refresh" ? { expires_at: 1 } : {});
    if (scenario === "malformed") writeFileSync(path, "not json");
    if (scenario === "guest") writeFileSync(path, JSON.stringify(tokenResponse({ principal_type: "guest" })));
    if (scenario === "permissions") chmodSync(path, 0o644);
    if (scenario === "directory") chmodSync(join(home, ".config", "cohesivity"), 0o777);
    if (scenario === "symlink") { rmSync(path); symlinkSync(join(project, "outside"), path); }
    await assert.rejects(callTool("create_tenant", { project_root: project, confirmed: true }, {
      env,
      fetch: async (url) => { assert.equal(String(url), "https://cohesivity.ai/oauth/token"); return response(tokenResponse({ principal_type: "guest" })); },
      runQuickstart: () => assert.fail("must not run"),
    }), undefined, scenario);
  }
});

test("login uses DCR, PKCE, account-required consent and protected user auth storage", async (t) => {
  const { home, env } = fixture(t);
  let authorize;
  let closed = false;
  const output = [];
  await login({
    env, stderr: { write: (text) => output.push(text) },
    callback: async (state) => ({ redirectUri: "http://127.0.0.1:12345/callback", wait: async () => { assert.equal(authorize.searchParams.get("state"), state); return "authorization-code"; }, close: () => { closed = true; } }),
    openBrowser: async (url) => { authorize = new URL(url); },
    fetch: async (url, options) => {
      assert.equal(options.redirect, "error");
      if (String(url).endsWith("/register")) {
        const body = JSON.parse(options.body);
        assert.deepEqual(body.redirect_uris, ["http://127.0.0.1:12345/callback"]);
        assert.equal(body.token_endpoint_auth_method, "none");
        return response({ client_id: "local-client" });
      }
      assert.equal(String(url), "https://cohesivity.ai/oauth/token");
      assert.equal(options.body.get("grant_type"), "authorization_code");
      assert.equal(options.body.get("code"), "authorization-code");
      assert.equal(options.body.get("resource"), RESOURCE);
      const { createHash } = await import("node:crypto");
      assert.equal(createHash("sha256").update(options.body.get("code_verifier")).digest("base64url"), authorize.searchParams.get("code_challenge"));
      return response(tokenResponse());
    },
  });
  assert.equal(authorize.origin, "https://cohesivity.ai");
  assert.equal(authorize.searchParams.get("account_required"), "true");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("resource"), RESOURCE);
  const path = join(home, ".config", "cohesivity", "mcp-auth.json");
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(path)).principal_type, "account");
  assert.equal(JSON.parse(readFileSync(path)).resource, RESOURCE);
  assert.equal(closed, true);
  assert.doesNotMatch(output.join(""), new RegExp(`${accessToken}|${refreshToken}`));
  await logout({ env, fetch: async () => new Response(""), stderr: { write() {} } }); assert.equal(existsSync(path), false);
});

test("login refuses guest grants and cleans up callbacks", async (t) => {
  const { home, env } = fixture(t);
  let closed = false;
  await assert.rejects(login({ env, stderr: { write() {} }, callback: async () => ({ redirectUri: "http://127.0.0.1:12345/callback", wait: async () => "code", close: () => { closed = true; } }), openBrowser: async () => {}, fetch: async (url) => response(String(url).endsWith("register") ? { client_id: "client" } : tokenResponse({ principal_type: "guest" })) }));
  assert.equal(closed, true);
  assert.equal(existsSync(join(home, ".config", "cohesivity", "mcp-auth.json")), false);
});

test("login timeout closes the callback and never saves tokens", async (t) => {
  const { home, env } = fixture(t);
  let closed = false;
  await assert.rejects(login({
    env, stderr: { write() {} },
    callback: async () => ({ redirectUri: "http://127.0.0.1:12345/callback", wait: async () => { throw new Error("timeout"); }, close: () => { closed = true; } }),
    fetch: async (url) => { assert.equal(String(url), "https://cohesivity.ai/oauth/register"); return response({ client_id: "local-client" }); },
  }));
  assert.equal(closed, true);
  assert.equal(existsSync(join(home, ".config", "cohesivity", "mcp-auth.json")), false);
});

test("XDG auth location is respected and symlink ancestors are rejected", async (t) => {
  const { root, home, env, project } = fixture(t);
  const config = join(root, "config");
  mkdirSync(config, { mode: 0o700 });
  const configHome = join(config, "cohesivity");
  mkdirSync(configHome, { mode: 0o700 });
  const path = join(configHome, "mcp-auth.json");
  writeFileSync(path, JSON.stringify({ ...tokenResponse(), expires_at: Date.now() + 600000, client_id: "client" }), { mode: 0o600 });
  await callTool("create_tenant", { project_root: project, confirmed: true }, {
    env: { ...env, XDG_CONFIG_HOME: config }, fetch: async () => new Response(script),
    runQuickstart: async (_script, args, options) => {
      assert.equal(options.env.XDG_CONFIG_HOME, config);
      assert.ok(args[1].startsWith(`${configHome}/`));
      credentials(project, "claimed");
    },
  });
  const link = join(home, "link"); symlinkSync(config, link);
  await assert.rejects(logout({ env: { ...env, XDG_CONFIG_HOME: link } }), /symlink/);
  await logout({ env: { ...env, XDG_CONFIG_HOME: config }, fetch: async () => new Response(""), stderr: { write() {} } }); assert.equal(existsSync(path), false);
});

test("existing quickstart config directory at 0755 permits guest creation", async (t) => {
  const { env, home, project } = fixture(t);
  mkdirSync(join(home, ".config", "cohesivity"), { recursive: true, mode: 0o755 });
  const result = await callTool("create_tenant", { project_root: project, confirmed: true }, {
    env, fetch: async () => new Response(script), runQuickstart: async () => credentials(project),
  });
  assert.equal(result.tenant_lifecycle, "ephemeral");
});

test("concurrent projects refresh one token family only once", async (t) => {
  const { root, home, env, project } = fixture(t);
  const secondProject = join(root, "second-project"); mkdirSync(secondProject);
  authFile(home, { expires_at: 1 });
  let refreshes = 0;
  const dependencies = {
    env, fetch: async (url) => {
      if (String(url).endsWith("/token")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return response(tokenResponse());
      }
      return new Response(script);
    },
    runQuickstart: async (_script, _args, options) => credentials(options.cwd, "claimed"),
  };
  await Promise.all([project, secondProject].map((project_root) => callTool("create_tenant", { project_root, confirmed: true }, dependencies)));
  assert.equal(refreshes, 1);
});

test("separate MCP processes serialize refresh through the same user auth file", async (t) => {
  const { root, home, project } = fixture(t);
  const secondProject = join(root, "second-process-project"); mkdirSync(secondProject);
  authFile(home, { expires_at: 1 });
  const counter = join(root, "refresh-count");
  const moduleUrl = new URL("../mcp/project-bootstrap.mjs", import.meta.url).href;
  const program = `
    import { callTool } from ${JSON.stringify(moduleUrl)};
    import { appendFileSync, writeFileSync } from 'node:fs';
    await callTool('create_tenant', { project_root: process.argv[1], confirmed: true }, {
      env: { HOME: ${JSON.stringify(home)}, PATH: '/usr/bin:/bin' },
      fetch: async (url) => {
        if (String(url).endsWith('/token')) {
          appendFileSync(${JSON.stringify(counter)}, 'refresh\\n');
          await new Promise(resolve => setTimeout(resolve, 100));
          return new Response(JSON.stringify(${JSON.stringify(tokenResponse())}));
        }
        return new Response('#!/bin/bash\\n');
      },
      runQuickstart: async (_script, _args, options) => writeFileSync(options.cwd + '/.cohesivity',
        'tenant_id=swift-fox-running\\ncoh_management_key=coh_man_1234567890abcdefghij\\ncoh_application_key=coh_app_abcdefghij1234567890\\n', { mode: 0o600 }),
    });
  `;
  await Promise.all([project, secondProject].map((projectRoot) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", program, projectRoot], { env: {}, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => { try { assert.equal(code, 0, output); assert.equal(output, ""); resolve(); } catch (error) { reject(error); } });
  })));
  assert.equal(readFileSync(counter, "utf8"), "refresh\n");
});

test("concurrent quickstarts for one project fail instead of provisioning twice", async (t) => {
  const { env, project } = fixture(t);
  let runs = 0;
  const dependencies = {
    env, fetch: async () => new Response(script),
    runQuickstart: async () => { runs++; await new Promise((resolve) => setTimeout(resolve, 50)); credentials(project); },
  };
  const results = await Promise.allSettled([1, 2].map(() => callTool("create_tenant", { project_root: project, confirmed: true }, dependencies)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /already running/);
  assert.equal(runs, 1);
});

test("logout revokes the refresh-token family and removes local auth even on network failure", async (t) => {
  for (const fails of [false, true]) {
    const { env, home } = fixture(t);
    const path = authFile(home);
    const output = [];
    await logout({ env, stderr: { write: (text) => output.push(text) }, fetch: async (url, options) => {
      assert.equal(String(url), "https://cohesivity.ai/oauth/revoke");
      assert.equal(options.redirect, "error");
      assert.equal(options.body.get("token"), refreshToken);
      assert.equal(options.body.get("token_type_hint"), "refresh_token");
      if (fails) throw new Error(accessToken);
      return new Response("");
    } });
    assert.equal(existsSync(path), false);
    assert.doesNotMatch(output.join(""), new RegExp(`${accessToken}|${refreshToken}`));
    if (fails) assert.match(output.join(""), /could not confirm server revocation/i);
  }
});

test("logout waits for refresh and revokes the newly rotated token", async (t) => {
  const { env, home, project } = fixture(t);
  const path = authFile(home, { expires_at: 1 });
  const rotatedToken = `mcp_rt_${"b".repeat(43)}`;
  let started;
  const refreshing = new Promise((resolve) => { started = resolve; });
  const create = callTool("create_tenant", { project_root: project, confirmed: true }, {
    env, fetch: async (url) => {
      if (String(url).endsWith("/token")) { started(); await new Promise((resolve) => setTimeout(resolve, 50)); return response(tokenResponse({ refresh_token: rotatedToken })); }
      return new Response(script);
    }, runQuickstart: async () => credentials(project, "claimed"),
  });
  await refreshing;
  await Promise.all([create, logout({ env, stderr: { write() {} }, fetch: async (_url, options) => {
    assert.equal(options.body.get("token"), rotatedToken); return new Response("");
  } })]);
  assert.equal(existsSync(path), false);
});

test("loopback callback rejects state mismatch, duplicate params, errors and wrong route", () => {
  assert.equal(validateOAuthCallback("/callback?state=state&code=code", "state"), "code");
  for (const url of ["/callback?state=wrong&code=code", "/callback?state=state&code=a&code=b", "/callback?state=state&error=access_denied", "/other?state=state&code=code", "//evil.example/callback?state=state&code=code"]) {
    assert.throws(() => validateOAuthCallback(url, "state"));
  }
});

test("execution environment excludes shell startup and unrelated secrets", () => {
  assert.deepEqual(secureEnvironment({ HOME: "/home/user", PATH: "/usr/bin", XDG_CONFIG_HOME: "/config", AWS_SECRET_ACCESS_KEY: "secret", NODE_OPTIONS: "--require malicious", BASH_ENV: "/malicious", SHELLOPTS: "xtrace" }), { HOME: "/home/user", PATH: "/usr/bin", XDG_CONFIG_HOME: "/config" });
});

test("quickstart subprocess has isolated stdio and is reaped after timeout", async () => {
  const events = [];
  let child;
  const promise = runQuickstartProcess(script, [], { cwd: "/project", env: { PATH: "/usr/bin" } }, {
    timeoutMs: 5,
    spawn: (command, args, options) => {
      assert.equal(command, "/bin/bash"); assert.deepEqual(args, ["--noprofile", "--norc", "-s", "--"]);
      assert.deepEqual(options.stdio, ["pipe", "ignore", "ignore"]); assert.equal(options.shell, false);
      child = new EventEmitter(); child.pid = 12345; child.stdin = new EventEmitter(); child.stdin.end = (text) => assert.equal(text, script);
      return child;
    },
    kill: (pid, signal) => { events.push([pid, signal]); setImmediate(() => child.emit("close", null, signal)); },
  });
  await assert.rejects(promise, /quickstart/i);
  assert.deepEqual(events, [[-12345, "SIGKILL"]]);
});

test("quickstart subprocess rejects spawn errors and nonzero exits without exposing output", async () => {
  for (const event of ["error", "close"]) {
    await assert.rejects(runQuickstartProcess(script, [], { cwd: "/project", env: {} }, {
      spawn: () => {
        const child = new EventEmitter(); child.stdin = new EventEmitter(); child.stdin.end = () => {};
        setImmediate(() => event === "error" ? child.emit("error", new Error(accessToken)) : child.emit("close", 1));
        return child;
      },
    }), (error) => { assert.doesNotMatch(error.message, new RegExp(accessToken)); return true; });
  }
});

test("account tokens are redacted even in rejected MCP arguments", async () => {
  const result = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: accessToken, arguments: {} } });
  assert.equal(result.result.isError, true);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(accessToken));
});

test("single no-configuration resources provision without config and reject supplied config", async (t) => {
  const { project } = fixture(t); credentials(project);
  let calls = 0;
  const dependencies = { fetch: async (_url, options) => { calls++; assert.equal(options.body, undefined); return response({ provisioned: true }); } };
  await callTool("provision_resource", { project_root: project, resource: "redis", confirmed: true }, dependencies);
  await assert.rejects(callTool("provision_resource", { project_root: project, resource: "redis", configuration: {}, confirmed: true }, dependencies), /does not accept/);
  assert.equal(calls, 1);
});


test("existing project reuse ignores expired or malformed optional account state", async (t) => {
  for (const malformed of [false, true]) {
    const { project, home, env } = fixture(t);
    credentials(project);
    const before = readFileSync(join(project, ".cohesivity"), "utf8");
    const path = authFile(home, { expires_at: 1 });
    if (malformed) writeFileSync(path, "invalid json");
    let runs = 0;
    await callTool("create_tenant", { project_root: project, confirmed: true }, {
      env,
      fetch: async (url) => { assert.equal(String(url), "https://cohesivity.ai/quickstart.sh"); return new Response(script); },
      runQuickstart: async (_script, args) => { assert.deepEqual(args, []); runs++; },
    });
    assert.equal(runs, 1);
    assert.equal(readFileSync(join(project, ".cohesivity"), "utf8"), before);
  }
});


test("social-login accepts IPv6 loopback and rejects non-loopback HTTP", async (t) => {
  const { project } = fixture(t); credentials(project);
  let calls = 0;
  const dependencies = { fetch: async (_url, options) => {
    calls++;
    assert.deepEqual(JSON.parse(options.body), { callback_urls: ["http://[::1]:5173/auth/done"] });
    return response({ success: true });
  } };
  await callTool("provision_resource", { project_root: project, resource: "social-login", configuration: { callback_urls: ["http://[::1]:5173/auth/done"] }, confirmed: true }, dependencies);
  await assert.rejects(callTool("provision_resource", { project_root: project, resource: "social-login", configuration: { callback_urls: ["http://[::2]:5173/auth/done"] }, confirmed: true }, dependencies), /localhost/);
  assert.equal(calls, 1);
});

test("login refuses a token issued for any resource other than /mcp", async (t) => {
  for (const resource of [RETIRED_RESOURCE, undefined, "https://evil.example/mcp"]) {
    const { home, env } = fixture(t);
    await assert.rejects(login({
      env, stderr: { write() {} },
      callback: async () => ({ redirectUri: "http://127.0.0.1:12345/callback", wait: async () => "code", close() {} }),
      openBrowser: async () => {},
      fetch: async (url) => response(String(url).endsWith("register") ? { client_id: "client" } : tokenResponse({ resource })),
    }), /unexpected resource/i);
    assert.equal(existsSync(join(home, ".config", "cohesivity", "mcp-auth.json")), false);
  }
});

test("saved sign-in for the retired /mcp/manage resource fails closed before any network call", async (t) => {
  for (const extra of [{ resource: RETIRED_RESOURCE }, { resource: undefined }, { resource: RETIRED_RESOURCE, expires_at: 1 }]) {
    const { project, home, env } = fixture(t);
    const path = authFile(home, extra);
    const before = readFileSync(path, "utf8");
    await assert.rejects(callTool("create_tenant", { project_root: project, confirmed: true }, {
      env,
      fetch: () => assert.fail("an obsolete sign-in must not refresh, download, or fall back to guest"),
      runQuickstart: () => assert.fail("must not run"),
    }), (error) => {
      assert.match(error.message, /retired/i);
      assert.match(error.message, /logout.*login/i);
      assert.doesNotMatch(error.message, new RegExp(`${accessToken}|${refreshToken}`));
      return true;
    });
    assert.equal(readFileSync(path, "utf8"), before);
    assert.equal(existsSync(join(project, ".cohesivity")), false);
  }
});

test("existing projects keep working when saved sign-in is for the retired resource", async (t) => {
  const { project, home, env } = fixture(t);
  credentials(project);
  authFile(home, { resource: RETIRED_RESOURCE });
  let runs = 0;
  await callTool("create_tenant", { project_root: project, confirmed: true }, {
    env,
    fetch: async (url) => { assert.equal(String(url), "https://cohesivity.ai/quickstart.sh"); return new Response(script); },
    runQuickstart: async (_script, args) => { assert.deepEqual(args, []); runs++; },
  });
  assert.equal(runs, 1);
  const status = await callTool("tenant_status", { project_root: project }, {
    env,
    fetch: async (url, options) => {
      assert.equal(String(url), "https://cohesivity.ai/api/status");
      assert.equal(options.headers.Authorization, "Bearer coh_man_1234567890abcdefghij");
      return response({ account: { lifecycle: "ephemeral" } });
    },
  });
  assert.equal(status.tenant_id, "swift-fox-running");
});

test("logout revokes and removes a saved sign-in for the retired resource", async (t) => {
  for (const extra of [{ resource: RETIRED_RESOURCE }, { resource: undefined }]) {
    const { env, home } = fixture(t);
    const path = authFile(home, extra);
    let revoked = 0;
    await logout({ env, stderr: { write() {} }, fetch: async (url, options) => {
      assert.equal(String(url), "https://cohesivity.ai/oauth/revoke");
      assert.equal(options.body.get("token"), refreshToken);
      revoked++;
      return new Response("");
    } });
    assert.equal(revoked, 1);
    assert.equal(existsSync(path), false);
  }
});
