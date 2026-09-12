use super::*;
#[tokio::test]
async fn auto_start_create_enters_an_active_room_in_one_write() {
    let repository = MemoryRepository::new();
    let mut request = create_request("auto-start-create");
    request.auto_start = true;

    let created = repository
        .create_session(&host(), "auto-start-board", &request, 100)
        .await
        .unwrap();

    assert_eq!(
        created.value.snapshot.room_status,
        crate::model::RoomStatus::Active,
    );
    assert!(
        created
            .value
            .snapshot
            .participants
            .iter()
            .all(|participant| participant.ready),
    );
    assert_eq!(created.value.snapshot.version, 0);
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
    let outcome = record.state.outcome.clone();
    let outbox_len = repository.outbox().await.len();

    for (request_id, actor, command) in [
        (
            "move-after-win",
            participant("second"),
            OmokIntent::PlaceStone {
                position: OmokPosition { row: 1, column: 1 },
            },
        ),
        ("resign-after-win", participant("first"), OmokIntent::Resign),
    ] {
        let rejected = repository
            .execute_command(
                &actor,
                &session_id,
                &CommandRequest {
                    request_id: request_id.to_owned(),
                    expected_version: version,
                    command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                    command,
                },
                500,
            )
            .await;
        assert_eq!(
            rejected,
            Err(RepositoryError::Model(
                crate::model::ModelError::InvalidPhase
            ))
        );
    }

    let unchanged = repository.get_session(&session_id).await.unwrap();
    assert_eq!(unchanged.version, version);
    assert_eq!(unchanged.state.outcome, outcome);
    assert_eq!(repository.outbox().await.len(), outbox_len);
}

