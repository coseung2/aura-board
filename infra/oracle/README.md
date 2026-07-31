# Oracle Cloud backup preparation

This directory is a preparation skeleton for a daily logical backup from Supabase Postgres to a private OCI Object Storage bucket. Supabase remains the system of record. Oracle stores a backup copy and may host long-running workers separately; it does not become the primary database.

The target compute plan is one `VM.Standard.A1.Flex` instance with **2 OCPUs and 12 GB RAM** in the tenancy home region, Japan Central (Osaka), `ap-osaka-1`. This uses the full Always Free Ampere A1 allowance as a single ARM64 worker. It replaces the legacy two 1 GB AMD micro instances after validation; it is a cross-tenancy blue/green replacement, not an in-place resize or a reuse of the old network/IAM configuration.

Nothing in this repository creates OCI resources, logs in to OCI, deploys the service, or runs a real backup. Perform those actions only after an infrastructure review.

## Prerequisites

- One OCI Ampere A1 Compute instance in the Osaka home region (`ap-osaka-1`), shape `VM.Standard.A1.Flex`, configured with 2 OCPUs and 12 GB RAM, plus dedicated `aura-backup` and `aura-media` system users and groups.
- Node.js 22 for Linux ARM64. Install dependencies and run `prisma generate` on the A1 itself; never copy `node_modules` or generated native binaries from an AMD64 host.
- ARM64-compatible PostgreSQL 17 client, OCI CLI, and future FFmpeg binaries. Do not copy x86_64 binaries from the old 1 GB instances.
- PostgreSQL 17 client tools (`pg_dump` and `pg_restore`). Keep the client major version compatible with or newer than the Supabase server version.
- OCI CLI with instance-principal authentication available to the service user. No API signing-key file is needed.
- A private Object Storage bucket. OCI Object Storage encrypts data at rest with AES-256 by default.
- Network access from the Compute instance to Supabase Postgres and OCI Object Storage.

After the A1 instance exists and its OCID is verified, place that one instance in a dynamic group and create the bucket-scoped policy. These resources do not exist yet because their matching rule depends on the future instance OCID. Replace every placeholder below with reviewed tenancy values; OCI policy syntax and supported bucket conditions can vary by tenancy configuration.

```text
Allow dynamic-group <BACKUP_DYNAMIC_GROUP> to manage objects in compartment <BACKUP_COMPARTMENT> where target.bucket.name = '<PRIVATE_BACKUP_BUCKET>'
```

If your tenancy requires separate permissions to inspect the bucket or namespace, add only the minimum read permissions needed by the deployed OCI CLI workflow. Do not grant tenancy-wide object-management access.

Configure a bucket lifecycle policy for retention and expiry after recovery requirements are approved. The upload script never lists or deletes remote objects. Keep the bucket private and disable public access.

## A1 consolidation operating model

The old two-instance plan could isolate work by host. The single A1 plan must preserve that isolation in software:

- Keep backup, FFmpeg, and batch-mail work as separate systemd units, service users, working directories, and log streams. A failure or restart in one job must not implicitly enable another job.
- Treat GitHub Actions and Supabase as the schedule and queue sources of truth. The A1 instance is a pull worker, not a second application host or an independent scheduler.
- Start with one resource-intensive job at a time. Do not overlap FFmpeg with a backup write or restore rehearsal until measured CPU, memory, disk, and network headroom demonstrates that concurrency is safe.
- Add explicit systemd CPU/memory limits per worker after the first measured runs. The 12 GB total is shared capacity, not 12 GB guaranteed to every process.
- Install only ARM64-native packages and images. Rebuild or replace every x86_64 binary, container image, native Node module, PostgreSQL client, OCI CLI, and FFmpeg dependency before cutover.
- Treat the 50 GB boot volume as replaceable runtime storage. Upload durable backup artifacts to the private bucket and keep original application data in Supabase/Cloudflare; do not make local A1 files the only copy.
- Accept that one A1 is a worker single point of failure. If it is unavailable, pause Oracle jobs and recover or recreate the worker; the Vercel app, Supabase source data, Cloudflare media, and GitHub configuration must continue independently.

## Cross-tenancy replacement of the two 1 GB instances

Treat the move as a blue/green replacement, not an in-place upgrade:

