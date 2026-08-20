# Oracle Cloud application and worker operations

This directory contains the production runtime contract for Aura Board on Oracle Cloud. The Osaka A1 instance hosts the public Next.js application, the private Rust play engine, scheduled API jobs, media workers, and the daily PostgreSQL logical backup. Supabase remains the primary Postgres/Auth/Realtime/Storage service and OCI Object Storage keeps the backup copy.

The backup contains PostgreSQL data and metadata only; it is not an object-payload copy and it does not archive WAL. `BACKUP_SOURCE` is a non-secret source label for the `DATABASE_URL` supplied to the script. Until the managed-to-self-hosted cutover, set `BACKUP_SOURCE=managed-supabase` and use the direct managed-Supabase PostgreSQL endpoint. After cutover, change both together to `BACKUP_SOURCE=oracle-self-hosted` and the local/self-hosted Oracle PostgreSQL primary endpoint. The script never discovers, migrates, or switches the database source automatically.

The production compute target is one `VM.Standard.A1.Flex` instance with **4 OCPUs and 24 GB RAM** in Japan Central (Osaka), `ap-osaka-1`. The resize was verified on-host on 2026-08-19 as `aarch64`, 4 online CPUs, and 23 GiB visible RAM. All runtime artifacts and native dependencies must be built for Linux ARM64.

OCI resource creation remains an operator action. The checked-in systemd and nginx files define the application runtime after the instance exists.

## Prerequisites

- One OCI Ampere A1 Compute instance in the Osaka home region (`ap-osaka-1`), shape `VM.Standard.A1.Flex`, configured with 4 OCPUs and 24 GB RAM, plus dedicated `aura-app`, `aura-backup`, and `aura-media` system users and groups.
- Node.js 22 for Linux ARM64. Install dependencies and run `prisma generate` on the A1 itself; never copy `node_modules` or generated native binaries from an AMD64 host.
- ARM64-compatible PostgreSQL 17 client, OCI CLI, Rust toolchain, nginx, and FFmpeg binaries.
- PostgreSQL 17 client tools (`pg_dump` and `pg_restore`). Keep the client major version compatible with or newer than the active PostgreSQL source.
- OCI CLI with instance-principal authentication available to the service user. No API signing-key file is needed.
- A private Object Storage bucket. OCI Object Storage encrypts data at rest with AES-256 by default.
- A direct PostgreSQL primary endpoint for the active source: managed Supabase before cutover, or the local/self-hosted Oracle PostgreSQL primary after cutover. Do not use a transaction pooler or a DR subscriber as the backup source.
- Network access from the Compute instance to the active PostgreSQL source and OCI Object Storage.

After the A1 instance exists and its OCID is verified, place that one instance in a dynamic group and create the bucket-scoped policy. These resources do not exist yet because their matching rule depends on the future instance OCID. Replace every placeholder below with reviewed tenancy values; OCI policy syntax and supported bucket conditions can vary by tenancy configuration.

```text
Allow dynamic-group <BACKUP_DYNAMIC_GROUP> to manage objects in compartment <BACKUP_COMPARTMENT> where target.bucket.name = '<PRIVATE_BACKUP_BUCKET>'
```

If your tenancy requires separate permissions to inspect the bucket or namespace, add only the minimum read permissions needed by the deployed OCI CLI workflow. Do not grant tenancy-wide object-management access.

### DevSpace Bastion session keeper

Keep public SSH closed. DevSpace administration uses OCI Bastion SSH port-forwarding sessions to the instance private IP and port 22. Because Bastion sessions are intentionally short-lived, the self-hosted `aura-board-prod` GitHub runner can refresh the session through the instance principal after the dedicated IAM policy below is installed and verified. Until then, create Bastion sessions manually.

Create a dedicated dynamic group named `aura-board-bastion-runner` with exactly this matching rule for the current production instance:

```text
instance.id = 'ocid1.instance.oc1.ap-osaka-1.anvwsljrwauhlkacvztijko427vjz6f4zcau64mjjmz7muur34ygd5t72jda'
```

Create a root policy named `aura-board-bastion-session-policy` with the following statements. The session-management permission is constrained to the one Bastion name and one target Compute instance; the remaining permissions are read-only dependencies required by OCI Bastion session creation.

