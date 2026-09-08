use play_domain::song_guess::{SongGuessParticipantSeed, SongGuessRoundSeed};

use play_domain::song_guess::SongGuessClip;

use super::*;

fn seed(id: &str) -> ParticipantSeed {
    ParticipantSeed {
        actor_subject: format!("student:{id}"),
        display_name: id.to_owned(),
    }
}

fn actor(id: &str) -> ActorContext {
    ActorContext {
        subject: format!("student:{id}"),
        role: ActorRole::Participant,
    }
}

fn host() -> ActorContext {
    ActorContext {
        subject: "teacher:1".to_owned(),
        role: ActorRole::Host,
    }
}

fn session() -> SessionRecord {
    SessionRecord::new(
        "session-1".to_owned(),
        "board-1".to_owned(),
        host().subject,
        [seed("first"), seed("second")],
        None,
        100,
    )
    .unwrap()
}

#[test]
fn requires_both_participants_ready_and_host_start() {
    let mut session = session();
    session.apply(&actor("first"), &OmokIntent::Ready).unwrap();
    assert_eq!(session.state.room_status, RoomStatus::Waiting);
    session.apply(&actor("second"), &OmokIntent::Ready).unwrap();
    assert_eq!(session.state.room_status, RoomStatus::Ready);
    session.apply(&host(), &OmokIntent::Start).unwrap();
    assert_eq!(session.state.room_status, RoomStatus::Active);
}

#[test]
fn actor_slot_is_server_owned() {
    let mut session = session();
    session.apply(&actor("first"), &OmokIntent::Ready).unwrap();
    session.apply(&actor("second"), &OmokIntent::Ready).unwrap();
    session.apply(&host(), &OmokIntent::Start).unwrap();
    let before = session.clone();
    let error = session
        .apply(
            &actor("second"),
            &OmokIntent::PlaceStone {
                position: OmokPosition { row: 7, column: 7 },
            },
        )
        .unwrap_err();
    assert!(matches!(error, ModelError::DomainRejected(_)));
    assert_eq!(session, before);
}

#[test]
fn resign_finishes_and_rematch_swaps_slots() {
    let mut session = session();
    session.apply(&actor("first"), &OmokIntent::Ready).unwrap();
    session.apply(&actor("second"), &OmokIntent::Ready).unwrap();
    session.apply(&host(), &OmokIntent::Start).unwrap();
    session.apply(&actor("first"), &OmokIntent::Resign).unwrap();
    assert_eq!(
        session.state.outcome,
        Some(SessionOutcome {
            winner: Some(OmokSlot::Second),
            reason: FinishReason::Resignation,
        })
    );

    let rematch = session.rematch("session-2".to_owned(), 200).unwrap();
    assert_eq!(rematch.previous_session_id.as_deref(), Some("session-1"));
    let first = rematch
        .state
        .participants
        .iter()
        .find(|participant| participant.slot == OmokSlot::First)
        .unwrap();
    assert_eq!(first.actor_subject, "student:second");
    assert_eq!(rematch.state.room_status, RoomStatus::Waiting);
}

#[test]
fn song_guess_snapshot_reports_authoritative_round_points_and_previous_rank() {
    let round = |round_id: &str, answer: &str| SongGuessRoundSeed {
        choices: Vec::new(),
        round_id: round_id.to_owned(),
        representative_answer: answer.to_owned(),
        normalized_answer: answer.to_ascii_lowercase(),
        aliases: vec![],
        normalized_aliases: vec![],
        accessibility_clue: None,
        clips: vec![
            SongGuessClip {
                asset_id: format!("{round_id}-500"),
                tier_ms: 500,
                mime_type: "audio/webm".to_owned(),
                size_bytes: 100,
                duration_ms: 500,
            },
            SongGuessClip {
                asset_id: format!("{round_id}-1000"),
                tier_ms: 1_000,
                mime_type: "audio/webm".to_owned(),
                size_bytes: 100,
                duration_ms: 1_000,
            },
            SongGuessClip {
                asset_id: format!("{round_id}-1500"),
                tier_ms: 1_500,
                mime_type: "audio/webm".to_owned(),
                size_bytes: 100,
                duration_ms: 1_500,
            },
        ],
    };
    let mut session = SongGuessSessionRecord::new(
        "song-1".to_owned(),
        "board-1".to_owned(),
        host().subject,
        vec![
            SongGuessParticipantSeed {
                actor_subject: "student:one".to_owned(),
                display_name: "One".to_owned(),
            },
            SongGuessParticipantSeed {
                actor_subject: "student:two".to_owned(),
                display_name: "Two".to_owned(),
            },
        ],
        vec![round("round-1", "Blue Moon"), round("round-2", "Red Sun")],
        None,
        0,
    )
    .unwrap();
    assert_waiting_song_guess_wire(&session, "draft");
    session.apply(&host(), &SongGuessIntent::OpenLobby).unwrap();
    assert_waiting_song_guess_wire(&session, "lobby");
    session
        .apply(&actor("one"), &SongGuessIntent::Join)
        .unwrap();
    session
        .apply(&actor("two"), &SongGuessIntent::Join)
        .unwrap();
    session
        .apply_at(&host(), &SongGuessIntent::Start, 1_000)
        .unwrap();
    session
        .apply_at(
            &actor("one"),
            &SongGuessIntent::Guess {
                choice_id: None,
                text: Some("blue moon".to_owned()),
                round_id: None,
            },
            1_000,
        )
        .unwrap();
    session.apply(&host(), &SongGuessIntent::Reveal).unwrap();
    session
        .apply_at(&host(), &SongGuessIntent::NextRound, 2_000)
        .unwrap();
    session
        .apply_at(
            &actor("two"),
            &SongGuessIntent::Guess {
                choice_id: None,
                text: Some("red sun".to_owned()),
                round_id: None,
            },
            2_000,
        )
        .unwrap();

    let snapshot = session.snapshot(&host(), 2_100).unwrap();
    assert_eq!(snapshot.participants[0].round_score, Some(0));
    assert_eq!(snapshot.participants[1].round_score, Some(1_000));
    assert_eq!(snapshot.participants[0].previous_rank, Some(1));
    assert_eq!(snapshot.participants[1].previous_rank, Some(2));
}

fn assert_waiting_song_guess_wire(session: &SongGuessSessionRecord, phase: &str) {
    for viewer in [host(), actor("one")] {
        let wire = serde_json::to_value(session.snapshot(&viewer, 100).unwrap()).unwrap();
        assert_eq!(wire["phase"], phase);
        let round = wire["currentRound"].as_object().unwrap();
        assert_eq!(round.get("startedAtMs"), Some(&serde_json::Value::Null));
        assert_eq!(round.get("deadlineAtMs"), Some(&serde_json::Value::Null));
        assert_eq!(round.get("maxScore"), Some(&serde_json::json!(1000)));
    }
}
