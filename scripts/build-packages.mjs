import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_VERSION } from "../mcp/project-bootstrap.mjs";

export const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const VERSION = SERVER_VERSION;
export const MCP_ENDPOINT = "https://cohesivity.ai/mcp/manage";
export const LOCAL_MCP_SOURCE = "mcp/project-bootstrap.mjs";
export const SKILL_SOURCE_COMMIT = "f97e0d2ac8a653b7d54d1bb6e70aee78a8887e60";
export const SKILL_VERSION = "84fbece3c00b";
export const SKILL_SHA256 =
  "3b0d9cda6167263cb35a4e3b54ed455113318a1b24cb5e341f26843456b0b589";

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const DESCRIPTION =
  "Cohesivity backend infrastructure skill with local project bootstrap and OAuth-protected remote management tools.";
const AUTHOR = {
  name: "Cohesivity",
  email: "smj@cohesivity.ai",
  url: "https://cohesivity.ai",
};
const KEYWORDS = ["backend", "infrastructure", "database", "hosting", "auth"];
const LEGACY_ROOT_PATHS = [
  ".claude-plugin",
  ".codex-plugin",
  ".mcp.json",
  "gemini-extension.json",
  "mcp_config.json",
  "openclaw.plugin.json",
  "skills/cohesivity/references",
];

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasOnlyKeys = (value, allowed) =>
  Object.keys(value).every((key) => allowed.includes(key));

const manifestMetadata = {
  name: "cohesivity",
  version: VERSION,
  description: DESCRIPTION,
  author: AUTHOR,
  homepage: "https://cohesivity.ai",
  repository: "https://github.com/cohesivity-org/cohesivity-plugin",
  license: "MIT",
  keywords: KEYWORDS,
};

export const portableManifest = {
  $schema: PLUGIN_SCHEMA,
  ...manifestMetadata,
};

export const portableMcp = {
  $schema: MCP_SCHEMA,
  mcpServers: {
    cohesivity: {
      type: "streamable-http",
      url: MCP_ENDPOINT,
    },
    "cohesivity-local": {
      type: "stdio",
      command: "node",
      args: [`\${PLUGIN_ROOT}/${LOCAL_MCP_SOURCE}`],
    },
  },
};

const claudeManifest = {
  ...manifestMetadata,
  skills: "./skills/",
  mcpServers: "./.mcp.json",
};

const claudeMarketplace = {
  $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
  name: "cohesivity",
  owner: {
    name: "Cohesivity",
    url: "https://cohesivity.ai",
  },
  plugins: [
    {
      name: "cohesivity",
      source: "./",
      description: DESCRIPTION,
      version: VERSION,
      category: "devops",
      license: "MIT",
      keywords: KEYWORDS,
    },
  ],
};

const claudeMcp = {
  mcpServers: {
    cohesivity: {
      type: "http",
      url: MCP_ENDPOINT,
    },
    "cohesivity-local": {
      type: "stdio",
      command: "node",
      args: [`\${CLAUDE_PLUGIN_ROOT}/${LOCAL_MCP_SOURCE}`],
    },
  },
};

const geminiManifest = {
  name: "cohesivity",
  version: VERSION,
  description: DESCRIPTION,
  mcpServers: {
    cohesivity: {
      type: "http",
      url: MCP_ENDPOINT,
    },
    "cohesivity-local": {
      command: "node",
      args: ["${extensionPath}${/}mcp${/}project-bootstrap.mjs"],
      cwd: "${extensionPath}",
    },
  },
};

const antigravityManifest = {
  name: "cohesivity",
  description: DESCRIPTION,
};

const antigravityMcp = {
  mcpServers: {
    cohesivity: {
      serverUrl: MCP_ENDPOINT,
    },
    "cohesivity-local": {
      command: "node",
      args: ["${extensionPath}${/}mcp${/}project-bootstrap.mjs"],
      cwd: "${extensionPath}",
    },
  },
};

const openAiManifest = {
  ...manifestMetadata,
  skills: "./skills/",
  mcpServers: "./.mcp.json",
};

const openAiMcp = {
  cohesivity: {
    type: "http",
    url: MCP_ENDPOINT,
  },
  "cohesivity-local": {
    type: "stdio",
    command: "node",
    args: ["./mcp/project-bootstrap.mjs"],
    cwd: ".",
  },
};