```text
Allow dynamic-group aura-board-bastion-runner to use bastion in tenancy where target.bastion.name = 'aura-board-devspace-bastion'
Allow dynamic-group aura-board-bastion-runner to read bastion-session in tenancy
Allow dynamic-group aura-board-bastion-runner to manage bastion-session in tenancy where ALL {target.bastion.name = 'aura-board-devspace-bastion', target.resource.ocid = '<CURRENT_PRODUCTION_INSTANCE_OCID>'}
Allow dynamic-group aura-board-bastion-runner to read instances in tenancy
Allow dynamic-group aura-board-bastion-runner to read vcn in tenancy
Allow dynamic-group aura-board-bastion-runner to read subnets in tenancy
Allow dynamic-group aura-board-bastion-runner to read vnic-attachments in tenancy
Allow dynamic-group aura-board-bastion-runner to read vnics in tenancy
Allow dynamic-group aura-board-bastion-runner to read private-ips in tenancy
Allow dynamic-group aura-board-bastion-runner to inspect work-requests in tenancy
```

`.github/workflows/oci-bastion-session.yml` runs only on the trusted `main` branch and only on the repository-scoped `aura-board-prod` self-hosted ARM64 runner, checking every 10 minutes. The former repository-variable gate was removed only after the live instance-principal session create/reuse, local SSH port forwarding, and public TCP/22 closure all passed. `infra/oracle/renew-bastion-session.sh` reads IMDSv2 for the current instance OCID/private IP, finds the active `aura-board-devspace-bastion`, reuses an existing `aura-board-devspace-auto` session while it has more than 20 minutes left, and otherwise creates a new port-forwarding session using the Bastion's configured maximum TTL. The workflow publishes only session metadata as a one-day GitHub Actions artifact; it never uploads a private SSH key.

The current DevSpace SSH public key is embedded in the trusted workflow because public keys are not secrets. Its matching private key remains outside the repository. Rotate this transitional key to a dedicated DevSpace-only SSH key when the execution environment gains a supported secret/key store; do not copy a private key into source control.

Configure an approved bucket lifecycle policy for retention and expiry after recovery requirements are approved. Apply the same retention treatment to each `.dump` and sibling `.dump.sha256` pair under the configured prefix. The upload script never lists or deletes remote objects. Keep the bucket private and disable public access.

## A1 operating model

The single A1 preserves workload isolation in software:

- Keep backup, FFmpeg, and batch-mail work as separate systemd units, service users, working directories, and log streams. A failure or restart in one job must not implicitly enable another job.
- Run the public app only through nginx on ports 80/443. Keep Next.js on `127.0.0.1:3000` and the Rust play engine on `127.0.0.1:8081`.
- Use the A1 scheduler for application cron endpoints. Supabase remains responsible for its database-native notification outbox wakeup.
- Start with one resource-intensive job at a time. Do not overlap FFmpeg with a backup write or restore rehearsal until measured CPU, memory, disk, and network headroom demonstrates that concurrency is safe.
- Add explicit systemd CPU/memory limits per worker after the first measured runs. The 24 GB total is shared capacity, not 24 GB guaranteed to every process.
- Install only ARM64-native packages and images. Rebuild or replace every x86_64 binary, container image, native Node module, PostgreSQL client, OCI CLI, and FFmpeg dependency before cutover.
- Treat the 50 GB boot volume as replaceable runtime storage. Upload durable backup artifacts to the private bucket and keep original application data in Supabase/Cloudflare; do not make local A1 files the only copy.
- Treat the A1 as a single application host. Keep release directories immutable, switch `/opt/aura-board-app/current` atomically, and retain one known-good release for rollback.

## Application runtime layout

```text
/opt/aura-board-app/releases/<git-sha>/server.js
/opt/aura-board-app/current -> releases/<git-sha>
/opt/aura-board-app/shared/cache
/opt/aura-board-app/shared/locks
/opt/aura-board-play-engine/releases/<git-sha>/play-server
/opt/aura-board-play-engine/current -> releases/<git-sha>
/etc/aura-board/app.env
/etc/aura-board/build.env
/etc/systemd/system/aura-board-app.service
/etc/systemd/system/aura-play-engine.service
/etc/nginx/sites-available/aura-board
/opt/aura-board-app/bin/run-app-cron.sh
/etc/cron.d/aura-board-app
```

