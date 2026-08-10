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
import { gzipSync } from "node:zlib";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_MCP_SOURCE, ROOT, VERSION, expectedFiles } from "./build-packages.mjs";

export const ARTIFACT_VERSION = `v${VERSION}`;
export const ARTIFACT_DIRECTORY = `artifacts/${ARTIFACT_VERSION}`;
export const INSTALL_MANIFEST = `${ARTIFACT_DIRECTORY}/install-manifest.v1.json`;
export const REPOSITORY = "cohesivity-org/cohesivity-plugin";

const CLIENTS = Object.freeze([
  { name: "portable", prefix: null },
  { name: "claude", prefix: "packages/claude/" },
  { name: "gemini", prefix: "packages/gemini/" },
  { name: "antigravity", prefix: "packages/antigravity/" },
  { name: "openai", prefix: "packages/openai/" },
  { name: "codex", prefix: "packages/codex/" },
]);

const PORTABLE_PATHS = Object.freeze([
  "LICENSE",
  LOCAL_MCP_SOURCE,
  "mcp.json",
  "plugin.json",
  "skills/cohesivity/SKILL.md",
]);
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SECRET_PATTERN = /coh_(?:man|app)_[a-z0-9]+|Authorization\s*:\s*Bearer\s+[^<>\s]/iu;

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};

function octal(value, length) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  assert(encoded.length < length, "tar numeric field overflow");
  return `${encoded}\0`;
}

function writeField(header, offset, length, value) {
  const bytes = Buffer.from(value);
  assert(bytes.length <= length, `tar field is too long: ${value}`);
  bytes.copy(header, offset);
}

function tarHeader(path, size) {
  const pathBytes = Buffer.from(path);
  assert(pathBytes.length <= 100, `archive path exceeds the portable tar limit: ${path}`);
  const header = Buffer.alloc(512);
  writeField(header, 0, 100, path);
  writeField(header, 100, 8, octal(0o644, 8));
  writeField(header, 108, 8, octal(0, 8));
  writeField(header, 116, 8, octal(0, 8));
  writeField(header, 124, 12, octal(size, 12));
  writeField(header, 136, 12, octal(0, 12));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeField(header, 257, 6, "ustar\0");
  writeField(header, 263, 2, "00");
  writeField(header, 265, 32, "root");
  writeField(header, 297, 32, "root");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeField(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

export function deterministicArchive(files) {
  const chunks = [];
  for (const [path, contents] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    assert(Buffer.isBuffer(contents), `archive entry is not a Buffer: ${path}`);
    assert(
      path.length > 0 &&
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !path.split("/").includes(".."),
      `unsafe archive path: ${path}`,
    );
    chunks.push(tarHeader(path, contents.length), contents);
    const remainder = contents.length % 512;
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

function packageFiles(allFiles, client, root) {
  if (client.prefix === null) {
    const output = new Map();
    for (const path of PORTABLE_PATHS) {
      output.set(path, allFiles.get(path) ?? readFileSync(resolve(root, path)));
    }
    return output;
  }
  return new Map(
    [...allFiles]
      .filter(([path]) => path.startsWith(client.prefix))
      .map(([path, contents]) => [path.slice(client.prefix.length), contents]),
  );
}

function fileInventory(files) {
  return [...files]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, contents]) => ({
      path,
      size: contents.length,
      sha256: sha256(contents),
      mode: "0644",
    }));
}

function treeDigest(inventory) {
  return sha256(
    inventory
      .map((file) => `${file.mode} ${file.sha256} ${file.size} ${file.path}\n`)
      .join(""),
  );
}

export function expectedArtifacts(sourceCommit, root = ROOT) {
  assert(
    typeof sourceCommit === "string" && SOURCE_COMMIT_PATTERN.test(sourceCommit),
    "SOURCE_COMMIT must be a full lowercase 40-character Git commit",
  );
  const allFiles = expectedFiles(root);
  const outputs = new Map();
  const packages = [];
  const rawBase = `https://raw.githubusercontent.com/${REPOSITORY}/${sourceCommit}/${ARTIFACT_DIRECTORY}`;

  for (const client of CLIENTS) {
    const files = packageFiles(allFiles, client, root);
    const inventory = fileInventory(files);
    const archive = deterministicArchive(files);
    const archiveName = `cohesivity-${client.name}-${VERSION}.tar.gz`;
    assert(!SECRET_PATTERN.test(archive.toString("latin1")), `${client.name} archive contains a secret`);
    outputs.set(`${ARTIFACT_DIRECTORY}/${archiveName}`, archive);
    packages.push({
      client: client.name,
      archive: archiveName,
      immutable_url: `${rawBase}/${archiveName}`,
      size: archive.length,
      sha256: sha256(archive),
      tree_sha256: treeDigest(inventory),
      files: inventory,
    });
  }

  const manifest = {
    schema_version: 1,
    package: "cohesivity",
    version: VERSION,
    source: {
      repository: `https://github.com/${REPOSITORY}`,
      commit: sourceCommit,
      immutable_base_url: rawBase,
    },
    packages,
  };
  outputs.set(INSTALL_MANIFEST, Buffer.from(json(manifest)));
  return outputs;
}

function walkFiles(path, base = path) {
  if (!existsSync(path)) return [];
  const output = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const absolute = resolve(path, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(absolute, base));
    else if (entry.isFile()) output.push(relative(base, absolute).split("\\").join("/"));
    else fail(`artifacts contains a non-regular entry: ${relative(ROOT, absolute)}`);
  }
  return output.sort();
}