1. Inventory both legacy instances before the old tenancy is removed: attached boot/block volumes, public/private IP dependencies, systemd units, cron entries, DNS, firewall rules, job ownership, and any data that is not reproducible from source control. Record configuration without copying secrets into this repository.
2. Keep both old instances running while requesting the Osaka A1 capacity in the new tenancy. An `out of host capacity` response is not a reason to terminate working instances; retry later in the home region. The new compartment, VCN, and bucket are independent replacements; the dynamic group and policy are created only after the new instance OCID exists.
3. Create one `VM.Standard.A1.Flex` instance at 2 OCPUs / 12 GB RAM with an Always Free-eligible ARM64 image. Confirm total boot/block volume allocation remains inside the tenancy allowance before provisioning.
4. Install this repository and ARM64-native dependencies on the A1 instance. Configure the dynamic group, private bucket policy, root-owned environment file, and systemd units without enabling the timer.
5. Run the script in its default dry-run mode, then perform one approved `--write` backup and an isolated restore rehearsal. Verify checksum, archive contents, logs, and Object Storage lifecycle policy.
6. Move roles rather than hosts: logical backup first, then batch mail, then FFmpeg/other long-running work. Move one job at a time, keep its old copy disabled while the new copy runs, and observe the A1 before moving the next job.
7. Stop the old instances before termination and retain rollback material for the approved observation window. Terminate them and remove obsolete volumes, IPs, IAM policies, and schedules only after the A1 backup and worker paths are proven.

The repository does not automate instance creation or termination. Record instance OCIDs and cutover evidence in the operator-owned handoff without placing them in source control if they are considered sensitive.

The capacity retry automation must perform a read-only guard before every attempt: confirm that no non-terminated `aura-board-worker-a1-osaka` instance and no associated boot volume already exists. Each five-hour wakeup may send exactly one A1 launch request. A verified successful launch permanently disables the retry automation before the dynamic group or policy is created, preventing a second instance from being requested.

## Installation layout

Install the repository backup files at these paths, matching the unit files:

```text
/opt/aura-board/infra/oracle/backup-supabase.sh
/etc/aura-board/oracle-backup.env
/etc/systemd/system/aura-supabase-backup.service
/etc/systemd/system/aura-supabase-backup.timer
/etc/aura-board/oracle-video-thumbnail.env
/etc/systemd/system/aura-video-thumbnail-backfill.service
/etc/tmpfiles.d/aura-board-workers.conf
```

The script and `/opt/aura-board/infra/oracle` should be owned by root and not writable by `aura-backup`. Create `/etc/aura-board/oracle-backup.env` from `oracle-backup.env.example`, replace placeholders outside source control, set ownership to `root:aura-backup`, and permissions to `0640`. Ensure the script is executable (`0755`). The script creates private temporary files under systemd's private temporary directory and removes them on exit.

Create `/etc/aura-board/oracle-video-thumbnail.env` from `oracle-video-thumbnail.env.example`, set ownership to `root:aura-media`, and permissions to `0640`. Store the values in Infisical under the operator-selected production environment at `/oracle/aura-board/video-thumbnail` with the names `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`. `AURA_FFMPEG_PATH=/usr/bin/ffmpeg` and optional exact `AURA_LEGACY_VIDEO_SOURCE_ORIGINS` are non-secret configuration. Keep backup secrets in the separate `/oracle/aura-board/backup` path. Do not copy either secret set into source control, cloud-init, instance metadata, or handoff logs.

Create the shared heavy-job lock before installing either unit. Install `aura-board-workers-tmpfiles.conf` as `/etc/tmpfiles.d/aura-board-workers.conf`:

```bash
sudo groupadd --system --force aura-workers
sudo usermod --append --groups aura-workers aura-backup
sudo usermod --append --groups aura-workers aura-media
sudo install -o root -g root -m 0644 \
  /opt/aura-board/infra/oracle/aura-board-workers-tmpfiles.conf \
  /etc/tmpfiles.d/aura-board-workers.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/aura-board-workers.conf
sudo -u aura-backup test -w /run/lock/aura-board-heavy.lock
sudo -u aura-media test -w /run/lock/aura-board-heavy.lock
```

Both units take a nonblocking exclusive `flock` on this file. Verify contention before any write run by holding the lock in one shell and confirming each unit refuses to start rather than overlapping. The tmpfiles rule recreates the lock after reboot.

The backup unit is capped at 150% CPU with a 1.5/2 GB memory high/max envelope. The manual video backfill unit can use up to 180% CPU and a 6/8 GB memory high/max envelope. These limits preserve headroom on the 2 OCPU/12 GB host and must be adjusted only after recording `MemoryPeak`, CPU time, temporary-disk use, and elapsed time from real runs.

## Manual A1 video-thumbnail backfill