Build the Next.js standalone output and Rust binary on the A1 so Prisma, Sharp, and Rust artifacts match Linux ARM64. Copy `public` and `.next/static` into the standalone release, link `.next/cache` to `/opt/aura-board-app/shared/cache`, then switch the `current` symlink. Keep `/etc/aura-board/app.env` root-owned with mode `0640` and group `aura-app`.

Builds must never source `/etc/aura-board/app.env`. Create `/etc/aura-board/build.env` from `build.env.example`, keep only non-production placeholders or explicitly public build-time values, and set it to `root:aura-app` mode `0640`. A repository build can execute package lifecycle and Next.js build code, so any value in this file must be safe to disclose to someone who can push `main`.

OAuth runtime values belong only in `/etc/aura-board/app.env`. Google uses
`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`; Kakao uses
`KAKAO_PARENT_CLIENT_ID`/`KAKAO_PARENT_CLIENT_SECRET`; Apple web uses an Apple
Services ID in `AUTH_APPLE_ID` and its signed client-secret JWT in
`AUTH_APPLE_SECRET`. Register both
`https://aura-board.com/api/auth/callback/apple` and
`https://aura-board.com/api/parent/auth/apple/web/callback` as Apple web return
URLs. `prepare-app-env.mjs` forces `NEXTAUTH_URL` and
`PARENT_OAUTH_REDIRECT_BASE_URL` to the canonical HTTPS origin so internal
loopback hostnames never become public OAuth redirects.

Before switching public traffic, verify all three layers locally:

```bash
curl --fail http://127.0.0.1:8081/health
curl --fail http://127.0.0.1:3000/api/health
curl --fail -H 'Host: aura-board.com' http://127.0.0.1/api/health
```

Only nginx is internet-facing. OCI network rules should allow TCP 80/443 from the internet and retain SSH as an administrator-only rule. Do not expose ports 3000, 8081, Postgres, or rpcbind.

## GitHub push deployment

`Deploy Oracle Production` connects every push to `main` to production in two stages. A standard GitHub-hosted `ubuntu-24.04-arm` runner builds and tests the Linux ARM64 Next.js/Rust artifact without production secrets. The repository-scoped self-hosted runner on the A1 only downloads that artifact, verifies it, combines it with the exact checkout's `public` tree, switches the release, and runs health checks. The production runner initiates an outbound GitHub connection, so deployment does not require widening the administrator-only SSH rule.

The transient artifact deliberately excludes `public`, which is copied from the same verified Git SHA on the production runner. This avoids repeatedly storing the large static asset tree in GitHub Actions. The workflow deletes the artifact after every deploy attempt and does not create npm, Next, or Cargo caches. This keeps the first implementation within the private repository's included Actions storage while moving CPU-heavy builds off production.

Treat write access to `main` as production deployment access. This private repository's current GitHub plan does not provide branch protection or repository rulesets, and the `Production` environment currently has no protection rules. Keep collaborator write access minimal; if the plan changes, require reviewed pull requests and protect the production environment before adding more writers.

This automation assumes the existing production units, `/etc/aura-board/app.env`, shared directories, and one currently healthy known-good release are already installed. It intentionally refuses a first-ever deployment with no rollback target.

Create the dedicated runner account and directory, then download the current Linux ARM64 runner archive using the checksum and commands shown in GitHub's **Settings -> Actions -> Runners -> New self-hosted runner** page:

```bash
sudo useradd --system --create-home --home-dir /opt/actions-runner-aura-board --shell /bin/bash aura-deploy
sudo chown -R aura-deploy:aura-deploy /opt/actions-runner-aura-board
cd /opt/actions-runner-aura-board
# Download and verify the exact GitHub-provided Linux ARM64 runner archive here.
sudo -u aura-deploy ./config.sh \
  --url https://github.com/coseung2/aura-board \
  --token '<SHORT_LIVED_REGISTRATION_TOKEN>' \
  --name aura-board-oracle-prod \
  --labels aura-board-prod \
  --work _work \
  --unattended
sudo ./svc.sh install aura-deploy
sudo ./svc.sh start
```

Keep the token out of shell history by substituting it interactively or through a root-readable temporary mechanism and deleting that temporary value immediately. Restrict the runner group to this repository and never enable it for fork pull requests.

