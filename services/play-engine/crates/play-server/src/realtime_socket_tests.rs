use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as ClientMessage;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::{MaybeTlsStream, tungstenite};
use tower::ServiceExt;

use super::{HubEvent, SessionHub};
use super::{RealtimeConfig, RealtimeTicketClaims, RealtimeTicketVerifier};
use crate::auth::{ActorAssertion, AssertionVerifier};
use crate::http::{AppState, router};
use crate::model::{ActorContext, ActorRole, CreateSessionRequest, ParticipantSeed, SessionRecord};
use crate::repository::{MemoryRepository, PlayRepository};

type ClientSocket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

const ASSERTION_SECRET: [u8; 32] = [5; 32];
const TICKET_SECRET: [u8; 32] = [7; 32];
const MOBILE_ORIGIN: &str = "https://mobile.aura-board.invalid";

struct TestServer {
    address: SocketAddr,
    app: Router,
    record: SessionRecord,
    assertion_verifier: AssertionVerifier,
    ticket_verifier: RealtimeTicketVerifier,
    realtime_config: RealtimeConfig,
    hub: SessionHub,
    task: JoinHandle<()>,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn test_server(auto_start: bool) -> TestServer {
    let repository = Arc::new(MemoryRepository::new());
    let host = actor("teacher:1", ActorRole::Host);
    let created = repository
        .create_session(
            &host,
            "board-1",
            &CreateSessionRequest {
                request_id: "create-1".to_owned(),
                participants: vec![
                    ParticipantSeed {
                        actor_subject: "student:1".to_owned(),
                        display_name: "One".to_owned(),
                    },
                    ParticipantSeed {
                        actor_subject: "student:2".to_owned(),
                        display_name: "Two".to_owned(),
                    },
                ],
                auto_start,
            },
            1_000,
        )
        .await
        .unwrap();
    let record = repository
        .get_session(&created.value.snapshot.session_id)
        .await
        .unwrap();
    let assertion_verifier = AssertionVerifier::new(ASSERTION_SECRET).unwrap();
    let ticket_verifier = RealtimeTicketVerifier::new(TICKET_SECRET).unwrap();
    let realtime_config = RealtimeConfig::new(
        ticket_verifier.clone(),
        [
            "https://aura-board.com".to_owned(),
            MOBILE_ORIGIN.to_owned(),
        ],
    );
    let state = AppState::new(
        repository,
        assertion_verifier.clone(),
        Arc::<str>::from("internal-test-secret-32-bytes-long"),
    )
    .with_realtime(realtime_config.clone())
    .with_clock(|| 1_000);
    let hub = state.command_service().hub().clone();
    let app = router(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let serving_app = app.clone();
    let task = tokio::spawn(async move {
        axum::serve(listener, serving_app).await.unwrap();
    });
    TestServer {
        address,
        app,
        record,
        assertion_verifier,
        ticket_verifier,
        realtime_config,
        hub,
        task,
    }
}

fn actor(subject: &str, role: ActorRole) -> ActorContext {
    ActorContext {
        subject: subject.to_owned(),
        role,
    }
}

fn ticket(server: &TestServer, actor: &ActorContext) -> String {
    ticket_with_expiry(server, actor, 2_000)
}

fn ticket_with_expiry(server: &TestServer, actor: &ActorContext, expires_at_ms: i64) -> String {
    let nonce = format!("nonce-{}", actor.subject);
    let claims = RealtimeTicketClaims {
        protocol_version: 1,
        session_id: server.record.session_id.clone(),
        role: actor.role,
        actor_key: server.ticket_verifier.actor_key_for_test(
            &server.record.session_id,
            actor.role,
            &actor.subject,
            expires_at_ms,
            &nonce,
        ),
        expires_at_ms,
        nonce,
    };
    server.ticket_verifier.sign_for_test(&claims)
}

fn assertion(server: &TestServer, actor: &ActorContext) -> String {
    server.assertion_verifier.sign_for_test(&ActorAssertion {
        actor_subject: actor.subject.clone(),
        role: actor.role,
        expires_at_ms: 2_000,
    })
}

async fn connect(server: &TestServer, actor: &ActorContext) -> ClientSocket {
    let mut socket = open_socket(server).await;
    authenticate(&mut socket, ticket(server, actor)).await;
    socket
}

async fn connect_with_ticket(server: &TestServer, ticket: String) -> ClientSocket {
    let mut socket = open_socket(server).await;
    authenticate(&mut socket, ticket).await;
    socket
}

async fn open_socket(server: &TestServer) -> ClientSocket {
    let mut request = format!("ws://{}/v1/realtime", server.address)
        .into_client_request()
        .unwrap();
    request
        .headers_mut()
        .insert("origin", HeaderValue::from_static(MOBILE_ORIGIN));
    let (socket, _) = connect_async(request).await.unwrap();
    socket
}

async fn authenticate(socket: &mut ClientSocket, ticket: String) {
    socket
        .send(ClientMessage::Text(
            json!({
                "type": "authenticate",
                "protocolVersion": 1,
                "ticket": ticket,
                "lastSeenVersion": 0
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
}

async fn read_close(socket: &mut ClientSocket) -> tungstenite::protocol::CloseFrame {
    loop {
        let message = timeout(Duration::from_secs(2), socket.next())
            .await
            .expect("socket close timeout")
            .expect("socket closed without close frame")
            .expect("socket error before close frame");
        match message {
            ClientMessage::Close(Some(frame)) => return frame,
            ClientMessage::Ping(payload) => {
                socket.send(ClientMessage::Pong(payload)).await.unwrap();
            }
            ClientMessage::Pong(_) => {}
            other => panic!("unexpected frame before close: {other:?}"),
        }
    }
}

async fn read_json(socket: &mut ClientSocket) -> Value {
    loop {
        let message = timeout(Duration::from_secs(2), socket.next())
            .await
            .expect("socket frame timeout")
            .expect("socket closed")
            .expect("socket error");
        match message {
            ClientMessage::Text(text) => return serde_json::from_str(text.as_str()).unwrap(),
            ClientMessage::Ping(payload) => {
                socket.send(ClientMessage::Pong(payload)).await.unwrap();
            }
            ClientMessage::Pong(_) => {}
            other => panic!("unexpected socket frame: {other:?}"),
        }
    }
}

async fn http_command(
    server: &TestServer,
    actor: &ActorContext,
    body: Value,
) -> axum::response::Response {
    server
        .app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/v1/sessions/{}/commands",
                    server.record.session_id
                ))
                .header("content-type", "application/json")
                .header("x-aura-play-actor", assertion(server, actor))
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn http_json(
    server: &TestServer,
    actor: &ActorContext,
    method: &str,
    path: String,
    body: Option<Value>,
) -> axum::response::Response {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("x-aura-play-actor", assertion(server, actor));
    if body.is_some() {
        request = request.header("content-type", "application/json");
    }
    server
        .app
        .clone()
        .oneshot(
            request
                .body(body.map_or_else(Body::empty, |body| Body::from(body.to_string())))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn response_json(response: axum::response::Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

#[tokio::test]
async fn websocket_and_http_commands_share_post_commit_projection_and_recovery() {
    let server = test_server(true).await;
    let first = actor("student:1", ActorRole::Participant);
    let second = actor("student:2", ActorRole::Participant);
    let mut first_socket = connect(&server, &first).await;
    let mut second_socket = connect(&server, &second).await;

    let first_ready = read_json(&mut first_socket).await;
    let second_ready = read_json(&mut second_socket).await;
    assert_eq!(first_ready["type"], "ready");
    assert_eq!(first_ready["snapshot"]["viewer"]["slot"], "first");
    assert_eq!(second_ready["snapshot"]["viewer"]["slot"], "second");

    let command = json!({
        "type": "command",
        "protocolVersion": 1,
        "requestId": "stone-1",
        "expectedVersion": 0,
        "commandSchemaVersion": 1,
        "command": {"type": "place_stone", "position": {"row": 7, "column": 7}}
    });
    first_socket
        .send(ClientMessage::Text(command.to_string().into()))
        .await
        .unwrap();
    let committed = read_json(&mut first_socket).await;
    assert_eq!(committed["type"], "command_committed");
    assert_eq!(committed["requestId"], "stone-1");
    assert_eq!(committed["commandType"], "place_stone");
    assert_eq!(committed["version"], 1);
    assert_eq!(committed["replayed"], false);
    let duration = server.realtime_config.command_duration_snapshot();
    assert_eq!(duration.sample_count, 1);
    assert!(duration.total_micros >= duration.max_micros);

    let peer = read_json(&mut second_socket).await;
    assert_eq!(peer["type"], "snapshot");
    assert_eq!(peer["snapshot"]["version"], 1);
    assert_eq!(peer["snapshot"]["viewer"]["slot"], "second");
    assert!(peer.get("requestId").is_none());

    second_socket
        .send(ClientMessage::Text(
            json!({
                "type": "command",
                "protocolVersion": 1,
                "requestId": "stale-2",
                "expectedVersion": 0,
                "commandSchemaVersion": 1,
                "command": {"type": "place_stone", "position": {"row": 7, "column": 8}}
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    let rejected = read_json(&mut second_socket).await;
    assert_eq!(rejected["type"], "command_rejected");
    assert_eq!(rejected["requestId"], "stale-2");
    assert_eq!(rejected["error"], "version_conflict");
    assert_eq!(rejected["snapshot"]["viewer"]["slot"], "second");

    first_socket
        .send(ClientMessage::Text(command.to_string().into()))
        .await
        .unwrap();
    let replay = read_json(&mut first_socket).await;
    assert_eq!(replay["type"], "command_committed");
    assert_eq!(replay["replayed"], true);
    assert_eq!(replay["version"], 1);
    assert_eq!(
        server
            .realtime_config
            .command_duration_snapshot()
            .sample_count,
        3
    );
    let replay_evidence = server.hub.subscribe(&server.record.session_id);
    assert!(!replay_evidence.has_changed().unwrap());

    let response = http_command(
        &server,
        &second,
        json!({
            "requestId": "stone-2",
            "expectedVersion": 1,
            "commandSchemaVersion": 1,
            "command": {"type": "place_stone", "position": {"row": 7, "column": 8}}
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let http_body: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(http_body["version"], 2);
    let http_wake = read_json(&mut first_socket).await;
    assert_eq!(http_wake["type"], "snapshot");
    assert_eq!(http_wake["snapshot"]["version"], 2);

    first_socket.close(None).await.unwrap();
    let response = http_command(
        &server,
        &first,
        json!({
            "requestId": "stone-3",
            "expectedVersion": 2,
            "commandSchemaVersion": 1,
            "command": {"type": "place_stone", "position": {"row": 8, "column": 7}}
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let mut reconnected = connect(&server, &first).await;
    let latest = read_json(&mut reconnected).await;
    assert_eq!(latest["type"], "ready");
    assert_eq!(latest["snapshot"]["version"], 3);
    assert_eq!(latest["snapshot"]["game"]["moveCount"], 3);
}

#[tokio::test]
async fn handshake_origin_auth_and_frame_policies_are_enforced() {
    let server = test_server(true).await;
    let url = format!("ws://{}/v1/realtime", server.address);

    let mut denied_request = url.clone().into_client_request().unwrap();
    denied_request
        .headers_mut()
        .insert("origin", HeaderValue::from_static("https://evil.example"));
    let denied = connect_async(denied_request).await.unwrap_err();
    assert!(
        matches!(denied, tungstenite::Error::Http(response) if response.status() == StatusCode::FORBIDDEN)
    );

    let mut allowed_request = url.clone().into_client_request().unwrap();
    allowed_request
        .headers_mut()
        .insert("origin", HeaderValue::from_static("https://aura-board.com"));
    let (mut allowed, _) = connect_async(allowed_request).await.unwrap();
    allowed
        .send(ClientMessage::Text(
            json!({
                "type": "command",
                "protocolVersion": 1,
                "requestId": "before-auth",
                "expectedVersion": 0,
                "commandSchemaVersion": 1,
                "command": {"type": "ready"}
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    let error = read_json(&mut allowed).await;
    assert_eq!(error["type"], "connection_error");
    assert_eq!(error["error"], "authentication_required");

    let (mut unauthenticated, _) = connect_async(url.clone()).await.unwrap();
    let timeout_frame = timeout(Duration::from_secs(7), unauthenticated.next())
        .await
        .expect("first-frame authentication timeout was not enforced")
        .expect("socket closed before timeout error")
        .expect("socket failed before timeout error");
    let ClientMessage::Text(timeout_text) = timeout_frame else {
        panic!("expected timeout error text frame");
    };
    let timeout_error: Value = serde_json::from_str(timeout_text.as_str()).unwrap();
    assert_eq!(timeout_error["type"], "connection_error");
    assert_eq!(timeout_error["error"], "authentication_timeout");

    let (mut oversized, _) = connect_async(url).await.unwrap();
    oversized
        .send(ClientMessage::Text("x".repeat(16 * 1024 + 1).into()))
        .await
        .unwrap();
    let closed = timeout(Duration::from_secs(2), oversized.next())
        .await
        .expect("oversized frame was not rejected");
    assert!(matches!(
        closed,
        None | Some(Err(_)) | Some(Ok(ClientMessage::Close(_)))
    ));
}

#[tokio::test]
async fn same_actor_reconnect_replaces_only_its_old_socket() {
    let server = test_server(true).await;
    let first = actor("student:1", ActorRole::Participant);
    let second = actor("student:2", ActorRole::Participant);
    let mut old_first = connect(&server, &first).await;
    let mut peer = connect(&server, &second).await;
    assert_eq!(read_json(&mut old_first).await["type"], "ready");
    assert_eq!(read_json(&mut peer).await["type"], "ready");

    let mut new_first = connect(&server, &first).await;
    assert_eq!(read_json(&mut new_first).await["type"], "ready");
    let replaced = read_close(&mut old_first).await;
    assert_eq!(u16::from(replaced.code), 4001);
    assert_eq!(replaced.reason, "REPLACED");

    let response = http_command(
        &server,
        &first,
        json!({
            "requestId": "stone-after-reconnect",
            "expectedVersion": 0,
            "commandSchemaVersion": 1,
            "command": {"type": "place_stone", "position": {"row": 7, "column": 7}}
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(read_json(&mut new_first).await["type"], "snapshot");
    assert_eq!(read_json(&mut peer).await["type"], "snapshot");
}

#[tokio::test]
async fn later_arrival_that_authenticates_first_rejects_older_attempt_as_stale() {
    let server = test_server(true).await;
    let first = actor("student:1", ActorRole::Participant);
    let mut old_arrival = open_socket(&server).await;
    let mut new_arrival = open_socket(&server).await;

    authenticate(&mut new_arrival, ticket(&server, &first)).await;
    assert_eq!(read_json(&mut new_arrival).await["type"], "ready");

    authenticate(&mut old_arrival, ticket(&server, &first)).await;
    let stale = read_close(&mut old_arrival).await;
    assert_eq!(u16::from(stale.code), 4002);
    assert_eq!(stale.reason, "STALE_ATTEMPT");

    let response = http_command(
        &server,
        &first,
        json!({
            "requestId": "new-remains-current",
            "expectedVersion": 0,
            "commandSchemaVersion": 1,
            "command": {"type": "place_stone", "position": {"row": 7, "column": 7}}
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(read_json(&mut new_arrival).await["type"], "snapshot");
}

#[tokio::test]
async fn invalid_auth_does_not_replace_current_socket_and_retryability_is_exact() {
    let server = test_server(true).await;
    let first = actor("student:1", ActorRole::Participant);
    let mut current = connect(&server, &first).await;
    assert_eq!(read_json(&mut current).await["type"], "ready");

    let mut invalid = connect_with_ticket(&server, "invalid-ticket".to_owned()).await;
    let invalid_error = read_json(&mut invalid).await;
    assert_eq!(invalid_error["error"], "invalid_ticket");
    assert_eq!(invalid_error["retryable"], false);

    let mut expired =
        connect_with_ticket(&server, ticket_with_expiry(&server, &first, 1_000)).await;
    let expired_error = read_json(&mut expired).await;
    assert_eq!(expired_error["error"], "ticket_expired");
    assert_eq!(expired_error["retryable"], true);

    let response = http_command(
        &server,
        &first,
        json!({
            "requestId": "still-current",
            "expectedVersion": 0,
            "commandSchemaVersion": 1,
            "command": {"type": "place_stone", "position": {"row": 7, "column": 7}}
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(read_json(&mut current).await["type"], "snapshot");
}

#[tokio::test]
async fn terminal_host_capability_and_rematch_replacement_are_authoritative() {
    let server = test_server(true).await;
    let host = actor("teacher:1", ActorRole::Host);
    let first = actor("student:1", ActorRole::Participant);

    let resigned = http_command(
        &server,
        &first,
        json!({
            "requestId": "resign-1",
            "expectedVersion": 0,
            "commandSchemaVersion": 1,
            "command": {"type": "resign"}
        }),
    )
    .await;
    assert_eq!(resigned.status(), StatusCode::OK);

    let host_snapshot = response_json(
        http_json(
            &server,
            &host,
            "GET",
            format!("/v1/sessions/{}/snapshot", server.record.session_id),
            None,
        )
        .await,
    )
    .await;
    assert_eq!(host_snapshot["viewer"]["capabilities"]["canRematch"], true);

    let participant_snapshot = response_json(
        http_json(
            &server,
            &first,
            "GET",
            format!("/v1/sessions/{}/snapshot", server.record.session_id),
            None,
        )
        .await,
    )
    .await;
    assert_eq!(
        participant_snapshot["viewer"]["capabilities"]["canRematch"],
        false
    );

    let host_conflict = http_command(
        &server,
        &host,
        json!({
            "requestId": "stale-host-1",
            "expectedVersion": 0,
            "commandSchemaVersion": 1,
            "command": {"type": "start"}
        }),
    )
    .await;
    assert_eq!(host_conflict.status(), StatusCode::CONFLICT);
    let host_conflict = response_json(host_conflict).await;
    assert_eq!(host_conflict["error"], "version_conflict");
    assert_eq!(
        host_conflict["snapshot"]["viewer"]["capabilities"]["canRematch"],
        true
    );

    let mut old_session_socket = connect(&server, &first).await;
    assert_eq!(read_json(&mut old_session_socket).await["type"], "ready");
    let rematch = http_json(
        &server,
        &host,
        "POST",
        format!("/v1/sessions/{}/rematch", server.record.session_id),
        Some(json!({"requestId": "rematch-1"})),
    )
    .await;
    assert_eq!(rematch.status(), StatusCode::CREATED);
    let rematch_body = response_json(rematch).await;
    let replacement_id = rematch_body["snapshot"]["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();

    let replacement = read_json(&mut old_session_socket).await;
    assert_eq!(replacement["type"], "session_replaced");
    assert_eq!(replacement["reason"], "rematch");
    assert_eq!(replacement["previousSessionId"], server.record.session_id);
    assert_eq!(replacement["sessionId"], replacement_id);
    assert_eq!(replacement["snapshot"]["version"], 0);
    assert_eq!(
        replacement["snapshot"]["previousSessionId"],
        server.record.session_id
    );
    assert_eq!(replacement["snapshot"]["viewer"]["slot"], "second");
    let closed = timeout(Duration::from_secs(2), old_session_socket.next())
        .await
        .expect("old session socket was not closed after replacement");
    assert!(matches!(closed, None | Some(Ok(ClientMessage::Close(_)))));

    let old_host_snapshot = response_json(
        http_json(
            &server,
            &host,
            "GET",
            format!("/v1/sessions/{}/snapshot", server.record.session_id),
            None,
        )
        .await,
    )
    .await;
    assert_eq!(
        old_host_snapshot["viewer"]["capabilities"]["canRematch"],
        false
    );

    let replacement_evidence = server.hub.subscribe(&server.record.session_id);
    let replay = http_json(
        &server,
        &host,
        "POST",
        format!("/v1/sessions/{}/rematch", server.record.session_id),
        Some(json!({"requestId": "rematch-1"})),
    )
    .await;
    assert_eq!(replay.status(), StatusCode::CREATED);
    assert_eq!(replay.headers().get("x-idempotent-replay").unwrap(), "true");
    assert!(!replacement_evidence.has_changed().unwrap());
}

#[tokio::test]
async fn projection_failure_sends_retryable_recovery_error_and_closes() {
    let server = test_server(true).await;
    let first = actor("student:1", ActorRole::Participant);
    let mut socket = connect(&server, &first).await;
    assert_eq!(read_json(&mut socket).await["type"], "ready");

    server.hub.publish(
        &server.record.session_id,
        HubEvent::SessionReplaced {
            session_id: "missing-replacement".to_owned(),
        },
    );
    let error = read_json(&mut socket).await;
    assert_eq!(error["type"], "connection_error");
    assert_eq!(error["error"], "snapshot_unavailable");
    assert_eq!(error["retryable"], true);
    let closed = timeout(Duration::from_secs(2), socket.next())
        .await
        .expect("socket was not closed after projection failure");
    assert!(matches!(closed, None | Some(Ok(ClientMessage::Close(_)))));
}