const codexMarketplace = {
  name: "cohesivity",
  interface: {
    displayName: "Cohesivity",
  },
  plugins: [
    {
      name: "cohesivity",
      source: {
        source: "local",
        path: "./plugins/cohesivity",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_USE",
        products: ["CODEX"],
      },
      category: "Developer Tools",
    },
  ],
};

function readCanonicalSkill(root = ROOT) {
  const path = resolve(root, "skills/cohesivity/SKILL.md");
  assert(existsSync(path), `missing canonical skill: ${relative(root, path)}`);
  const skill = readFileSync(path);
  assert(
    sha256(skill) === SKILL_SHA256,
    `canonical skill hash mismatch; expected ${SKILL_SHA256}`,
  );
  const text = skill.toString("utf8");
  assert(text.startsWith("---\nname: cohesivity\n"), "canonical skill must carry the cohesivity name");
  assert(
    new RegExp(`^metadata:\\n  version: "${SKILL_VERSION}"$`, "m").test(text),
    `canonical skill must carry metadata.version ${SKILL_VERSION}`,
  );
  return skill;
}

export function expectedFiles(root = ROOT) {
  const skill = readCanonicalSkill(root);
  const license = readFileSync(resolve(root, "LICENSE"));
  const localMcp = readFileSync(resolve(root, LOCAL_MCP_SOURCE));
  const files = new Map([
    ["plugin.json", Buffer.from(json(portableManifest))],
    ["mcp.json", Buffer.from(json(portableMcp))],
    [LOCAL_MCP_SOURCE, localMcp],
  ]);

  const wrappers = {
    claude: {
      ".claude-plugin/plugin.json": json(claudeManifest),
      ".claude-plugin/marketplace.json": json(claudeMarketplace),
      ".mcp.json": json(claudeMcp),
    },
    gemini: {
      "gemini-extension.json": json(geminiManifest),
    },
    antigravity: {
      "plugin.json": json(antigravityManifest),
      "mcp_config.json": json(antigravityMcp),
    },
    openai: {
      ".codex-plugin/plugin.json": json(openAiManifest),
      ".mcp.json": json(openAiMcp),
    },
  };

  for (const [client, clientFiles] of Object.entries(wrappers)) {
    const packageRoot = `packages/${client}`;
    files.set(`${packageRoot}/LICENSE`, license);
    files.set(`${packageRoot}/skills/cohesivity/SKILL.md`, skill);
    files.set(`${packageRoot}/${LOCAL_MCP_SOURCE}`, localMcp);
    for (const [path, contents] of Object.entries(clientFiles)) {
      files.set(`${packageRoot}/${path}`, Buffer.from(contents));
    }
  }

  const codexPluginRoot = "packages/codex/plugins/cohesivity";
  files.set("packages/codex/.agents/plugins/marketplace.json", Buffer.from(json(codexMarketplace)));
  files.set(`${codexPluginRoot}/LICENSE`, license);
  files.set(`${codexPluginRoot}/skills/cohesivity/SKILL.md`, skill);
  files.set(`${codexPluginRoot}/${LOCAL_MCP_SOURCE}`, localMcp);
  files.set(`${codexPluginRoot}/.codex-plugin/plugin.json`, Buffer.from(json(openAiManifest)));
  files.set(`${codexPluginRoot}/.mcp.json`, Buffer.from(json(openAiMcp)));

  return files;
}

function validatePortableManifest(manifest) {
  const allowed = [
    "$schema",
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
    "extensions",
  ];
  assert(isRecord(manifest), "plugin.json must be an object");
  assert(hasOnlyKeys(manifest, allowed), "plugin.json contains a non-portable field");
  assert(manifest.$schema === PLUGIN_SCHEMA, "plugin.json has the wrong schema");
  assert(
    /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(manifest.name) &&
      manifest.name.length <= 64,
    "plugin.json has an invalid name",
  );
  for (const key of ["version", "description", "homepage", "repository", "license"]) {
    assert(typeof manifest[key] === "string", `plugin.json ${key} must be a string`);
  }
  assert(isRecord(manifest.author), "plugin.json author must be an object");
  assert(
    hasOnlyKeys(manifest.author, ["name", "email", "url"]) &&
      Object.values(manifest.author).every((value) => typeof value === "string"),
    "plugin.json author has an invalid field",
  );
  assert(
    Array.isArray(manifest.keywords) &&
      manifest.keywords.every((value) => typeof value === "string"),
    "plugin.json keywords must be strings",
  );
}