Create the non-secret build environment before installing the helper:

```bash
sudo install -o root -g aura-app -m 0640 \
  ./infra/oracle/build.env.example /etc/aura-board/build.env
sudoedit /etc/aura-board/build.env
```

After the runner service exists, install the root-owned deployment helpers from a reviewed checkout:

```bash
sudo bash ./infra/oracle/install-deploy-automation.sh "$PWD"
sudo -u aura-deploy sudo -n /usr/local/sbin/aura-board-deploy-release
```

The second command is an end-to-end **live production deployment**, not a privilege-only smoke test, and must be run only during an approved release window. The sudo policy permits exactly that argument-free helper. In Actions, the helper requires the downloaded artifact at the fixed checkout path and publishes it through the root-owned `publish-ci-artifact.sh`; without an artifact it retains the existing on-host build path as an operator-only fallback. It locks concurrent releases, switches both release links, restarts the Rust engine and Next.js app, verifies their process paths plus all three health endpoints, and records durable pending state. Errors and termination signals restore both previous links; a later run recovers an interrupted activation before starting another deployment.

Use `workflow_dispatch` for the first controlled deployment. After it succeeds, a push to `main` uses the same workflow automatically. Updating either deployment script does not update the trusted installed copy; review it and rerun `install-deploy-automation.sh` manually before relying on changed deployment behavior.

Required one-time checks:

```bash
sudo -u aura-deploy test -w /opt/actions-runner-aura-board/_work
sudo -u aura-deploy sudo -n -l
sudo systemctl status 'actions.runner.*aura-board*'
curl --fail http://127.0.0.1:8081/health
curl --fail http://127.0.0.1:3000/api/health
curl --fail -H 'Host: aura-board.com' http://127.0.0.1/api/health
```

Install `aura-board-app.cron` as `/etc/cron.d/aura-board-app` and keep it root-owned with mode `0644`. The runner calls the loopback Next.js endpoint with the root-owned `CRON_SECRET`, takes a per-job nonblocking lock, and never sends cron traffic through public DNS. `notification-push` and `play-outbox` run once per minute; the remaining schedules preserve the existing UTC production cadence, including `role-salary-payout` at 15:10 UTC.

Keep root deployment state in `/opt/aura-board-app/shared/locks` and application
cron locks in the separate `/opt/aura-board-app/shared/cron-locks` directory.
The installer creates the latter as `aura-app:aura-app` mode `0750` and installs
the matching runner plus `/etc/cron.d/aura-board-app`. Verify it after
installation with `sudo -u aura-app test -w
/opt/aura-board-app/shared/cron-locks`. If this check fails, every application
cron job exits before making its loopback request and durable outboxes will
build a backlog. Never make the root deployment-state directory writable by
`aura-app`; its predictable root-opened paths must not share a directory with
unprivileged lock files.

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

The script and `/opt/aura-board/infra/oracle` should be owned by root and not writable by `aura-backup`. Create `/etc/aura-board/oracle-backup.env` from `oracle-backup.env.example`, replace placeholders outside source control, set ownership to `root:aura-backup`, and permissions to `0640`. Before cutover, use `BACKUP_SOURCE=managed-supabase` with the managed direct PostgreSQL endpoint. At cutover, update the same file in one reviewed change to `BACKUP_SOURCE=oracle-self-hosted` and the local/self-hosted primary `DATABASE_URL`; do not leave the managed URL in place or put either real value in source control. Ensure the script is executable (`0755`). The script creates private temporary files under systemd's private temporary directory and removes them on exit.

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

The backup unit remains capped at 150% CPU with a 1.5/2 GB memory high/max envelope. The manual video backfill unit can use up to 180% CPU and a 6/8 GB memory high/max envelope. These limits were originally set for the 2 OCPU/12 GB host and remain conservative after the 4 OCPU/24 GB resize; adjust them only after recording `MemoryPeak`, CPU time, temporary-disk use, and elapsed time from real runs.

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

The default mode does not check external commands, contact the database, or call OCI. It validates the allowed source label and required variable presence and prints only generated object names, the non-secret source label, and stages—never values, credentials, or the database URL.

```bash
set -a
. /etc/aura-board/oracle-backup.env
set +a
/opt/aura-board/infra/oracle/backup-supabase.sh
```

