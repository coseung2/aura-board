use async_trait::async_trait;
use serde::{Serialize, de::DeserializeOwned};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::types::Json;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::model::{
    ActorContext, ActorRole, CommandRequest, CommandResponse, CreateSessionRequest,
    CreateSongGuessSessionRequest, ModelError, RematchRequest, SessionRecord, SessionResponse,
    SongGuessCommandRequest, SongGuessCommandResponse, SongGuessSessionRecord,
    SongGuessSessionResponse, validate_request_id,
};
use crate::repository::{
    COMMAND_SCOPE, CREATE_SCOPE, Execution, OutboxEvent, PlayRepository, REMATCH_SCOPE,
    RepositoryError, SHADOW_ALLIANCE_COMMAND_SCOPE, SHADOW_ALLIANCE_CREATE_SCOPE,
    SHADOW_ALLIANCE_REMATCH_SCOPE, SONG_GUESS_COMMAND_SCOPE, SONG_GUESS_CREATE_SCOPE, request_hash,
};
use crate::result_repository::{GameResultRepositoryError, append_game_result};
use crate::shadow::{
    CreateShadowAllianceSessionRequest, SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
    ShadowAllianceCommandRequest, ShadowAllianceCommandResponse, ShadowAllianceSessionRecord,
    ShadowAllianceSessionResponse, validate_shadow_request_id,
};

#[derive(Clone)]
pub struct PostgresRepository {
    pool: PgPool,
}

impl PostgresRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn connect(database_url: &str) -> Result<Self, RepositoryError> {
        Self::connect_with_max_connections(database_url, 16).await
    }

    pub async fn connect_with_max_connections(
        database_url: &str,
        max_connections: u32,
    ) -> Result<Self, RepositoryError> {
        // Supabase transaction poolers (PgBouncer) discard prepared statements
        // between checkouts. Disable statement caching so current-session reads
        // do not fail with "prepared statement does not exist".
        let options = database_url
            .parse::<PgConnectOptions>()
            .map_err(storage)?
            .statement_cache_capacity(0);
        let pool = PgPoolOptions::new()
            .max_connections(max_connections.clamp(1, 64))
            .connect_lazy_with(options);
        Ok(Self::new(pool))
    }
}

#[path = "postgres_repository.rs"]
mod implementation;

async fn lock_scope(
    tx: &mut Transaction<'_, Postgres>,
    scope: &str,
) -> Result<(), RepositoryError> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(scope)
        .execute(&mut **tx)
        .await
        .map_err(storage)?;
    Ok(())
}

