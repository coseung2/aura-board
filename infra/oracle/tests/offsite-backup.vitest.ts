// @vitest-environment node

import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

const SCRIPT = resolve(process.cwd(), "infra/oracle/offsite-backup.mjs");

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type DestinationRace = {
  outputPath: string;
  replacement: Buffer;
};

function runBackup(
  args: string[],
  stdin: string | undefined,
  keepStdinOpen = false,
  destinationRace?: DestinationRace,
): Promise<RunResult> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PASSPHRASE_SHOULD_NOT_BE_READ: "environment-secret-fixture" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let pollInFlight = false;
    let pollTimer: NodeJS.Timeout | undefined;

    if (destinationRace !== undefined) {
      const temporaryPrefix = `.${basename(destinationRace.outputPath)}.tmp-`;
      pollTimer = setInterval(() => {
        if (settled || pollInFlight) {
          return;
        }
        pollInFlight = true;
        void readdir(dirname(destinationRace.outputPath))
          .then(async (entries) => {
            if (settled || !entries.some((entry) => entry.startsWith(temporaryPrefix))) {
              return;
            }
            try {
              await writeFile(destinationRace.outputPath, destinationRace.replacement, { flag: "wx", mode: 0o600 });
            } catch (error) {
              if (error?.code !== "EEXIST") {
                throw error;
              }
            }
          })
          .catch(() => undefined)
          .finally(() => {
            pollInFlight = false;
          });
      }, 1);
    }

    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill();
        settled = true;
        resolveResult({ code: 124, stdout, stderr: `${stderr}timeout` });
      }
    }, 30_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        if (pollTimer !== undefined) {
          clearInterval(pollTimer);
        }
        clearTimeout(timeout);
        resolveResult({ code: 1, stdout, stderr: `${stderr}${error.message}` });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        if (pollTimer !== undefined) {
          clearInterval(pollTimer);
        }
        clearTimeout(timeout);
        resolveResult({ code: code ?? 1, stdout, stderr });
      }
    });

    if (!keepStdinOpen) {
      child.stdin.end(stdin ?? "");
    }
  });
}

function writeMode(passphrase: string): string {
  return JSON.stringify({ passphrase });
}

function containerLayout(bytes: Buffer): { headerLength: number; dataStart: number } {
  const magicLength = Buffer.byteLength("AURABKP1", "ascii");
  const prefixLength = magicLength + 4;
  if (bytes.length < prefixLength || bytes.subarray(0, magicLength).toString("ascii") !== "AURABKP1") {
    throw new Error("fixture is not an Aura backup container");
  }
  const headerLength = bytes.readUInt32BE(magicLength);
  return { headerLength, dataStart: prefixLength + headerLength };
}

function replaceHeader(bytes: Buffer, changes: Record<string, unknown>): Buffer {
  const { headerLength, dataStart } = containerLayout(bytes);
  const header = JSON.parse(bytes.subarray(12, dataStart).toString("utf8")) as Record<string, unknown>;
  const headerBytes = Buffer.from(JSON.stringify({ ...header, ...changes }), "utf8");
  const prefix = Buffer.alloc(12);
  Buffer.from("AURABKP1", "ascii").copy(prefix);
  prefix.writeUInt32BE(headerBytes.length, 8);
  expect(headerLength).toBeGreaterThan(0);
  return Buffer.concat([prefix, headerBytes, bytes.subarray(dataStart)]);
}

async function encryptFixture(directory: string, inputPath: string, passphrase: string): Promise<string> {
  const encryptedPath = join(directory, "fixture.aura");
  const result = await runBackup(
    ["encrypt", "--write", "--input", inputPath, "--output", encryptedPath],
    writeMode(passphrase),
  );
  expect(result.code).toBe(0);
  return encryptedPath;
}

