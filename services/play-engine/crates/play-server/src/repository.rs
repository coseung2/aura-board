use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::model::{
    ActorContext, ActorRole, CommandRequest, CommandResponse, CreateSessionRequest,
    CreateSongGuessSessionRequest, ModelError, RematchRequest, SessionRecord, SessionResponse,
    SongGuessCommandRequest, SongGuessCommandResponse, SongGuessSessionRecord,
    SongGuessSessionResponse, validate_request_id,
};
use crate::shadow::{
    CreateShadowAllianceSessionRequest, SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
    ShadowAllianceCommandRequest, ShadowAllianceCommandResponse, ShadowAllianceSessionRecord,
    ShadowAllianceSessionResponse, validate_shadow_request_id,
};

pub(crate) const CREATE_SCOPE: &str = "board_create";
pub(crate) const COMMAND_SCOPE: &str = "session_command";
pub(crate) const REMATCH_SCOPE: &str = "session_rematch";
pub(crate) const SONG_GUESS_CREATE_SCOPE: &str = "song_guess_board_create";
pub(crate) const SONG_GUESS_COMMAND_SCOPE: &str = "song_guess_session_command";
pub(crate) const SHADOW_ALLIANCE_CREATE_SCOPE: &str = "shadow_alliance_board_create";
pub(crate) const SHADOW_ALLIANCE_COMMAND_SCOPE: &str = "shadow_alliance_session_command";
pub(crate) const SHADOW_ALLIANCE_REMATCH_SCOPE: &str = "shadow_alliance_session_rematch";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxEvent {
    pub id: String,
    pub session_id: String,
    pub board_id: String,
    pub version: u64,
    pub event_type: String,
    pub attempts: u32,
    pub lock_token: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Execution<T> {
    pub value: T,
    pub replayed: bool,
}

#[derive(Clone, Debug, Error, PartialEq)]
pub enum RepositoryError {
    #[error("not_found")]
    NotFound,
    #[error("session_already_exists")]
    SessionAlreadyExists,
    #[error("version_conflict")]
    VersionConflict { current: Box<SessionRecord> },
    #[error("song_guess_version_conflict")]
    SongGuessVersionConflict {
        current: Box<SongGuessSessionRecord>,
    },
    #[error("shadow_alliance_version_conflict")]
    ShadowAllianceVersionConflict {
        current: Box<ShadowAllianceSessionRecord>,
    },
    #[error("idempotency_key_reuse")]
    IdempotencyKeyReuse,
    #[error("request_schema_unsupported")]
    UnsupportedSchema,
    #[error("model:{0}")]
    Model(#[from] ModelError),
    #[error("storage:{0}")]
    Storage(String),
}

#[async_trait]
pub trait PlayRepository: Send + Sync {
    async fn create_session(
        &self,
        actor: &ActorContext,
        board_id: &str,
        request: &CreateSessionRequest,
        now_ms: i64,
    ) -> Result<Execution<SessionResponse>, RepositoryError>;

    async fn current_session(
        &self,
        board_id: &str,
    ) -> Result<Option<SessionRecord>, RepositoryError>;

    async fn get_session(&self, session_id: &str) -> Result<SessionRecord, RepositoryError>;

    async fn execute_command(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &CommandRequest,
        now_ms: i64,
    ) -> Result<Execution<CommandResponse>, RepositoryError>;

    async fn rematch(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &RematchRequest,
        now_ms: i64,
    ) -> Result<Execution<SessionResponse>, RepositoryError>;

    async fn create_song_guess_session(
        &self,
        actor: &ActorContext,
        board_id: &str,
        request: &CreateSongGuessSessionRequest,
        now_ms: i64,
    ) -> Result<Execution<SongGuessSessionResponse>, RepositoryError>;

    async fn current_song_guess_session(
        &self,
        board_id: &str,
    ) -> Result<Option<SongGuessSessionRecord>, RepositoryError>;

    async fn get_song_guess_session(
        &self,
        session_id: &str,
    ) -> Result<SongGuessSessionRecord, RepositoryError>;

    async fn execute_song_guess_command(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &SongGuessCommandRequest,
        now_ms: i64,
    ) -> Result<Execution<SongGuessCommandResponse>, RepositoryError>;

    async fn create_shadow_alliance_session(
        &self,
        actor: &ActorContext,
        board_id: &str,
        request: &CreateShadowAllianceSessionRequest,
        now_ms: i64,
    ) -> Result<Execution<ShadowAllianceSessionResponse>, RepositoryError>;

    async fn current_shadow_alliance_session(
        &self,
        board_id: &str,
    ) -> Result<Option<ShadowAllianceSessionRecord>, RepositoryError>;

    async fn get_shadow_alliance_session(
        &self,
        session_id: &str,
    ) -> Result<ShadowAllianceSessionRecord, RepositoryError>;

    async fn execute_shadow_alliance_command(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &ShadowAllianceCommandRequest,
        now_ms: i64,
    ) -> Result<Execution<ShadowAllianceCommandResponse>, RepositoryError>;

    async fn rematch_shadow_alliance_session(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &RematchRequest,
        now_ms: i64,
    ) -> Result<Execution<ShadowAllianceSessionResponse>, RepositoryError>;

    async fn claim_outbox(&self, limit: usize) -> Result<Vec<OutboxEvent>, RepositoryError>;

    async fn complete_outbox(
        &self,
        ids: &[String],
        lock_token: &str,
    ) -> Result<(), RepositoryError>;
}

#[derive(Clone, Debug)]
struct Receipt {
    request_hash: String,
    response: serde_json::Value,
}

#[derive(Default)]
struct MemoryState {
    sessions: HashMap<String, SessionRecord>,
    song_guess_sessions: HashMap<String, SongGuessSessionRecord>,
    shadow_alliance_sessions: HashMap<String, ShadowAllianceSessionRecord>,
    game_result_ids: HashMap<String, String>,
    current_by_board: HashMap<String, String>,
    receipts: HashMap<(String, String, String), Receipt>,
    outbox: Vec<OutboxEvent>,
    completed_outbox: HashSet<String>,
}

#[derive(Clone, Default)]
pub struct MemoryRepository {
    state: Arc<Mutex<MemoryState>>,
}

impl MemoryRepository {
    pub fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    pub async fn outbox(&self) -> Vec<OutboxEvent> {
        self.state.lock().await.outbox.clone()
    }
}

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
        let record = SessionRecord::new(
            session_id.clone(),
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
        if actor.role != ActorRole::Host || board_id.is_empty() {
            return Err(ModelError::Forbidden.into());
        }
        let payload_hash = request_hash(SONG_GUESS_CREATE_SCOPE, board_id, actor, request)?;
        let key = receipt_key(SONG_GUESS_CREATE_SCOPE, board_id, &request.request_id);
        let mut state = self.state.lock().await;
        if let Some(receipt) = state.receipts.get(&key) {
            return replay(receipt, &payload_hash);
        }
        if state.current_by_board.contains_key(board_id) {
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
        state
            .current_by_board
            .insert(board_id.to_owned(), record.session_id.clone());
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
        if current.version != request.expected_version {
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

pub(crate) fn request_hash<T: Serialize>(
    scope_type: &str,
    scope_id: &str,
    actor: &ActorContext,
    request: &T,
) -> Result<String, RepositoryError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct HashInput<'a, T> {
        scope_type: &'a str,
        scope_id: &'a str,
        actor_subject: &'a str,
        actor_role: ActorRole,
        request: &'a T,
    }
    let bytes = serde_json::to_vec(&HashInput {
        scope_type,
        scope_id,
        actor_subject: &actor.subject,
        actor_role: actor.role,
        request,
    })
    .map_err(|error| RepositoryError::Storage(error.to_string()))?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

fn store_receipt<T: Serialize>(
    state: &mut MemoryState,
    key: (String, String, String),
    request_hash: String,
    response: &T,
) -> Result<(), RepositoryError> {
    state.receipts.insert(
        key,
        Receipt {
            request_hash,
            response: serde_json::to_value(response)
                .map_err(|error| RepositoryError::Storage(error.to_string()))?,
        },
    );
    Ok(())
}

fn replay<T: for<'de> Deserialize<'de>>(
    receipt: &Receipt,
    request_hash: &str,
) -> Result<Execution<T>, RepositoryError> {
    if receipt.request_hash != request_hash {
        return Err(RepositoryError::IdempotencyKeyReuse);
    }
    Ok(Execution {
        value: serde_json::from_value(receipt.response.clone())
            .map_err(|error| RepositoryError::Storage(error.to_string()))?,
        replayed: true,
    })
}

fn insert_outbox(state: &mut MemoryState, record: &SessionRecord, event_type: &str) {
    state.outbox.push(OutboxEvent {
        id: Uuid::new_v4().to_string(),
        session_id: record.session_id.clone(),
        board_id: record.board_id.clone(),
        version: record.version,
        event_type: event_type.to_owned(),
        attempts: 0,
        lock_token: String::new(),
    });
}

fn insert_song_guess_outbox(
    state: &mut MemoryState,
    record: &SongGuessSessionRecord,
    event_type: &str,
) {
    state.outbox.push(OutboxEvent {
        id: Uuid::new_v4().to_string(),
        session_id: record.session_id.clone(),
        board_id: record.board_id.clone(),
        version: record.version,
        event_type: event_type.to_owned(),
        attempts: 0,
        lock_token: String::new(),
    });
}

fn insert_shadow_alliance_outbox(
    state: &mut MemoryState,
    record: &ShadowAllianceSessionRecord,
    event_type: &str,
) {
    state.outbox.push(OutboxEvent {
        id: Uuid::new_v4().to_string(),
        session_id: record.session_id.clone(),
        board_id: record.board_id.clone(),
        version: record.version,
        event_type: event_type.to_owned(),
        attempts: 0,
        lock_token: String::new(),
    });
}

#[cfg(test)]
mod tests {
    use play_domain::omok::OmokPosition;
    use play_domain::song_guess::{SongGuessClip, SongGuessParticipantSeed, SongGuessRoundSeed};

    use super::*;
    use crate::model::{
        CreateSongGuessSessionRequest, OmokIntent, ParticipantSeed, SongGuessCommandRequest,
        SongGuessIntent,
    };
    use crate::shadow::{
        CreateShadowAllianceSessionRequest, SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
        ShadowAllianceCommandRequest, ShadowAllianceIntent, ShadowAllianceParticipantSeed,
    };

    fn host() -> ActorContext {
        ActorContext {
            subject: "teacher:1".to_owned(),
            role: ActorRole::Host,
        }
    }

    fn participant(id: &str) -> ActorContext {
        ActorContext {
            subject: format!("student:{id}"),
            role: ActorRole::Participant,
        }
    }

    fn create_request(id: &str) -> CreateSessionRequest {
        CreateSessionRequest {
            request_id: id.to_owned(),
            participants: vec![
                ParticipantSeed {
                    actor_subject: "student:first".to_owned(),
                    display_name: "첫째".to_owned(),
                },
                ParticipantSeed {
                    actor_subject: "student:second".to_owned(),
                    display_name: "둘째".to_owned(),
                },
            ],
        }
    }

    async fn setup() -> (MemoryRepository, String) {
        let repository = MemoryRepository::new();
        let created = repository
            .create_session(&host(), "board-1", &create_request("create-1"), 100)
            .await
            .unwrap();
        (repository, created.value.snapshot.session_id)
    }

    fn song_guess_request(id: &str) -> CreateSongGuessSessionRequest {
        CreateSongGuessSessionRequest {
            request_id: id.to_owned(),
            participants: vec![
                SongGuessParticipantSeed {
                    actor_subject: "student:first".to_owned(),
                    display_name: "First".to_owned(),
                },
                SongGuessParticipantSeed {
                    actor_subject: "student:second".to_owned(),
                    display_name: "Second".to_owned(),
                },
            ],
            rounds: vec![SongGuessRoundSeed {
                round_id: "round-1".to_owned(),
                representative_answer: "Blue Moon".to_owned(),
                normalized_answer: "blue moon".to_owned(),
                aliases: vec!["BlueMoon".to_owned()],
                normalized_aliases: vec!["bluemoon".to_owned()],
                accessibility_clue: Some("A classic".to_owned()),
                clips: vec![
                    SongGuessClip {
                        asset_id: "asset-500".to_owned(),
                        tier_ms: 500,
                        mime_type: "audio/webm".to_owned(),
                        size_bytes: 100,
                        duration_ms: 500,
                    },
                    SongGuessClip {
                        asset_id: "asset-1000".to_owned(),
                        tier_ms: 1_000,
                        mime_type: "audio/webm".to_owned(),
                        size_bytes: 100,
                        duration_ms: 1_000,
                    },
                    SongGuessClip {
                        asset_id: "asset-1500".to_owned(),
                        tier_ms: 1_500,
                        mime_type: "audio/webm".to_owned(),
                        size_bytes: 100,
                        duration_ms: 1_500,
                    },
                ],
            }],
        }
    }

    async fn setup_song_guess() -> (MemoryRepository, String) {
        let repository = MemoryRepository::new();
        let created = repository
            .create_song_guess_session(
                &host(),
                "board-song",
                &song_guess_request("create-song"),
                100,
            )
            .await
            .unwrap();
        (repository, created.value.snapshot.session_id)
    }

    fn shadow_request(id: &str) -> CreateShadowAllianceSessionRequest {
        CreateShadowAllianceSessionRequest {
            request_id: id.to_owned(),
            classroom_id: "class-shadow".to_owned(),
            total_rounds: 1,
            participants: ["first", "second"]
                .into_iter()
                .map(|student_id| ShadowAllianceParticipantSeed {
                    actor_subject: format!("student:{student_id}"),
                    student_id: student_id.to_owned(),
                    display_name: student_id.to_owned(),
                })
                .collect(),
        }
    }

    async fn setup_shadow_alliance() -> (MemoryRepository, String) {
        let repository = MemoryRepository::new();
        let created = repository
            .create_shadow_alliance_session(
                &host(),
                "board-shadow",
                &shadow_request("create-shadow"),
                100,
            )
            .await
            .unwrap();
        (repository, created.value.snapshot.id)
    }

    #[tokio::test]
    async fn lost_response_retry_is_replayed_before_version_check() {
        let (repository, session_id) = setup().await;
        let request = CommandRequest {
            request_id: "ready-first".to_owned(),
            expected_version: 0,
            command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
            command: OmokIntent::Ready,
        };
        let first = repository
            .execute_command(&participant("first"), &session_id, &request, 200)
            .await
            .unwrap();
        let retry = repository
            .execute_command(&participant("first"), &session_id, &request, 300)
            .await
            .unwrap();
        assert!(!first.replayed);
        assert!(retry.replayed);
        assert_eq!(retry.value, first.value);
        assert_eq!(
            repository.get_session(&session_id).await.unwrap().version,
            1
        );
    }

    #[tokio::test]
    async fn request_id_reuse_with_different_payload_is_rejected() {
        let (repository, session_id) = setup().await;
        let ready = CommandRequest {
            request_id: "same-key".to_owned(),
            expected_version: 0,
            command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
            command: OmokIntent::Ready,
        };
        repository
            .execute_command(&participant("first"), &session_id, &ready, 200)
            .await
            .unwrap();
        let changed = CommandRequest {
            command: OmokIntent::Resign,
            ..ready
        };
        assert_eq!(
            repository
                .execute_command(&participant("first"), &session_id, &changed, 300)
                .await,
            Err(RepositoryError::IdempotencyKeyReuse)
        );
    }

    #[tokio::test]
    async fn concurrent_expected_version_is_rejected_without_mutation() {
        let (repository, session_id) = setup().await;
        let first = repository
            .execute_command(
                &participant("first"),
                &session_id,
                &CommandRequest {
                    request_id: "ready-first".to_owned(),
                    expected_version: 0,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: OmokIntent::Ready,
                },
                200,
            )
            .await
            .unwrap();
        assert_eq!(first.value.version, 1);
        let conflict = repository
            .execute_command(
                &participant("second"),
                &session_id,
                &CommandRequest {
                    request_id: "ready-second".to_owned(),
                    expected_version: 0,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: OmokIntent::Ready,
                },
                300,
            )
            .await
            .unwrap_err();
        assert!(matches!(
            conflict,
            RepositoryError::VersionConflict { current } if current.version == 1
        ));
        assert_eq!(
            repository.get_session(&session_id).await.unwrap().version,
            1
        );
    }

    #[tokio::test]
    async fn outbox_observes_only_committed_versions() {
        let (repository, session_id) = setup().await;
        repository
            .execute_command(
                &participant("first"),
                &session_id,
                &CommandRequest {
                    request_id: "ready-first".to_owned(),
                    expected_version: 0,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: OmokIntent::Ready,
                },
                200,
            )
            .await
            .unwrap();
        let events = repository.outbox().await;
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].version, 0);
        assert_eq!(events[1].version, 1);
        assert_eq!(
            repository.get_session(&session_id).await.unwrap().version,
            1
        );
    }

    #[tokio::test]
    async fn outbox_completion_requires_the_current_claim_token() {
        let (repository, _) = setup().await;
        let first_claim = repository.claim_outbox(1).await.unwrap();
        let event_id = first_claim[0].id.clone();
        let stale_token = first_claim[0].lock_token.clone();

        let second_claim = repository.claim_outbox(1).await.unwrap();
        assert_eq!(second_claim[0].id, event_id);
        assert_ne!(second_claim[0].lock_token, stale_token);

        repository
            .complete_outbox(std::slice::from_ref(&event_id), &stale_token)
            .await
            .unwrap();
        let third_claim = repository.claim_outbox(1).await.unwrap();
        assert_eq!(third_claim[0].id, event_id);

        repository
            .complete_outbox(std::slice::from_ref(&event_id), &third_claim[0].lock_token)
            .await
            .unwrap();
        let next = repository.claim_outbox(1).await.unwrap();
        assert!(next.is_empty());
    }

    #[tokio::test]
    async fn full_first_game_flow_reaches_a_win() {
        let (repository, session_id) = setup().await;
        let mut version = 0;
        for (actor, id) in [(participant("first"), "r1"), (participant("second"), "r2")] {
            let response = repository
                .execute_command(
                    &actor,
                    &session_id,
                    &CommandRequest {
                        request_id: id.to_owned(),
                        expected_version: version,
                        command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                        command: OmokIntent::Ready,
                    },
                    200,
                )
                .await
                .unwrap();
            version = response.value.version;
        }
        version = repository
            .execute_command(
                &host(),
                &session_id,
                &CommandRequest {
                    request_id: "start".to_owned(),
                    expected_version: version,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: OmokIntent::Start,
                },
                300,
            )
            .await
            .unwrap()
            .value
            .version;

        for column in 0..5 {
            version = repository
                .execute_command(
                    &participant("first"),
                    &session_id,
                    &CommandRequest {
                        request_id: format!("first-{column}"),
                        expected_version: version,
                        command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                        command: OmokIntent::PlaceStone {
                            position: OmokPosition { row: 7, column },
                        },
                    },
                    400,
                )
                .await
                .unwrap()
                .value
                .version;
            if column < 4 {
                version = repository
                    .execute_command(
                        &participant("second"),
                        &session_id,
                        &CommandRequest {
                            request_id: format!("second-{column}"),
                            expected_version: version,
                            command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                            command: OmokIntent::PlaceStone {
                                position: OmokPosition { row: 0, column },
                            },
                        },
                        400,
                    )
                    .await
                    .unwrap()
                    .value
                    .version;
            }
        }
        let record = repository.get_session(&session_id).await.unwrap();
        assert_eq!(record.version, version);
        assert_eq!(record.state.room_status, crate::model::RoomStatus::Finished);
    }

    #[tokio::test]
    async fn song_guess_snapshot_is_redacted_and_commands_are_idempotent() {
        let (repository, session_id) = setup_song_guess().await;
        let opened = repository
            .execute_song_guess_command(
                &host(),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "open-lobby".to_owned(),
                    expected_version: 0,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::OpenLobby,
                },
                200,
            )
            .await
            .unwrap();
        let serialized = serde_json::to_string(&opened.value.snapshot).unwrap();
        assert!(!serialized.contains("Blue Moon"));
        assert!(!serialized.contains("BlueMoon"));
        assert!(!serialized.contains("asset-1000"));
        assert!(!serialized.contains("asset-1500"));
        assert_eq!(opened.value.snapshot.current_round.accessibility_clue, None);
        assert_eq!(opened.value.snapshot.current_round.revealed_answer, None);
        assert!(serialized.contains("draft") || serialized.contains("lobby"));

        let retry = repository
            .execute_song_guess_command(
                &host(),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "open-lobby".to_owned(),
                    expected_version: 0,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::OpenLobby,
                },
                999,
            )
            .await
            .unwrap();
        assert!(retry.replayed);
        assert_eq!(retry.value, opened.value);

        let started = repository
            .execute_song_guess_command(
                &host(),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "start-for-reveal".to_owned(),
                    expected_version: 1,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::Start,
                },
                1_000,
            )
            .await
            .unwrap();
        assert_eq!(
            started
                .value
                .snapshot
                .current_round
                .accessibility_clue
                .as_deref(),
            Some("A classic")
        );
        assert_eq!(started.value.snapshot.current_round.revealed_answer, None);

        let revealed = repository
            .execute_song_guess_command(
                &host(),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "reveal-answer".to_owned(),
                    expected_version: 2,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::Reveal,
                },
                1_100,
            )
            .await
            .unwrap();
        assert_eq!(
            revealed
                .value
                .snapshot
                .current_round
                .revealed_answer
                .as_deref(),
            Some("Blue Moon")
        );
    }

    #[tokio::test]
    async fn song_guess_scores_fixed_tiers_and_rejects_stale_version() {
        let (repository, session_id) = setup_song_guess().await;
        for (version, command, id) in [
            (0, SongGuessIntent::OpenLobby, "open"),
            (1, SongGuessIntent::Start, "start"),
        ] {
            repository
                .execute_song_guess_command(
                    &host(),
                    &session_id,
                    &SongGuessCommandRequest {
                        request_id: id.to_owned(),
                        expected_version: version,
                        command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                        command,
                    },
                    200,
                )
                .await
                .unwrap();
        }
        let correct = repository
            .execute_song_guess_command(
                &participant("first"),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "guess".to_owned(),
                    expected_version: 2,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::Guess {
                        text: " BLUE   MOON ".to_owned(),
                    },
                },
                300,
            )
            .await
            .unwrap();
        assert_eq!(
            correct.value.result.as_ref().map(|result| result.score),
            Some(1_000)
        );

        let duplicate = repository
            .execute_song_guess_command(
                &participant("first"),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "guess-again".to_owned(),
                    expected_version: 3,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::Guess {
                        text: "blue moon".to_owned(),
                    },
                },
                300,
            )
            .await
            .unwrap();
        assert_eq!(
            duplicate.value.result.as_ref().map(|result| result.score),
            Some(0)
        );
        assert!(duplicate.value.result.as_ref().unwrap().already_scored);

        let stale = repository
            .execute_song_guess_command(
                &participant("second"),
                &session_id,
                &SongGuessCommandRequest {
                    request_id: "stale".to_owned(),
                    expected_version: 2,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command: SongGuessIntent::Guess {
                        text: "blue moon".to_owned(),
                    },
                },
                300,
            )
            .await
            .unwrap_err();
        assert!(matches!(
            stale,
            RepositoryError::SongGuessVersionConflict { current } if current.version == 4
        ));
    }

    #[tokio::test]
    async fn concurrent_song_guess_attempts_from_one_player_score_once() {
        let (repository, session_id) = setup_song_guess().await;
        for (version, command, id) in [
            (0, SongGuessIntent::OpenLobby, "open"),
            (1, SongGuessIntent::Start, "start"),
        ] {
            repository
                .execute_song_guess_command(
                    &host(),
                    &session_id,
                    &SongGuessCommandRequest {
                        request_id: id.to_owned(),
                        expected_version: version,
                        command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                        command,
                    },
                    200,
                )
                .await
                .unwrap();
        }
        let first = SongGuessCommandRequest {
            request_id: "concurrent-a".to_owned(),
            expected_version: 2,
            command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
            command: SongGuessIntent::Guess {
                text: "blue moon".to_owned(),
            },
        };
        let second = SongGuessCommandRequest {
            request_id: "concurrent-b".to_owned(),
            ..first.clone()
        };
        let first_actor = participant("first");
        let (left, right) = tokio::join!(
            repository.execute_song_guess_command(&first_actor, &session_id, &first, 300),
            repository.execute_song_guess_command(&first_actor, &session_id, &second, 300),
        );
        let successes = [left, right]
            .into_iter()
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        assert_eq!(successes.len(), 1);
        assert_eq!(successes[0].value.result.as_ref().unwrap().score, 1_000);
        assert_eq!(
            repository
                .get_song_guess_session(&session_id)
                .await
                .unwrap()
                .version,
            3
        );
    }

    #[tokio::test]
    async fn shadow_alliance_replays_terminal_result_without_leaking_choices() {
        let (repository, session_id) = setup_shadow_alliance().await;
        let join_first = ShadowAllianceCommandRequest {
            request_id: "join-first".to_owned(),
            expected_version: 0,
            command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
            command: ShadowAllianceIntent::Join,
        };
        let first_join = repository
            .execute_shadow_alliance_command(&participant("first"), &session_id, &join_first, 200)
            .await
            .unwrap();
        let retried_join = repository
            .execute_shadow_alliance_command(&participant("first"), &session_id, &join_first, 999)
            .await
            .unwrap();
        assert!(retried_join.replayed);
        assert_eq!(retried_join.value, first_join.value);

        let mut version = first_join.value.version;
        for (actor, request_id, command) in [
            (
                participant("second"),
                "join-second",
                ShadowAllianceIntent::Join,
            ),
            (
                participant("first"),
                "ready-first",
                ShadowAllianceIntent::Ready,
            ),
            (
                participant("second"),
                "ready-second",
                ShadowAllianceIntent::Ready,
            ),
            (host(), "start-shadow", ShadowAllianceIntent::Start),
        ] {
            version = repository
                .execute_shadow_alliance_command(
                    &actor,
                    &session_id,
                    &ShadowAllianceCommandRequest {
                        request_id: request_id.to_owned(),
                        expected_version: version,
                        command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                        command,
                    },
                    300,
                )
                .await
                .unwrap()
                .value
                .version;
        }

        version = repository
            .execute_shadow_alliance_command(
                &participant("first"),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: "submit-first".to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command: ShadowAllianceIntent::Submit { number: 44 },
                },
                400,
            )
            .await
            .unwrap()
            .value
            .version;
        let second_view = repository
            .get_shadow_alliance_session(&session_id)
            .await
            .unwrap()
            .snapshot(&participant("second"), 400)
            .unwrap();
        let first = second_view
            .participants
            .iter()
            .find(|candidate| candidate.student_id == "first")
            .unwrap();
        assert!(first.submitted);
        assert_eq!(first.own_number, None);

        version = repository
            .execute_shadow_alliance_command(
                &participant("second"),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: "submit-second".to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command: ShadowAllianceIntent::Submit { number: 46 },
                },
                400,
            )
            .await
            .unwrap()
            .value
            .version;
        for (request_id, command) in [
            ("reveal-terminal", ShadowAllianceIntent::Reveal),
            ("postround-terminal", ShadowAllianceIntent::Postround),
        ] {
            version = repository
                .execute_shadow_alliance_command(
                    &host(),
                    &session_id,
                    &ShadowAllianceCommandRequest {
                        request_id: request_id.to_owned(),
                        expected_version: version,
                        command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                        command,
                    },
                    500,
                )
                .await
                .unwrap()
                .value
                .version;
        }
        let terminal_request = ShadowAllianceCommandRequest {
            request_id: "finish-terminal".to_owned(),
            expected_version: version,
            command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
            command: ShadowAllianceIntent::Finish,
        };
        let terminal = repository
            .execute_shadow_alliance_command(&host(), &session_id, &terminal_request, 600)
            .await
            .unwrap();
        assert_eq!(terminal.value.result_ids.len(), 2);
        let retry = repository
            .execute_shadow_alliance_command(&host(), &session_id, &terminal_request, 900)
            .await
            .unwrap();
        assert!(retry.replayed);
        assert_eq!(retry.value, terminal.value);
        assert_eq!(repository.state.lock().await.game_result_ids.len(), 2);
    }

    #[tokio::test]
    async fn shadow_alliance_forfeit_result_is_not_recomputed_after_rank_changes() {
        let (repository, session_id) = setup_shadow_alliance().await;
        let mut version = 0;
        for (actor, request_id, command) in [
            (
                participant("first"),
                "forfeit-flow-join-first",
                ShadowAllianceIntent::Join,
            ),
            (
                participant("second"),
                "forfeit-flow-join-second",
                ShadowAllianceIntent::Join,
            ),
            (
                participant("first"),
                "forfeit-flow-ready-first",
                ShadowAllianceIntent::Ready,
            ),
            (
                participant("second"),
                "forfeit-flow-ready-second",
                ShadowAllianceIntent::Ready,
            ),
            (host(), "forfeit-flow-start", ShadowAllianceIntent::Start),
        ] {
            version = repository
                .execute_shadow_alliance_command(
                    &actor,
                    &session_id,
                    &ShadowAllianceCommandRequest {
                        request_id: request_id.to_owned(),
                        expected_version: version,
                        command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                        command,
                    },
                    200,
                )
                .await
                .unwrap()
                .value
                .version;
        }

        let forfeited = repository
            .execute_shadow_alliance_command(
                &participant("first"),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: "forfeit-flow-forfeit".to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command: ShadowAllianceIntent::Forfeit,
                },
                300,
            )
            .await
            .unwrap();
        assert_eq!(forfeited.value.result_ids.len(), 1);
        version = forfeited.value.version;

        for (request_id, command) in [
            (
                "forfeit-flow-submit",
                ShadowAllianceIntent::Submit { number: 46 },
            ),
            ("forfeit-flow-reveal", ShadowAllianceIntent::Reveal),
            ("forfeit-flow-postround", ShadowAllianceIntent::Postround),
        ] {
            let actor = if matches!(&command, ShadowAllianceIntent::Submit { .. }) {
                participant("second")
            } else {
                host()
            };
            let response = repository
                .execute_shadow_alliance_command(
                    &actor,
                    &session_id,
                    &ShadowAllianceCommandRequest {
                        request_id: request_id.to_owned(),
                        expected_version: version,
                        command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                        command,
                    },
                    400,
                )
                .await
                .unwrap();
            assert!(response.value.result_ids.is_empty());
            version = response.value.version;
        }

        let finished = repository
            .execute_shadow_alliance_command(
                &host(),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: "forfeit-flow-finish".to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command: ShadowAllianceIntent::Finish,
                },
                500,
            )
            .await
            .unwrap();
        assert_eq!(finished.value.result_ids.len(), 1);
        assert_eq!(repository.state.lock().await.game_result_ids.len(), 2);
    }

    #[tokio::test]
    async fn shadow_alliance_stale_version_returns_authoritative_snapshot() {
        let (repository, session_id) = setup_shadow_alliance().await;
        repository
            .execute_shadow_alliance_command(
                &participant("first"),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: "join-first".to_owned(),
                    expected_version: 0,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command: ShadowAllianceIntent::Join,
                },
                200,
            )
            .await
            .unwrap();
        let error = repository
            .execute_shadow_alliance_command(
                &participant("second"),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: "stale-join".to_owned(),
                    expected_version: 0,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command: ShadowAllianceIntent::Join,
                },
                300,
            )
            .await
            .unwrap_err();
        assert!(matches!(
            error,
            RepositoryError::ShadowAllianceVersionConflict { current }
                if current.version == 1
        ));
    }
}
