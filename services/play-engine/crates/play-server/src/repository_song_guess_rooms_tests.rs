use super::*;
use crate::model::SongGuessRoomMode;
use play_domain::song_guess::SongGuessPhase;

#[tokio::test]
async fn finished_teacher_session_can_be_replaced_without_removing_results() {
    let (repository, id) = setup_song_guess().await;
    let ended = repository
        .execute_song_guess_command(
            &host(),
            &id,
            &command("end", 0, SongGuessIntent::Finish),
            200,
        )
        .await
        .unwrap();
    assert_eq!(ended.value.snapshot.current_round.revealed_answer, None);
    assert_eq!(ended.value.snapshot.current_round.started_at_ms, None);
    assert_eq!(ended.value.snapshot.current_round.deadline_at_ms, None);
    let next = repository
        .create_song_guess_session(&host(), "board-song", &song_guess_request("next-room"), 201)
        .await
        .unwrap();
    assert_ne!(next.value.snapshot.session_id, id);
    assert_eq!(
        repository
            .get_song_guess_session(&id)
            .await
            .unwrap()
            .state
            .phase,
        SongGuessPhase::Finished
    );
}

fn free_request(id: &str) -> CreateSongGuessSessionRequest {
    let mut request = song_guess_request(id);
    request.room_mode = SongGuessRoomMode::StudentFree;
    request.classroom_teacher_subject = Some(host().subject);
    request
}

fn command(id: &str, version: u64, intent: SongGuessIntent) -> SongGuessCommandRequest {
    SongGuessCommandRequest {
        request_id: id.into(),
        expected_version: version,
        command_schema_version: 1,
        command: intent,
    }
}

#[tokio::test]
async fn student_rooms_coexist_without_replacing_teacher_current_and_hide_answers() {
    let (repository, teacher_id) = setup_song_guess().await;
    let first = repository
        .create_song_guess_session(
            &participant("first"),
            "board-song",
            &free_request("free-1"),
            200,
        )
        .await
        .unwrap();
    let second = repository
        .create_song_guess_session(
            &participant("second"),
            "board-song",
            &free_request("free-1"),
            201,
        )
        .await
        .unwrap();
    assert_ne!(
        first.value.snapshot.session_id,
        second.value.snapshot.session_id
    );
    let retry = repository
        .create_song_guess_session(
            &participant("first"),
            "board-song",
            &free_request("free-1"),
            202,
        )
        .await
        .unwrap();
    assert!(retry.replayed);
    assert_eq!(retry.value, first.value);
    assert!(matches!(
        repository
            .create_song_guess_session(
                &participant("first"),
                "board-song",
                &free_request("duplicate-room"),
                203
            )
            .await,
        Err(RepositoryError::SessionAlreadyExists)
    ));
    assert_eq!(
        repository
            .current_song_guess_session("board-song")
            .await
            .unwrap()
            .unwrap()
            .session_id,
        teacher_id
    );
    assert_eq!(
        repository
            .list_song_guess_sessions("board-song")
            .await
            .unwrap()
            .len(),
        3
    );
    assert!(first.value.snapshot.viewer.can_start);
    assert_eq!(
        first.value.snapshot.host_display_name.as_deref(),
        Some("First")
    );
    assert!(first.value.snapshot.viewer.is_room_host);
    assert!(first.value.snapshot.viewer.joined);
    assert_eq!(first.value.snapshot.viewer.role, ActorRole::Participant);
    let wire = serde_json::to_string(&first.value.snapshot).unwrap();
    assert!(!wire.contains("Blue Moon"));
    assert!(!wire.contains("bluemoon"));
    assert!(
        repository
            .create_song_guess_session(&participant("first"), "x", &song_guess_request("denied"), 0)
            .await
            .is_err()
    );
    assert!(
        repository
            .create_song_guess_session(
                &participant("outsider"),
                "x",
                &free_request("denied-free"),
                0
            )
            .await
            .is_err()
    );
}