#[tokio::test]
async fn resignation_is_terminal_without_post_finish_mutation_or_outbox() {
    let repository = MemoryRepository::new();
    let mut request = create_request("resignation-terminal");
    request.auto_start = true;
    let created = repository
        .create_session(&host(), "resignation-board", &request, 100)
        .await
        .unwrap();
    let session_id = created.value.snapshot.session_id;
    let resigned = repository
        .execute_command(
            &participant("first"),
            &session_id,
            &CommandRequest {
                request_id: "resign-once".to_owned(),
                expected_version: 0,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: OmokIntent::Resign,
            },
            200,
        )
        .await
        .unwrap();
    let version = resigned.value.version;
    let record = repository.get_session(&session_id).await.unwrap();
    let outcome = record.state.outcome.clone();
    let outbox_len = repository.outbox().await.len();

    let rejected = repository
        .execute_command(
            &participant("second"),
            &session_id,
            &CommandRequest {
                request_id: "move-after-resign".to_owned(),
                expected_version: version,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: OmokIntent::PlaceStone {
                    position: OmokPosition { row: 7, column: 7 },
                },
            },
            300,
        )
        .await;
    assert_eq!(
        rejected,
        Err(RepositoryError::Model(
            crate::model::ModelError::InvalidPhase
        ))
    );
    let unchanged = repository.get_session(&session_id).await.unwrap();
    assert_eq!(unchanged.version, version);
    assert_eq!(unchanged.state.outcome, outcome);
    assert_eq!(repository.outbox().await.len(), outbox_len);
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

    repository
        .execute_song_guess_command(
            &participant("first"),
            &session_id,
            &SongGuessCommandRequest {
                request_id: "join-first".to_owned(),
                expected_version: 1,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: SongGuessIntent::Join,
            },
            900,
        )
        .await
        .unwrap();

    let started = repository
        .execute_song_guess_command(
            &host(),
            &session_id,
            &SongGuessCommandRequest {
                request_id: "start-for-reveal".to_owned(),
                expected_version: 2,
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
                expected_version: 3,
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
        (1, SongGuessIntent::Join, "join"),
        (2, SongGuessIntent::Start, "start"),
    ] {
        let actor = if matches!(&command, SongGuessIntent::Join) {
            participant("first")
        } else {
            host()
        };
        repository
            .execute_song_guess_command(
                &actor,
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
                expected_version: 3,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: SongGuessIntent::Guess {
                    choice_id: None,
                    text: Some(" BLUE   MOON ".to_owned()),
                    round_id: None,
                },
            },
            300,
        )
        .await
        .unwrap();
    assert_eq!(
        correct.value.result.as_ref().map(|result| result.score),
        Some(997)
    );

    let duplicate = repository
        .execute_song_guess_command(
            &participant("first"),
            &session_id,
            &SongGuessCommandRequest {
                request_id: "guess-again".to_owned(),
                expected_version: 4,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: SongGuessIntent::Guess {
                    choice_id: None,
                    text: Some("blue moon".to_owned()),
                    round_id: None,
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
                expected_version: 3,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: SongGuessIntent::Guess {
                    choice_id: None,
                    text: Some("blue moon".to_owned()),
                    round_id: None,
                },
            },
            300,
        )
        .await
        .unwrap_err();
    assert!(matches!(
        stale,
        RepositoryError::SongGuessVersionConflict { current } if current.version == 5
    ));
}

#[tokio::test]
async fn concurrent_song_guess_attempts_from_one_player_score_once() {
    let (repository, session_id) = setup_song_guess().await;
    for (version, command, id) in [
        (0, SongGuessIntent::OpenLobby, "open"),
        (1, SongGuessIntent::Join, "join"),
        (2, SongGuessIntent::Start, "start"),
    ] {
        let actor = if matches!(&command, SongGuessIntent::Join) {
            participant("first")
        } else {
            host()
        };
        repository
            .execute_song_guess_command(
                &actor,
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
        expected_version: 3,
        command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
        command: SongGuessIntent::Guess {
            choice_id: None,
            text: Some("blue moon".to_owned()),
            round_id: None,
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
    assert_eq!(successes[0].value.result.as_ref().unwrap().score, 997);
    assert_eq!(
        repository
            .get_song_guess_session(&session_id)
            .await
            .unwrap()
            .version,
        4
    );
}

#[tokio::test]
async fn concurrent_song_guess_joins_accept_one_lobby_version_and_keep_both_entries() {
    let (repository, session_id) = setup_song_guess().await;
    repository
        .execute_song_guess_command(
            &host(),
            &session_id,
            &SongGuessCommandRequest {
                request_id: "open-join-race".to_owned(),
                expected_version: 0,
                command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
                command: SongGuessIntent::OpenLobby,
            },
            200,
        )
        .await
        .unwrap();
    let first = SongGuessCommandRequest {
        request_id: "join-first-race".to_owned(),
        expected_version: 1,
        command_schema_version: crate::model::COMMAND_SCHEMA_VERSION,
        command: SongGuessIntent::Join,
    };
    let second = SongGuessCommandRequest {
        request_id: "join-second-race".to_owned(),
        ..first.clone()
    };
    let first_actor = participant("first");
    let second_actor = participant("second");
    let (left, right) = tokio::join!(
        repository.execute_song_guess_command(&first_actor, &session_id, &first, 300),
        repository.execute_song_guess_command(&second_actor, &session_id, &second, 300),
    );
    assert!(left.is_ok());
    assert!(right.is_ok());
    let replay = repository
        .execute_song_guess_command(&first_actor, &session_id, &first, 400)
        .await
        .unwrap();
    assert!(replay.replayed);
    let session = repository
        .get_song_guess_session(&session_id)
        .await
        .unwrap();
    assert!(
        session
            .state
            .participants
            .iter()
            .all(|participant| participant.joined)
    );
    assert_eq!(session.version, 3);
}

#[tokio::test]
async fn shadow_alliance_accepts_stale_versions_for_independent_lobby_updates() {
    let (repository, session_id) = setup_shadow_alliance().await;

    let first_join = repository
        .execute_shadow_alliance_command(
            &participant("first"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-join-first".to_owned(),
                expected_version: 0,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Join,
            },
            200,
        )
        .await
        .unwrap();
    assert_eq!(first_join.value.version, 1);

    let second_join = repository
        .execute_shadow_alliance_command(
            &participant("second"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-join-second".to_owned(),
                expected_version: 0,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Join,
            },
            210,
        )
        .await
        .unwrap();
    assert_eq!(second_join.value.previous_version, 1);
    assert_eq!(second_join.value.version, 2);

    let first_ready = repository
        .execute_shadow_alliance_command(
            &participant("first"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-ready-first".to_owned(),
                expected_version: 1,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Ready,
            },
            220,
        )
        .await
        .unwrap();
    assert_eq!(first_ready.value.previous_version, 2);
    assert_eq!(first_ready.value.version, 3);

    let second_ready = repository
        .execute_shadow_alliance_command(
            &participant("second"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-ready-second".to_owned(),
                expected_version: 2,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Ready,
            },
            230,
        )
        .await
        .unwrap();
    assert_eq!(second_ready.value.previous_version, 3);
    assert_eq!(second_ready.value.version, 4);

    let duplicate_join = repository
        .execute_shadow_alliance_command(
            &participant("first"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-join-first-again".to_owned(),
                expected_version: 0,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Join,
            },
            240,
        )
        .await;
    assert!(matches!(
        duplicate_join,
        Err(RepositoryError::ShadowAllianceVersionConflict { current })
            if current.version == 4
    ));

    let stale_host_start = repository
        .execute_shadow_alliance_command(
            &host(),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-host-start".to_owned(),
                expected_version: 0,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Start,
            },
            250,
        )
        .await;
    assert!(matches!(
        stale_host_start,
        Err(RepositoryError::ShadowAllianceVersionConflict { current })
            if current.version == 4
    ));
}
