use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::hash::Hash;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use thiserror::Error;
use tokio::sync::{oneshot, watch};
use tokio::time::{Instant, interval, timeout};

use crate::http::AppState;
use crate::model::{
    ActorContext, ActorRole, CommandRequest, OmokIntent, SessionRecord, SessionSnapshot,
};
use crate::repository::RepositoryError;

type HmacSha256 = Hmac<Sha256>;

pub const REALTIME_PROTOCOL_VERSION: u16 = 1;
const MAX_FRAME_BYTES: usize = 16 * 1024;
const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const SEND_TIMEOUT: Duration = Duration::from_secs(5);
const PING_INTERVAL: Duration = Duration::from_secs(20);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_CONNECTION_LIFETIME: Duration = Duration::from_secs(15 * 60);
const CLOSE_REPLACED: u16 = 4001;
const CLOSE_STALE_ATTEMPT: u16 = 4002;
const TICKET_SIGNATURE_DOMAIN: &[u8] = b"aura-play-realtime-ticket-v1";
const ACTOR_KEY_DOMAIN: &[u8] = b"aura-play-realtime-actor-v1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HubEvent {
    Idle,
    SessionChanged { version: u64 },
    SessionReplaced { session_id: String },
}

#[derive(Clone, Default)]
pub struct SessionHub {
    sessions: Arc<Mutex<HashMap<String, watch::Sender<HubEvent>>>>,
}

pub struct HubSubscription {
    session_id: String,
    sessions: Arc<Mutex<HashMap<String, watch::Sender<HubEvent>>>>,
    receiver: watch::Receiver<HubEvent>,
}

impl HubSubscription {
    pub async fn changed(&mut self) -> Result<(), watch::error::RecvError> {
        self.receiver.changed().await
    }

    pub fn borrow_and_update(&mut self) -> watch::Ref<'_, HubEvent> {
        self.receiver.borrow_and_update()
    }

    #[cfg(test)]
    pub fn has_changed(&self) -> Result<bool, watch::error::RecvError> {
        self.receiver.has_changed()
    }
}

impl Drop for HubSubscription {
    fn drop(&mut self) {
        let mut sessions = self.sessions.lock().expect("session hub mutex poisoned");
        let remove = sessions
            .get(&self.session_id)
            .is_some_and(|sender| sender.receiver_count() <= 1);
        if remove {
            sessions.remove(&self.session_id);
        }
    }
}

impl SessionHub {
    pub fn subscribe(&self, session_id: &str) -> HubSubscription {
        let mut sessions = self.sessions.lock().expect("session hub mutex poisoned");
        let receiver = sessions
            .entry(session_id.to_owned())
            .or_insert_with(|| watch::channel(HubEvent::Idle).0)
            .subscribe();
        HubSubscription {
            session_id: session_id.to_owned(),
            sessions: self.sessions.clone(),
            receiver,
        }
    }

    pub fn publish(&self, session_id: &str, event: HubEvent) {
        let sessions = self.sessions.lock().expect("session hub mutex poisoned");
        if let Some(sender) = sessions.get(session_id) {
            sender.send_replace(event);
        }
    }
}

#[derive(Clone)]
pub struct RealtimeTicketVerifier {
    secret: Arc<[u8]>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct RealtimeTicketClaims {
    pub protocol_version: u16,
    pub session_id: String,
    pub role: ActorRole,
    pub actor_key: String,
    pub expires_at_ms: i64,
    pub nonce: String,
}

#[derive(Clone, Copy, Debug, Error, PartialEq, Eq)]
pub enum RealtimeTicketError {
    #[error("invalid_ticket")]
    Invalid,
    #[error("ticket_expired")]
    Expired,
    #[error("ticket_session_mismatch")]
    SessionMismatch,
    #[error("ticket_role_mismatch")]
    RoleMismatch,
}

impl RealtimeTicketVerifier {
    pub fn new(secret: impl AsRef<[u8]>) -> Result<Self, RealtimeTicketError> {
        let secret = secret.as_ref();
        if secret.len() < 32 {
            return Err(RealtimeTicketError::Invalid);
        }
        Ok(Self {
            secret: Arc::from(secret),
        })
    }

    pub fn verify_claims(
        &self,
        encoded: &str,
        now_ms: i64,
    ) -> Result<RealtimeTicketClaims, RealtimeTicketError> {
        let (payload_b64, signature_b64) = encoded
            .split_once('.')
            .ok_or(RealtimeTicketError::Invalid)?;
        if encoded.len() > 8_192 || payload_b64.is_empty() || signature_b64.is_empty() {
            return Err(RealtimeTicketError::Invalid);
        }
        let signature = URL_SAFE_NO_PAD
            .decode(signature_b64)
            .map_err(|_| RealtimeTicketError::Invalid)?;
        let expected = derive_mac(
            &self.secret,
            TICKET_SIGNATURE_DOMAIN,
            &[payload_b64.as_bytes()],
        )?;
        expected
            .verify_slice(&signature)
            .map_err(|_| RealtimeTicketError::Invalid)?;
        let payload = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|_| RealtimeTicketError::Invalid)?;
        let claims: RealtimeTicketClaims =
            serde_json::from_slice(&payload).map_err(|_| RealtimeTicketError::Invalid)?;
        if claims.protocol_version != REALTIME_PROTOCOL_VERSION
            || claims.session_id.is_empty()
            || claims.session_id.len() > 255
            || claims.actor_key.is_empty()
            || claims.actor_key.len() > 128
            || claims.nonce.is_empty()
            || claims.nonce.len() > 128
        {
            return Err(RealtimeTicketError::Invalid);
        }
        if claims.expires_at_ms <= now_ms {
            return Err(RealtimeTicketError::Expired);
        }
        Ok(claims)
    }

