#!/usr/bin/env node
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, link, open, realpath, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt);
const MAGIC = Buffer.from("AURABKP1", "ascii");
const FORMAT_VERSION = 1;
const HEADER_LENGTH_BYTES = 4;
const MAX_HEADER_BYTES = 4096;
const TAG_BYTES = 16;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const MAX_STDIN_BYTES = 64 * 1024;
const MAX_KDF_MEMORY = 128 * 1024 * 1024;
const STREAM_HIGH_WATER_MARK = 64 * 1024;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const DIRECTORY_FLAG = fsConstants.O_DIRECTORY ?? 0;
const DEFAULT_KDF = Object.freeze({ N: 32_768, r: 8, p: 1 });
class BackupError extends Error {
  constructor(reason, exitCode = 1) {
    super(reason);
    this.name = "BackupError";
    this.reason = reason;
    this.exitCode = exitCode;
  }
}
let activeAbortController = null;
let pendingSignalCode = null;
function installSignalHandlers() {
  const handleSignal = (exitCode) => {
    pendingSignalCode = exitCode;
    if (activeAbortController !== null) {
      activeAbortController.abort();
    }
  };
  process.once("SIGINT", () => handleSignal(130));
  process.once("SIGTERM", () => handleSignal(143));
  process.once("SIGHUP", () => handleSignal(129));
}
function fail(reason) {
  throw new BackupError(reason);
}
function assertNotAborted(signal) {
  if (signal.aborted) {
    throw new BackupError("interrupted", pendingSignalCode ?? 1);
  }
}
function hasControlChars(value) {
  return /[\u0000-\u001f\u007f]/u.test(value);
}
function requireSafePath(value) {
  if (typeof value !== "string" || value.length === 0 || hasControlChars(value)) {
    fail("path");
  }
}
function parseArgs(argv) {
  if (Number.parseInt(process.versions.node.split(".")[0], 10) < 22) {
    fail("node-version");
  }
  const mode = argv[0];
  if (mode !== "encrypt" && mode !== "decrypt") {
    fail("arguments");
  }
  let operationMode = null;
  let input = null;
  let output = null;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--write") {
      if (operationMode !== null) {
        fail("arguments");
      }
      operationMode = argument.slice(2);
      continue;
    }
    if (argument === "--input" || argument === "--output") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        fail("arguments");
      }
      const value = argv[index + 1];
      requireSafePath(value);
      if (argument === "--input") {
        if (input !== null) {
          fail("arguments");
        }
        input = value;
      } else {
        if (output !== null) {
          fail("arguments");
        }
        output = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--input=") || argument.startsWith("--output=")) {
      const [name, ...valueParts] = argument.split("=");
      const value = valueParts.join("=");
      requireSafePath(value);
      if (name === "--input") {
        if (input !== null) {
          fail("arguments");
        }
        input = value;
      } else {
        if (output !== null) {
          fail("arguments");
        }
        output = value;
      }
      continue;
    }
    fail("arguments");
  }
  if (operationMode === null || input === null || output === null) {
    fail("arguments");
  }
  return { mode, operationMode, input, output };
}
async function lstatOrFail(path, missingReason) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(missingReason);
    }
    fail("path");
  }
}
async function validatePaths(inputValue, outputValue) {
  requireSafePath(inputValue);
  requireSafePath(outputValue);
  const inputPath = resolve(inputValue);
  const outputPath = resolve(outputValue);
  const comparableInput = process.platform === "win32" ? inputPath.toLowerCase() : inputPath;
  const comparableOutput = process.platform === "win32" ? outputPath.toLowerCase() : outputPath;
  if (comparableInput === comparableOutput) {
    fail("same-path");
  }
  const inputStat = await lstatOrFail(inputPath, "input");
  if (inputStat.isSymbolicLink()) {
    fail("symlink");
  }
  if (!inputStat.isFile()) {
    fail("nonregular");
  }
  const parentPath = dirname(outputPath);
  const parentStat = await lstatOrFail(parentPath, "output-parent");
  if (parentStat.isSymbolicLink()) {
    fail("symlink");
  }
  if (!parentStat.isDirectory()) {
    fail("output-parent");
  }
  const canonicalParent = await realpath(parentPath).catch(() => fail("output-parent"));
  const comparableParent = process.platform === "win32" ? parentPath.toLowerCase() : parentPath;
  const comparableCanonical = process.platform === "win32" ? canonicalParent.toLowerCase() : canonicalParent;
  if (comparableParent !== comparableCanonical) {
    fail("symlink");
  }
  if (
    process.platform !== "win32" &&
    (parentStat.uid !== process.getuid() || (parentStat.mode & 0o022) !== 0)
  ) {
    fail("output-parent-permissions");
  }
  try {
    const outputStat = await lstat(outputPath);
    if (outputStat.isSymbolicLink()) {
      fail("symlink");
    }
    fail("output-exists");
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    if (error?.code !== "ENOENT") {
      fail("output");
    }
  }
  return { inputPath, outputPath, parentPath, parentSnapshot: identitySnapshot(parentStat) };
}

