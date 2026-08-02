import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const entryPoint = join(projectRoot, "src", "lib", "song-guess", "audio.ts");
const chromePath = findChrome();
if (!chromePath) {
  throw new Error("Headless Chrome or Edge was not found. Set CHROME_PATH to run this check.");
}

const bundle = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: "iife",
  globalName: "AuraSongGuessAudio",
  platform: "browser",
  target: ["chrome120"],
  write: false,
  logLevel: "silent",
});
const browserModule = bundle.outputFiles[0]?.text;
if (!browserModule) throw new Error("Song Guess audio browser bundle was empty.");

const report = createDeferred();
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderPage(browserModule));
    return;
  }
  if (request.method === "POST" && request.url === "/report") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        report.resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.writeHead(204).end();
      } catch (error) {
        report.reject(error);
        response.writeHead(400).end();
      }
    });
    return;
  }
  response.writeHead(404).end();
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser smoke server did not bind.");

const profileDir = await mkdtemp(join(tmpdir(), "aura-song-guess-browser-"));
const browser = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=user-gesture-required",
    `--user-data-dir=${profileDir}`,
    `http://127.0.0.1:${address.port}/`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let browserError = "";
browser.stderr.setEncoding("utf8");
browser.stderr.on("data", (chunk) => {
  browserError += chunk;
});

const timeout = setTimeout(() => {
  report.reject(new Error("Timed out waiting for the browser audio report."));
}, 30_000);

try {
  const result = await report.promise;
  if (!result || result.ok !== true) {
    throw new Error(result?.error || "Browser audio verification failed without a report.");
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (browserError.trim()) console.error(browserError.trim());
  throw error;
} finally {
  clearTimeout(timeout);
  browser.kill();
  await new Promise((resolveExit) => {
    if (browser.exitCode !== null) return resolveExit();
    browser.once("exit", resolveExit);
    setTimeout(resolveExit, 2_000).unref();
  });
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profileDir, { recursive: true, force: true });
}

function renderPage(moduleSource) {
  const escapedModule = moduleSource.replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Song Guess browser verification</title></head>
<body>
<script>${escapedModule}</script>
<script>
(async () => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const ascii = (bytes, offset, length) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  let context;
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    const source = context.createBuffer(2, 48000 * 3, 48000);
    const left = source.getChannelData(0);
    const right = source.getChannelData(1);
    for (let frame = 0; frame < source.length; frame += 1) {
      const time = frame / source.sampleRate;
      left[frame] = Math.sin(2 * Math.PI * 440 * time) * 0.45;
      right[frame] = Math.sin(2 * Math.PI * 660 * time) * 0.25;
    }

    const clips = AuraSongGuessAudio.createSongGuessWavClips(source, 0.25);
    assert(clips.length === 3, "Expected exactly three derivative clips.");
    const expected = new Map([[500, 44144], [1000, 88244], [1500, 132344]]);
    const decoded = [];
    for (const clip of clips) {
      const view = new DataView(clip.bytes.buffer, clip.bytes.byteOffset, clip.bytes.byteLength);
      assert(clip.mimeType === "audio/wav", "Derivative MIME must be audio/wav.");
      assert(clip.bytes.byteLength === expected.get(clip.tierMs), "Unexpected WAV byte length.");
      assert(ascii(clip.bytes, 0, 4) === "RIFF", "Missing RIFF header.");
      assert(ascii(clip.bytes, 8, 4) === "WAVE", "Missing WAVE header.");
      assert(ascii(clip.bytes, 36, 4) === "data", "Missing data chunk.");
      assert(view.getUint16(22, true) === 1, "WAV must be mono.");
      assert(view.getUint32(24, true) === 44100, "WAV must use 44.1 kHz PCM.");
      assert(view.getUint16(34, true) === 16, "WAV must use 16-bit PCM.");
      assert(view.getUint32(40, true) === clip.bytes.byteLength - 44, "WAV data length mismatch.");

      const blob = new Blob([clip.bytes.slice()], { type: clip.mimeType });
      const objectUrl = URL.createObjectURL(blob);
      URL.revokeObjectURL(objectUrl);
      const decodedClip = await context.decodeAudioData(await blob.arrayBuffer());
      const expectedDuration = clip.tierMs / 1000;
      assert(decodedClip.numberOfChannels === 1, "Browser decoded a non-mono derivative.");
      assert(Math.abs(decodedClip.duration - expectedDuration) < 0.002, "Decoded duration mismatch.");
      decoded.push({
        tierMs: clip.tierMs,
        byteLength: clip.bytes.byteLength,
        decodedDuration: decodedClip.duration,
        decodedSampleRate: decodedClip.sampleRate,
      });
    }
    await fetch("/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        browserSampleRate: context.sampleRate,
        sourceChannels: source.numberOfChannels,
        startSeconds: 0.25,
        autoplayAttempted: false,
        decoded,
      }),
    });
  } catch (error) {
    await fetch("/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error) }),
    });
  } finally {
    if (context) await context.close();
  }
})();
</script>
</body>
</html>`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : null,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : null,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : null,
    process.platform === "win32" ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  for (const command of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const lookup = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
      encoding: "utf8",
    });
    const resolved = lookup.status === 0 ? lookup.stdout.trim().split(/\r?\n/u)[0] : "";
    if (resolved) return resolved;
  }
  return null;
}

function createDeferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