    pub fn resolve_actor(
        &self,
        claims: &RealtimeTicketClaims,
        record: &SessionRecord,
    ) -> Result<ActorContext, RealtimeTicketError> {
        if claims.session_id != record.session_id {
            return Err(RealtimeTicketError::SessionMismatch);
        }
        let candidates: Vec<&str> = match claims.role {
            ActorRole::Host => vec![record.host_subject.as_str()],
            ActorRole::Participant => record
                .state
                .participants
                .iter()
                .map(|participant| participant.actor_subject.as_str())
                .collect(),
        };
        let presented = URL_SAFE_NO_PAD
            .decode(&claims.actor_key)
            .map_err(|_| RealtimeTicketError::Invalid)?;
        let mut matched: Option<&str> = None;
        for subject in candidates {
            let expected = derive_mac(
                &self.secret,
                ACTOR_KEY_DOMAIN,
                &[
                    claims.session_id.as_bytes(),
                    role_name(claims.role).as_bytes(),
                    subject.as_bytes(),
                    claims.expires_at_ms.to_string().as_bytes(),
                    claims.nonce.as_bytes(),
                ],
            )?;
            if expected.verify_slice(&presented).is_ok() {
                if matched.is_some() {
                    return Err(RealtimeTicketError::Invalid);
                }
                matched = Some(subject);
            }
        }
        let subject = matched.ok_or(RealtimeTicketError::RoleMismatch)?;
        Ok(ActorContext {
            subject: subject.to_owned(),
            role: claims.role,
        })
    }

    #[cfg(test)]
    pub(crate) fn sign_for_test(&self, claims: &RealtimeTicketClaims) -> String {
        let payload = serde_json::to_vec(claims).unwrap();
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload);
        let signature = derive_mac(
            &self.secret,
            TICKET_SIGNATURE_DOMAIN,
            &[payload_b64.as_bytes()],
        )
        .unwrap()
        .finalize()
        .into_bytes();
        format!("{payload_b64}.{}", URL_SAFE_NO_PAD.encode(signature))
    }

    #[cfg(test)]
    pub(crate) fn actor_key_for_test(
        &self,
        session_id: &str,
        role: ActorRole,
        subject: &str,
        expires_at_ms: i64,
        nonce: &str,
    ) -> String {
        let mac = derive_mac(
            &self.secret,
            ACTOR_KEY_DOMAIN,
            &[
                session_id.as_bytes(),
                role_name(role).as_bytes(),
                subject.as_bytes(),
                expires_at_ms.to_string().as_bytes(),
                nonce.as_bytes(),
            ],
        )
        .unwrap();
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    }
}

fn derive_mac(
    secret: &[u8],
    domain: &[u8],
    parts: &[&[u8]],
) -> Result<HmacSha256, RealtimeTicketError> {
    let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| RealtimeTicketError::Invalid)?;
    update_part(&mut mac, domain)?;
    for part in parts {
        update_part(&mut mac, part)?;
    }
    Ok(mac)
}

fn update_part(mac: &mut HmacSha256, value: &[u8]) -> Result<(), RealtimeTicketError> {
    let length = u32::try_from(value.len()).map_err(|_| RealtimeTicketError::Invalid)?;
    mac.update(&length.to_be_bytes());
    mac.update(value);
    Ok(())
}

fn role_name(role: ActorRole) -> &'static str {
    match role {
        ActorRole::Host => "host",
        ActorRole::Participant => "participant",
    }
}

#[derive(Clone)]
pub struct RealtimeConfig {
    pub ticket_verifier: RealtimeTicketVerifier,
    allowed_origins: Arc<HashSet<String>>,
    connections: ActiveConnectionRegistry,
    command_metrics: CommandDurationMetrics,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CommandDurationSnapshot {
    pub sample_count: u64,
    pub total_micros: u64,
    pub max_micros: u64,
}

#[derive(Clone, Default)]
struct CommandDurationMetrics {
    sample_count: Arc<AtomicU64>,
    total_micros: Arc<AtomicU64>,
    max_micros: Arc<AtomicU64>,
}

impl CommandDurationMetrics {
    fn observe(&self, duration: Duration) {
        let micros = u64::try_from(duration.as_micros()).unwrap_or(u64::MAX);
        self.sample_count.fetch_add(1, Ordering::Relaxed);
        self.total_micros.fetch_add(micros, Ordering::Relaxed);
        self.max_micros.fetch_max(micros, Ordering::Relaxed);
    }