[`scripts/backfill-video-thumbnails.ts`](../../scripts/backfill-video-thumbnails.ts) is the first FFmpeg workload approved for A1. It defaults to dry-run and requires explicit `--write` for DB/Storage changes. Write mode accepts only HTTPS objects from the exact configured Supabase origin and bucket, plus optional exact legacy origins; it rejects redirects, local paths, and internal/arbitrary hosts. It uses the system ARM64 FFmpeg, streams remote videos to private temporary files, rejects sources above the configured byte limit, kills stalled downloads/FFmpeg children, and caps captured frame output. The systemd unit has no timer or install target and therefore cannot start on a schedule by itself.

Before the first run, verify native binaries and the unit files on the A1:

```bash
uname -m
file "$(command -v node)" "$(command -v ffmpeg)" "$(command -v pg_dump)" "$(command -v oci)"
ffmpeg -version
sudo systemd-analyze verify \
  /etc/systemd/system/aura-supabase-backup.service \
  /etc/systemd/system/aura-video-thumbnail-backfill.service
```

Run the script directly with `--dry-run --limit=1` first. Before a write run, confirm `aura-supabase-backup.service` is inactive and no restore rehearsal is running. The initial systemd unit uses concurrency 1; moving to 2 requires measured `MemoryPeak`, CPU, temporary-disk, and elapsed-time evidence with no backup overlap. Then start the manual unit and inspect its bounded-resource evidence:

```bash
sudo systemctl start aura-video-thumbnail-backfill.service
journalctl -u aura-video-thumbnail-backfill.service
systemctl show -p Result,MemoryPeak,CPUUsageNSec aura-video-thumbnail-backfill.service
```

Any failed item makes the unit fail after the remaining claimed items finish, so a partial result cannot be mistaken for success. If Storage upload succeeds but the DB update fails, the worker attempts to delete the new object. An `orphan cleanup failed` warning requires an operator to inspect the attachment's `uploads/previews/videos/<attachment-id>-...` objects, confirm that none is referenced, and remove only the unreferenced object. Verify generated WebP dimensions, the updated `previewUrl`, the Supabase object, and temporary-file cleanup before increasing scope. Do not add a timer until this manual verification and the backup/restore rehearsal both pass.

## Safe review and dry-run

The default mode does not check external commands, contact the database, or call OCI. It validates required variable presence and prints only generated object names and stages—never values, credentials, or the database URL.

```bash
set -a
. /etc/aura-board/oracle-backup.env
set +a
/opt/aura-board/infra/oracle/backup-supabase.sh
```

Only `--write` enables `pg_dump`, archive validation, checksum creation, and uploads. In write mode the database URL is passed to `pg_dump` through `PGDATABASE`, not as a command-line argument, and the original `DATABASE_URL` shell variable is unset before `pg_dump` starts.

After installation and review, an operator can load and enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aura-supabase-backup.timer
systemctl list-timers aura-supabase-backup.timer
```

Do not run `systemctl start aura-supabase-backup.service` until database connectivity, IAM scope, bucket privacy, lifecycle policy, and the environment file have all been reviewed.

## Operation and verification

The timer runs once daily at 03:00 UTC (12:00 in Osaka/Korea) with up to 30 minutes of randomized delay and catches up after downtime. Every OCI upload explicitly targets `ap-osaka-1`; the script rejects another region to avoid silently writing backups outside the home-region plan. Inspect stage/object-only logs with:

```bash
journalctl -u aura-supabase-backup.service
systemctl status aura-supabase-backup.timer
```

Each run writes a PostgreSQL custom-format archive plus a sibling SHA-256 manifest. Before upload, `pg_restore --list` verifies that the archive is readable. OCI CLI uploads both objects using instance-principal authentication, checksum verification, and no-overwrite protection.

Periodically perform a restore rehearsal in an isolated, disposable scratch database—not production:

1. Download one archive and its manifest through an approved operator workflow.
2. Run `sha256sum --check <archive>.sha256` in the directory containing the archive.
3. Run `pg_restore --list <archive>.dump` and review the object list.
4. Restore into an empty scratch database with a compatible PostgreSQL client, capture errors, and run application-specific integrity checks.
5. Destroy the scratch database and securely remove downloaded backup material according to policy.

## Rollback

To stop future runs without deleting backups, disable the timer:

```bash
sudo systemctl disable --now aura-supabase-backup.timer
```

Then remove or revert the installed unit/script files and run `sudo systemctl daemon-reload`. Rollback does not delete Object Storage data; retention remains controlled by the bucket lifecycle policy. Revoke the dynamic-group policy only after confirming no approved backup workflow still depends on it.
