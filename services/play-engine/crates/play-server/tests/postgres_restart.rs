//! Opt-in real database recovery test. Owns a disposable Docker container only.
use play_server::model::{
    ActorContext, ActorRole, CommandRequest, CreateSessionRequest, OmokIntent, ParticipantSeed,
};
use play_server::{PlayRepository, PostgresRepository};
use sqlx::postgres::PgPoolOptions;
use std::{process::Command, time::Duration};

struct Container(String);
impl Drop for Container {
    fn drop(&mut self) {
        let _ = Command::new("docker")
            .args(["rm", "-f", "-v", &self.0])
            .output();
    }
}
fn docker(args: &[&str]) -> String {
    let result = Command::new("docker")
        .args(args)
        .output()
        .expect("Docker CLI");
    assert!(
        result.status.success(),
        "Docker: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    String::from_utf8(result.stdout).unwrap().trim().to_owned()
}
async fn ready(container: &Container) {
    for _ in 0..60 {
        let result = Command::new("docker")
            .args(["exec", &container.0, "pg_isready", "-U", "postgres"])
            .output()
            .unwrap();
        if result.status.success() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    panic!("isolated Postgres did not start");
}

#[tokio::test]
#[ignore = "requires Docker; creates and removes its own isolated postgres:16 container"]
async fn postgres_restart_preserves_receipt_and_recovers_existing_pool() {
    let name = format!("omok-restart-{}", uuid::Uuid::new_v4());
    let reservation = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = reservation.local_addr().unwrap().port();
    let binding = format!("127.0.0.1:{port}:5432");
    drop(reservation);
    let id = docker(&[
        "run",
        "-d",
        "--name",
        &name,
        "--label",
        "aura.task=omok-restart",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "-p",
        &binding,
        "postgres:16",
    ]);
    let container = Container(id);
    ready(&container).await;
    let address = docker(&["port", &container.0, "5432/tcp"]);
    assert!(address.starts_with("127.0.0.1:"));
    let url = format!("postgres://postgres@{address}/postgres");
    let pool = PgPoolOptions::new()
        .acquire_timeout(Duration::from_secs(2))
        .connect(&url)
        .await
        .unwrap();
    // Use the real play-platform migration; only its external Board/roles are fixtures.
    sqlx::raw_sql(
        r#"CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE TABLE "Board" ("id" TEXT PRIMARY KEY);
        INSERT INTO "Board" VALUES ('restart-board');"#,
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../../../../../prisma/migrations/20260801140000_authoritative_play_platform/migration.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let repository = PostgresRepository::new(pool.clone());
    let host = ActorContext {
        subject: "teacher:test".into(),
        role: ActorRole::Host,
    };
    let first = ActorContext {
        subject: "student:first".into(),
        role: ActorRole::Participant,
    };
    let second = ActorContext {
        subject: "student:second".into(),
        role: ActorRole::Participant,
    };
    let created = repository
        .create_session(
            &host,
            "restart-board",
            &CreateSessionRequest {
                request_id: "restart-create".into(),
                auto_start: false,
                participants: vec![
                    ParticipantSeed {
                        actor_subject: first.subject.clone(),
                        display_name: "First".into(),
                    },
                    ParticipantSeed {
                        actor_subject: second.subject.clone(),
                        display_name: "Second".into(),
                    },
                ],
            },
            100,
        )
        .await
        .unwrap();
    let session = created.value.snapshot.session_id;
    let request = CommandRequest {
        request_id: "restart-ready-first".into(),
        expected_version: 0,
        command_schema_version: 1,
        command: OmokIntent::Ready,
    };
    let committed = repository
        .execute_command(&first, &session, &request, 200)
        .await
        .unwrap();
    assert!(!committed.replayed);
    docker(&["stop", "-t", "1", &container.0]);
    assert!(repository.get_session(&session).await.is_err());
    let next = CommandRequest {
        request_id: "restart-ready-second".into(),
        expected_version: 1,
        command_schema_version: 1,
        command: OmokIntent::Ready,
    };
    assert!(
        repository
            .execute_command(&second, &session, &next, 300)
            .await
            .is_err()
    );
    docker(&["start", &container.0]);
    ready(&container).await;
    assert_eq!(docker(&["port", &container.0, "5432/tcp"]), address);
    // Keep the original Rust repository/pool alive across DB restart.
    let replay = repository
        .execute_command(&first, &session, &request, 400)
        .await
        .unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.value, committed.value);
    assert_eq!(repository.get_session(&session).await.unwrap().version, 1);
    let resumed = repository
        .execute_command(&second, &session, &next, 500)
        .await
        .unwrap();
    assert!(!resumed.replayed);
    assert_eq!(resumed.value.version, 2);
    let counts: (i64, i64) = sqlx::query_as(
        r#"SELECT (SELECT count(*) FROM "PlayRequestReceipt"),
                  (SELECT count(*) FROM "PlayOutbox")"#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        counts,
        (3, 3),
        "one create and two commands, no outage/replay duplicates"
    );
    pool.close().await;
}