    fn snapshot(&self) -> CommandDurationSnapshot {
        CommandDurationSnapshot {
            sample_count: self.sample_count.load(Ordering::Relaxed),
            total_micros: self.total_micros.load(Ordering::Relaxed),
            max_micros: self.max_micros.load(Ordering::Relaxed),
        }
    }
}

impl RealtimeConfig {
    pub fn new(
        ticket_verifier: RealtimeTicketVerifier,
        allowed_origins: impl IntoIterator<Item = String>,
    ) -> Self {
        Self {
            ticket_verifier,
            allowed_origins: Arc::new(
                allowed_origins
                    .into_iter()
                    .map(|origin| origin.trim().to_owned())
                    .filter(|origin| !origin.is_empty())
                    .collect(),
            ),
            connections: ActiveConnectionRegistry::default(),
            command_metrics: CommandDurationMetrics::default(),
        }
    }

    pub fn origin_allowed(&self, origin: Option<&str>) -> bool {
        origin.is_none_or(|origin| self.allowed_origins.contains(origin))
    }

    /// Aggregate command receive-to-repository-return timing. It deliberately
    /// carries no session, actor, request, command body, or ticket labels.
    pub fn command_duration_snapshot(&self) -> CommandDurationSnapshot {
        self.command_metrics.snapshot()
    }
}

#[derive(Clone, Copy, Debug)]
struct ConnectionIdentity {
    arrival_seq: u64,
    connection_id: u64,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct ConnectionKey {
    session_id: String,
    role: &'static str,
    actor_subject: String,
}

impl ConnectionKey {
    fn authenticated(session_id: &str, actor: &ActorContext) -> Self {
        Self {
            session_id: session_id.to_owned(),
            role: role_name(actor.role),
            actor_subject: actor.subject.clone(),
        }
    }
}

struct ActiveConnection {
    arrival_seq: u64,
    connection_id: u64,
    replace: oneshot::Sender<()>,
}

enum InstallOutcome {
    Installed {
        replaced: Option<oneshot::Sender<()>>,
    },
    Stale,
}

#[derive(Clone)]
struct ActiveConnectionRegistry {
    entries: Arc<Mutex<HashMap<ConnectionKey, ActiveConnection>>>,
    next_arrival_seq: Arc<AtomicU64>,
    next_connection_id: Arc<AtomicU64>,
}

impl Default for ActiveConnectionRegistry {
    fn default() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            next_arrival_seq: Arc::new(AtomicU64::new(1)),
            next_connection_id: Arc::new(AtomicU64::new(1)),
        }
    }
}

impl ActiveConnectionRegistry {
    fn issue_identity(&self) -> ConnectionIdentity {
        ConnectionIdentity {
            arrival_seq: self.next_arrival_seq.fetch_add(1, Ordering::Relaxed),
            connection_id: self.next_connection_id.fetch_add(1, Ordering::Relaxed),
        }
    }

    fn install_authenticated(
        &self,
        key: ConnectionKey,
        identity: ConnectionIdentity,
        replace: oneshot::Sender<()>,
    ) -> InstallOutcome {
        let mut entries = self
            .entries
            .lock()
            .expect("active connection registry mutex poisoned");
        if entries
            .get(&key)
            .is_some_and(|current| current.arrival_seq >= identity.arrival_seq)
        {
            return InstallOutcome::Stale;
        }
        let replaced = entries
            .insert(
                key,
                ActiveConnection {
                    arrival_seq: identity.arrival_seq,
                    connection_id: identity.connection_id,
                    replace,
                },
            )
            .map(|connection| connection.replace);
        InstallOutcome::Installed { replaced }
    }

    fn remove_if_current(&self, key: &ConnectionKey, connection_id: u64) -> bool {
        let mut entries = self
            .entries
            .lock()
            .expect("active connection registry mutex poisoned");
        let is_current = entries
            .get(key)
            .is_some_and(|connection| connection.connection_id == connection_id);
        if is_current {
            entries.remove(key);
        }
        is_current
    }

    #[cfg(test)]
    fn current_connection_id(&self, key: &ConnectionKey) -> Option<u64> {
        self.entries
            .lock()
            .expect("active connection registry mutex poisoned")
            .get(key)
            .map(|connection| connection.connection_id)
    }
}

struct ActiveConnectionLease {
    registry: ActiveConnectionRegistry,
    key: ConnectionKey,
    connection_id: u64,
}

impl Drop for ActiveConnectionLease {
    fn drop(&mut self) {
        self.registry
            .remove_if_current(&self.key, self.connection_id);
    }
}

struct TransportLiveness {
    last_inbound: Instant,
}

impl TransportLiveness {
    fn new(now: Instant) -> Self {
        Self { last_inbound: now }
    }

