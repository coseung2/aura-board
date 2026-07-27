#!/usr/bin/env node

/**
 * Publish the slime art in `public/creatures/slimes` to Supabase Storage as an
 * immutable, content-addressed release.
 *
 * Why a release hash rather than uploading over the previous files: a CDN and a
 * mobile disk cache both key on URL. Overwriting an object at a stable URL leaves
 * clients on whatever they already cached, sometimes for as long as the TTL. A
 * new prefix per release makes every change a new URL, which is what makes a
 * one-year immutable cache safe.
 *
 * The release id is a hash of the manifest, so identical inputs republish to the
 * same prefix and the upload becomes a no-op. Rolling back is selecting the
 * previous release id in `NEXT_PUBLIC_SLIME_ASSET_RELEASE`; nothing is deleted.
 *
 * Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Those are read from the
 * environment and never logged.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(projectRoot, "public", "creatures", "slimes");

const DEFAULT_BUCKET = "aura-static-assets";
/** Objects live under this prefix so the bucket can host other asset families. */
const OBJECT_NAMESPACE = "slimes/releases";
/** One year, matching the immutable cache policy these paths are eligible for. */
const CACHE_CONTROL_SECONDS = "31536000";

const CONTENT_TYPES = {
  ".gif": "image/gif",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
};

const toPosix = (value) => value.split(path.sep).join("/");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function walk(root) {
  const found = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(child)));
    else if (entry.isFile()) found.push(child);
  }
  return found;
}

/**
 * Build the manifest and derive the release id from it.
 *
 * The id covers every path and every content hash, so adding, removing, or
 * changing a single byte produces a different release.
 */
async function buildManifest() {
  const files = (await walk(assetRoot)).sort();
  const entries = [];
  for (const filePath of files) {
    const relative = toPosix(path.relative(assetRoot, filePath));
    const extension = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) {
      throw new Error(`Unsupported asset type for publishing: ${relative}`);
    }
    const buffer = await fs.readFile(filePath);
    entries.push({
      path: relative,
      bytes: buffer.length,
      sha256: sha256(buffer),
      contentType,
    });
  }
  if (entries.length === 0) throw new Error(`No assets found under ${assetRoot}`);

  const fingerprint = sha256(
    Buffer.from(entries.map((entry) => `${entry.path}:${entry.sha256}`).join("\n"), "utf8"),
  );
  return {
    release: fingerprint.slice(0, 16),
    fingerprint,
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    files: entries,
  };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.error(
      "Usage: node scripts/publish-slime-assets.mjs [--dry-run] [--bucket <name>]\n" +
        "Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    return;
  }
  const dryRun = argv.includes("--dry-run");
  const bucketIndex = argv.indexOf("--bucket");
  const bucket = bucketIndex >= 0 ? argv[bucketIndex + 1] : DEFAULT_BUCKET;
  if (!bucket) throw new Error("--bucket requires a value");

  const manifest = await buildManifest();
  const prefix = `${OBJECT_NAMESPACE}/${manifest.release}`;

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          bucket,
          release: manifest.release,
          prefix,
          fileCount: manifest.fileCount,
          totalMiB: Number((manifest.totalBytes / 1024 / 1024).toFixed(2)),
          largest: manifest.files
            .slice()
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 5)
            .map((entry) => ({ path: entry.path, kiB: Math.round(entry.bytes / 1024) })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to publish");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = client.storage.from(bucket);

  let uploaded = 0;
  let skipped = 0;
  for (const entry of manifest.files) {
    const objectPath = `${prefix}/${entry.path}`;
    const buffer = await fs.readFile(path.join(assetRoot, ...entry.path.split("/")));
    const { error } = await storage.upload(objectPath, buffer, {
      contentType: entry.contentType,
      cacheControl: CACHE_CONTROL_SECONDS,
      // Release prefixes are immutable, so an existing object is already correct.
      upsert: false,
    });
    if (!error) {
      uploaded += 1;
      continue;
    }
    const alreadyPresent =
      error.message?.toLowerCase().includes("already exists") || error.statusCode === "409";
    if (!alreadyPresent) {
      throw new Error(`Upload failed for ${objectPath}: ${error.message}`);
    }
    skipped += 1;
  }

  const manifestPath = `${prefix}/manifest.json`;
  const { error: manifestError } = await storage.upload(
    manifestPath,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    { contentType: "application/json", cacheControl: CACHE_CONTROL_SECONDS, upsert: true },
  );
  if (manifestError) throw new Error(`Manifest upload failed: ${manifestError.message}`);

  // Written locally too, so a rollback can name a previous release without
  // querying storage.
  const localManifestDir = path.join(projectRoot, "assets-source", "slime-releases");
  await fs.mkdir(localManifestDir, { recursive: true });
  await fs.writeFile(
    path.join(localManifestDir, `${manifest.release}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const publicBase = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}`;
  console.log(
    JSON.stringify(
      {
        mode: "publish",
        bucket,
        release: manifest.release,
        prefix,
        uploaded,
        skippedAlreadyPresent: skipped,
        totalMiB: Number((manifest.totalBytes / 1024 / 1024).toFixed(2)),
        verifySample: `${publicBase}/${prefix}/${manifest.files[0].path}`,
        nextStep:
          "Set NEXT_PUBLIC_SLIME_ASSET_BASE_URL to the public bucket base and " +
          `NEXT_PUBLIC_SLIME_ASSET_RELEASE to ${manifest.release}, then redeploy.`,
        envHints: {
          NEXT_PUBLIC_SLIME_ASSET_BASE_URL: publicBase,
          NEXT_PUBLIC_SLIME_ASSET_RELEASE: manifest.release,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { buildManifest, main };