Only `--write` enables `pg_dump`, archive validation, checksum creation, and uploads. In write mode the script converts `DATABASE_URL` into a short-lived, mode-0600 `pg_service.conf` under the private temporary directory, invokes `pg_dump` through `PGSERVICEFILE`/`PGSERVICE`, then removes the file with the rest of the temporary directory. The original `DATABASE_URL` shell variable is unset before `pg_dump` starts, so the connection string is not placed in the process argument list.

### Database source selection

The source selector is intentionally explicit in the environment file, but it is not endpoint discovery:

- Before cutover, `BACKUP_SOURCE=managed-supabase` and `DATABASE_URL` must address the current managed Supabase primary directly.
- After cutover, `BACKUP_SOURCE=oracle-self-hosted` and `DATABASE_URL` must address the host-visible local/self-hosted Oracle PostgreSQL primary directly. Do not use a Supavisor transaction-pooler URL, a read-only endpoint, or the Supabase Free DR subscriber.

The script accepts a legacy environment file without `BACKUP_SOURCE` as `managed-supabase` so that adding the selector does not stop the current managed backup unexpectedly. That compatibility default must be replaced explicitly before a self-hosted cutover; the script cannot prove that a URL's endpoint matches its label.

After installation and review, an operator can load and enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aura-supabase-backup.timer
systemctl list-timers aura-supabase-backup.timer
```

Do not run `systemctl start aura-supabase-backup.service` until database connectivity, IAM scope, bucket privacy, lifecycle policy, and the environment file have all been reviewed.

## Operation and verification

The timer runs once daily at 03:00 UTC (12:00 in Osaka/Korea) with up to 30 minutes of randomized delay and catches up after downtime. This is the full logical-dump schedule; it does not provide a 15-minute RPO or PITR. Every OCI upload explicitly targets `ap-osaka-1`; the script rejects another region to avoid silently writing backups outside the home-region plan. Inspect source/stage/object-only logs with:

```bash
journalctl -u aura-supabase-backup.service
systemctl status aura-supabase-backup.timer
```

Each run writes a PostgreSQL custom-format archive plus a sibling SHA-256 manifest. Before upload, `pg_restore --list` verifies that the archive is readable. OCI CLI uploads both objects using instance-principal authentication, checksum verification, and no-overwrite protection. The archive does not include object payloads stored outside PostgreSQL.

### Retention contract

Retention is deliberately outside the script and systemd timer:

- Keep the archive and its `.dump.sha256` manifest as one backup set under the same `OCI_OBJECT_PREFIX`; any approved expiry rule must treat the pair consistently.
- No retention duration, lifecycle rule, cross-region copy, or Oracle-external copy is configured by these checked-in files. Do not infer that a retention policy or offsite copy exists until an operator has configured and verified it.
- At each retention review, confirm that the private OCI lifecycle rule targets only the approved backup prefix, does not expire the newest restore-validated set, and covers both archive and manifest objects. The script remains no-overwrite and never performs remote deletion.

### WAL/PITR status and future activation contract

WAL archiving and point-in-time recovery are not implemented here. This repository contains no PostgreSQL `archive_command`/WAL archive configuration, archive monitor, WAL shipping service, or PITR restore automation. A custom-format `pg_dump` is a logical backup, not a physical base backup, and cannot by itself support PITR.

Before claiming a self-hosted RPO better than the latest validated logical dump, a separate reviewed change must provide and test all of the following:

1. WAL archiving from the self-hosted primary to a private durable destination outside the replaceable boot volume and outside the same single failure domain; archive writes must be idempotent, non-overwriting, and fail visibly.
2. Monitoring for archive failures, backlog, destination capacity, and retention gaps.
3. A compatible physical base-backup/snapshot plus a retention rule that keeps every required WAL segment from that base through the recovery window. This logical-dump script is not that base backup.
4. An isolated restore rehearsal to a specified recovery time, with the WAL chain, data integrity, RPO, and RTO recorded before the path is relied upon.

Until that work is separately implemented and verified, recovery coverage is limited to the latest checksum- and archive-validated logical dump. Do not describe the daily timer as WAL/PITR protection.

Periodically perform a logical-dump restore rehearsal in an isolated, disposable scratch database—not production. This validates the custom-format backup path; it does not validate WAL/PITR:

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
