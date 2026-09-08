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

#[path = "repository_memory.rs"]
mod memory;

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
#[path = "repository_tests.rs"]
mod tests;