async fn lookup_receipt<T: DeserializeOwned>(
    tx: &mut Transaction<'_, Postgres>,
    scope_type: &str,
    scope_id: &str,
    request_id: &str,
    expected_hash: &str,
) -> Result<Option<Execution<T>>, RepositoryError> {
    let row = sqlx::query(
        r#"SELECT "requestHash", "response"
           FROM "PlayRequestReceipt"
           WHERE "scopeType" = $1 AND "scopeId" = $2 AND "requestId" = $3"#,
    )
    .bind(scope_type)
    .bind(scope_id)
    .bind(request_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let actual_hash: String = row.try_get("requestHash").map_err(storage)?;
    if actual_hash != expected_hash {
        return Err(RepositoryError::IdempotencyKeyReuse);
    }
    let response: serde_json::Value = row.try_get("response").map_err(storage)?;
    Ok(Some(Execution {
        value: serde_json::from_value(response)
            .map_err(|error| RepositoryError::Storage(error.to_string()))?,
        replayed: true,
    }))
}

async fn insert_receipt<T: Serialize>(
    tx: &mut Transaction<'_, Postgres>,
    scope_type: &str,
    scope_id: &str,
    request_id: &str,
    request_hash: &str,
    response: &T,
) -> Result<(), RepositoryError> {
    let response = serde_json::to_value(response)
        .map_err(|error| RepositoryError::Storage(error.to_string()))?;
    sqlx::query(
        r#"INSERT INTO "PlayRequestReceipt"
           ("id", "scopeType", "scopeId", "requestId", "requestHash", "response", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(scope_type)
    .bind(scope_id)
    .bind(request_id)
    .bind(request_hash)
    .bind(response)
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    Ok(())
}

async fn insert_session(
    tx: &mut Transaction<'_, Postgres>,
    record: &SessionRecord,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"INSERT INTO "PlaySession"
           ("id", "boardId", "hostSubject", "gameKind", "version", "rulesVersion",
            "stateSchemaVersion", "previousSessionId", "current", "createdAtMs",
            "state", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'omok', $4, $5, $6, $7, TRUE, $8, $9, NOW(), NOW())"#,
    )
    .bind(&record.session_id)
    .bind(&record.board_id)
    .bind(&record.host_subject)
    .bind(as_i64(record.version)?)
    .bind(i32::from(record.rules_version))
    .bind(i32::from(record.state_schema_version))
    .bind(&record.previous_session_id)
    .bind(record.created_at_ms)
    .bind(Json(record))
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    for participant in &record.state.participants {
        sqlx::query(
            r#"INSERT INTO "PlayParticipant"
               ("id", "sessionId", "actorSubject", "displayName", "slot", "createdAt")
               VALUES ($1, $2, $3, $4, $5, NOW())"#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&record.session_id)
        .bind(&participant.actor_subject)
        .bind(&participant.display_name)
        .bind(match participant.slot {
            crate::model::OmokSlot::First => "first",
            crate::model::OmokSlot::Second => "second",
        })
        .execute(&mut **tx)
        .await
        .map_err(storage)?;
    }
    Ok(())
}

async fn insert_song_guess_session(
    tx: &mut Transaction<'_, Postgres>,
    record: &SongGuessSessionRecord,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"INSERT INTO "PlaySession"
           ("id", "boardId", "hostSubject", "gameKind", "version", "rulesVersion",
            "stateSchemaVersion", "previousSessionId", "current", "createdAtMs",
            "state", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'song-guess', $4, $5, $6, $7, TRUE, $8, $9, NOW(), NOW())"#,
    )
    .bind(&record.session_id)
    .bind(&record.board_id)
    .bind(&record.host_subject)
    .bind(as_i64(record.version)?)
    .bind(i32::from(record.rules_version))
    .bind(i32::from(record.state_schema_version))
    .bind(&record.previous_session_id)
    .bind(record.created_at_ms)
    .bind(Json(record))
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    for (index, participant) in record.state.participants.iter().enumerate() {
        sqlx::query(
            r#"INSERT INTO "PlayParticipant"
               ("id", "sessionId", "actorSubject", "displayName", "slot", "createdAt")
               VALUES ($1, $2, $3, $4, $5, NOW())"#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&record.session_id)
        .bind(&participant.actor_subject)
        .bind(&participant.display_name)
        .bind(format!("player:{index}"))
        .execute(&mut **tx)
        .await
        .map_err(storage)?;
    }
    Ok(())
}

async fn insert_shadow_alliance_session(
    tx: &mut Transaction<'_, Postgres>,
    record: &ShadowAllianceSessionRecord,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"INSERT INTO "PlaySession"
           ("id", "boardId", "hostSubject", "gameKind", "version", "rulesVersion",
            "stateSchemaVersion", "previousSessionId", "current", "createdAtMs",
            "startedAtMs", "completedAtMs", "terminalReason", "state", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'shadow-alliance', $4, $5, $6, $7, TRUE, $8,
                   $9, $10, $11, $12, NOW(), NOW())"#,
    )
    .bind(&record.session_id)
    .bind(&record.board_id)
    .bind(&record.host_subject)
    .bind(as_i64(record.version)?)
    .bind(i32::from(record.rules_version))
    .bind(i32::from(record.state_schema_version))
    .bind(&record.previous_session_id)
    .bind(record.created_at_ms)
    .bind(record.started_at_ms)
    .bind(record.completed_at_ms)
    .bind(terminal_reason_wire(record.state.terminal_reason)?)
    .bind(Json(record))
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    for (index, identity) in record.participants.values().enumerate() {
        sqlx::query(
            r#"INSERT INTO "PlayParticipant"
               ("id", "sessionId", "actorSubject", "studentId", "displayName", "slot",
                "joinedAtMs", "forfeitedAtMs", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())"#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&record.session_id)
        .bind(&identity.actor_subject)
        .bind(&identity.student_id)
        .bind(&identity.display_name)
        .bind(format!("player:{index}"))
        .bind(identity.joined_at_ms)
        .bind(identity.forfeited_at_ms)
        .execute(&mut **tx)
        .await
        .map_err(storage)?;
    }
    Ok(())
}

async fn update_shadow_alliance_session(
    tx: &mut Transaction<'_, Postgres>,
    record: &ShadowAllianceSessionRecord,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"UPDATE "PlaySession"
           SET "version" = $2,
               "startedAtMs" = $3,
               "completedAtMs" = $4,
               "terminalReason" = $5,
               "state" = $6,
               "updatedAt" = NOW()
           WHERE "id" = $1 AND "gameKind" = 'shadow-alliance'"#,
    )
    .bind(&record.session_id)
    .bind(as_i64(record.version)?)
    .bind(record.started_at_ms)
    .bind(record.completed_at_ms)
    .bind(terminal_reason_wire(record.state.terminal_reason)?)
    .bind(Json(record))
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    Ok(())
}

async fn update_shadow_alliance_participants(
    tx: &mut Transaction<'_, Postgres>,
    record: &ShadowAllianceSessionRecord,
) -> Result<(), RepositoryError> {
    for identity in record.participants.values() {
        sqlx::query(
            r#"UPDATE "PlayParticipant"
               SET "displayName" = $3, "joinedAtMs" = $4, "forfeitedAtMs" = $5
               WHERE "sessionId" = $1 AND "actorSubject" = $2"#,
        )
        .bind(&record.session_id)
        .bind(&identity.actor_subject)
        .bind(&identity.display_name)
        .bind(identity.joined_at_ms)
        .bind(identity.forfeited_at_ms)
        .execute(&mut **tx)
        .await
        .map_err(storage)?;
    }
    Ok(())
}

async fn insert_outbox(
    tx: &mut Transaction<'_, Postgres>,
    record: &SessionRecord,
    event_type: &str,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"INSERT INTO "PlayOutbox"
           ("id", "sessionId", "boardId", "version", "eventType", "status",
            "attempts", "nextAttemptAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'pending', 0, NOW(), NOW(), NOW())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&record.session_id)
    .bind(&record.board_id)
    .bind(as_i64(record.version)?)
    .bind(event_type)
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    Ok(())
}

async fn insert_song_guess_outbox(
    tx: &mut Transaction<'_, Postgres>,
    record: &SongGuessSessionRecord,
    event_type: &str,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"INSERT INTO "PlayOutbox"
           ("id", "sessionId", "boardId", "version", "eventType", "status",
            "attempts", "nextAttemptAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'pending', 0, NOW(), NOW(), NOW())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&record.session_id)
    .bind(&record.board_id)
    .bind(as_i64(record.version)?)
    .bind(event_type)
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    Ok(())
}

async fn insert_shadow_alliance_outbox(
    tx: &mut Transaction<'_, Postgres>,
    record: &ShadowAllianceSessionRecord,
    event_type: &str,
) -> Result<(), RepositoryError> {
    sqlx::query(
        r#"INSERT INTO "PlayOutbox"
           ("id", "sessionId", "boardId", "version", "eventType", "status",
            "attempts", "nextAttemptAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'pending', 0, NOW(), NOW(), NOW())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&record.session_id)
    .bind(&record.board_id)
    .bind(as_i64(record.version)?)
    .bind(event_type)
    .execute(&mut **tx)
    .await
    .map_err(storage)?;
    Ok(())
}

async fn session_board_id_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
) -> Result<String, RepositoryError> {
    sqlx::query_scalar::<_, String>(r#"SELECT "boardId" FROM "PlaySession" WHERE "id" = $1"#)
        .bind(session_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(storage)?
        .ok_or(RepositoryError::NotFound)
}

async fn lock_session(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
) -> Result<SessionRecord, RepositoryError> {
    let Json(record) = sqlx::query_scalar::<_, Json<SessionRecord>>(
        r#"SELECT "state" FROM "PlaySession"
           WHERE "id" = $1 AND "gameKind" = 'omok' FOR UPDATE"#,
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?
    .ok_or(RepositoryError::NotFound)?;
    checked(record)
}

async fn lock_song_guess_session(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
) -> Result<SongGuessSessionRecord, RepositoryError> {
    let Json(record) = sqlx::query_scalar::<_, Json<SongGuessSessionRecord>>(
        r#"SELECT "state" FROM "PlaySession"
           WHERE "id" = $1 AND "gameKind" = 'song-guess' FOR UPDATE"#,
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?
    .ok_or(RepositoryError::NotFound)?;
    checked_song_guess(record)
}

async fn lock_shadow_alliance_session(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
) -> Result<ShadowAllianceSessionRecord, RepositoryError> {
    let Json(record) = sqlx::query_scalar::<_, Json<ShadowAllianceSessionRecord>>(
        r#"SELECT "state" FROM "PlaySession"
           WHERE "id" = $1 AND "gameKind" = 'shadow-alliance' FOR UPDATE"#,
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?
    .ok_or(RepositoryError::NotFound)?;
    checked_shadow_alliance(record)
}

async fn has_current_session_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    board_id: &str,
) -> Result<bool, RepositoryError> {
    let value = sqlx::query_scalar::<_, String>(
        r#"SELECT "id" FROM "PlaySession"
           WHERE "boardId" = $1 AND "current" = TRUE FOR UPDATE"#,
    )
    .bind(board_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?;
    Ok(value.is_some())
}

async fn current_session_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    board_id: &str,
) -> Result<Option<SessionRecord>, RepositoryError> {
    let value = sqlx::query_scalar::<_, Json<SessionRecord>>(
        r#"SELECT "state" FROM "PlaySession"
           WHERE "boardId" = $1 AND "current" = TRUE AND "gameKind" = 'omok' FOR UPDATE"#,
    )
    .bind(board_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?;
    value.map(|Json(record)| checked(record)).transpose()
}

async fn current_shadow_alliance_session_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    board_id: &str,
) -> Result<Option<ShadowAllianceSessionRecord>, RepositoryError> {
    let value = sqlx::query_scalar::<_, Json<ShadowAllianceSessionRecord>>(
        r#"SELECT "state" FROM "PlaySession"
           WHERE "boardId" = $1 AND "current" = TRUE
             AND "gameKind" = 'shadow-alliance' FOR UPDATE"#,
    )
    .bind(board_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?;
    value
        .map(|Json(record)| checked_shadow_alliance(record))
        .transpose()
}

async fn validate_shadow_board_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    board_id: &str,
    classroom_id: &str,
) -> Result<(), RepositoryError> {
    let found = sqlx::query_scalar::<_, String>(
        r#"SELECT "id" FROM "Board"
           WHERE "id" = $1 AND "classroomId" = $2 AND "layout" = 'shadow-alliance'
           FOR UPDATE"#,
    )
    .bind(board_id)
    .bind(classroom_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(storage)?;
    if found.is_some() {
        Ok(())
    } else {
        Err(RepositoryError::NotFound)
    }
}

fn checked(record: SessionRecord) -> Result<SessionRecord, RepositoryError> {
    record.validate()?;
    Ok(record)
}

fn checked_song_guess(
    record: SongGuessSessionRecord,
) -> Result<SongGuessSessionRecord, RepositoryError> {
    record.validate()?;
    Ok(record)
}

fn checked_shadow_alliance(
    record: ShadowAllianceSessionRecord,
) -> Result<ShadowAllianceSessionRecord, RepositoryError> {
    record.validate()?;
    Ok(record)
}

fn terminal_reason_wire(
    reason: Option<play_domain::lifecycle::TerminalReason>,
) -> Result<Option<String>, RepositoryError> {
    reason
        .map(|value| {
            let encoded = serde_json::to_string(&value).map_err(storage)?;
            encoded
                .strip_prefix('"')
                .and_then(|value| value.strip_suffix('"'))
                .map(ToOwned::to_owned)
                .ok_or_else(|| RepositoryError::Storage("invalid_terminal_reason".into()))
        })
        .transpose()
}

fn game_result_storage(error: GameResultRepositoryError) -> RepositoryError {
    RepositoryError::Storage(format!("game_result:{error}"))
}

fn as_i64(value: u64) -> Result<i64, RepositoryError> {
    i64::try_from(value).map_err(|error| RepositoryError::Storage(error.to_string()))
}

fn as_u64(value: i64) -> Result<u64, RepositoryError> {
    u64::try_from(value).map_err(|error| RepositoryError::Storage(error.to_string()))
}

fn storage(error: impl ToString) -> RepositoryError {
    RepositoryError::Storage(error.to_string())
}
