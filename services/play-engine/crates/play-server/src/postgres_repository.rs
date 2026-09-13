use super::*;
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
        let mut record = SessionRecord::new(
            Uuid::new_v4().to_string(),
            board_id.to_owned(),
            actor.subject.clone(),
            participants,
            None,
            now_ms,
        )?;
        if request.auto_start {
            record.start_immediately()?;
        }
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
        if board_id.is_empty() {
            return Err(ModelError::Forbidden.into());
        }
        let payload_hash = request_hash(SONG_GUESS_CREATE_SCOPE, board_id, actor, request)?;
        // Keep scopeType aligned with the database allow-list. Student-free
        // rooms still need per-student idempotency isolation, so put the actor
        // in scopeId rather than inventing a suffixed scopeType.
        let (receipt_scope, receipt_scope_id) =
            if request.room_mode == crate::model::SongGuessRoomMode::StudentFree {
                (
                    SONG_GUESS_CREATE_SCOPE.to_owned(),
                    format!("{board_id}:{}", actor.subject),
                )
            } else {
                (SONG_GUESS_CREATE_SCOPE.to_owned(), board_id.to_owned())
            };
        let mut tx = self.pool.begin().await.map_err(storage)?;
        lock_scope(&mut tx, board_id).await?;
        if let Some(replay) = lookup_receipt::<SongGuessSessionResponse>(
            &mut tx,
            &receipt_scope,
            &receipt_scope_id,
            &request.request_id,
            &payload_hash,
        )
        .await?
        {
            tx.commit().await.map_err(storage)?;
            return Ok(replay);
        }
        if request.room_mode == crate::model::SongGuessRoomMode::StudentFree {
            let exists: bool = sqlx::query_scalar(r#"SELECT EXISTS(SELECT 1 FROM "PlaySession" WHERE "boardId" = $1 AND "gameKind" = 'song-guess' AND "hostSubject" = $2 AND "state"->'state'->>'phase' <> 'finished')"#)
                .bind(board_id).bind(&actor.subject).fetch_one(&mut *tx).await.map_err(storage)?;
            if exists {
                return Err(RepositoryError::SessionAlreadyExists);
            }
        }
        if request.room_mode == crate::model::SongGuessRoomMode::TeacherLed {
            sqlx::query(r#"UPDATE "PlaySession" SET "current" = FALSE WHERE "boardId" = $1 AND "gameKind" = 'song-guess' AND "state"->'state'->>'phase' = 'finished'"#)
                .bind(board_id).execute(&mut *tx).await.map_err(storage)?;
            if has_current_session_in_tx(&mut tx, board_id).await? {
                return Err(RepositoryError::SessionAlreadyExists);
            }
        }
        let record = SongGuessSessionRecord::from_request(
            Uuid::new_v4().to_string(),
            board_id.to_owned(),
            actor,
            request,
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
            &receipt_scope,
            &receipt_scope_id,
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

    async fn list_song_guess_sessions(
        &self,
        board_id: &str,
    ) -> Result<Vec<SongGuessSessionRecord>, RepositoryError> {
        let values = sqlx::query_scalar::<_, Json<SongGuessSessionRecord>>(r#"SELECT "state" FROM "PlaySession" WHERE "boardId" = $1 AND "gameKind" = 'song-guess' ORDER BY "createdAtMs" DESC, "id" ASC LIMIT 100"#)
            .bind(board_id).fetch_all(&self.pool).await.map_err(storage)?;
        values
            .into_iter()
            .map(|Json(record)| checked_song_guess(record))
            .collect()
    }

    async fn advance_song_guess_session(
        &self,
        actor: &ActorContext,
        session_id: &str,
        now_ms: i64,
    ) -> Result<SongGuessSessionRecord, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(storage)?;
        let mut record = lock_song_guess_session(&mut tx, session_id).await?;
        record.authorize(actor)?;
        if record.advance_due(now_ms)? {
            sqlx::query(r#"UPDATE "PlaySession" SET "version" = $2, "state" = $3, "updatedAt" = NOW() WHERE "id" = $1 AND "gameKind" = 'song-guess'"#)
                .bind(session_id).bind(as_i64(record.version)?).bind(Json(&record))
                .execute(&mut *tx).await.map_err(storage)?;
            insert_song_guess_outbox(&mut tx, &record, "session_changed").await?;
        }
        tx.commit().await.map_err(storage)?;
        Ok(record)
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
        self.advance_song_guess_session(actor, session_id, now_ms)
            .await?;
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
        let allow_stale_guess = matches!(
            &request.command,
            crate::model::SongGuessIntent::Guess {
                round_id: Some(round_id),
                ..
            } if current.rules_version == crate::model::SONG_GUESS_RULES_VERSION
                && current.state.phase == play_domain::song_guess::SongGuessPhase::Guessing
                && current
                    .state
                    .current_round()
                    .map(|round| round.round_id.as_str() == round_id.as_str())
                .unwrap_or(false)
        );
        let allow_stale_join = matches!(
            &request.command,
            crate::model::SongGuessIntent::Join
                if current.rules_version == crate::model::SONG_GUESS_RULES_VERSION
                    && current.state.phase == play_domain::song_guess::SongGuessPhase::Lobby
        );
        if current.version != request.expected_version
            && !((allow_stale_guess || allow_stale_join)
                && request.expected_version < current.version)
        {
            return Err(RepositoryError::SongGuessVersionConflict {
                current: Box::new(current),
            });
        }
        let mut updated = current.clone();
        let result = updated.apply_at(actor, &request.command, now_ms)?;
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
        if current.version != request.expected_version
            && !current.permits_stale_participant_lobby_command(actor, &request.command)?
        {
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