function validateEndpoint(value, label) {
  assert(value === MCP_ENDPOINT, `${label} must use ${MCP_ENDPOINT}`);
  const url = new URL(value);
  assert(url.protocol === "https:", `${label} must use HTTPS`);
  assert(!url.username && !url.password && !url.hash, `${label} contains URL credentials or a fragment`);
}

function validatePortableMcp(mcp) {
  assert(isRecord(mcp), "mcp.json must be an object");
  assert(
    hasOnlyKeys(mcp, ["$schema", "mcpServers"]) &&
      Object.keys(mcp).length === 2,
    "mcp.json must contain only $schema and mcpServers",
  );
  assert(mcp.$schema === MCP_SCHEMA, "mcp.json has the wrong schema");
  assert(isRecord(mcp.mcpServers), "mcp.json mcpServers must be an object");
  for (const [name, server] of Object.entries(mcp.mcpServers)) {
    assert(name.length > 0 && isRecord(server), "mcp.json has an invalid server entry");
    if (name === "cohesivity") {
      assert(
        server.type === "streamable-http" &&
          hasOnlyKeys(server, ["type", "url", "headers"]),
        `mcp.json server ${name} is not Streamable HTTP`,
      );
      validateEndpoint(server.url, `mcp.json server ${name}`);
      assert(server.headers === undefined, `mcp.json server ${name} must not package headers`);
    } else {
      assert(name === "cohesivity-local", "mcp.json contains an unknown server");
      assert(
        server.type === "stdio" &&
          server.command === "node" &&
          JSON.stringify(server.args) === JSON.stringify(["${PLUGIN_ROOT}/mcp/project-bootstrap.mjs"]) &&
          hasOnlyKeys(server, ["type", "command", "args"]),
        "mcp.json has an invalid local stdio server",
      );
    }
  }
}

function validateNativeArtifacts(files) {
  const parse = (path) => JSON.parse(files.get(path).toString("utf8"));
  const claude = parse("packages/claude/.claude-plugin/plugin.json");
  assert(claude.skills === "./skills/", "Claude manifest has the wrong skills path");
  assert(claude.mcpServers === "./.mcp.json", "Claude manifest has the wrong MCP path");

  const gemini = parse("packages/gemini/gemini-extension.json");
  assert(
    hasOnlyKeys(gemini, ["name", "version", "description", "mcpServers"]),
    "Gemini manifest contains an unsupported field",
  );
  assert(gemini.mcpServers.cohesivity.type === "http", "Gemini remote MCP has the wrong type");
  validateEndpoint(gemini.mcpServers.cohesivity.url, "Gemini MCP server");

  const antigravity = parse("packages/antigravity/plugin.json");
  assert(
    isRecord(antigravity) &&
      hasOnlyKeys(antigravity, ["name", "description"]) &&
      Object.keys(antigravity).length === 2,
    "Antigravity manifest violates its strict root schema",
  );
  assert(/^[a-zA-Z0-9-_]+$/.test(antigravity.name), "Antigravity name is invalid");
  validateEndpoint(
    parse("packages/antigravity/mcp_config.json").mcpServers.cohesivity.serverUrl,
    "Antigravity MCP server",
  );

  const openAi = parse("packages/openai/.codex-plugin/plugin.json");
  assert(openAi.skills === "./skills/", "OpenAI manifest has the wrong skills path");
  assert(openAi.mcpServers === "./.mcp.json", "OpenAI manifest has the wrong MCP path");
  assert(openAi.apps === undefined, "OpenAI manifest must not invent an app registration");
  validateEndpoint(parse("packages/openai/.mcp.json").cohesivity.url, "OpenAI MCP server");

  const codexMarketplacePath = "packages/codex/.agents/plugins/marketplace.json";
  const marketplace = parse(codexMarketplacePath);
  assert(
    marketplace.plugins.length === 1 &&
      marketplace.plugins[0].source.source === "local" &&
      marketplace.plugins[0].source.path === "./plugins/cohesivity" &&
      marketplace.plugins[0].policy.authentication === "ON_USE" &&
      JSON.stringify(marketplace.plugins[0].policy.products) === JSON.stringify(["CODEX"]),
    "Codex marketplace has an invalid local plugin entry",
  );
  const codexPlugin = parse("packages/codex/plugins/cohesivity/.codex-plugin/plugin.json");
  assert(codexPlugin.skills === "./skills/", "Codex marketplace plugin has the wrong skills path");
  assert(codexPlugin.mcpServers === "./.mcp.json", "Codex marketplace plugin has the wrong MCP path");
  assert(codexPlugin.apps === undefined, "Codex marketplace plugin must not invent an app registration");
  validateEndpoint(
    parse("packages/codex/plugins/cohesivity/.mcp.json").cohesivity.url,
    "Codex marketplace MCP server",
  );

  const mcpPaths = [
    "mcp.json",
    "packages/claude/.mcp.json",
    "packages/gemini/gemini-extension.json",
    "packages/antigravity/mcp_config.json",
    "packages/openai/.mcp.json",
    "packages/codex/plugins/cohesivity/.mcp.json",
  ];
  for (const path of mcpPaths) {
    const contents = files.get(path).toString("utf8");
    assert(!/"(?:headers|auth|oauth)"\s*:/i.test(contents), `${path} packages auth data`);
    assert(!/Authorization|Bearer\s/i.test(contents), `${path} contains a literal auth header`);
  }
}