    fn observe_inbound(&mut self, _message: &Message, now: Instant) {
        self.last_inbound = now;
    }

    fn heartbeat_missed(&self, now: Instant) -> bool {
        now.duration_since(self.last_inbound) >= HEARTBEAT_TIMEOUT
    }
}

pub async fn realtime_disabled() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({ "error": "realtime_disabled" })),
    )
        .into_response()
}

pub async fn websocket_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    let Some(config) = state.realtime_config().cloned() else {
        return realtime_disabled().await;
    };
    let origin = headers.get("origin").and_then(|value| value.to_str().ok());
    if !config.origin_allowed(origin) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let identity = config.connections.issue_identity();
    upgrade
        .read_buffer_size(MAX_FRAME_BYTES)
        .write_buffer_size(MAX_FRAME_BYTES)
        .max_write_buffer_size(MAX_FRAME_BYTES * 4)
        .max_message_size(MAX_FRAME_BYTES)
        .max_frame_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| run_socket(socket, state, config, identity))
}

#[derive(Debug, Deserialize)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
#[serde(deny_unknown_fields)]
enum ClientFrame {
    Authenticate {
        protocol_version: u16,
        ticket: String,
        last_seen_version: Option<u64>,
    },
    Command {
        protocol_version: u16,
        request_id: String,
        expected_version: u64,
        command_schema_version: u16,
        command: OmokIntent,
    },
}

#[derive(Debug, Serialize)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
enum ServerFrame {
    Ready {
        protocol_version: u16,
        session_id: String,
        snapshot: SessionSnapshot,
    },
    CommandCommitted {
        protocol_version: u16,
        session_id: String,
        request_id: String,
        command_type: String,
        previous_version: u64,
        version: u64,
        replayed: bool,
        snapshot: SessionSnapshot,
    },
    Snapshot {
        protocol_version: u16,
        session_id: String,
        reason: &'static str,
        snapshot: SessionSnapshot,
    },
    CommandRejected {
        protocol_version: u16,
        session_id: String,
        request_id: String,
        command_type: String,
        error: &'static str,
        retryable: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        current_version: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        snapshot: Option<SessionSnapshot>,
    },
    ConnectionError {
        protocol_version: u16,
        error: &'static str,
        retryable: bool,
    },
    SessionReplaced {
        protocol_version: u16,
        reason: &'static str,
        previous_session_id: String,
        session_id: String,
        snapshot: SessionSnapshot,
    },
}