async function requireUnchangedParent(parentPath, expectedSnapshot) {
  const current = await lstatOrFail(parentPath, "output-parent");
  if (current.isSymbolicLink() || !current.isDirectory() || !sameIdentity(expectedSnapshot, identitySnapshot(current))) {
    fail("output-parent-changed");
  }
}
async function openRegularInput(inputPath) {
  const inputStat = await lstatOrFail(inputPath, "input");
  if (inputStat.isSymbolicLink()) {
    fail("symlink");
  }
  if (!inputStat.isFile()) {
    fail("nonregular");
  }
  try {
    const handle = await open(inputPath, fsConstants.O_RDONLY | NO_FOLLOW);
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      await handle.close();
      fail("nonregular");
    }
    return { handle, stat: openedStat };
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    if (error?.code === "ELOOP") {
      fail("symlink");
    }
    fail("input");
  }
}
function snapshot(stat) {
  return {
    dev: BigInt(stat.dev ?? 0),
    ino: BigInt(stat.ino ?? 0),
    size: BigInt(stat.size),
  };
}
function identitySnapshot(stat) {
  return { dev: BigInt(stat.dev ?? 0), ino: BigInt(stat.ino ?? 0) };
}
function sameIdentity(first, second) {
  return (
    (first.dev === 0n || second.dev === 0n || first.dev === second.dev) &&
    (first.ino === 0n || second.ino === 0n || first.ino === second.ino)
  );
}
function sameSnapshot(first, second) {
  const sameIdentity =
    (first.dev === 0n || second.dev === 0n || first.dev === second.dev) &&
    (first.ino === 0n || second.ino === 0n || first.ino === second.ino);
  return sameIdentity && first.size === second.size;
}
async function readAndHash(inputPath, signal) {
  const { handle, stat } = await openRegularInput(inputPath);
  const initialSnapshot = snapshot(stat);
  const hash = createHash("sha256");
  let byteCount = 0n;
  const stream = handle.createReadStream({
    autoClose: false,
    highWaterMark: STREAM_HIGH_WATER_MARK,
  });
  try {
    for await (const chunk of stream) {
      assertNotAborted(signal);
      hash.update(chunk);
      byteCount += BigInt(chunk.length);
    }
    const finalStat = await handle.stat();
    if (!sameSnapshot(initialSnapshot, snapshot(finalStat)) || byteCount !== initialSnapshot.size) {
      fail("input-changed");
    }
    return { sha256: hash.digest("hex"), byteCount };
  } finally {
    stream.destroy();
    await handle.close().catch(() => undefined);
  }
}
function encodeHeader(header) {
  let headerBytes;
  try {
    headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  } catch {
    fail("header");
  }
  if (headerBytes.length === 0 || headerBytes.length > MAX_HEADER_BYTES) {
    fail("header");
  }
  const headerLength = Buffer.alloc(HEADER_LENGTH_BYTES);
  headerLength.writeUInt32BE(headerBytes.length, 0);
  const prefix = Buffer.concat([MAGIC, headerLength]);
  return { headerBytes, prefix, aad: Buffer.concat([prefix, headerBytes]) };
}
function decodeBase64Url(value, expectedBytes) {
  if (typeof value !== "string" || value.length === 0) {
    fail("header");
  }
  let decoded;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    fail("header");
  }
  if (
    decoded.length !== expectedBytes ||
    decoded.toString("base64url") !== value
  ) {
    fail("header");
  }
  return decoded;
}
function validateScryptParameters(header) {
  const { N, r, p } = header;
  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    N < 16_384 ||
    N > 1_048_576 ||
    (N & (N - 1)) !== 0 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    fail("kdf");
  }
  const memory = 128n * BigInt(N) * BigInt(r);
  if (memory > BigInt(MAX_KDF_MEMORY)) {
    fail("kdf");
  }
}
const HEADER_KEYS = [
  "version",
  "algorithm",
  "kdf",
  "N",
  "r",
  "p",
  "salt",
  "iv",
  "plaintextBytes",
  "inputSha256",
];
function parseHeader(headerBytes) {
  let headerText;
  try {
    headerText = new TextDecoder("utf-8", { fatal: true }).decode(headerBytes);
  } catch {
    fail("header");
  }
  let header;
  try {
    header = JSON.parse(headerText);
  } catch {
    fail("header");
  }
  if (header === null || typeof header !== "object" || Array.isArray(header)) {
    fail("header");
  }
  if (!Buffer.from(JSON.stringify(header), "utf8").equals(headerBytes)) {
    fail("header");
  }
  const actualKeys = Object.keys(header).sort();
  const expectedKeys = [...HEADER_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail("header");
  }
  if (header.version !== FORMAT_VERSION || header.algorithm !== "aes-256-gcm" || header.kdf !== "scrypt") {
    fail("header");
  }
  validateScryptParameters(header);
  const salt = decodeBase64Url(header.salt, SALT_BYTES);
  const iv = decodeBase64Url(header.iv, IV_BYTES);
  if (
    typeof header.plaintextBytes !== "string" ||
    !/^(?:0|[1-9][0-9]*)$/u.test(header.plaintextBytes) ||
    typeof header.inputSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(header.inputSha256)
  ) {
    fail("header");
  }
  let plaintextBytes;
  try {
    plaintextBytes = BigInt(header.plaintextBytes);
  } catch {
    fail("header");
  }
  return { header, salt, iv, plaintextBytes };
}
async function readExactly(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      position + offset,
    );
    if (bytesRead === 0) {
      return false;
    }
    offset += bytesRead;
  }
  return true;
}
async function openContainer(inputPath) {
  const { handle, stat } = await openRegularInput(inputPath);
  try {
    if (!Number.isSafeInteger(stat.size)) {
      fail("input");
    }
    const prefixLength = MAGIC.length + HEADER_LENGTH_BYTES;
    const prefix = Buffer.alloc(prefixLength);
    if (!(await readExactly(handle, prefix, 0))) {
      fail("truncated");
    }
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      fail("magic");
    }
    const headerLength = prefix.readUInt32BE(MAGIC.length);
    if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) {
      fail("header");
    }
    const headerBytes = Buffer.alloc(headerLength);
    if (!(await readExactly(handle, headerBytes, prefixLength))) {
      fail("truncated");
    }
    const parsedHeader = parseHeader(headerBytes);
    const dataStart = prefixLength + headerLength;
    const minimumSize = dataStart + TAG_BYTES;
    if (stat.size < minimumSize) {
      fail("truncated");
    }
    const ciphertextBytes = stat.size - minimumSize;
    if (BigInt(ciphertextBytes) !== parsedHeader.plaintextBytes) {
      fail("length");
    }
    const tag = Buffer.alloc(TAG_BYTES);
    if (!(await readExactly(handle, tag, stat.size - TAG_BYTES))) {
      fail("truncated");
    }
    return {
      handle,
      stat,
      headerBytes,
      aad: Buffer.concat([prefix, headerBytes]),
      ...parsedHeader,
      dataStart,
      dataEnd: dataStart + ciphertextBytes - 1,
      ciphertextBytes,
      tag,
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}
async function deriveKey(passphrase, salt, parameters) {
  validateScryptParameters(parameters);
  const passphraseBytes = Buffer.from(passphrase, "utf8");
  try {
    return Buffer.from(
      await scryptAsync(passphraseBytes, salt, KEY_BYTES, {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: MAX_KDF_MEMORY,
      }),
    );
  } finally {
    passphraseBytes.fill(0);
  }
}
async function writeBuffer(handle, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset);
    if (bytesWritten <= 0) {
      fail("write");
    }
    offset += bytesWritten;
  }
}
async function createTempFile(outputPath) {
  const parentPath = dirname(outputPath);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = randomBytes(12).toString("hex");
    const tempPath = `${parentPath}/.${outputPath.split(/[\\/]/u).pop()}.tmp-${process.pid}-${suffix}`;
    try {
      const handle = await open(
        tempPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
        0o600,
      );
      try {
        await handle.chmod(0o600);
      } catch (error) {
        if (process.platform !== "win32") {
          await handle.close().catch(() => undefined);
          await unlink(tempPath).catch(() => undefined);
          throw error;
        }
      }
      return { tempPath, handle };
    } catch (error) {
      if (error?.code === "EEXIST") {
        continue;
      }
      throw new BackupError("temp");
    }
  }
  fail("temp");
}
async function syncDirectory(parentPath) {
  let directoryHandle;
  try {
    directoryHandle = await open(parentPath, fsConstants.O_RDONLY | DIRECTORY_FLAG);
    await directoryHandle.sync();
  } catch (error) {
    if (
      process.platform === "win32" &&
      ["EACCES", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(error?.code)
    ) {
      return;
    }
    throw new BackupError("sync");
  } finally {
    await directoryHandle?.close().catch(() => undefined);
  }
}
async function cleanupState(state) {
  await state.handle?.close().catch(() => undefined);
  if (state.tempPath !== null) {
    await unlink(state.tempPath).catch(() => undefined);
  }
}

async function publishTemp(state, outputPath, parentPath) {
  await state.handle.sync();
  await state.handle.close();
  state.handle = null;

  try {
    await link(state.tempPath, outputPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("output-exists");
    }
    fail("publish");
  }

  await syncDirectory(parentPath);
  await unlink(state.tempPath);
  state.tempPath = null;
  await syncDirectory(parentPath);
}

function buildHeader(hashResult) {
  return {
    version: FORMAT_VERSION,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    N: DEFAULT_KDF.N,
    r: DEFAULT_KDF.r,
    p: DEFAULT_KDF.p,
    salt: randomBytes(SALT_BYTES).toString("base64url"),
    iv: randomBytes(IV_BYTES).toString("base64url"),
    plaintextBytes: hashResult.byteCount.toString(),
    inputSha256: hashResult.sha256,
  };
}

async function streamEncrypt(inputPath, state, headerInfo, key, signal) {
  const { handle, stat } = await openRegularInput(inputPath);
  const initialSnapshot = snapshot(stat);
  const hash = createHash("sha256");
  const cipher = createCipheriv("aes-256-gcm", key, headerInfo.iv);
  cipher.setAAD(headerInfo.aad);
  let byteCount = 0n;
  const stream = handle.createReadStream({
    autoClose: false,
    highWaterMark: STREAM_HIGH_WATER_MARK,
  });

  try {
    for await (const chunk of stream) {
      assertNotAborted(signal);
      hash.update(chunk);
      byteCount += BigInt(chunk.length);
      await writeBuffer(state.handle, cipher.update(chunk));
    }
    const finalStat = await handle.stat();
    if (!sameSnapshot(initialSnapshot, snapshot(finalStat))) {
      fail("input-changed");
    }
    const digest = hash.digest("hex");
    if (byteCount !== BigInt(headerInfo.header.plaintextBytes) || digest !== headerInfo.header.inputSha256) {
      fail("input-changed");
    }
    await writeBuffer(state.handle, cipher.final());
    await writeBuffer(state.handle, cipher.getAuthTag());
  } finally {
    stream.destroy();
    await handle.close().catch(() => undefined);
  }
}

async function streamDecrypt(container, state, key, signal) {
  const decipher = createDecipheriv("aes-256-gcm", key, container.iv);
  decipher.setAAD(container.aad);
  decipher.setAuthTag(container.tag);
  const hash = createHash("sha256");
  let byteCount = 0n;

  if (container.ciphertextBytes > 0) {
    const stream = container.handle.createReadStream({
      autoClose: false,
      start: container.dataStart,
      end: container.dataEnd,
      highWaterMark: STREAM_HIGH_WATER_MARK,
    });
    try {
      for await (const chunk of stream) {
        assertNotAborted(signal);
        const plaintext = decipher.update(chunk);
        if (plaintext.length > 0) {
          hash.update(plaintext);
          byteCount += BigInt(plaintext.length);
          await writeBuffer(state.handle, plaintext);
        }
      }
    } finally {
      stream.destroy();
    }
  }

  assertNotAborted(signal);
  const finalPlaintext = decipher.final();
  if (finalPlaintext.length > 0) {
    hash.update(finalPlaintext);
    byteCount += BigInt(finalPlaintext.length);
    await writeBuffer(state.handle, finalPlaintext);
  }

  const expectedHash = Buffer.from(container.header.inputSha256, "hex");
  const actualHash = hash.digest();
  if (
    byteCount !== container.plaintextBytes ||
    expectedHash.length !== actualHash.length ||
    !timingSafeEqual(expectedHash, actualHash)
  ) {
    fail("plaintext-hash");
  }
}

async function encryptFile(inputPath, outputPath, parentPath, parentSnapshot, passphrase, signal) {
  const hashResult = await readAndHash(inputPath, signal);
  const header = buildHeader(hashResult);
  const encodedHeader = encodeHeader(header);
  const key = await deriveKey(passphrase, Buffer.from(header.salt, "base64url"), header);
  const state = {
    tempPath: null,
    handle: null,
  };

  try {
    await requireUnchangedParent(parentPath, parentSnapshot);
    const temp = await createTempFile(outputPath);
    state.tempPath = temp.tempPath;
    state.handle = temp.handle;
    await writeBuffer(state.handle, encodedHeader.prefix);
    await writeBuffer(state.handle, encodedHeader.headerBytes);
    const headerInfo = { header, ...encodedHeader, iv: Buffer.from(header.iv, "base64url") };
    await streamEncrypt(inputPath, state, headerInfo, key, signal);
    await requireUnchangedParent(parentPath, parentSnapshot);
    await publishTemp(state, outputPath, parentPath);
  } catch (error) {
    await cleanupState(state);
    throw error instanceof BackupError ? error : new BackupError("encrypt");
  } finally {
    key.fill(0);
  }
}

async function decryptFile(inputPath, outputPath, parentPath, parentSnapshot, passphrase, signal) {
  const container = await openContainer(inputPath);
  let key;
  const state = {
    tempPath: null,
    handle: null,
  };

  try {
    key = await deriveKey(passphrase, container.salt, container.header);
    await requireUnchangedParent(parentPath, parentSnapshot);
    const temp = await createTempFile(outputPath);
    state.tempPath = temp.tempPath;
    state.handle = temp.handle;
    await streamDecrypt(container, state, key, signal);
    await requireUnchangedParent(parentPath, parentSnapshot);
    await publishTemp(state, outputPath, parentPath);
  } catch (error) {
    await cleanupState(state);
    throw error instanceof BackupError ? error : new BackupError("decrypt");
  } finally {
    key?.fill(0);
    await container.handle.close().catch(() => undefined);
  }
}

async function readPassphrase() {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_STDIN_BYTES) {
      fail("stdin");
    }
    chunks.push(buffer);
  }

  let payload;
  try {
    payload = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, totalBytes));
  } catch {
    fail("stdin");
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    fail("stdin");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    Object.keys(parsed)[0] !== "passphrase" ||
    typeof parsed.passphrase !== "string" ||
    parsed.passphrase.length === 0 ||
    Buffer.byteLength(parsed.passphrase, "utf8") > MAX_STDIN_BYTES
  ) {
    fail("stdin");
  }
  return parsed.passphrase;
}