#[tokio::test]
async fn host_can_play_participant_leave_persists_and_only_owner_or_teacher_can_end() {
    let repository = MemoryRepository::new();
    let created = repository
        .create_song_guess_session(&participant("first"), "b", &free_request("create"), 0)
        .await
        .unwrap();
    let id = &created.value.snapshot.session_id;
    repository
        .execute_song_guess_command(
            &participant("second"),
            id,
            &command("join", 0, SongGuessIntent::Join),
            1,
        )
        .await
        .unwrap();
    assert!(
        repository
            .execute_song_guess_command(
                &participant("second"),
                id,
                &command("bad-start", 1, SongGuessIntent::Start),
                2
            )
            .await
            .is_err()
    );
    repository
        .execute_song_guess_command(
            &participant("first"),
            id,
            &command("start", 1, SongGuessIntent::Start),
            100,
        )
        .await
        .unwrap();
    assert!(
        repository
            .execute_song_guess_command(
                &participant("first"),
                id,
                &command("manual", 2, SongGuessIntent::Reveal),
                101
            )
            .await
            .is_err()
    );
    let guessed = repository
        .execute_song_guess_command(
            &participant("first"),
            id,
            &command(
                "guess",
                2,
                SongGuessIntent::Guess {
                    text: Some("Blue Moon".into()),
                    choice_id: None,
                    round_id: Some("round-1".into()),
                },
            ),
            200,
        )
        .await
        .unwrap();
    assert!(guessed.value.snapshot.viewer.scored_current_round);
    repository
        .execute_song_guess_command(
            &participant("second"),
            id,
            &command("leave", 3, SongGuessIntent::Leave),
            201,
        )
        .await
        .unwrap();
    let record = repository.get_song_guess_session(id).await.unwrap();
    let restored: SongGuessSessionRecord =
        serde_json::from_str(&serde_json::to_string(&record).unwrap()).unwrap();
    assert!(!restored.state.participants[1].joined);
    assert!(
        repository
            .execute_song_guess_command(
                &participant("second"),
                id,
                &command("bad-end", 4, SongGuessIntent::Finish),
                202
            )
            .await
            .is_err()
    );
    assert!(
        repository
            .execute_song_guess_command(
                &participant("first"),
                id,
                &command("host-leave", 4, SongGuessIntent::Leave),
                202
            )
            .await
            .is_err()
    );
    let unrelated = ActorContext {
        subject: "teacher:other".into(),
        role: ActorRole::Host,
    };
    assert!(
        repository
            .advance_song_guess_session(&unrelated, id, 203)
            .await
            .is_err()
    );
    let ended = repository
        .execute_song_guess_command(
            &host(),
            id,
            &command("teacher-end", 4, SongGuessIntent::Finish),
            203,
        )
        .await
        .unwrap();
    assert_eq!(ended.value.snapshot.phase, SongGuessPhase::Finished);
}

#[tokio::test]
async fn automatic_transitions_persist_versions_and_replay_does_not_restart_timer() {
    let repository = MemoryRepository::new();
    let mut request = free_request("create");
    let mut round = request.rounds[0].clone();
    round.round_id = "round-2".into();
    for clip in &mut round.clips {
        clip.asset_id.push_str("-2");
    }
    request.rounds.push(round);
    let created = repository
        .create_song_guess_session(&participant("first"), "b", &request, 0)
        .await
        .unwrap();
    let id = &created.value.snapshot.session_id;
    let start = command("start", 0, SongGuessIntent::Start);
    let started = repository
        .execute_song_guess_command(&participant("first"), id, &start, 100)
        .await
        .unwrap();
    let before = repository
        .advance_song_guess_session(&participant("first"), id, 30_099)
        .await
        .unwrap();
    assert_eq!(before.state.phase, SongGuessPhase::Guessing);
    assert!(
        repository
            .execute_song_guess_command(
                &participant("first"),
                id,
                &command(
                    "late-guess",
                    1,
                    SongGuessIntent::Guess {
                        text: Some("Blue Moon".into()),
                        choice_id: None,
                        round_id: Some("round-1".into())
                    }
                ),
                30_100
            )
            .await
            .is_err()
    );
    assert_eq!(
        repository.get_song_guess_session(id).await.unwrap().version,
        2
    );
    let revealed = repository
        .advance_song_guess_session(&participant("first"), id, 30_100)
        .await
        .unwrap();
    assert_eq!(revealed.state.phase, SongGuessPhase::Reveal);
    assert_eq!(revealed.version, 2);
    assert_eq!(revealed.next_transition_at_ms, Some(35_100));
    let retry = repository
        .execute_song_guess_command(&participant("first"), id, &start, 35_100)
        .await
        .unwrap();
    assert!(retry.replayed);
    assert_eq!(retry.value, started.value);
    let next = repository.get_song_guess_session(id).await.unwrap();
    assert_eq!(next.version, 3);
    assert_eq!(next.state.current_round_index, 1);
    let finished = repository
        .advance_song_guess_session(&participant("first"), id, 1_000_000)
        .await
        .unwrap();
    assert_eq!(finished.version, 5);
    assert_eq!(finished.state.phase, SongGuessPhase::Finished);
    assert_eq!(
        repository
            .advance_song_guess_session(&participant("first"), id, 2_000_000)
            .await
            .unwrap()
            .version,
        5
    );
}
