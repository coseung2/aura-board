use super::*;
use serde_json::{Value, json};

fn actor(subject: &str) -> ActorContext {
    ActorContext {
        subject: subject.to_owned(),
        role: if subject == "teacher" {
            ActorRole::Host
        } else {
            ActorRole::Participant
        },
    }
}

#[test]
fn answer_target_survives_restore_and_legacy_defaults_to_title() {
    for target in [
        SongGuessAnswerTarget::Artist,
        SongGuessAnswerTarget::ArtistTitle,
    ] {
        let record = record().with_answer_target(target);
        let restored: SongGuessSessionRecord =
            serde_json::from_value(serde_json::to_value(&record).unwrap()).unwrap();
        assert_eq!(
            restored
                .snapshot(&actor("student:1"), 0)
                .unwrap()
                .answer_target,
            target
        );
    }
    let mut legacy = serde_json::to_value(record()).unwrap();
    legacy.as_object_mut().unwrap().remove("answerTarget");
    let restored: SongGuessSessionRecord = serde_json::from_value(legacy).unwrap();
    assert_eq!(restored.answer_target, SongGuessAnswerTarget::Title);
    let mut bad = serde_json::to_value(request()).unwrap();
    bad["answerTarget"] = json!("unknown");
    assert!(serde_json::from_value::<CreateSongGuessSessionRequest>(bad).is_err());
}

fn request() -> CreateSongGuessSessionRequest {
    serde_json::from_value(json!({
        "requestId": "create-mc", "answerMode": "multiple-choice",
        "participants": [
            {"actorSubject": "student:1", "displayName": "One"},
            {"actorSubject": "student:2", "displayName": "Two"}
        ],
        "rounds": (0..2).map(|i| json!({
            "roundId": format!("round-{i}"), "representativeAnswer": "Blue Moon",
            "normalizedAnswer": "blue moon", "aliases": ["BlueMoon"],
            "normalizedAliases": ["bluemoon"], "accessibilityClue": null,
            "clips": [{"assetId": format!("asset-{i}"), "tierMs": 15000,
                "mimeType": "audio/wav", "sizeBytes": 100, "durationMs": 15000}],
            "choices": [
                {"id": format!("opaque-{i}-a"), "label": "Red Sun"},
                {"id": format!("opaque-{i}-b"), "label": "Blue Moon"},
                {"id": format!("opaque-{i}-c"), "label": "Green Star"},
                {"id": format!("opaque-{i}-d"), "label": "White Sky"}
            ]
        })).collect::<Vec<_>>()
    }))
    .unwrap()
}

fn record() -> SongGuessSessionRecord {
    let req = request();
    SongGuessSessionRecord::new(
        "session".into(),
        "board".into(),
        "teacher".into(),
        req.participants,
        req.rounds,
        None,
        0,
    )
    .unwrap()
    .with_answer_mode(req.answer_mode)
    .unwrap()
}

fn playing() -> SongGuessSessionRecord {
    let mut record = record();
    record
        .apply(&actor("teacher"), &SongGuessIntent::OpenLobby)
        .unwrap();
    for subject in ["student:1", "student:2"] {
        record
            .apply(&actor(subject), &SongGuessIntent::Join)
            .unwrap();
    }
    record
        .apply_at(&actor("teacher"), &SongGuessIntent::Start, 1000)
        .unwrap();
    record
}

fn guess(id: &str) -> SongGuessIntent {
    serde_json::from_value(json!({"type":"guess", "choiceId":id, "roundId":"round-0"})).unwrap()
}