async function inspectDryRun(inputPath, mode) {
  if (mode !== "decrypt") {
    return;
  }
  const container = await openContainer(inputPath);
  await container.handle.close().catch(() => undefined);
}

async function main() {
  installSignalHandlers();
  const args = parseArgs(process.argv.slice(2));
  const paths = await validatePaths(args.input, args.output);

  if (args.operationMode === "dry-run") {
    await inspectDryRun(paths.inputPath, args.mode);
    console.log(`[offsite-backup] status=dry-run mode=${args.mode} output=${paths.outputPath}`);
    return;
  }

  const passphrase = await readPassphrase();
  activeAbortController = new AbortController();
  try {
    if (args.mode === "encrypt") {
      await encryptFile(paths.inputPath, paths.outputPath, paths.parentPath, paths.parentSnapshot, passphrase, activeAbortController.signal);
    } else {
      await decryptFile(paths.inputPath, paths.outputPath, paths.parentPath, paths.parentSnapshot, passphrase, activeAbortController.signal);
    }
  } finally {
    activeAbortController = null;
  }
  if (pendingSignalCode !== null) {
    throw new BackupError("interrupted", pendingSignalCode);
  }
  console.log(`[offsite-backup] status=success mode=${args.mode} output=${paths.outputPath}`);
}

try {
  await main();
} catch (error) {
  const reason = error instanceof BackupError ? error.reason : "operation";
  const exitCode = error instanceof BackupError ? error.exitCode : 1;
  console.error(`[offsite-backup] status=failed reason=${reason}`);
  process.exitCode = exitCode;
}