async fn run_socket(
    mut socket: WebSocket,
    state: AppState,
    config: RealtimeConfig,
    identity: ConnectionIdentity,
) {
    let Some(frame) = receive_auth_frame(&mut socket).await else {
        return;
    };
    let ClientFrame::Authenticate {
        protocol_version,
        ticket,
        last_seen_version,
    } = frame
    else {
        send_connection_error(&mut socket, "authentication_required", false).await;
        return;
    };
    if protocol_version != REALTIME_PROTOCOL_VERSION {
        send_connection_error(&mut socket, "unsupported_protocol", false).await;
        return;
    }
    if last_seen_version.is_some_and(|version| version > crate::model::MAX_SAFE_VERSION) {
        send_connection_error(&mut socket, "invalid_frame", false).await;
        return;
    }
    // v1 always returns a full actor-projected ready snapshot. lastSeenVersion is
    // only a bounded client catch-up hint/validation field; no incremental replay exists.
    let claims = match config
        .ticket_verifier
        .verify_claims(&ticket, state.now_ms())
    {
        Ok(claims) => claims,
        Err(error) => {
            send_connection_error(
                &mut socket,
                ticket_error_code(error),
                ticket_error_retryable(error),
            )
            .await;
            return;
        }
    };
    let service = state.command_service().clone();
    let mut subscriber = service.hub().subscribe(&claims.session_id);
    let record = match service.repository().get_session(&claims.session_id).await {
        Ok(record) => record,
        Err(error) => {
            let (code, retryable) = handshake_repository_error(&error);
            send_connection_error(&mut socket, code, retryable).await;
            return;
        }
    };
    let actor = match config.ticket_verifier.resolve_actor(&claims, &record) {
        Ok(actor) => actor,
        Err(error) => {
            send_connection_error(&mut socket, ticket_error_code(error), false).await;
            return;
        }
    };
    let ready_snapshot = match service
        .project_record(&actor, &record, state.now_ms())
        .await
    {
        Ok(snapshot) => snapshot,
        Err(_) => {
            send_connection_error(&mut socket, "snapshot_unavailable", true).await;
            return;
        }
    };
    let session_id = claims.session_id;
    let connection_key = ConnectionKey::authenticated(&session_id, &actor);
    let (replace_sender, mut replace_receiver) = oneshot::channel();
    let replaced = match config.connections.install_authenticated(
        connection_key.clone(),
        identity,
        replace_sender,
    ) {
        InstallOutcome::Installed { replaced } => replaced,
        InstallOutcome::Stale => {
            close_socket_with(&mut socket, CLOSE_STALE_ATTEMPT, "STALE_ATTEMPT").await;
            return;
        }
    };
    let _connection_lease = ActiveConnectionLease {
        registry: config.connections.clone(),
        key: connection_key,
        connection_id: identity.connection_id,
    };
    if let Some(replaced) = replaced {
        let _ = replaced.send(());
    }
    let mut last_sent_version = ready_snapshot.version;
    if send_frame(
        &mut socket,
        &ServerFrame::Ready {
            protocol_version: REALTIME_PROTOCOL_VERSION,
            session_id: session_id.clone(),
            snapshot: ready_snapshot,
        },
    )
    .await
    .is_err()
    {
        return;
    }

    let mut ping = interval(PING_INTERVAL);
    ping.tick().await;
    let connected_at = Instant::now();
    let mut transport_liveness = TransportLiveness::new(connected_at);
    loop {
        tokio::select! {
            message = socket.recv() => {
                let Some(Ok(message)) = message else { return; };
                transport_liveness.observe_inbound(&message, Instant::now());
                match message {
                    Message::Text(text) => {
                        let Ok(frame) = serde_json::from_str::<ClientFrame>(text.as_str()) else {
                            send_connection_error(&mut socket, "invalid_frame", false).await;
                            return;
                        };
                        let ClientFrame::Command {
                            protocol_version,
                            request_id,
                            expected_version,
                            command_schema_version,
                            command,
                        } = frame else {
                            send_connection_error(&mut socket, "already_authenticated", false).await;
                            return;
                        };
                        if protocol_version != REALTIME_PROTOCOL_VERSION {
                            send_connection_error(&mut socket, "unsupported_protocol", false).await;
                            return;
                        }
                        let command_type = intent_name(&command).to_owned();
                        let request = CommandRequest {
                            request_id: request_id.clone(),
                            expected_version,
                            command_schema_version,
                            command,
                        };
                        let command_started_at = Instant::now();
                        let execution = service.execute(
                            &actor,
                            &session_id,
                            &request,
                            state.now_ms(),
                        ).await;
                        config.command_metrics.observe(command_started_at.elapsed());
                        match execution {
                            Ok(execution) => {
                                last_sent_version = last_sent_version.max(execution.value.version);
                                if send_frame(&mut socket, &ServerFrame::CommandCommitted {
                                    protocol_version: REALTIME_PROTOCOL_VERSION,
                                    session_id: session_id.clone(),
                                    request_id,
                                    command_type,
                                    previous_version: execution.value.previous_version,
                                    version: execution.value.version,
                                    replayed: execution.replayed,
                                    snapshot: execution.value.snapshot,
                                }).await.is_err() { return; }
                            }
                            Err(error) => {
                                let rejected = command_rejected(
                                    &service,
                                    &actor,
                                    &session_id,
                                    request_id,
                                    command_type,
                                    error,
                                    state.now_ms(),
                                ).await;
                                if send_frame(&mut socket, &rejected).await.is_err() { return; }
                            }
                        }
                    }
                    Message::Pong(_) => {}
                    Message::Ping(payload) => {
                        if send_message(&mut socket, Message::Pong(payload)).await.is_err() {
                            return;
                        }
                    }
                    Message::Close(_) => return,
                    Message::Binary(_) => {
                        send_connection_error(&mut socket, "invalid_frame", false).await;
                        return;
                    }
                }
            }
            replaced = &mut replace_receiver => {
                if replaced.is_ok() {
                    close_socket_with(&mut socket, CLOSE_REPLACED, "REPLACED").await;
                }
                return;
            }
            changed = subscriber.changed() => {
                if changed.is_err() { return; }
                let event = subscriber.borrow_and_update().clone();
                match event {
                    HubEvent::Idle => {}
                    HubEvent::SessionChanged { version } if version > last_sent_version => {
                        let snapshot = match service.snapshot(&actor, &session_id, state.now_ms()).await {
                            Ok(snapshot) => snapshot,
                            Err(_) => {
                                send_connection_error(&mut socket, "snapshot_unavailable", true).await;
                                return;
                            }
                        };
                        if snapshot.version <= last_sent_version { continue; }
                        last_sent_version = snapshot.version;
                        if send_frame(&mut socket, &ServerFrame::Snapshot {
                            protocol_version: REALTIME_PROTOCOL_VERSION,
                            session_id: session_id.clone(),
                            reason: "session_changed",
                            snapshot,
                        }).await.is_err() { return; }
                    }
                    HubEvent::SessionChanged { .. } => {}
                    HubEvent::SessionReplaced { session_id: replacement_id } => {
                        let snapshot = match service.snapshot(&actor, &replacement_id, state.now_ms()).await {
                            Ok(snapshot) => snapshot,
                            Err(_) => {
                                send_connection_error(&mut socket, "snapshot_unavailable", true).await;
                                return;
                            }
                        };
                        if send_frame(&mut socket, &ServerFrame::SessionReplaced {
                            protocol_version: REALTIME_PROTOCOL_VERSION,
                            reason: "rematch",
                            previous_session_id: session_id.clone(),
                            session_id: replacement_id,
                            snapshot,
                        }).await.is_err() { return; }
                        close_socket(&mut socket).await;
                        return;
                    }
                }
            }
            _ = ping.tick() => {
                if connected_at.elapsed() >= MAX_CONNECTION_LIFETIME {
                    send_connection_error(&mut socket, "reconnect_required", true).await;
                    return;
                }
                if transport_liveness.heartbeat_missed(Instant::now()) {
                    send_connection_error(&mut socket, "heartbeat_timeout", true).await;
                    return;
                }
                if send_message(&mut socket, Message::Ping(Vec::new().into())).await.is_err() {
                    return;
                }
            }
        }
    }
}

