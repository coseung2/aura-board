# Oracle Cloud backup preparation

This directory is a preparation skeleton for a daily logical backup from Supabase Postgres to a private OCI Object Storage bucket. Supabase remains the system of record. Oracle stores a backup copy and may host long-running workers separately; it does not become the primary database.

The target compute plan is one `VM.Standard.A1.Flex` instance with **2 OCPUs and 12 GB RAM** in the tenancy home region, Japan Central (Osaka), `ap-osaka-1`. This uses the full Always Free Ampere A1 allowance as a single ARM64 worker. It replaces the current two 1 GB instances after validation; it is not an in-place resize of those AMD micro instances.

Nothing in this repository creates OCI resources, logs in to OCI, deploys the service, or runs a real backup. Perform those actions only after an infrastructure review.

## Prerequisites

- One OCI Ampere A1 Compute instance in the Osaka home region (`ap-osaka-1`), shape `VM.Standard.A1.Flex`, configured with 2 OCPUs and 12 GB RAM, plus a dedicated `aura-backup` system user and group.
- ARM64-compatible PostgreSQL 17 client, OCI CLI, and future FFmpeg binaries. Do not copy x86_64 binaries from the old 1 GB instances.
- PostgreSQL 17 client tools (`pg_dump` and `pg_restore`). Keep the client major version compatible with or newer than the Supabase server version.
- OCI CLI with instance-principal authentication available to the service user. No API signing-key file is needed.
- A private Object Storage bucket. OCI Object Storage encrypts data at rest with AES-256 by default.
- Network access from the Compute instance to Supabase Postgres and OCI Object Storage.

Place the Compute instance in a dynamic group. Grant only object-management access to the intended bucket and compartment. Replace every placeholder below with reviewed tenancy values; OCI policy syntax and supported bucket conditions can vary by tenancy configuration.

```text
Allow dynamic-group <BACKUP_DYNAMIC_GROUP> to manage objects in compartment <BACKUP_COMPARTMENT> where target.bucket.name = '<PRIVATE_BACKUP_BUCKET>'
```

If your tenancy requires separate permissions to inspect the bucket or namespace, add only the minimum read permissions needed by the deployed OCI CLI workflow. Do not grant tenancy-wide object-management access.

Configure a bucket lifecycle policy for retention and expiry after recovery requirements are approved. The upload script never lists or deletes remote objects. Keep the bucket private and disable public access.

## Compute upgrade from the two 1 GB instances

Treat the move as a blue/green replacement, not an in-place upgrade:

1. Inventory both existing instances, attached boot/block volumes, public/private IP dependencies, systemd units, cron entries, DNS, firewall rules, and any data that is not reproducible from source control.
2. Keep both old instances running while requesting the Osaka A1 capacity. An `out of host capacity` response is not a reason to terminate working instances; retry later in the home region.
3. Create one `VM.Standard.A1.Flex` instance at 2 OCPUs / 12 GB RAM with an Always Free-eligible ARM64 image. Confirm total boot/block volume allocation remains inside the tenancy allowance before provisioning.
4. Install this repository and ARM64-native dependencies on the A1 instance. Configure the dynamic group, private bucket policy, root-owned environment file, and systemd units without enabling the timer.
5. Run the script in its default dry-run mode, then perform one approved `--write` backup and an isolated restore rehearsal. Verify checksum, archive contents, logs, and Object Storage lifecycle policy.
6. Move future long-running workers one at a time. Observe the A1 instance before stopping the first old instance, then the second. Do not run the same scheduled job on old and new hosts simultaneously.
7. Stop the old instances before termination and retain rollback material for the approved observation window. Terminate them and remove obsolete volumes, IPs, IAM policies, and schedules only after the A1 backup and worker paths are proven.

The repository does not automate instance creation or termination. Record instance OCIDs and cutover evidence in the operator-owned handoff without placing them in source control if they are considered sensitive.

## Installation layout

Install the repository backup files at these paths, matching the unit files:

```text
/opt/aura-board/infra/oracle/backup-supabase.sh
/etc/aura-board/oracle-backup.env
/etc/systemd/system/aura-supabase-backup.service
/etc/systemd/system/aura-supabase-backup.timer
```

The script and `/opt/aura-board/infra/oracle` should be owned by root and not writable by `aura-backup`. Create `/etc/aura-board/oracle-backup.env` from `oracle-backup.env.example`, replace placeholders outside source control, set ownership to `root:aura-backup`, and permissions to `0640`. Ensure the script is executable (`0755`). The script creates private temporary files under systemd's private temporary directory and removes them on exit.

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
