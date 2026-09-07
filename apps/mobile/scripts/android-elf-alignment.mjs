// Android's 16 KB requirement concerns the 64-bit ABIs. Keep legacy 32-bit
// tablets supported rather than rejecting their correctly 4 KB-aligned libs.
// https://android.googlesource.com/platform/ndk/+/master/docs/BuildSystemMaintainers.md#page-sizes
export function assertAndroidElfAlignment(bytes, fileName) {
  const fail = (message) => { throw new Error(`ELF alignment gate failed: ${fileName}: ${message}`); };
  if (bytes.length < 16 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
    fail("invalid ELF native library");
  }
  const elfClass = bytes[4];
  if (elfClass !== 1 && elfClass !== 2) fail(`unsupported ELF class ${elfClass}`);
  if (bytes[5] !== 1) fail("non-little-endian ELF");
  const is64Bit = elfClass === 2;
  const headerSize = is64Bit ? 64 : 52;
  const entryMinimumSize = is64Bit ? 56 : 32;
  if (bytes.length < headerSize) fail("truncated ELF header");
  const abi = fileName.split("/").at(-2);
  if ((["arm64-v8a", "x86_64"].includes(abi) && !is64Bit) ||
      (["armeabi-v7a", "x86"].includes(abi) && is64Bit)) {
    fail("ELF class does not match the packaged ABI");
  }
  const offset = is64Bit ? Number(bytes.readBigUInt64LE(32)) : bytes.readUInt32LE(28);
  const entrySize = bytes.readUInt16LE(is64Bit ? 54 : 42);
  const count = bytes.readUInt16LE(is64Bit ? 56 : 44);
  if (!Number.isSafeInteger(offset) || offset < headerSize || entrySize < entryMinimumSize || count === 0 || offset + entrySize * count > bytes.length) {
    fail("malformed program headers");
  }
  const minimumAlignment = is64Bit ? 16_384n : 4_096n;
  let loadSegments = 0;
  for (let index = 0; index < count; index += 1) {
    const headerOffset = offset + index * entrySize;
    if (bytes.readUInt32LE(headerOffset) !== 1) continue;
    loadSegments += 1;
    const alignment = is64Bit ? bytes.readBigUInt64LE(headerOffset + 48) : BigInt(bytes.readUInt32LE(headerOffset + 28));
    if (alignment < minimumAlignment || (alignment & (alignment - 1n)) !== 0n) {
      fail(`PT_LOAD alignment ${alignment} bytes; expected a power of two >= ${minimumAlignment}`);
    }
  }
  if (loadSegments === 0) fail("no PT_LOAD segments");
}