#[test]
fn current_options_and_only_own_selection_survive_serialization() {
    let mut record = record();
    for phase in ["draft", "lobby"] {
        let snapshot =
            serde_json::to_value(record.snapshot(&actor("student:1"), 0).unwrap()).unwrap();
        assert_eq!(snapshot["phase"], phase);
        assert!(snapshot["currentRound"].get("choices").is_none());
        assert!(!snapshot.to_string().contains("Blue Moon"));
        if phase == "draft" {
            record
                .apply(&actor("teacher"), &SongGuessIntent::OpenLobby)
                .unwrap();
        }
    }
    let mut record = playing();
    record
        .apply_at(&actor("student:1"), &guess("opaque-0-a"), 1000)
        .unwrap();
    let persisted = serde_json::to_value(&record).unwrap();
    let restored: SongGuessSessionRecord = serde_json::from_value(persisted).unwrap();
    restored.validate().unwrap();
    for subject in ["teacher", "student:1", "student:2"] {
        let snapshot =
            serde_json::to_value(restored.snapshot(&actor(subject), 2000).unwrap()).unwrap();
        assert_eq!(snapshot["answerMode"], "multiple-choice");
        assert_eq!(
            snapshot["currentRound"]["choices"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(snapshot["currentRound"]["revealedAnswer"], Value::Null);
        let wire = snapshot.to_string();
        for hidden in [
            "normalizedAnswer",
            "normalizedAliases",
            "correctChoiceId",
            "selections",
            "opaque-1-a",
            "asset-1",
        ] {
            assert!(!wire.contains(hidden), "{hidden}");
        }
        assert_eq!(
            snapshot["viewer"]["answeredCurrentRound"],
            subject == "student:1"
        );
        if subject == "student:1" {
            assert_eq!(snapshot["viewer"]["selectedChoiceId"], "opaque-0-a");
        } else {
            assert!(snapshot["viewer"].get("selectedChoiceId").is_none());
        }
        assert!(
            snapshot["participants"]
                .as_array()
                .unwrap()
                .iter()
                .all(|p| p.get("selectedChoiceId").is_none())
        );
    }
    assert_eq!(
        restored
            .snapshot(&actor("student:1"), 2000)
            .unwrap()
            .current_round
            .choices,
        record
            .snapshot(&actor("student:1"), 1000)
            .unwrap()
            .current_round
            .choices
    );
    let mut next = restored;
    next.apply(&actor("teacher"), &SongGuessIntent::Reveal)
        .unwrap();
    next.apply_at(&actor("teacher"), &SongGuessIntent::NextRound, 2000)
        .unwrap();
    assert!(
        !next
            .snapshot(&actor("student:1"), 2000)
            .unwrap()
            .viewer
            .answered_current_round
    );
}

#[test]
fn invalid_free_text_and_duplicate_attempts_never_mutate_state() {
    let mut record = playing();
    for intent in [
        json!({"type":"guess","text":"Blue Moon","roundId":"round-0"}),
        json!({"type":"guess","text":"Blue Moon","choiceId":"opaque-0-b"}),
        json!({"type":"guess","choiceId":"arbitrary"}),
        json!({"type":"guess","choiceId":"opaque-1-b"}),
        json!({"type":"guess","choiceId":"opaque-0-b","roundId":"round-1"}),
    ] {
        let before = record.clone();
        assert!(
            record
                .apply_at(
                    &actor("student:1"),
                    &serde_json::from_value(intent).unwrap(),
                    1000
                )
                .is_err()
        );
        assert_eq!(record, before);
    }
    let wrong = record
        .apply_at(&actor("student:1"), &guess("opaque-0-a"), 1000)
        .unwrap()
        .unwrap();
    assert!(!wrong.correct);
    let before = record.clone();
    assert_eq!(
        record.apply_at(&actor("student:1"), &guess("opaque-0-b"), 1000),
        Err(ModelError::DomainRejected("already_answered".into()))
    );
    assert_eq!(record, before);
    let correct = record
        .apply_at(&actor("student:2"), &guess("opaque-0-b"), 1000)
        .unwrap()
        .unwrap();
    assert_eq!(correct.score, 1000);
    assert!(
        record
            .apply_at(&actor("student:2"), &guess("opaque-0-a"), 1000)
            .is_err()
    );
    assert!(
        record
            .state
            .guess_at("student:1", "Blue Moon", 1000)
            .is_err()
    );
}

#[test]
fn malformed_options_and_mode_mismatch_are_rejected() {
    let record = record();
    for count in [0, 1, 3, 5] {
        let mut invalid = record.clone();
        invalid.state.rounds[0].choices.resize(
            count,
            SongGuessChoice {
                id: "other".into(),
                label: "Other".into(),
            },
        );
        assert!(invalid.validate().is_err());
    }
    for label in ["BlueMoon", "red sun", " ", "Blue Moon"] {
        let mut invalid = record.clone();
        invalid.state.rounds[0].choices[2].label = label.into();
        assert!(invalid.validate().is_err());
    }
    let mut invalid = record.clone();
    invalid.state.rounds[0].choices[2].id = "opaque-0-a".into();
    assert!(invalid.validate().is_err());
    assert!(record.with_answer_mode(SongGuessAnswerMode::Text).is_err());
}

#[test]
fn old_state_and_old_request_hash_shape_remain_compatible() {
    let mut legacy = serde_json::to_value(record()).unwrap();
    let state = legacy["state"].as_object_mut().unwrap();
    state.remove("answerMode");
    for round in state["rounds"].as_array_mut().unwrap() {
        round.as_object_mut().unwrap().remove("choices");
        round.as_object_mut().unwrap().remove("selections");
    }
    let restored: SongGuessSessionRecord = serde_json::from_value(legacy).unwrap();
    restored.validate().unwrap();
    assert_eq!(restored.state.answer_mode, SongGuessAnswerMode::Text);
    let legacy_command = json!({"type":"guess", "text":"Blue Moon", "round_id": null});
    let parsed: SongGuessIntent = serde_json::from_value(legacy_command.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), legacy_command);
    let mut req = serde_json::to_value(request()).unwrap();
    req.as_object_mut().unwrap().remove("answerMode");
    for round in req["rounds"].as_array_mut().unwrap() {
        round.as_object_mut().unwrap().remove("choices");
    }
    let parsed: CreateSongGuessSessionRequest = serde_json::from_value(req.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), req);
}