async fn receive_auth_frame(socket: &mut WebSocket) -> Option<ClientFrame> {
    let message = timeout(AUTH_TIMEOUT, socket.recv()).await;
    match message {
        Ok(Some(Ok(Message::Text(text)))) => match serde_json::from_str(text.as_str()) {
            Ok(frame) => Some(frame),
            Err(_) => {
                send_connection_error(socket, "invalid_frame", false).await;
                None
            }
        },
        Ok(Some(Ok(_))) => {
            send_connection_error(socket, "authentication_required", false).await;
            None
        }
        Ok(Some(Err(_))) | Ok(None) => None,
        Err(_) => {
            send_connection_error(socket, "authentication_timeout", true).await;
            None
        }
    }
}

async fn send_frame(socket: &mut WebSocket, frame: &ServerFrame) -> Result<(), ()> {
    let encoded = serde_json::to_string(frame).map_err(|_| ())?;
    send_message(socket, Message::Text(encoded.into())).await
}

async fn send_message(socket: &mut WebSocket, message: Message) -> Result<(), ()> {
    complete_send_before(SEND_TIMEOUT, socket.send(message)).await
}

async fn complete_send_before<F, E>(deadline: Duration, send: F) -> Result<(), ()>
where
    F: Future<Output = Result<(), E>>,
{
    timeout(deadline, send)
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

async fn send_connection_error(socket: &mut WebSocket, error: &'static str, retryable: bool) {
    let _ = send_frame(
        socket,
        &ServerFrame::ConnectionError {
            protocol_version: REALTIME_PROTOCOL_VERSION,
            error,
            retryable,
        },
    )
    .await;
    close_socket(socket).await;
}

async fn close_socket(socket: &mut WebSocket) {
    let _ = timeout(SEND_TIMEOUT, socket.send(Message::Close(None))).await;
}

async fn close_socket_with(socket: &mut WebSocket, code: u16, reason: &'static str) {
    let frame = CloseFrame {
        code,
        reason: reason.into(),
    };
    let _ = timeout(SEND_TIMEOUT, socket.send(Message::Close(Some(frame)))).await;
}

fn handshake_repository_error(error: &RepositoryError) -> (&'static str, bool) {
    match error {
        RepositoryError::NotFound => ("invalid_ticket", false),
        _ => ("server_error", true),
    }
}

fn ticket_error_code(error: RealtimeTicketError) -> &'static str {
    match error {
        RealtimeTicketError::Expired => "ticket_expired",
        RealtimeTicketError::Invalid
        | RealtimeTicketError::SessionMismatch
        | RealtimeTicketError::RoleMismatch => "invalid_ticket",
    }
}

fn ticket_error_retryable(error: RealtimeTicketError) -> bool {
    matches!(error, RealtimeTicketError::Expired)
}

fn intent_name(intent: &OmokIntent) -> &'static str {
    match intent {
        OmokIntent::Ready => "ready",
        OmokIntent::Start => "start",
        OmokIntent::PlaceStone { .. } => "place_stone",
        OmokIntent::Resign => "resign",
    }
}

