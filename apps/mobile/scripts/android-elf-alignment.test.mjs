import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAndroidElfAlignment } from "./android-elf-alignment.mjs";

function elf(is64Bit, alignment) {
  const headerSize = is64Bit ? 64 : 52;
  const entrySize = is64Bit ? 56 : 32;
  const bytes = Buffer.alloc(headerSize + entrySize);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, is64Bit ? 2 : 1, 1]);
  if (is64Bit) bytes.writeBigUInt64LE(BigInt(headerSize), 32);
  else bytes.writeUInt32LE(headerSize, 28);
  bytes.writeUInt16LE(entrySize, is64Bit ? 54 : 42);
  bytes.writeUInt16LE(1, is64Bit ? 56 : 44);
  bytes.writeUInt32LE(1, headerSize);
  if (is64Bit) bytes.writeBigUInt64LE(BigInt(alignment), headerSize + 48);
  else bytes.writeUInt32LE(alignment, headerSize + 28);
  return bytes;
}

for (const abi of ["armeabi-v7a", "x86"]) {
  test(`${abi}: accepts legacy 4 KB libraries without removing 32-bit tablets`, () => {
    assert.doesNotThrow(() => assertAndroidElfAlignment(elf(false, 4096), `lib/${abi}/libimage.so`));
  });
  test(`${abi}: rejects insufficient 32-bit alignment`, () => {
    assert.throws(() => assertAndroidElfAlignment(elf(false, 1024), `lib/${abi}/libimage.so`), /PT_LOAD alignment/);
  });
}
for (const abi of ["arm64-v8a", "x86_64"]) {
  for (const alignment of [16384, 65536]) {
    test(`${abi}: accepts ${alignment}-byte aligned libraries`, () => {
      assert.doesNotThrow(() => assertAndroidElfAlignment(elf(true, alignment), `base/lib/${abi}/libimage.so`));
    });
  }
  test(`${abi}: still rejects 4 KB alignment on 64-bit libraries`, () => {
    assert.throws(() => assertAndroidElfAlignment(elf(true, 4096), `lib/${abi}/libimage.so`), /expected a power of two >= 16384/);
  });
}

test("rejects a 32-bit ELF disguised as a 64-bit ABI", () => {
  assert.throws(() => assertAndroidElfAlignment(elf(false, 4096), "lib/arm64-v8a/libimage.so"), /does not match/);
});
test("rejects non-power-of-two alignment", () => {
  assert.throws(() => assertAndroidElfAlignment(elf(true, 20000), "lib/arm64-v8a/libimage.so"), /power of two/);
});
test("rejects truncated and malformed ELF rather than silently bypassing the gate", () => {
  const path = "lib/arm64-v8a/libimage.so";
  assert.throws(() => assertAndroidElfAlignment(Buffer.alloc(12), path), /invalid ELF/);
  assert.throws(() => assertAndroidElfAlignment(elf(true, 16384).subarray(0, 60), path), /truncated ELF/);
  const malformed = elf(true, 16384);
  malformed.writeUInt16LE(100, 56);
  assert.throws(() => assertAndroidElfAlignment(malformed, path), /malformed program headers/);
});
test("rejects missing load segments and wrong endianness", () => {
  const path = "lib/arm64-v8a/libimage.so";
  const noLoad = elf(true, 16384);
  noLoad.writeUInt32LE(0, 64);
  assert.throws(() => assertAndroidElfAlignment(noLoad, path), /no PT_LOAD/);
  const wrongEndian = elf(true, 16384);
  wrongEndian[5] = 2;
  assert.throws(() => assertAndroidElfAlignment(wrongEndian, path), /non-little-endian/);
});
