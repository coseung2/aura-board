#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

const PAGE_16K = 16 * 1024;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const parsed = { buildDir: "", sdkRoot: "", artifacts: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--build-dir") {
      parsed.buildDir = argv[++index] ?? "";
    } else if (current === "--sdk-root") {
      parsed.sdkRoot = argv[++index] ?? "";
    } else if (current === "--artifact") {
      const artifact = argv[++index] ?? "";
      if (artifact) parsed.artifacts.push(artifact);
    } else {
      fail(`Unknown release-check argument: ${current}`);
    }
  }
  if (!parsed.buildDir) fail("--build-dir is required");
  if (!parsed.sdkRoot) fail("--sdk-root is required");
  return parsed;
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} not found: ${filePath}`);
  return filePath;
}

function assertReleaseOptimizationConfig(buildDir) {
  const propertiesPath = requireFile(
    path.join(buildDir, "android", "gradle.properties"),
    "Generated Android gradle.properties",
  );
  const properties = fs.readFileSync(propertiesPath, "utf8");
  for (const required of [
    "android.enableMinifyInReleaseBuilds=true",
    "android.enableShrinkResourcesInReleaseBuilds=true",
  ]) {
    const escaped = required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^${escaped}\\s*$`, "m").test(properties)) {
      fail(
        `Play optimization gate failed: missing ${required} in generated gradle.properties.`,
      );
    }
  }

  const buildGradlePath = requireFile(
    path.join(buildDir, "android", "app", "build.gradle"),
    "Generated Android app build.gradle",
  );
  const buildGradle = fs.readFileSync(buildGradlePath, "utf8");
  if (!/minifyEnabled/.test(buildGradle)) {
    fail(
      "Play optimization gate failed: release build.gradle does not configure minifyEnabled.",
    );
  }
  if (!/shrinkResources/.test(buildGradle)) {
    fail(
      "Play optimization gate failed: release build.gradle does not configure shrinkResources.",
    );
  }

  const manifestPath = requireFile(
    path.join(buildDir, "android", "app", "src", "main", "AndroidManifest.xml"),
    "Generated Android main manifest",
  );
  const manifest = fs.readFileSync(manifestPath, "utf8");
  if (!/<application\b[^>]*android:resizeableActivity="true"/s.test(manifest)) {
    fail(
      "Large-screen gate failed: generated application must set android:resizeableActivity=\"true\".",
    );
  }
  for (const restrictedAttribute of [
    "android:screenOrientation",
    "android:maxAspectRatio",
    "android:minAspectRatio",
  ]) {
    if (manifest.includes(`${restrictedAttribute}=`)) {
      fail(
        `Large-screen gate failed: generated manifest still contains ${restrictedAttribute}.`,
      );
    }
  }
  if (/android:resizeableActivity="false"/.test(manifest)) {
    fail(
      'Large-screen gate failed: generated manifest contains android:resizeableActivity="false".',
    );
  }
}

function findEocd(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  fail("ZIP end-of-central-directory record not found");
}

function readZipEntries(filePath) {
  const archive = fs.readFileSync(filePath);
  const eocd = findEocd(archive);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    fail(`ZIP64 release artifacts are not supported by this verifier: ${filePath}`);
  }
  if (centralOffset + centralSize > archive.length) {
    fail(`Malformed ZIP central directory: ${filePath}`);
  }

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      fail(`Malformed ZIP central directory entry ${index}: ${filePath}`);
    }
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      fail(`ZIP64 entry is not supported by this verifier: ${filePath}`);
    }
    const fileName = archive
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString(flags & 0x0800 ? "utf8" : "utf8");
    entries.push({
      fileName,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return { archive, entries };
}

function readZipEntry(zip, entry) {
  const { archive } = zip;
  const offset = entry.localOffset;
  if (archive.readUInt32LE(offset) !== 0x04034b50) {
    fail(`Malformed ZIP local entry: ${entry.fileName}`);
  }
  const fileNameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > archive.length) fail(`Truncated ZIP entry: ${entry.fileName}`);
  const compressed = archive.subarray(dataOffset, dataEnd);
  let output;
  if (entry.method === 0) {
    output = Buffer.from(compressed);
  } else if (entry.method === 8) {
    output = inflateRawSync(compressed);
  } else {
    fail(
      `Unsupported ZIP compression method ${entry.method} for ${entry.fileName}`,
    );
  }
  if (output.length !== entry.uncompressedSize) {
    fail(`Unexpected uncompressed size for ${entry.fileName}`);
  }
  return output;
}