export function readTrackedSourceCommit(root = ROOT) {
  const path = resolve(root, INSTALL_MANIFEST);
  if (!existsSync(path)) return undefined;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${INSTALL_MANIFEST} is not valid JSON`);
  }
  assert(
    SOURCE_COMMIT_PATTERN.test(manifest?.source?.commit ?? ""),
    `${INSTALL_MANIFEST} does not contain a valid source commit`,
  );
  return manifest.source.commit;
}

export function checkArtifacts(root = ROOT) {
  const sourceCommit = readTrackedSourceCommit(root);
  assert(sourceCommit, `${INSTALL_MANIFEST} is missing; generate release artifacts first`);
  const expected = expectedArtifacts(sourceCommit, root);
  for (const [path, contents] of expected) {
    const absolute = resolve(root, path);
    assert(existsSync(absolute), `missing release artifact: ${path}`);
    assert(statSync(absolute).isFile(), `release artifact is not a file: ${path}`);
    assert(readFileSync(absolute).equals(contents), `release artifact is stale: ${path}`);
  }
  const actualPaths = walkFiles(resolve(root, ARTIFACT_DIRECTORY)).map(
    (path) => `${ARTIFACT_DIRECTORY}/${path}`,
  );
  assert(
    JSON.stringify(actualPaths) === JSON.stringify([...expected.keys()].sort()),
    `${ARTIFACT_DIRECTORY}/ contains an unexpected or missing artifact`,
  );
}

export function buildArtifacts(sourceCommit, root = ROOT) {
  const expected = expectedArtifacts(sourceCommit, root);
  rmSync(resolve(root, ARTIFACT_DIRECTORY), { recursive: true, force: true });
  for (const [path, contents] of expected) {
    const absolute = resolve(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  checkArtifacts(root);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) {
    console.error("Usage: SOURCE_COMMIT=<40-hex> node scripts/build-artifacts.mjs [--check]");
    process.exitCode = 2;
  } else {
    try {
      if (args[0] === "--check") checkArtifacts();
      else {
        const sourceCommit = process.env.SOURCE_COMMIT ?? readTrackedSourceCommit();
        assert(sourceCommit, "SOURCE_COMMIT is required for the first artifact generation");
        buildArtifacts(sourceCommit);
      }
      console.log(args[0] === "--check" ? "Release artifacts are current." : "Release artifacts rebuilt.");
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
