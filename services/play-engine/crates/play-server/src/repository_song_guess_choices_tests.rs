use super::*;
use play_domain::song_guess::{SongGuessAnswerMode, SongGuessChoice};

#[tokio::test]
async fn mc_create_replay_and_concurrent_attempts_survive_repository_reload() {
    let repository = MemoryRepository::new();
    let mut request = song_guess_request("create-mc");
    request.answer_mode = SongGuessAnswerMode::MultipleChoice;
    request.answer_target = crate::model::SongGuessAnswerTarget::Artist;
    request.rounds[0].choices = ["Other", "Blue Moon", "Another", "Last"]
        .iter()
        .enumerate()
        .map(|(index, label)| SongGuessChoice {
            id: format!("opaque-{index}"),
            label: (*label).into(),
        })
        .collect();
    let created = repository
        .create_song_guess_session(&host(), "board-mc", &request, 0)
        .await
        .unwrap();
    let session_id = created.value.snapshot.session_id.clone();
    let replay = repository
        .create_song_guess_session(&host(), "board-mc", &request, 1)
        .await
        .unwrap();
    assert!(replay.replayed);
    assert_eq!(created.value, replay.value);
    assert_eq!(
        created.value.snapshot.answer_target,
        crate::model::SongGuessAnswerTarget::Artist
    );
    let mut changed_target = request.clone();
    changed_target.answer_target = crate::model::SongGuessAnswerTarget::ArtistTitle;
    assert_eq!(
        repository
            .create_song_guess_session(&host(), "board-mc", &changed_target, 1)
            .await,
        Err(RepositoryError::IdempotencyKeyReuse)
    );
    let mut reused = request.clone();
    reused.answer_mode = SongGuessAnswerMode::Text;
    assert_eq!(
        repository
            .create_song_guess_session(&host(), "board-mc", &reused, 1)
            .await,
        Err(RepositoryError::IdempotencyKeyReuse)
    );
    for (version, actor, command) in [
        (0, host(), SongGuessIntent::OpenLobby),
        (1, participant("first"), SongGuessIntent::Join),
        (2, host(), SongGuessIntent::Start),
    ] {
        repository
            .execute_song_guess_command(
                &actor,
                &session_id,
                &SongGuessCommandRequest {
                    request_id: format!("phase-{version}"),
                    expected_version: version,
                    command_schema_version: 1,
                    command,
                },
                1000,
            )
            .await
            .unwrap();
    }
    let wrong = SongGuessCommandRequest {
        request_id: "wrong".into(),
        expected_version: 3,
        command_schema_version: 1,
        command: SongGuessIntent::Guess {
            text: None,
            choice_id: Some("opaque-0".into()),
            round_id: Some("round-1".into()),
        },
    };
    let first = repository
        .execute_song_guess_command(&participant("first"), &session_id, &wrong, 1000)
        .await
        .unwrap();
    assert!(!first.value.result.as_ref().unwrap().correct);
    let replay = repository
        .execute_song_guess_command(&participant("first"), &session_id, &wrong, 2000)
        .await
        .unwrap();
    assert!(replay.replayed);
    assert_eq!(first.value, replay.value);
    let mut retry = wrong.clone();
    retry.request_id = "retry-correct".into();
    retry.command = SongGuessIntent::Guess {
        text: None,
        choice_id: Some("opaque-1".into()),
        round_id: Some("round-1".into()),
    };
    let before = repository.outbox().await.len();
    let student = participant("first");
    let (a, b) = tokio::join!(
        repository.execute_song_guess_command(&student, &session_id, &retry, 2000),
        repository.execute_song_guess_command(&student, &session_id, &retry, 2000),
    );
    assert!(a.is_err() && b.is_err());
    assert_eq!(repository.outbox().await.len(), before);
    let restored = repository
        .get_song_guess_session(&session_id)
        .await
        .unwrap();
    assert_eq!(restored.version, 4);
    assert_eq!(restored.state.participants[0].score, 0);
    let own = restored.snapshot(&participant("first"), 3000).unwrap();
    assert!(own.viewer.answered_current_round);
    assert_eq!(own.viewer.selected_choice_id.as_deref(), Some("opaque-0"));
    let peer = restored.snapshot(&participant("second"), 3000).unwrap();
    assert!(!peer.viewer.answered_current_round);
    assert!(peer.viewer.selected_choice_id.is_none());
    let reloaded: SongGuessSessionRecord =
        serde_json::from_value(serde_json::to_value(restored).unwrap()).unwrap();
    assert_eq!(reloaded.snapshot(&participant("first"), 3000).unwrap(), own);
}