function readVarint(buffer, state, limit) {
  let value = 0n;
  let shift = 0n;
  while (state.offset < limit && shift <= 63n) {
    const current = buffer[state.offset++];
    value |= BigInt(current & 0x7f) << shift;
    if ((current & 0x80) === 0) return value;
    shift += 7n;
  }
  fail("Malformed protobuf varint in BundleConfig.pb");
}

function findProtoField(buffer, start, length, fieldNumber) {
  const state = { offset: start };
  const limit = start + length;
  while (state.offset < limit) {
    const key = readVarint(buffer, state, limit);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (wire === 0) {
      const value = readVarint(buffer, state, limit);
      if (field === fieldNumber) return { wire, value };
    } else if (wire === 1) {
      if (field === fieldNumber) {
        fail(`Unexpected fixed64 wire type for protobuf field ${fieldNumber}`);
      }
      state.offset += 8;
    } else if (wire === 2) {
      const rawLength = readVarint(buffer, state, limit);
      if (rawLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail("BundleConfig.pb field is too large");
      }
      const payloadLength = Number(rawLength);
      const payloadStart = state.offset;
      if (payloadStart + payloadLength > limit) {
        fail("Malformed length-delimited field in BundleConfig.pb");
      }
      if (field === fieldNumber) {
        return { wire, start: payloadStart, length: payloadLength };
      }
      state.offset += payloadLength;
    } else if (wire === 5) {
      if (field === fieldNumber) {
        fail(`Unexpected fixed32 wire type for protobuf field ${fieldNumber}`);
      }
      state.offset += 4;
    } else {
      fail(`Unsupported protobuf wire type ${wire} in BundleConfig.pb`);
    }
    if (state.offset > limit) fail("Malformed protobuf field in BundleConfig.pb");
  }
  return null;
}

function assertAabPageAlignment16K(filePath, zip) {
  const configEntry = zip.entries.find((entry) => entry.fileName === "BundleConfig.pb");
  if (!configEntry) fail(`BundleConfig.pb not found in AAB: ${filePath}`);
  const bytes = readZipEntry(zip, configEntry);
  const optimizations = findProtoField(bytes, 0, bytes.length, 2);
  if (!optimizations || optimizations.wire !== 2) {
    fail("16 KB gate failed: BundleConfig.optimizations is missing");
  }
  const nativeLibraries = findProtoField(
    bytes,
    optimizations.start,
    optimizations.length,
    2,
  );
  if (!nativeLibraries || nativeLibraries.wire !== 2) {
    fail(
      "16 KB gate failed: uncompress_native_libraries is missing from BundleConfig.pb",
    );
  }
  const enabled = findProtoField(
    bytes,
    nativeLibraries.start,
    nativeLibraries.length,
    1,
  );
  const alignment = findProtoField(
    bytes,
    nativeLibraries.start,
    nativeLibraries.length,
    2,
  );
  if (!enabled || enabled.wire !== 0 || enabled.value !== 1n) {
    fail(
      "16 KB gate failed: App Bundle does not enable uncompressed native libraries",
    );
  }
  if (!alignment || alignment.wire !== 0 || alignment.value !== 2n) {
    fail(
      `16 KB gate failed: App Bundle page alignment is ${alignment?.value ?? "missing"}, expected PAGE_ALIGNMENT_16K (2)`,
    );
  }
}

function readUInt64LE(buffer, offset) {
  return Number(buffer.readBigUInt64LE(offset));
}

