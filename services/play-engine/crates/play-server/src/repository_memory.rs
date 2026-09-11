use super::*;
#[async_trait]
impl PlayRepository for MemoryRepository {
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
        let key = receipt_key(CREATE_SCOPE, board_id, &request.request_id);
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        if state.current_by_board.contains_key(board_id) {
            return Err(RepositoryError::SessionAlreadyExists);
        }
        let participants: [_; 2] = request
            .participants
            .clone()
            .try_into()
            .map_err(|_| ModelError::InvalidRequest)?;
        let session_id = Uuid::new_v4().to_string();
        let mut record = SessionRecord::new(
            session_id.clone(),
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
        state.sessions.insert(session_id.clone(), record.clone());
        state
            .current_by_board
            .insert(board_id.to_owned(), session_id.clone());
        insert_outbox(&mut state, &record, "session_created");
        store_receipt(&mut state, key, payload_hash, &response)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn current_session(
        &self,
        board_id: &str,
    ) -> Result<Option<SessionRecord>, RepositoryError> {
        let state = self.state.lock().await;
        Ok(state
            .current_by_board
            .get(board_id)
            .and_then(|session_id| state.sessions.get(session_id))
            .cloned())
    }

    async fn get_session(&self, session_id: &str) -> Result<SessionRecord, RepositoryError> {
        self.state
            .lock()
            .await
            .sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)
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
        let key = receipt_key(COMMAND_SCOPE, session_id, &request.request_id);
        let mut state = self.state.lock().await;

        // This lookup intentionally precedes the optimistic concurrency check.
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }

        let current = state
            .sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)?;
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
        state
            .sessions
            .insert(session_id.to_owned(), updated.clone());
        insert_outbox(&mut state, &updated, "session_changed");
        store_receipt(&mut state, key, payload_hash, &response)?;
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
        let key = receipt_key(REMATCH_SCOPE, session_id, &request.request_id);
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        let current = state
            .sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)?;
        current.authorize(actor)?;
        if actor.role != ActorRole::Host {
            return Err(ModelError::Forbidden.into());
        }
        if state
            .current_by_board
            .get(&current.board_id)
            .map(String::as_str)
            != Some(session_id)
        {
            return Err(RepositoryError::VersionConflict {
                current: Box::new(current),
            });
        }
        let new_session_id = Uuid::new_v4().to_string();
        let rematch = current.rematch(new_session_id.clone(), now_ms)?;
        let response = SessionResponse {
            request_id: request.request_id.clone(),
            snapshot: rematch.snapshot(actor, now_ms)?,
        };
        state
            .sessions
            .insert(new_session_id.clone(), rematch.clone());
        state
            .current_by_board
            .insert(current.board_id.clone(), new_session_id);
        insert_outbox(&mut state, &rematch, "session_created");
        store_receipt(&mut state, key, payload_hash, &response)?;
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
        let receipt_scope = if request.room_mode == crate::model::SongGuessRoomMode::StudentFree {
            format!("{SONG_GUESS_CREATE_SCOPE}:{}", actor.subject)
        } else {
            SONG_GUESS_CREATE_SCOPE.to_owned()
        };
        let key = receipt_key(&receipt_scope, board_id, &request.request_id);
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        if request.room_mode == crate::model::SongGuessRoomMode::StudentFree
            && state.song_guess_sessions.values().any(|r| {
                r.board_id == board_id
                    && r.host_subject == actor.subject
                    && r.state.phase != play_domain::song_guess::SongGuessPhase::Finished
            })
        {
            return Err(RepositoryError::SessionAlreadyExists);
        }
        if request.room_mode == crate::model::SongGuessRoomMode::TeacherLed {
            if let Some(id) = state.current_by_board.get(board_id) {
                if !state.song_guess_sessions.get(id).is_some_and(|r| {
                    r.state.phase == play_domain::song_guess::SongGuessPhase::Finished
                }) {
                    return Err(RepositoryError::SessionAlreadyExists);
                }
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
        if record.room_mode == crate::model::SongGuessRoomMode::TeacherLed {
            state
                .current_by_board
                .insert(board_id.to_owned(), record.session_id.clone());
        }
        state
            .song_guess_sessions
            .insert(record.session_id.clone(), record.clone());
        insert_song_guess_outbox(&mut state, &record, "session_created");
        store_receipt(&mut state, key, payload_hash, &response)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn list_song_guess_sessions(
        &self,
        board_id: &str,
    ) -> Result<Vec<SongGuessSessionRecord>, RepositoryError> {
        let state = self.state.lock().await;
        let mut records: Vec<_> = state
            .song_guess_sessions
            .values()
            .filter(|r| r.board_id == board_id)
            .cloned()
            .collect();
        records.sort_by(|a, b| {
            b.created_at_ms
                .cmp(&a.created_at_ms)
                .then_with(|| a.session_id.cmp(&b.session_id))
        });
        records.truncate(100);
        Ok(records)
    }

    async fn advance_song_guess_session(
        &self,
        actor: &ActorContext,
        session_id: &str,
        now_ms: i64,
    ) -> Result<SongGuessSessionRecord, RepositoryError> {
        let mut state = self.state.lock().await;
        let mut record = state
            .song_guess_sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)?;
        record.authorize(actor)?;
        if record.advance_due(now_ms)? {
            state
                .song_guess_sessions
                .insert(session_id.to_owned(), record.clone());
            insert_song_guess_outbox(&mut state, &record, "session_changed");
        }
        Ok(record)
    }

    async fn current_song_guess_session(
        &self,
        board_id: &str,
    ) -> Result<Option<SongGuessSessionRecord>, RepositoryError> {
        let state = self.state.lock().await;
        Ok(state
            .current_by_board
            .get(board_id)
            .and_then(|session_id| state.song_guess_sessions.get(session_id))
            .cloned())
    }

    async fn get_song_guess_session(
        &self,
        session_id: &str,
    ) -> Result<SongGuessSessionRecord, RepositoryError> {
        self.state
            .lock()
            .await
            .song_guess_sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)
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
        let key = receipt_key(SONG_GUESS_COMMAND_SCOPE, session_id, &request.request_id);
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        let current = state
            .song_guess_sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)?;
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
        state
            .song_guess_sessions
            .insert(session_id.to_owned(), updated.clone());
        insert_song_guess_outbox(&mut state, &updated, "session_changed");
        store_receipt(&mut state, key, payload_hash, &response)?;
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
        let key = receipt_key(SHADOW_ALLIANCE_CREATE_SCOPE, board_id, &request.request_id);
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        if state.current_by_board.contains_key(board_id) {
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
        let response = ShadowAllianceSessionResponse {
            request_id: request.request_id.clone(),
            snapshot: record.snapshot(actor, now_ms)?,
        };
        state
            .current_by_board
            .insert(board_id.to_owned(), record.session_id.clone());
        state
            .shadow_alliance_sessions
            .insert(record.session_id.clone(), record.clone());
        insert_shadow_alliance_outbox(&mut state, &record, "session_created");
        store_receipt(&mut state, key, payload_hash, &response)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn current_shadow_alliance_session(
        &self,
        board_id: &str,
    ) -> Result<Option<ShadowAllianceSessionRecord>, RepositoryError> {
        let state = self.state.lock().await;
        Ok(state
            .current_by_board
            .get(board_id)
            .and_then(|session_id| state.shadow_alliance_sessions.get(session_id))
            .cloned())
    }

    async fn get_shadow_alliance_session(
        &self,
        session_id: &str,
    ) -> Result<ShadowAllianceSessionRecord, RepositoryError> {
        self.state
            .lock()
            .await
            .shadow_alliance_sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)
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
        let key = receipt_key(
            SHADOW_ALLIANCE_COMMAND_SCOPE,
            session_id,
            &request.request_id,
        );
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        let current = state
            .shadow_alliance_sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)?;
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
        let result_records = updated
            .result_records()?
            .into_iter()
            .filter(|result| !previous_result_students.contains(&result.student_id))
            .collect::<Vec<_>>();
        let mut result_ids = Vec::with_capacity(result_records.len());
        for result in result_records {
            let id = state
                .game_result_ids
                .entry(result.idempotency_key.clone())
                .or_insert_with(|| format!("play-result:{}", result.idempotency_key))
                .clone();
            result_ids.push(id);
        }
        let response = ShadowAllianceCommandResponse {
            request_id: request.request_id.clone(),
            previous_version,
            version: updated.version,
            snapshot: updated.snapshot(actor, now_ms)?,
            result_ids,
        };
        state
            .shadow_alliance_sessions
            .insert(session_id.to_owned(), updated.clone());
        insert_shadow_alliance_outbox(&mut state, &updated, "session_changed");
        store_receipt(&mut state, key, payload_hash, &response)?;
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
        let key = receipt_key(
            SHADOW_ALLIANCE_REMATCH_SCOPE,
            session_id,
            &request.request_id,
        );
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        if actor.role != ActorRole::Host {
            return Err(ModelError::Forbidden.into());
        }
        let current = state
            .shadow_alliance_sessions
            .get(session_id)
            .cloned()
            .ok_or(RepositoryError::NotFound)?;
        current.authorize(actor)?;
        if state
            .current_by_board
            .get(&current.board_id)
            .map(String::as_str)
            != Some(session_id)
        {
            return Err(RepositoryError::ShadowAllianceVersionConflict {
                current: Box::new(current),
            });
        }
        let rematch = current.rematch(Uuid::new_v4().to_string(), now_ms)?;
        let response = ShadowAllianceSessionResponse {
            request_id: request.request_id.clone(),
            snapshot: rematch.snapshot(actor, now_ms)?,
        };
        state
            .shadow_alliance_sessions
            .insert(rematch.session_id.clone(), rematch.clone());
        state
            .current_by_board
            .insert(current.board_id.clone(), rematch.session_id.clone());
        insert_shadow_alliance_outbox(&mut state, &rematch, "session_created");
        store_receipt(&mut state, key, payload_hash, &response)?;
        Ok(Execution {
            value: response,
            replayed: false,
        })
    }

    async fn claim_outbox(&self, limit: usize) -> Result<Vec<OutboxEvent>, RepositoryError> {
        let mut state = self.state.lock().await;
        let completed = state.completed_outbox.clone();
        let lock_token = Uuid::new_v4().to_string();
        let mut claimed = Vec::new();
        for event in &mut state.outbox {
            if claimed.len() >= limit || completed.contains(&event.id) {
                continue;
            }
            event.attempts = event.attempts.saturating_add(1);
            event.lock_token.clone_from(&lock_token);
            claimed.push(event.clone());
        }
        Ok(claimed)
    }

    async fn complete_outbox(
        &self,
        ids: &[String],
        lock_token: &str,
    ) -> Result<(), RepositoryError> {
        let mut state = self.state.lock().await;
        let matching = state
            .outbox
            .iter()
            .filter(|event| event.lock_token == lock_token && ids.contains(&event.id))
            .map(|event| event.id.clone())
            .collect::<Vec<_>>();
        state.completed_outbox.extend(matching);
        Ok(())
    }
}

fn receipt_key(scope_type: &str, scope_id: &str, request_id: &str) -> (String, String, String) {
    (
        scope_type.to_owned(),
        scope_id.to_owned(),
        request_id.to_owned(),
    )
}