async fn command_rejected(
    service: &crate::command::CommandService,
    actor: &ActorContext,
    session_id: &str,
    request_id: String,
    command_type: String,
    error: RepositoryError,
    now_ms: i64,
) -> ServerFrame {
    let (code, retryable, current_version, snapshot) = match error {
        RepositoryError::VersionConflict { current } => {
            let snapshot = service.project_record(actor, &current, now_ms).await.ok();
            ("version_conflict", false, Some(current.version), snapshot)
        }
        RepositoryError::NotFound => ("not_found", false, None, None),
        RepositoryError::IdempotencyKeyReuse => ("idempotency_key_reuse", false, None, None),
        RepositoryError::UnsupportedSchema => ("unsupported_command_schema", false, None, None),
        RepositoryError::Model(model) => {
            let code = match model {
                crate::model::ModelError::Unauthorized => "unauthorized",
                crate::model::ModelError::Forbidden | crate::model::ModelError::NotParticipant => {
                    "forbidden"
                }
                crate::model::ModelError::InvalidRequest => "invalid_request",
                crate::model::ModelError::AlreadyReady => "already_ready",
                crate::model::ModelError::InvalidPhase => "invalid_phase",
                crate::model::ModelError::DomainRejected(_) => "domain_rejected",
                crate::model::ModelError::InvalidState => "invalid_persisted_state",
            };
            (code, false, None, None)
        }
        RepositoryError::Storage(_)
        | RepositoryError::SessionAlreadyExists
        | RepositoryError::SongGuessVersionConflict { .. }
        | RepositoryError::ShadowAllianceVersionConflict { .. } => {
            ("server_error", true, None, None)
        }
    };
    ServerFrame::CommandRejected {
        protocol_version: REALTIME_PROTOCOL_VERSION,
        session_id: session_id.to_owned(),
        request_id,
        command_type,
        error: code,
        retryable,
        current_version,
        snapshot,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ParticipantSeed, SessionRecord};

    fn record() -> SessionRecord {
        SessionRecord::new(
            "session-1".to_owned(),
            "board-1".to_owned(),
            "teacher:secret-subject".to_owned(),
            [
                ParticipantSeed {
                    actor_subject: "student:first-secret".to_owned(),
                    display_name: "One".to_owned(),
                },
                ParticipantSeed {
                    actor_subject: "student:second-secret".to_owned(),
                    display_name: "Two".to_owned(),
                },
            ],
            None,
            1_000,
        )
        .unwrap()
    }

    fn claims(
        verifier: &RealtimeTicketVerifier,
        role: ActorRole,
        subject: &str,
    ) -> RealtimeTicketClaims {
        let expires_at_ms = 2_000;
        let nonce = "opaque-nonce";
        RealtimeTicketClaims {
            protocol_version: 1,
            session_id: "session-1".to_owned(),
            role,
            actor_key: verifier.actor_key_for_test(
                "session-1",
                role,
                subject,
                expires_at_ms,
                nonce,
            ),
            expires_at_ms,
            nonce: nonce.to_owned(),
        }
    }

    #[test]
    fn ticket_is_bound_to_signature_expiry_session_role_and_stored_actor() {
        let verifier = RealtimeTicketVerifier::new([7_u8; 32]).unwrap();
        let record = record();
        let participant = claims(&verifier, ActorRole::Participant, "student:first-secret");
        let encoded = verifier.sign_for_test(&participant);
        let verified = verifier.verify_claims(&encoded, 1_000).unwrap();
        assert_eq!(
            verifier.resolve_actor(&verified, &record).unwrap(),
            ActorContext {
                subject: "student:first-secret".to_owned(),
                role: ActorRole::Participant,
            }
        );
        assert_eq!(
            verifier.verify_claims(&encoded, 2_000),
            Err(RealtimeTicketError::Expired)
        );

        let mut tampered = encoded.into_bytes();
        let last = tampered.len() - 1;
        tampered[last] = if tampered[last] == b'A' { b'B' } else { b'A' };
        assert_eq!(
            verifier.verify_claims(std::str::from_utf8(&tampered).unwrap(), 1_000),
            Err(RealtimeTicketError::Invalid)
        );

        let mut wrong_session = participant.clone();
        wrong_session.session_id = "session-2".to_owned();
        assert_eq!(
            verifier.resolve_actor(&wrong_session, &record),
            Err(RealtimeTicketError::SessionMismatch)
        );
        let mut wrong_role = participant;
        wrong_role.role = ActorRole::Host;
        assert_eq!(
            verifier.resolve_actor(&wrong_role, &record),
            Err(RealtimeTicketError::RoleMismatch)
        );
    }

    #[test]
    fn ticket_payload_and_errors_do_not_expose_actor_subject_or_secret() {
        let verifier = RealtimeTicketVerifier::new([7_u8; 32]).unwrap();
        let claims = claims(&verifier, ActorRole::Participant, "student:first-secret");
        let encoded = verifier.sign_for_test(&claims);
        let payload = URL_SAFE_NO_PAD
            .decode(encoded.split_once('.').unwrap().0)
            .unwrap();
        let payload = String::from_utf8(payload).unwrap();
        assert!(!payload.contains("student:first-secret"));
        assert!(!payload.contains("teacher:secret-subject"));
        assert!(!payload.contains("07070707"));
        assert_eq!(RealtimeTicketError::Invalid.to_string(), "invalid_ticket");
    }

    #[test]
    fn missing_origin_is_native_compatible_but_present_origin_is_allowlisted() {
        let config = RealtimeConfig::new(
            RealtimeTicketVerifier::new([1_u8; 32]).unwrap(),
            ["https://aura-board.com".to_owned()],
        );
        assert!(config.origin_allowed(None));
        assert!(config.origin_allowed(Some("https://aura-board.com")));
        assert!(!config.origin_allowed(Some("https://aura-board.com/")));
        assert!(!config.origin_allowed(Some("https://evil.example")));

        let fail_closed = RealtimeConfig::new(
            RealtimeTicketVerifier::new([2_u8; 32]).unwrap(),
            std::iter::empty(),
        );
        assert!(fail_closed.origin_allowed(None));
        assert!(!fail_closed.origin_allowed(Some("https://aura-board.com")));
    }

    #[test]
    fn handshake_repository_errors_distinguish_missing_from_retryable_failures() {
        assert_eq!(
            handshake_repository_error(&RepositoryError::NotFound),
            ("invalid_ticket", false)
        );
        assert_eq!(
            handshake_repository_error(&RepositoryError::Storage("temporary".to_owned())),
            ("server_error", true)
        );
    }

    #[test]
    fn later_arrival_wins_even_when_earlier_arrival_authenticates_last() {
        let registry = ActiveConnectionRegistry::default();
        let key = ConnectionKey::authenticated(
            "session-1",
            &ActorContext {
                subject: "student:first-secret".to_owned(),
                role: ActorRole::Participant,
            },
        );
        let (new_sender, _new_receiver) = oneshot::channel();
        assert!(matches!(
            registry.install_authenticated(
                key.clone(),
                ConnectionIdentity {
                    arrival_seq: 2,
                    connection_id: 20,
                },
                new_sender,
            ),
            InstallOutcome::Installed { replaced: None }
        ));

        let (old_sender, _old_receiver) = oneshot::channel();
        assert!(matches!(
            registry.install_authenticated(
                key.clone(),
                ConnectionIdentity {
                    arrival_seq: 1,
                    connection_id: 10,
                },
                old_sender,
            ),
            InstallOutcome::Stale
        ));
        assert_eq!(registry.current_connection_id(&key), Some(20));
    }

    #[test]
    fn stale_cleanup_cannot_remove_replacement_connection() {
        let registry = ActiveConnectionRegistry::default();
        let key = ConnectionKey::authenticated(
            "session-1",
            &ActorContext {
                subject: "student:first-secret".to_owned(),
                role: ActorRole::Participant,
            },
        );
        let (old_sender, _old_receiver) = oneshot::channel();
        assert!(matches!(
            registry.install_authenticated(
                key.clone(),
                ConnectionIdentity {
                    arrival_seq: 1,
                    connection_id: 10,
                },
                old_sender,
            ),
            InstallOutcome::Installed { replaced: None }
        ));
        let (new_sender, _new_receiver) = oneshot::channel();
        let InstallOutcome::Installed {
            replaced: Some(replaced),
        } = registry.install_authenticated(
            key.clone(),
            ConnectionIdentity {
                arrival_seq: 2,
                connection_id: 20,
            },
            new_sender,
        )
        else {
            panic!("newer connection did not replace the old entry");
        };
        let _ = replaced.send(());

        assert!(!registry.remove_if_current(&key, 10));
        assert_eq!(registry.current_connection_id(&key), Some(20));
        assert!(registry.remove_if_current(&key, 20));
        assert_eq!(registry.current_connection_id(&key), None);
    }

    #[test]
    fn pong_refreshes_transport_liveness_without_application_commands() {
        let connected_at = Instant::now();
        let mut liveness = TransportLiveness::new(connected_at);
        let pong_at = connected_at + HEARTBEAT_TIMEOUT - Duration::from_secs(1);
        liveness.observe_inbound(&Message::Pong(Vec::new().into()), pong_at);

        assert!(!liveness.heartbeat_missed(connected_at + HEARTBEAT_TIMEOUT));
        assert!(liveness.heartbeat_missed(pong_at + HEARTBEAT_TIMEOUT));
    }

    #[test]
    fn only_expired_tickets_are_retryable() {
        assert!(ticket_error_retryable(RealtimeTicketError::Expired));
        assert!(!ticket_error_retryable(RealtimeTicketError::Invalid));
        assert!(!ticket_error_retryable(
            RealtimeTicketError::SessionMismatch
        ));
        assert!(!ticket_error_retryable(RealtimeTicketError::RoleMismatch));
    }

    #[tokio::test]
    async fn watch_hub_drops_intermediate_updates_and_converges_to_latest() {
        let hub = SessionHub::default();
        let mut subscriber = hub.subscribe("session-1");
        for version in 1..=1_000 {
            hub.publish("session-1", HubEvent::SessionChanged { version });
        }
        subscriber.changed().await.unwrap();
        assert_eq!(
            subscriber.borrow_and_update().clone(),
            HubEvent::SessionChanged { version: 1_000 }
        );
        assert!(!subscriber.has_changed().unwrap());
    }

    #[tokio::test]
    async fn send_timeout_seam_drops_a_stalled_subscriber_deterministically() {
        let stalled = std::future::pending::<Result<(), ()>>();
        assert_eq!(
            complete_send_before(Duration::from_millis(1), stalled).await,
            Err(())
        );
        assert_eq!(
            complete_send_before(Duration::from_secs(1), async { Ok::<_, ()>(()) }).await,
            Ok(())
        );
    }
}

#[cfg(test)]
#[path = "realtime_socket_tests.rs"]
mod socket_tests;