function assertElfLoadAlignment16K(filePath, zip) {
  const nativeEntries = zip.entries.filter((entry) =>
    /(^|\/)lib\/[^/]+\/[^/]+\.so$/.test(entry.fileName),
  );
  for (const entry of nativeEntries) {
    const bytes = readZipEntry(zip, entry);
    if (
      bytes.length < 64 ||
      bytes[0] !== 0x7f ||
      bytes[1] !== 0x45 ||
      bytes[2] !== 0x4c ||
      bytes[3] !== 0x46
    ) {
      fail(`16 KB gate failed: invalid ELF native library: ${entry.fileName}`);
    }
    const elfClass = bytes[4];
    const elfData = bytes[5];
    if (elfData !== 1) {
      fail(`16 KB gate failed: non-little-endian ELF: ${entry.fileName}`);
    }

    let programHeaderOffset;
    let programHeaderEntrySize;
    let programHeaderCount;
    let alignOffset;
    let is64Bit;
    if (elfClass === 1) {
      programHeaderOffset = bytes.readUInt32LE(28);
      programHeaderEntrySize = bytes.readUInt16LE(42);
      programHeaderCount = bytes.readUInt16LE(44);
      alignOffset = 28;
      is64Bit = false;
    } else if (elfClass === 2) {
      programHeaderOffset = readUInt64LE(bytes, 32);
      programHeaderEntrySize = bytes.readUInt16LE(54);
      programHeaderCount = bytes.readUInt16LE(56);
      alignOffset = 48;
      is64Bit = true;
    } else {
      fail(`16 KB gate failed: unsupported ELF class ${elfClass}: ${entry.fileName}`);
    }

    for (let index = 0; index < programHeaderCount; index += 1) {
      const headerOffset =
        programHeaderOffset + index * programHeaderEntrySize;
      if (headerOffset + programHeaderEntrySize > bytes.length) {
        fail(`16 KB gate failed: malformed ELF headers: ${entry.fileName}`);
      }
      if (bytes.readUInt32LE(headerOffset) !== 1) continue;
      const segmentAlignment = is64Bit
        ? readUInt64LE(bytes, headerOffset + alignOffset)
        : bytes.readUInt32LE(headerOffset + alignOffset);
      if (segmentAlignment < PAGE_16K) {
        fail(
          `16 KB gate failed: ${entry.fileName} has PT_LOAD alignment ${segmentAlignment} bytes`,
        );
      }
    }
  }
  console.log(
    `16 KB ELF alignment check passed for ${nativeEntries.length} native libraries in ${path.basename(filePath)}.`,
  );
}

function versionParts(name) {
  return name.split(/[^0-9]+/).filter(Boolean).map(Number);
}

function compareVersionNames(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right);
}

function resolveZipAlign(sdkRoot) {
  const buildToolsRoot = path.join(sdkRoot, "build-tools");
  if (!fs.existsSync(buildToolsRoot)) return null;
  const executable = process.platform === "win32" ? "zipalign.exe" : "zipalign";
  const directories = fs
    .readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => compareVersionNames(right, left));
  for (const directory of directories) {
    const candidate = path.join(buildToolsRoot, directory, executable);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function assertApkZipAlignment16K(filePath, sdkRoot) {
  const zipalign = resolveZipAlign(sdkRoot);
  if (!zipalign) {
    fail(
      `16 KB gate failed: zipalign was not found under ${path.join(sdkRoot, "build-tools")}`,
    );
  }
  const result = spawnSync(zipalign, ["-c", "-P", "16", "-v", "4", filePath], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`16 KB gate failed: zipalign -P 16 verification failed for ${filePath}`);
  }
}

function assertR8Mapping(buildDir) {
  const mappingPath = requireFile(
    path.join(
      buildDir,
      "android",
      "app",
      "build",
      "outputs",
      "mapping",
      "release",
      "mapping.txt",
    ),
    "R8 release mapping",
  );
  if (fs.statSync(mappingPath).size <= 0) {
    fail(`Play optimization gate failed: R8 mapping is empty: ${mappingPath}`);
  }
  console.log(`R8 release mapping verified: ${mappingPath}`);
}

function verifyArtifact(filePath, sdkRoot) {
  requireFile(filePath, "Release artifact");
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== ".aab" && extension !== ".apk") {
    fail(`Unsupported Android release artifact: ${filePath}`);
  }
  const zip = readZipEntries(filePath);
  if (extension === ".aab") {
    assertAabPageAlignment16K(filePath, zip);
  } else {
    assertApkZipAlignment16K(filePath, sdkRoot);
  }
  assertElfLoadAlignment16K(filePath, zip);
  console.log(`${extension.slice(1).toUpperCase()} 16 KB page-size gate passed: ${filePath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertReleaseOptimizationConfig(args.buildDir);
  if (args.artifacts.length > 0) {
    assertR8Mapping(args.buildDir);
    for (const artifact of args.artifacts) verifyArtifact(artifact, args.sdkRoot);
  }
  console.log("Android Play release checks passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