export function validateExpectedFiles(files) {
  validatePortableManifest(JSON.parse(files.get("plugin.json").toString("utf8")));
  validatePortableMcp(JSON.parse(files.get("mcp.json").toString("utf8")));
  validateNativeArtifacts(files);

  const canonical = files.get("packages/claude/skills/cohesivity/SKILL.md");
  for (const client of ["gemini", "antigravity", "openai"]) {
    assert(
      files.get(`packages/${client}/skills/cohesivity/SKILL.md`).equals(canonical),
      `${client} skill copy is not byte-identical`,
    );
  }
  assert(
    files.get("packages/codex/plugins/cohesivity/skills/cohesivity/SKILL.md").equals(canonical),
    "Codex marketplace skill copy is not byte-identical",
  );

  const localMcp = files.get(LOCAL_MCP_SOURCE);
  for (const path of [
    "packages/claude/mcp/project-bootstrap.mjs",
    "packages/gemini/mcp/project-bootstrap.mjs",
    "packages/antigravity/mcp/project-bootstrap.mjs",
    "packages/openai/mcp/project-bootstrap.mjs",
    "packages/codex/plugins/cohesivity/mcp/project-bootstrap.mjs",
  ]) {
    assert(files.get(path).equals(localMcp), `${path} is not byte-identical to the local MCP source`);
  }
}

function walkFiles(path, base = path) {
  if (!existsSync(path)) return [];
  const output = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const absolute = resolve(path, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(absolute, base));
    else if (entry.isFile()) output.push(relative(base, absolute).split("\\").join("/"));
    else fail(`generated package contains a non-regular entry: ${relative(ROOT, absolute)}`);
  }
  return output.sort();
}

export function check(root = ROOT) {
  const files = expectedFiles(root);
  validateExpectedFiles(files);

  for (const [path, expected] of files) {
    const absolute = resolve(root, path);
    assert(existsSync(absolute), `missing generated artifact: ${path}`);
    assert(statSync(absolute).isFile(), `generated artifact is not a file: ${path}`);
    assert(readFileSync(absolute).equals(expected), `generated artifact is stale: ${path}`);
  }

  const expectedPackageFiles = [...files.keys()]
    .filter((path) => path.startsWith("packages/"))
    .map((path) => path.slice("packages/".length))
    .sort();
  assert(
    JSON.stringify(walkFiles(resolve(root, "packages"))) ===
      JSON.stringify(expectedPackageFiles),
    "packages/ contains an unexpected or missing generated file",
  );

  for (const path of LEGACY_ROOT_PATHS) {
    assert(!existsSync(resolve(root, path)), `root contains a client-specific or stale path: ${path}`);
  }
  assert(!existsSync(resolve(root, ".app.json")), "root must not contain an unregistered .app.json");
  for (const path of walkFiles(resolve(root, "packages"))) {
    assert(!path.endsWith(".app.json"), `generated wrapper invents an app registration: ${path}`);
  }
}

export function build(root = ROOT) {
  const files = expectedFiles(root);
  validateExpectedFiles(files);

  for (const path of LEGACY_ROOT_PATHS) rmSync(resolve(root, path), { recursive: true, force: true });
  rmSync(resolve(root, "packages"), { recursive: true, force: true });

  for (const [path, contents] of files) {
    const absolute = resolve(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  check(root);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) {
    console.error("Usage: node scripts/build-packages.mjs [--check]");
    process.exitCode = 2;
  } else {
    try {
      if (args[0] === "--check") check();
      else build();
      console.log(args[0] === "--check" ? "Package artifacts are current." : "Package artifacts rebuilt.");
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
