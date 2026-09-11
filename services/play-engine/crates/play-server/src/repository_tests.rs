use play_domain::omok::OmokPosition;
use play_domain::song_guess::{SongGuessClip, SongGuessParticipantSeed, SongGuessRoundSeed};

use super::*;

#[path = "repository_song_guess_choices_tests.rs"]
mod choices;
#[path = "repository_song_guess_rooms_tests.rs"]
mod rooms;
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
        auto_start: false,
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
        room_mode: crate::model::SongGuessRoomMode::TeacherLed,
        classroom_teacher_subject: None,
        answer_target: crate::model::SongGuessAnswerTarget::Title,
        answer_mode: Default::default(),
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
            choices: Vec::new(),
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

#[path = "repository_tests_1.rs"]
mod cases_1;

#[path = "repository_tests_2.rs"]
mod cases_2;
