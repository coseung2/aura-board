use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::auth::AssertionVerifier;
use crate::model::{
    ActorContext, CommandRequest, CreateSessionRequest, CreateSongGuessSessionRequest, ModelError,
    RematchRequest, SessionSnapshot, SongGuessCommandRequest, SongGuessSnapshot,
};
use crate::repository::{Execution, PlayRepository, RepositoryError};
use crate::shadow::{
    CreateShadowAllianceSessionRequest, ShadowAllianceCommandRequest, ShadowAllianceSnapshot,
};

const ACTOR_HEADER: &str = "x-aura-play-actor";
const INTERNAL_HEADER: &str = "x-aura-play-internal-secret";

#[derive(Clone)]
pub struct AppState {
    repository: Arc<dyn PlayRepository>,
    assertion_verifier: AssertionVerifier,
    internal_secret: Arc<str>,
    clock: Arc<dyn Fn() -> i64 + Send + Sync>,
}

impl AppState {
    pub fn new(
        repository: Arc<dyn PlayRepository>,
        assertion_verifier: AssertionVerifier,
        internal_secret: impl Into<Arc<str>>,
    ) -> Self {
        Self {
            repository,
            assertion_verifier,
            internal_secret: internal_secret.into(),
            clock: Arc::new(system_time_ms),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_clock(mut self, clock: impl Fn() -> i64 + Send + Sync + 'static) -> Self {
        self.clock = Arc::new(clock);
        self
    }

    fn now_ms(&self) -> i64 {
        (self.clock)()
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/boards/{board_id}/sessions", post(create_session))
        .route(
            "/v1/boards/{board_id}/sessions/current",
            get(current_session),
        )
        .route(
            "/v1/boards/{board_id}/song-guess/sessions",
            post(create_song_guess_session),
        )
        .route(
            "/v1/boards/{board_id}/song-guess/sessions/current",
            get(current_song_guess_session),
        )
        .route("/v1/sessions/{session_id}/snapshot", get(session_snapshot))
        .route("/v1/sessions/{session_id}/commands", post(execute_command))
        .route(
            "/v1/song-guess/sessions/{session_id}/snapshot",
            get(song_guess_session_snapshot),
        )
        .route(
            "/v1/song-guess/sessions/{session_id}/commands",
            post(execute_song_guess_command),
        )
        .route(
            "/v1/boards/{board_id}/shadow-alliance/sessions",
            post(create_shadow_alliance_session),
        )
        .route(
            "/v1/boards/{board_id}/shadow-alliance/sessions/current",
            get(current_shadow_alliance_session),
        )
        .route(
            "/v1/shadow-alliance/sessions/{session_id}/snapshot",
            get(shadow_alliance_session_snapshot),
        )
        .route(
            "/v1/shadow-alliance/sessions/{session_id}/commands",
            post(execute_shadow_alliance_command),
        )
        .route(
            "/v1/shadow-alliance/sessions/{session_id}/rematch",
            post(create_shadow_alliance_rematch),
        )
        .route("/v1/sessions/{session_id}/rematch", post(create_rematch))
        .route("/v1/internal/outbox/claim", post(claim_outbox))
        .route("/v1/internal/outbox/complete", post(complete_outbox))
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "service": "aura-play-engine" }))
}

async fn create_session(
    State(state): State<AppState>,
    Path(board_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CreateSessionRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .create_session(&actor, &board_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::CREATED, result))
}

