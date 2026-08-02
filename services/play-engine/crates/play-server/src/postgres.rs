use async_trait::async_trait;
use serde::{Serialize, de::DeserializeOwned};
use sqlx::postgres::PgPoolOptions;
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
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await
            .map_err(storage)?;
        Ok(Self::new(pool))
    }
}

#[async_trait]
impl PlayRepository for PostgresRepository {
    async fn create_session(
        &self,
        actor: &ActorContext,
        board_id: &str,
        request: &CreateSessionRequest,
        now_ms: i64,
    ) -> Result<Execution<SessionResponse>, RepositoryError> {
        validate_request_id(&request.request_id)?;
        if actor.role != ActorRole::Host || board_id.is_empty() {
            return Err(ModelError::Forbidden.into());
        }
        let payload_hash = request_hash(CREATE_SCOPE, board_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        lock_scope(&mut tx, board_id).await?;
        if let Some(replay) = lookup_receipt::<SessionResponse>(
            &mut tx,
            CREATE_SCOPE,
            board_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        if has_current_session_in_tx(&mut tx, board_id).await? {
            return Err(RepositoryError::SessionAlreadyExists);
        }
        let participants: [_; 2] = request
            .participants
            .clone()
            .try_into()
            .map_err(|_| ModelError::InvalidRequest)?;
        let record = SessionRecord::new(
            Uuid::new_v4().to_string(),
            board_id.to_owned(),
            actor.subject.clone(),
            participants,
            None,
            now_ms,
        )?;
        let response = SessionResponse {
            request_id: request.request_id.clone(),
            snapshot: record.snapshot(actor, now_ms)?,
        };
        insert_session(&mut tx, &record).await?;
        insert_outbox(&mut tx, &record, "session_created").await?;
        insert_receipt(
            &mut tx,
            CREATE_SCOPE,
            board_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn current_session(
        &self,
        board_id: &str,
    ) -> Result<Option<SessionRecord>, RepositoryError> {
        let value = sqlx::query_scalar::<_, Json<SessionRecord>>(
            r#"SELECT "state" FROM "PlaySession"
               WHERE "boardId" = $1 AND "current" = TRUE AND "gameKind" = 'omok'"#,
        )
        .bind(board_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?;
        value.map(|Json(record)| checked(record)).transpose()
    }

    async fn get_session(&self, session_id: &str) -> Result<SessionRecord, RepositoryError> {
        let Json(record) = sqlx::query_scalar::<_, Json<SessionRecord>>(
            r#"SELECT "state" FROM "PlaySession"
               WHERE "id" = $1 AND "gameKind" = 'omok'"#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .ok_or(RepositoryError::NotFound)?;
        checked(record)
    }

    async fn execute_command(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &CommandRequest,
        now_ms: i64,
    ) -> Result<Execution<CommandResponse>, RepositoryError> {
        validate_request_id(&request.request_id)?;
        if request.command_schema_version != crate::model::COMMAND_SCHEMA_VERSION {
            return Err(RepositoryError::UnsupportedSchema);
        }
        let payload_hash = request_hash(COMMAND_SCOPE, session_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;

        // The durable receipt lookup is deliberately before the row/version check.
        if let Some(replay) = lookup_receipt::<CommandResponse>(
            &mut tx,
            COMMAND_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }

        let current = lock_session(&mut tx, session_id).await?;
        current.authorize(actor)?;
        if current.version != request.expected_version {
            return Err(RepositoryError::VersionConflict {
                current: Box::new(current),
            });
        }
        let mut updated = current.clone();
        updated.apply(actor, &request.command)?;
        let previous_version = updated.version;
        updated.version = updated
            .version
            .checked_add(1)
            .filter(|version| *version <= crate::model::MAX_SAFE_VERSION)
            .ok_or(ModelError::InvalidState)?;
        updated.validate()?;
        let response = CommandResponse {
            request_id: request.request_id.clone(),
            previous_version,
            version: updated.version,
            snapshot: updated.snapshot(actor, now_ms)?,
        };
        sqlx::query(
            r#"UPDATE "PlaySession"
               SET "version" = $2, "state" = $3, "updatedAt" = NOW()
               WHERE "id" = $1"#,
        )
        .bind(session_id)
        .bind(as_i64(updated.version)?)
        .bind(Json(&updated))
        .execute(&mut *tx)
        .await
        .map_err(storage)?;
        insert_outbox(&mut tx, &updated, "session_changed").await?;
        insert_receipt(
            &mut tx,
            COMMAND_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn rematch(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &RematchRequest,
        now_ms: i64,
    ) -> Result<Execution<SessionResponse>, RepositoryError> {
        validate_request_id(&request.request_id)?;
        let payload_hash = request_hash(REMATCH_SCOPE, session_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        if let Some(replay) = lookup_receipt::<SessionResponse>(
            &mut tx,
            REMATCH_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        if actor.role != ActorRole::Host {
            return Err(ModelError::Forbidden.into());
        }
        let board_id = session_board_id_in_tx(&mut tx, session_id).await?;
        lock_scope(&mut tx, &board_id).await?;
        let current = lock_session(&mut tx, session_id).await?;
        current.authorize(actor)?;
        let current_id = current_session_in_tx(&mut tx, &current.board_id)
            .await?
            .map(|record| record.session_id);
        if current_id.as_deref() != Some(session_id) {
            return Err(RepositoryError::VersionConflict {
                current: Box::new(current),
            });
        }
        let rematch = current.rematch(Uuid::new_v4().to_string(), now_ms)?;
        sqlx::query(
            r#"UPDATE "PlaySession" SET "current" = FALSE, "updatedAt" = NOW() WHERE "id" = $1"#,
        )
        .bind(session_id)
        .execute(&mut *tx)
        .await
        .map_err(storage)?;
        insert_session(&mut tx, &rematch).await?;
        insert_outbox(&mut tx, &rematch, "session_created").await?;
        let response = SessionResponse {
            request_id: request.request_id.clone(),
            snapshot: rematch.snapshot(actor, now_ms)?,
        };
        insert_receipt(
            &mut tx,
            REMATCH_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn create_song_guess_session(
        &self,
        actor: &ActorContext,
        board_id: &str,
        request: &CreateSongGuessSessionRequest,
        now_ms: i64,
    ) -> Result<Execution<SongGuessSessionResponse>, RepositoryError> {
        validate_request_id(&request.request_id)?;
        if actor.role != ActorRole::Host || board_id.is_empty() {
            return Err(ModelError::Forbidden.into());
        }
        let payload_hash = request_hash(SONG_GUESS_CREATE_SCOPE, board_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        lock_scope(&mut tx, board_id).await?;
        if let Some(replay) = lookup_receipt::<SongGuessSessionResponse>(
            &mut tx,
            SONG_GUESS_CREATE_SCOPE,
            board_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        if has_current_session_in_tx(&mut tx, board_id).await? {
            return Err(RepositoryError::SessionAlreadyExists);
        }
        let record = SongGuessSessionRecord::new(
            Uuid::new_v4().to_string(),
            board_id.to_owned(),
            actor.subject.clone(),
            request.participants.clone(),
            request.rounds.clone(),
            None,
            now_ms,
        )?;
        let response = SongGuessSessionResponse {
            request_id: request.request_id.clone(),
            snapshot: record.snapshot(actor, now_ms)?,
        };
        insert_song_guess_session(&mut tx, &record).await?;
        insert_song_guess_outbox(&mut tx, &record, "session_created").await?;
        insert_receipt(
            &mut tx,
            SONG_GUESS_CREATE_SCOPE,
            board_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn current_song_guess_session(
        &self,
        board_id: &str,
    ) -> Result<Option<SongGuessSessionRecord>, RepositoryError> {
        let value = sqlx::query_scalar::<_, Json<SongGuessSessionRecord>>(
            r#"SELECT "state" FROM "PlaySession"
               WHERE "boardId" = $1 AND "current" = TRUE AND "gameKind" = 'song-guess'"#,
        )
        .bind(board_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?;
        value
            .map(|Json(record)| checked_song_guess(record))
            .transpose()
    }

    async fn get_song_guess_session(
        &self,
        session_id: &str,
    ) -> Result<SongGuessSessionRecord, RepositoryError> {
        let Json(record) = sqlx::query_scalar::<_, Json<SongGuessSessionRecord>>(
            r#"SELECT "state" FROM "PlaySession"
               WHERE "id" = $1 AND "gameKind" = 'song-guess'"#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .ok_or(RepositoryError::NotFound)?;
        checked_song_guess(record)
    }

    async fn execute_song_guess_command(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &SongGuessCommandRequest,
        now_ms: i64,
    ) -> Result<Execution<SongGuessCommandResponse>, RepositoryError> {
        validate_request_id(&request.request_id)?;
        if request.command_schema_version != crate::model::COMMAND_SCHEMA_VERSION {
            return Err(RepositoryError::UnsupportedSchema);
        }
        let payload_hash = request_hash(SONG_GUESS_COMMAND_SCOPE, session_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        if let Some(replay) = lookup_receipt::<SongGuessCommandResponse>(
            &mut tx,
            SONG_GUESS_COMMAND_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        let current = lock_song_guess_session(&mut tx, session_id).await?;
        current.authorize(actor)?;
        if current.version != request.expected_version {
            return Err(RepositoryError::SongGuessVersionConflict {
                current: Box::new(current),
            });
        }
        let mut updated = current.clone();
        let result = updated.apply(actor, &request.command)?;
        let previous_version = updated.version;
        updated.version = updated
            .version
            .checked_add(1)
            .filter(|version| *version <= crate::model::MAX_SAFE_VERSION)
            .ok_or(ModelError::InvalidState)?;
        updated.validate()?;
        let response = SongGuessCommandResponse {
            request_id: request.request_id.clone(),
            previous_version,
            version: updated.version,
            snapshot: updated.snapshot(actor, now_ms)?,
            result,
        };
        sqlx::query(
            r#"UPDATE "PlaySession"
               SET "version" = $2, "state" = $3, "updatedAt" = NOW()
               WHERE "id" = $1 AND "gameKind" = 'song-guess'"#,
        )
        .bind(session_id)
        .bind(as_i64(updated.version)?)
        .bind(Json(&updated))
        .execute(&mut *tx)
        .await
        .map_err(storage)?;
        insert_song_guess_outbox(&mut tx, &updated, "session_changed").await?;
        insert_receipt(
            &mut tx,
            SONG_GUESS_COMMAND_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn create_shadow_alliance_session(
        &self,
        actor: &ActorContext,
        board_id: &str,
        request: &CreateShadowAllianceSessionRequest,
        now_ms: i64,
    ) -> Result<Execution<ShadowAllianceSessionResponse>, RepositoryError> {
        validate_shadow_request_id(&request.request_id)?;
        if actor.role != ActorRole::Host
            || board_id.is_empty()
            || request.classroom_id.trim().is_empty()
        {
            return Err(ModelError::Forbidden.into());
        }
        let payload_hash = request_hash(SHADOW_ALLIANCE_CREATE_SCOPE, board_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        lock_scope(&mut tx, board_id).await?;
        if let Some(replay) = lookup_receipt::<ShadowAllianceSessionResponse>(
            &mut tx,
            SHADOW_ALLIANCE_CREATE_SCOPE,
            board_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        validate_shadow_board_in_tx(&mut tx, board_id, &request.classroom_id).await?;
        if has_current_session_in_tx(&mut tx, board_id).await? {
            return Err(RepositoryError::SessionAlreadyExists);
        }
        let record = ShadowAllianceSessionRecord::new(
            Uuid::new_v4().to_string(),
            board_id.to_owned(),
            request.classroom_id.clone(),
            actor.subject.clone(),
            request.participants.clone(),
            request.total_rounds,
            None,
            now_ms,
        )?;
        insert_shadow_alliance_session(&mut tx, &record).await?;
        insert_shadow_alliance_outbox(&mut tx, &record, "session_created").await?;
        let response = ShadowAllianceSessionResponse {
            request_id: request.request_id.clone(),
            snapshot: record.snapshot(actor, now_ms)?,
        };
        insert_receipt(
            &mut tx,
            SHADOW_ALLIANCE_CREATE_SCOPE,
            board_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn current_shadow_alliance_session(
        &self,
        board_id: &str,
    ) -> Result<Option<ShadowAllianceSessionRecord>, RepositoryError> {
        let value = sqlx::query_scalar::<_, Json<ShadowAllianceSessionRecord>>(
            r#"SELECT "state" FROM "PlaySession"
               WHERE "boardId" = $1 AND "current" = TRUE
                 AND "gameKind" = 'shadow-alliance'"#,
        )
        .bind(board_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?;
        value
            .map(|Json(record)| checked_shadow_alliance(record))
            .transpose()
    }

    async fn get_shadow_alliance_session(
        &self,
        session_id: &str,
    ) -> Result<ShadowAllianceSessionRecord, RepositoryError> {
        let Json(record) = sqlx::query_scalar::<_, Json<ShadowAllianceSessionRecord>>(
            r#"SELECT "state" FROM "PlaySession"
               WHERE "id" = $1 AND "gameKind" = 'shadow-alliance'"#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .ok_or(RepositoryError::NotFound)?;
        checked_shadow_alliance(record)
    }

    async fn execute_shadow_alliance_command(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &ShadowAllianceCommandRequest,
        now_ms: i64,
    ) -> Result<Execution<ShadowAllianceCommandResponse>, RepositoryError> {
        validate_shadow_request_id(&request.request_id)?;
        if request.command_schema_version != SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION {
            return Err(RepositoryError::UnsupportedSchema);
        }
        let payload_hash = request_hash(SHADOW_ALLIANCE_COMMAND_SCOPE, session_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        if let Some(replay) = lookup_receipt::<ShadowAllianceCommandResponse>(
            &mut tx,
            SHADOW_ALLIANCE_COMMAND_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        let current = lock_shadow_alliance_session(&mut tx, session_id).await?;
        current.authorize(actor)?;
        if current.version != request.expected_version {
            return Err(RepositoryError::ShadowAllianceVersionConflict {
                current: Box::new(current),
            });
        }
        let previous_result_students = current.result_student_ids();
        let mut updated = current.clone();
        let previous_version = updated.version;
        updated.apply(actor, &request.command, now_ms)?;
        let mut result_ids = Vec::new();
        for result in updated
            .result_records()?
            .into_iter()
            .filter(|result| !previous_result_students.contains(&result.student_id))
        {
            result_ids.push(
                append_game_result(&mut tx, &result)
                    .await
                    .map_err(game_result_storage)?,
            );
        }
        update_shadow_alliance_session(&mut tx, &updated).await?;
        update_shadow_alliance_participants(&mut tx, &updated).await?;
        insert_shadow_alliance_outbox(&mut tx, &updated, "session_changed").await?;
        let response = ShadowAllianceCommandResponse {
            request_id: request.request_id.clone(),
            previous_version,
            version: updated.version,
            snapshot: updated.snapshot(actor, now_ms)?,
            result_ids,
        };
        insert_receipt(
            &mut tx,
            SHADOW_ALLIANCE_COMMAND_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn rematch_shadow_alliance_session(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &RematchRequest,
        now_ms: i64,
    ) -> Result<Execution<ShadowAllianceSessionResponse>, RepositoryError> {
        validate_shadow_request_id(&request.request_id)?;
        let payload_hash = request_hash(SHADOW_ALLIANCE_REMATCH_SCOPE, session_id, actor, request)?;
        let mut tx = self.pool.begin().await.map_err(storage)?;
        if let Some(replay) = lookup_receipt::<ShadowAllianceSessionResponse>(
            &mut tx,
            SHADOW_ALLIANCE_REMATCH_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        if actor.role != ActorRole::Host {
            return Err(ModelError::Forbidden.into());
        }
        let board_id = session_board_id_in_tx(&mut tx, session_id).await?;
        lock_scope(&mut tx, &board_id).await?;
        let current = lock_shadow_alliance_session(&mut tx, session_id).await?;
        current.authorize(actor)?;
        let current_id = current_shadow_alliance_session_in_tx(&mut tx, &current.board_id)
            .await?
            .map(|record| record.session_id);
        if current_id.as_deref() != Some(session_id) {
            return Err(RepositoryError::ShadowAllianceVersionConflict {
                current: Box::new(current),
            });
        }
        let rematch = current.rematch(Uuid::new_v4().to_string(), now_ms)?;
        sqlx::query(
            r#"UPDATE "PlaySession"
               SET "current" = FALSE, "updatedAt" = NOW()
               WHERE "id" = $1 AND "gameKind" = 'shadow-alliance'"#,
        )
        .bind(session_id)
        .execute(&mut *tx)
        .await
        .map_err(storage)?;
        insert_shadow_alliance_session(&mut tx, &rematch).await?;
        insert_shadow_alliance_outbox(&mut tx, &rematch, "session_created").await?;
        let response = ShadowAllianceSessionResponse {
            request_id: request.request_id.clone(),
            snapshot: rematch.snapshot(actor, now_ms)?,
        };
        insert_receipt(
            &mut tx,
            SHADOW_ALLIANCE_REMATCH_SCOPE,
            session_id,
            &request.request_id,
            &payload_hash,
            &response,
        )
        .await?;
        tx.commit().await.map_err(storage)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn claim_outbox(&self, limit: usize) -> Result<Vec<OutboxEvent>, RepositoryError> {
        let limit =
            i64::try_from(limit.clamp(1, 100)).map_err(|error| storage(error.to_string()))?;
        let lock_token = Uuid::new_v4().to_string();
        let rows = sqlx::query(
            r#"WITH candidates AS (
                 SELECT "id"
                 FROM "PlayOutbox"
                 WHERE "processedAt" IS NULL
                   AND "nextAttemptAt" <= NOW()
                   AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '2 minutes')
                 ORDER BY "createdAt"
                 FOR UPDATE SKIP LOCKED
                 LIMIT $1
               )
               UPDATE "PlayOutbox" outbox
               SET "status" = 'processing',
                   "attempts" = outbox."attempts" + 1,
                   "lockedAt" = NOW(),
                   "lockToken" = $2,
                   "updatedAt" = NOW()
               FROM candidates
               WHERE outbox."id" = candidates."id"
               RETURNING outbox."id", outbox."sessionId", outbox."boardId",
                         outbox."version", outbox."eventType", outbox."attempts",
                         outbox."lockToken""#,
        )
        .bind(limit)
        .bind(lock_token)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?;
        rows.into_iter()
            .map(|row| {
                Ok(OutboxEvent {
                    id: row.try_get("id").map_err(storage)?,
                    session_id: row.try_get("sessionId").map_err(storage)?,
                    board_id: row.try_get("boardId").map_err(storage)?,
                    version: as_u64(row.try_get::<i64, _>("version").map_err(storage)?)?,
                    event_type: row.try_get("eventType").map_err(storage)?,
                    attempts: u32::try_from(row.try_get::<i32, _>("attempts").map_err(storage)?)
                        .map_err(|error| storage(error.to_string()))?,
                    lock_token: row.try_get("lockToken").map_err(storage)?,
                })
            })
            .collect()
    }

    async fn complete_outbox(
        &self,
        ids: &[String],
        lock_token: &str,
    ) -> Result<(), RepositoryError> {
        if ids.is_empty() {
            return Ok(());
        }
        sqlx::query(
            r#"UPDATE "PlayOutbox"
               SET "status" = 'processed', "processedAt" = NOW(), "lockedAt" = NULL,
                   "lockToken" = NULL, "lastError" = NULL, "updatedAt" = NOW()
               WHERE "id" = ANY($1) AND "lockToken" = $2 AND "processedAt" IS NULL"#,
        )
        .bind(ids)
        .bind(lock_token)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }
}

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