describe("offsite-backup.mjs", () => {
  let directory: string;
  let inputPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "aura-offsite-test-"));
    inputPath = join(directory, "source.dump");
    const fixture = Buffer.alloc(256 * 1024 + 17);
    for (let index = 0; index < fixture.length; index += 1) {
      fixture[index] = (index * 31 + 7) % 251;
    }
    await writeFile(inputPath, fixture, { mode: 0o600 });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("round-trips a large fixture and keeps published files private", async () => {
    const encryptedPath = join(directory, "source.aura");
    const restoredPath = join(directory, "restored.dump");
    const passphrase = "roundtrip-passphrase-fixture";

    const encrypted = await runBackup(
      ["encrypt", "--write", "--input", inputPath, "--output", encryptedPath],
      writeMode(passphrase),
    );
    expect(encrypted.code).toBe(0);
    expect(encrypted.stdout).toContain("status=success");
    expect(encrypted.stdout).toContain(encryptedPath);

    const decrypted = await runBackup(
      ["decrypt", "--write", "--input", encryptedPath, "--output", restoredPath],
      writeMode(passphrase),
    );
    expect(decrypted.code).toBe(0);
    expect(await readFile(restoredPath)).toEqual(await readFile(inputPath));

    if (process.platform !== "win32") {
      expect((await stat(encryptedPath)).mode & 0o777).toBe(0o600);
      expect((await stat(restoredPath)).mode & 0o777).toBe(0o600);
    }
  });

  it("does not publish output for a wrong passphrase", async () => {
    const encryptedPath = join(directory, "source.aura");
    const wrongOutputPath = join(directory, "wrong-restored.dump");
    const passphrase = "correct-passphrase-fixture";

    expect(
      (await runBackup(
        ["encrypt", "--write", "--input", inputPath, "--output", encryptedPath],
        writeMode(passphrase),
      )).code,
    ).toBe(0);

    const result = await runBackup(
      ["decrypt", "--write", "--input", encryptedPath, "--output", wrongOutputPath],
      writeMode("wrong-passphrase-fixture"),
    );
    expect(result.code).not.toBe(0);
    await expect(stat(wrongOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(directory)).filter((entry) => entry.includes("wrong-restored.dump.tmp-")).length).toBe(0);
  });

  it("rejects tampering without publishing plaintext", async () => {
    const encryptedPath = join(directory, "source.aura");
    const restoredPath = join(directory, "tampered-restored.dump");
    const passphrase = "tamper-passphrase-fixture";

    expect(
      (await runBackup(
        ["encrypt", "--write", "--input", inputPath, "--output", encryptedPath],
        writeMode(passphrase),
      )).code,
    ).toBe(0);
    const encrypted = await readFile(encryptedPath);
    encrypted[encrypted.length - 1] ^= 0x01;
    await writeFile(encryptedPath, encrypted, { mode: 0o600 });

    const result = await runBackup(
      ["decrypt", "--write", "--input", encryptedPath, "--output", restoredPath],
      writeMode(passphrase),
    );
    expect(result.code).not.toBe(0);
    await expect(stat(restoredPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not read stdin or write files in dry-run mode", async () => {
    const outputPath = join(directory, "dry-run.aura");
    const result = await runBackup(
      ["encrypt", "--dry-run", "--input", inputPath, "--output", outputPath],
      undefined,
      true,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("status=dry-run");
    await expect(stat(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects secrets in argv, unknown arguments, and overwrite attempts", async () => {
    const outputPath = join(directory, "argv-rejected.aura");
    const argvSecret = "argv-secret-fixture";
    const argvResult = await runBackup(
      [
        "encrypt",
        "--write",
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--passphrase",
        argvSecret,
      ],
      undefined,
    );
    expect(argvResult.code).not.toBe(0);
    expect(`${argvResult.stdout}\n${argvResult.stderr}`).not.toContain(argvSecret);

    const unknownResult = await runBackup(
      ["encrypt", "--write", "--input", inputPath, "--output", outputPath, "--unknown"],
      undefined,
    );
    expect(unknownResult.code).not.toBe(0);

    const existing = Buffer.from("must-not-be-overwritten");
    await writeFile(outputPath, existing, { mode: 0o600 });
    const overwriteResult = await runBackup(
      ["encrypt", "--write", "--input", inputPath, "--output", outputPath],
      writeMode("overwrite-passphrase-fixture"),
    );
    expect(overwriteResult.code).not.toBe(0);
    expect(await readFile(outputPath)).toEqual(existing);
  });

  it("keeps an existing decrypt destination unchanged", async () => {
    const encryptedPath = await encryptFixture(directory, inputPath, "decrypt-no-overwrite-passphrase");
    const outputPath = join(directory, "existing-restored.dump");
    const existing = Buffer.from("existing-destination-bytes");
    await writeFile(outputPath, existing, { mode: 0o600 });

    const result = await runBackup(
      ["decrypt", "--write", "--input", encryptedPath, "--output", outputPath],
      writeMode("decrypt-no-overwrite-passphrase"),
    );
    expect(result.code).not.toBe(0);
    expect(await readFile(outputPath)).toEqual(existing);
  });

  it("rejects an output symlink and a symlinked output parent", async () => {
    const outputTarget = join(directory, "output-target.dump");
    const outputLink = join(directory, "output-link.dump");
    await writeFile(outputTarget, Buffer.from("target"), { mode: 0o600 });
    try {
      await symlink(outputTarget, outputLink);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw error;
    }

    const outputResult = await runBackup(
      ["encrypt", "--dry-run", "--input", inputPath, "--output", outputLink],
      undefined,
    );
    expect(outputResult.code).not.toBe(0);
    expect(await readFile(outputTarget)).toEqual(Buffer.from("target"));

    const realParent = join(directory, "real-parent");
    const linkedParent = join(directory, "linked-parent");
    await mkdir(realParent);
    try {
      await symlink(realParent, linkedParent, "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw error;
    }
    const parentResult = await runBackup(
      ["encrypt", "--dry-run", "--input", inputPath, "--output", join(linkedParent, "output.aura")],
      undefined,
    );
    expect(parentResult.code).not.toBe(0);
  });

  it("does not replace a destination created after initial validation", async () => {
    const raceInput = join(directory, "race-source.dump");
    const raceBytes = Buffer.alloc(8 * 1024 * 1024 + 31);
    for (let index = 0; index < raceBytes.length; index += 1) {
      raceBytes[index] = (index * 17 + 13) % 251;
    }
    await writeFile(raceInput, raceBytes, { mode: 0o600 });
    const outputPath = join(directory, "race-output.aura");
    const replacement = Buffer.from("destination-replacement-race");
    const result = await runBackup(
      ["encrypt", "--write", "--input", raceInput, "--output", outputPath],
      writeMode("race-passphrase"),
      false,
      { outputPath, replacement },
    );

    expect(result.code).not.toBe(0);
    expect(await readFile(outputPath)).toEqual(replacement);
  });

  it("rejects malformed and truncated container boundaries before publishing", async () => {
    const encryptedPath = await encryptFixture(directory, inputPath, "malformed-container-passphrase");
    const valid = await readFile(encryptedPath);
    const { dataStart } = containerLayout(valid);
    const ciphertext = valid.subarray(dataStart, -16);
    const tag = valid.subarray(-16);
    const malformedCases: Array<[string, Buffer]> = [
      ["truncated-prefix", valid.subarray(0, 7)],
      ["bad-magic", Buffer.concat([Buffer.from("BADMAGIC"), valid.subarray(8)])],
      ["zero-header-length", (() => {
        const bytes = Buffer.from(valid);
        bytes.writeUInt32BE(0, 8);
        return bytes;
      })()],
      ["truncated-header", valid.subarray(0, dataStart - 1)],
      ["missing-tag", valid.subarray(0, -16)],
      ["truncated-ciphertext", Buffer.concat([valid.subarray(0, dataStart), ciphertext.subarray(0, -1), tag])],
      ["malformed-json-header", (() => {
        const bytes = Buffer.from(valid);
        const malformedHeader = Buffer.from("{\"version\":", "utf8");
        const prefix = Buffer.alloc(12);
        Buffer.from("AURABKP1", "ascii").copy(prefix);
        prefix.writeUInt32BE(malformedHeader.length, 8);
        return Buffer.concat([prefix, malformedHeader, valid.subarray(dataStart)]);
      })()],
    ];

    for (const [name, bytes] of malformedCases) {
      const malformedPath = join(directory, `${name}.aura`);
      const outputPath = join(directory, `${name}.dump`);
      await writeFile(malformedPath, bytes, { mode: 0o600 });
      const result = await runBackup(
        ["decrypt", "--write", "--input", malformedPath, "--output", outputPath],
        writeMode("malformed-container-passphrase"),
      );
      expect(result.code, name).not.toBe(0);
      await expect(stat(outputPath), name).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("rejects duplicate JSON header keys before authentication", async () => {
    const encryptedPath = await encryptFixture(directory, inputPath, "duplicate-header-passphrase");
    const valid = await readFile(encryptedPath);
    const { headerLength, dataStart } = containerLayout(valid);
    const headerText = valid.subarray(12, 12 + headerLength).toString("utf8");
    const duplicateHeader = Buffer.from(
      headerText.replace('{"version":1,', '{"version":1,"version":1,'),
      "utf8",
    );
    const prefix = Buffer.alloc(12);
    Buffer.from("AURABKP1", "ascii").copy(prefix);
    prefix.writeUInt32BE(duplicateHeader.length, 8);
    const malformedPath = join(directory, "duplicate-header.aura");
    const outputPath = join(directory, "duplicate-header.dump");
    await writeFile(
      malformedPath,
      Buffer.concat([prefix, duplicateHeader, valid.subarray(dataStart)]),
      { mode: 0o600 },
    );

    const result = await runBackup(
      ["decrypt", "--write", "--input", malformedPath, "--output", outputPath],
      writeMode("duplicate-header-passphrase"),
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("reason=header");
    await expect(stat(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects invalid scrypt parameters before attempting decryption", async () => {
    const encryptedPath = await encryptFixture(directory, inputPath, "invalid-kdf-passphrase");
    const valid = await readFile(encryptedPath);
    const invalidParameters: Array<[string, Record<string, unknown>]> = [
      ["n-too-small", { N: 16_383 }],
      ["n-not-power-of-two", { N: 32_769 }],
      ["n-too-large", { N: 1_048_577 }],
      ["r-zero", { r: 0 }],
      ["p-too-large", { p: 17 }],
      ["memory-too-large", { N: 1_048_576, r: 32 }],
    ];

    for (const [name, changes] of invalidParameters) {
      const malformedPath = join(directory, `${name}.aura`);
      const outputPath = join(directory, `${name}.dump`);
      await writeFile(malformedPath, replaceHeader(valid, changes), { mode: 0o600 });
      const result = await runBackup(
        ["decrypt", "--write", "--input", malformedPath, "--output", outputPath],
        writeMode("invalid-kdf-passphrase"),
      );
      expect(result.code, name).not.toBe(0);
      await expect(stat(outputPath), name).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("rejects ciphertext length that disagrees with authenticated plaintext metadata", async () => {
    const encryptedPath = await encryptFixture(directory, inputPath, "length-mismatch-passphrase");
    const valid = await readFile(encryptedPath);
    const { headerLength } = containerLayout(valid);
    const header = JSON.parse(valid.subarray(12, 12 + headerLength).toString("utf8"));
    const malformedPath = join(directory, "length-mismatch.aura");
    const outputPath = join(directory, "length-mismatch.dump");
    await writeFile(
      malformedPath,
      replaceHeader(valid, { plaintextBytes: (BigInt(header.plaintextBytes) + 1n).toString() }),
      { mode: 0o600 },
    );

    const result = await runBackup(
      ["decrypt", "--write", "--input", malformedPath, "--output", outputPath],
      writeMode("length-mismatch-passphrase"),
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("reason=length");
    await expect(stat(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a group/world-writable output parent on POSIX", async () => {
    if (process.platform === "win32") return;
    const writableParent = join(directory, "writable-parent");
    await mkdir(writableParent, { mode: 0o700 });
    await chmod(writableParent, 0o777);
    const result = await runBackup(
      ["encrypt", "--dry-run", "--input", inputPath, "--output", join(writableParent, "out.aura")],
      undefined,
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("reason=output-parent-permissions");
  });

  it("rejects symlink inputs", async () => {
    const symlinkPath = join(directory, "source-link.dump");
    try {
      await symlink(inputPath, symlinkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw error;
    }
    const result = await runBackup(
      ["encrypt", "--dry-run", "--input", symlinkPath, "--output", join(directory, "link.aura")],
      undefined,
    );
    expect(result.code).not.toBe(0);
  });
});