async fn current_session(
    State(state): State<AppState>,
    Path(board_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<SessionSnapshot>, ApiError> {
    let actor = actor(&state, &headers)?;
    let record = state
        .repository
        .current_session(&board_id)
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(
        record
            .snapshot(&actor, state.now_ms())
            .map_err(ApiError::from_model)?,
    ))
}

async fn create_song_guess_session(
    State(state): State<AppState>,
    Path(board_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CreateSongGuessSessionRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .create_song_guess_session(&actor, &board_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::CREATED, result))
}

async fn current_song_guess_session(
    State(state): State<AppState>,
    Path(board_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<crate::model::SongGuessSnapshot>, ApiError> {
    let actor = actor(&state, &headers)?;
    let record = state
        .repository
        .current_song_guess_session(&board_id)
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(
        record
            .snapshot(&actor, state.now_ms())
            .map_err(ApiError::from_model)?,
    ))
}

async fn session_snapshot(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<SessionSnapshot>, ApiError> {
    let actor = actor(&state, &headers)?;
    let record = state
        .repository
        .get_session(&session_id)
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(Json(
        record
            .snapshot(&actor, state.now_ms())
            .map_err(ApiError::from_model)?,
    ))
}

async fn song_guess_session_snapshot(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<SongGuessSnapshot>, ApiError> {
    let actor = actor(&state, &headers)?;
    let record = state
        .repository
        .get_song_guess_session(&session_id)
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(Json(
        record
            .snapshot(&actor, state.now_ms())
            .map_err(ApiError::from_model)?,
    ))
}

async fn execute_command(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CommandRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .execute_command(&actor, &session_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::OK, result))
}

async fn execute_song_guess_command(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<SongGuessCommandRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .execute_song_guess_command(&actor, &session_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::OK, result))
}

async fn create_shadow_alliance_session(
    State(state): State<AppState>,
    Path(board_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CreateShadowAllianceSessionRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .create_shadow_alliance_session(&actor, &board_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::CREATED, result))
}

async fn current_shadow_alliance_session(
    State(state): State<AppState>,
    Path(board_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ShadowAllianceSnapshot>, ApiError> {
    let actor = actor(&state, &headers)?;
    let record = state
        .repository
        .current_shadow_alliance_session(&board_id)
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(
        record
            .snapshot(&actor, state.now_ms())
            .map_err(ApiError::from_model)?,
    ))
}

async fn shadow_alliance_session_snapshot(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ShadowAllianceSnapshot>, ApiError> {
    let actor = actor(&state, &headers)?;
    let record = state
        .repository
        .get_shadow_alliance_session(&session_id)
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(Json(
        record
            .snapshot(&actor, state.now_ms())
            .map_err(ApiError::from_model)?,
    ))
}

async fn execute_shadow_alliance_command(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<ShadowAllianceCommandRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .execute_shadow_alliance_command(&actor, &session_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::OK, result))
}

async fn create_shadow_alliance_rematch(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<RematchRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .rematch_shadow_alliance_session(&actor, &session_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::CREATED, result))
}

async fn create_rematch(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<RematchRequest>,
) -> Result<Response, ApiError> {
    let actor = actor(&state, &headers)?;
    let result = state
        .repository
        .rematch(&actor, &session_id, &request, state.now_ms())
        .await
        .map_err(|error| ApiError::from_repository(error, &actor, state.now_ms()))?;
    Ok(execution_response(StatusCode::CREATED, result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimQuery {
    #[serde(default = "default_claim_limit")]
    limit: usize,
}

fn default_claim_limit() -> usize {
    25
}

async fn claim_outbox(
    State(state): State<AppState>,
    Query(query): Query<ClaimQuery>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_internal(&state, &headers)?;
    let events = state
        .repository
        .claim_outbox(query.limit.clamp(1, 100))
        .await
        .map_err(ApiError::storage)?;
    Ok(Json(serde_json::json!({ "events": events })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompleteOutboxRequest {
    ids: Vec<String>,
    lock_token: String,
}

async fn complete_outbox(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CompleteOutboxRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_internal(&state, &headers)?;
    if request.ids.len() > 100
        || request.ids.iter().any(String::is_empty)
        || request.lock_token.is_empty()
        || request.lock_token.len() > 128
    {
        return Err(ApiError::bad_request("invalid_outbox_ids"));
    }
    state
        .repository
        .complete_outbox(&request.ids, &request.lock_token)
        .await
        .map_err(ApiError::storage)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

fn actor(state: &AppState, headers: &HeaderMap) -> Result<ActorContext, ApiError> {
    let encoded = headers
        .get(ACTOR_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(ApiError::unauthorized)?;
    state
        .assertion_verifier
        .verify(encoded, state.now_ms())
        .map_err(|_| ApiError::unauthorized())
}

fn require_internal(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let provided = headers
        .get(INTERNAL_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if constant_time_equal(provided.as_bytes(), state.internal_secret.as_bytes()) {
        Ok(())
    } else {
        Err(ApiError::unauthorized())
    }
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let left_hash = Sha256::digest(left);
    let right_hash = Sha256::digest(right);
    left_hash
        .iter()
        .zip(right_hash.iter())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
        && left.len() == right.len()
}

fn execution_response<T: Serialize>(status: StatusCode, execution: Execution<T>) -> Response {
    let mut response = (status, Json(execution.value)).into_response();
    if execution.replayed {
        response
            .headers_mut()
            .insert("x-idempotent-replay", HeaderValue::from_static("true"));
    }
    response
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_version: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<Box<serde_json::Value>>,
}

#[derive(Clone, Debug)]
struct ApiError {
    status: StatusCode,
    body: ErrorBody,
}

impl ApiError {
    fn new(status: StatusCode, error: impl Into<String>) -> Self {
        Self {
            status,
            body: ErrorBody {
                error: error.into(),
                detail: None,
                current_version: None,
                snapshot: None,
            },
        }
    }

    fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized")
    }

    fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found")
    }

    fn bad_request(error: &str) -> Self {
        Self::new(StatusCode::BAD_REQUEST, error)
    }

    fn storage(error: RepositoryError) -> Self {
        let mut result = Self::new(StatusCode::INTERNAL_SERVER_ERROR, "storage_error");
        if cfg!(debug_assertions) {
            result.body.detail = Some(error.to_string());
        }
        result
    }

    fn from_model(error: ModelError) -> Self {
        match error {
            ModelError::Unauthorized => Self::unauthorized(),
            ModelError::Forbidden | ModelError::NotParticipant => {
                Self::new(StatusCode::FORBIDDEN, "forbidden")
            }
            ModelError::InvalidRequest => Self::bad_request("invalid_request"),
            ModelError::AlreadyReady => Self::new(StatusCode::CONFLICT, "already_ready"),
            ModelError::InvalidState => {
                Self::new(StatusCode::INTERNAL_SERVER_ERROR, "invalid_persisted_state")
            }
            ModelError::InvalidPhase => {
                Self::new(StatusCode::UNPROCESSABLE_ENTITY, "invalid_phase")
            }
            ModelError::DomainRejected(detail) => {
                let mut result = Self::new(StatusCode::UNPROCESSABLE_ENTITY, "domain_rejected");
                result.body.detail = Some(detail);
                result
            }
        }
    }

    fn from_repository(error: RepositoryError, actor: &ActorContext, now_ms: i64) -> Self {
        match error {
            RepositoryError::NotFound => Self::not_found(),
            RepositoryError::SessionAlreadyExists => {
                Self::new(StatusCode::CONFLICT, "session_already_exists")
            }
            RepositoryError::IdempotencyKeyReuse => {
                Self::new(StatusCode::CONFLICT, "idempotency_key_reuse")
            }
            RepositoryError::UnsupportedSchema => Self::bad_request("unsupported_command_schema"),
            RepositoryError::VersionConflict { current } => {
                let snapshot = current
                    .snapshot(actor, now_ms)
                    .ok()
                    .and_then(|snapshot| serde_json::to_value(snapshot).ok())
                    .map(Box::new);
                Self {
                    status: StatusCode::CONFLICT,
                    body: ErrorBody {
                        error: "version_conflict".to_owned(),
                        detail: None,
                        current_version: Some(current.version),
                        snapshot,
                    },
                }
            }
            RepositoryError::SongGuessVersionConflict { current } => {
                let snapshot = current
                    .snapshot(actor, now_ms)
                    .ok()
                    .and_then(|snapshot| serde_json::to_value(snapshot).ok())
                    .map(Box::new);
                Self {
                    status: StatusCode::CONFLICT,
                    body: ErrorBody {
                        error: "version_conflict".to_owned(),
                        detail: None,
                        current_version: Some(current.version),
                        snapshot,
                    },
                }
            }
            RepositoryError::ShadowAllianceVersionConflict { current } => {
                let snapshot = current
                    .snapshot(actor, now_ms)
                    .ok()
                    .and_then(|snapshot| serde_json::to_value(snapshot).ok())
                    .map(Box::new);
                Self {
                    status: StatusCode::CONFLICT,
                    body: ErrorBody {
                        error: "version_conflict".to_owned(),
                        detail: None,
                        current_version: Some(current.version),
                        snapshot,
                    },
                }
            }
            RepositoryError::Model(error) => Self::from_model(error),
            RepositoryError::Storage(_) => Self::storage(error),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

fn system_time_ms() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    i64::try_from(millis).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use axum::body::{Body, to_bytes};
    use axum::http::Request;
    use serde_json::json;
    use tower::ServiceExt;

    use super::*;
    use crate::auth::{ActorAssertion, AssertionVerifier};
    use crate::model::ActorRole;
    use crate::repository::MemoryRepository;

    const SECRET: [u8; 32] = [9; 32];

    fn test_app() -> (Router, AssertionVerifier) {
        let verifier = AssertionVerifier::new(SECRET).unwrap();
        let state = AppState::new(
            Arc::new(MemoryRepository::new()),
            verifier.clone(),
            Arc::<str>::from("internal-test-secret"),
        )
        .with_clock(|| 1_000);
        (router(state), verifier)
    }

    fn assertion(verifier: &AssertionVerifier, subject: &str, role: ActorRole) -> String {
        verifier.sign_for_test(&ActorAssertion {
            actor_subject: subject.to_owned(),
            role,
            expires_at_ms: 2_000,
        })
    }

    async fn json_body(response: Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn command_retry_replays_and_conflict_returns_snapshot() {
        let (app, verifier) = test_app();
        let host = assertion(&verifier, "teacher:1", ActorRole::Host);
        let create = Request::builder()
            .method("POST")
            .uri("/v1/boards/board-1/sessions")
            .header("content-type", "application/json")
            .header(ACTOR_HEADER, &host)
            .body(Body::from(
                json!({
                    "requestId": "create-1",
                    "participants": [
                        {"actorSubject": "student:first", "displayName": "첫째"},
                        {"actorSubject": "student:second", "displayName": "둘째"}
                    ]
                })
                .to_string(),
            ))
            .unwrap();
        let created = app.clone().oneshot(create).await.unwrap();
        assert_eq!(created.status(), StatusCode::CREATED);
        let session_id = json_body(created).await["snapshot"]["sessionId"]
            .as_str()
            .unwrap()
            .to_owned();

        let first = assertion(&verifier, "student:first", ActorRole::Participant);
        let command_json = json!({
            "requestId": "ready-1",
            "expectedVersion": 0,
            "commandSchemaVersion": 1,
            "command": {"type": "ready"}
        })
        .to_string();
        let command = || {
            Request::builder()
                .method("POST")
                .uri(format!("/v1/sessions/{session_id}/commands"))
                .header("content-type", "application/json")
                .header(ACTOR_HEADER, &first)
                .body(Body::from(command_json.clone()))
                .unwrap()
        };
        let applied = app.clone().oneshot(command()).await.unwrap();
        assert_eq!(applied.status(), StatusCode::OK);
        let replayed = app.clone().oneshot(command()).await.unwrap();
        assert_eq!(replayed.status(), StatusCode::OK);
        assert_eq!(
            replayed.headers().get("x-idempotent-replay").unwrap(),
            "true"
        );

        let second = assertion(&verifier, "student:second", ActorRole::Participant);
        let stale = Request::builder()
            .method("POST")
            .uri(format!("/v1/sessions/{session_id}/commands"))
            .header("content-type", "application/json")
            .header(ACTOR_HEADER, &second)
            .body(Body::from(
                json!({
                    "requestId": "ready-2",
                    "expectedVersion": 0,
                    "commandSchemaVersion": 1,
                    "command": {"type": "ready"}
                })
                .to_string(),
            ))
            .unwrap();
        let conflict = app.oneshot(stale).await.unwrap();
        assert_eq!(conflict.status(), StatusCode::CONFLICT);
        let body = json_body(conflict).await;
        assert_eq!(body["error"], "version_conflict");
        assert_eq!(body["currentVersion"], 1);
        assert_eq!(body["snapshot"]["version"], 1);
    }

    #[tokio::test]
    async fn rejects_missing_or_expired_actor_assertions() {
        let (app, verifier) = test_app();
        let missing = Request::builder()
            .uri("/v1/boards/board-1/sessions/current")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            app.clone().oneshot(missing).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );

        let expired = verifier.sign_for_test(&ActorAssertion {
            actor_subject: "teacher:1".to_owned(),
            role: ActorRole::Host,
            expires_at_ms: 999,
        });
        let request = Request::builder()
            .uri("/v1/boards/board-1/sessions/current")
            .header(ACTOR_HEADER, expired)
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            app.oneshot(request).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
    }
}
