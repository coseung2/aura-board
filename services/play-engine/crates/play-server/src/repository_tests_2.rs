use super::*;
#[tokio::test]
async fn shadow_alliance_replays_terminal_result_without_leaking_choices() {
    let (repository, session_id) = setup_shadow_alliance().await;
    let join_first = ShadowAllianceCommandRequest {
        request_id: "join-first".to_owned(),
        expected_version: 0,
        command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
        command: ShadowAllianceIntent::Join,
    };
    let first_join = repository
        .execute_shadow_alliance_command(&participant("first"), &session_id, &join_first, 200)
        .await
        .unwrap();
    let retried_join = repository
        .execute_shadow_alliance_command(&participant("first"), &session_id, &join_first, 999)
        .await
        .unwrap();
    assert!(retried_join.replayed);
    assert_eq!(retried_join.value, first_join.value);

    let mut version = first_join.value.version;
    for (actor, request_id, command) in [
        (
            participant("second"),
            "join-second",
            ShadowAllianceIntent::Join,
        ),
        (
            participant("first"),
            "ready-first",
            ShadowAllianceIntent::Ready,
        ),
        (
            participant("second"),
            "ready-second",
            ShadowAllianceIntent::Ready,
        ),
        (host(), "start-shadow", ShadowAllianceIntent::Start),
    ] {
        version = repository
            .execute_shadow_alliance_command(
                &actor,
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: request_id.to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command,
                },
                300,
            )
            .await
            .unwrap()
            .value
            .version;
    }

    version = repository
        .execute_shadow_alliance_command(
            &participant("first"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "submit-first".to_owned(),
                expected_version: version,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Submit { number: 44 },
            },
            400,
        )
        .await
        .unwrap()
        .value
        .version;
    let second_view = repository
        .get_shadow_alliance_session(&session_id)
        .await
        .unwrap()
        .snapshot(&participant("second"), 400)
        .unwrap();
    let first = second_view
        .participants
        .iter()
        .find(|candidate| candidate.student_id == "first")
        .unwrap();
    assert!(first.submitted);
    assert_eq!(first.own_number, None);

    version = repository
        .execute_shadow_alliance_command(
            &participant("second"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "submit-second".to_owned(),
                expected_version: version,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Submit { number: 46 },
            },
            400,
        )
        .await
        .unwrap()
        .value
        .version;
    for (request_id, command) in [
        ("reveal-terminal", ShadowAllianceIntent::Reveal),
        ("postround-terminal", ShadowAllianceIntent::Postround),
    ] {
        version = repository
            .execute_shadow_alliance_command(
                &host(),
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: request_id.to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command,
                },
                500,
            )
            .await
            .unwrap()
            .value
            .version;
    }
    let terminal_request = ShadowAllianceCommandRequest {
        request_id: "finish-terminal".to_owned(),
        expected_version: version,
        command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
        command: ShadowAllianceIntent::Finish,
    };
    let terminal = repository
        .execute_shadow_alliance_command(&host(), &session_id, &terminal_request, 600)
        .await
        .unwrap();
    assert_eq!(terminal.value.result_ids.len(), 2);
    let retry = repository
        .execute_shadow_alliance_command(&host(), &session_id, &terminal_request, 900)
        .await
        .unwrap();
    assert!(retry.replayed);
    assert_eq!(retry.value, terminal.value);
    assert_eq!(repository.state.lock().await.game_result_ids.len(), 2);
}

#[tokio::test]
async fn shadow_alliance_forfeit_result_is_not_recomputed_after_rank_changes() {
    let (repository, session_id) = setup_shadow_alliance().await;
    let mut version = 0;
    for (actor, request_id, command) in [
        (
            participant("first"),
            "forfeit-flow-join-first",
            ShadowAllianceIntent::Join,
        ),
        (
            participant("second"),
            "forfeit-flow-join-second",
            ShadowAllianceIntent::Join,
        ),
        (
            participant("first"),
            "forfeit-flow-ready-first",
            ShadowAllianceIntent::Ready,
        ),
        (
            participant("second"),
            "forfeit-flow-ready-second",
            ShadowAllianceIntent::Ready,
        ),
        (host(), "forfeit-flow-start", ShadowAllianceIntent::Start),
    ] {
        version = repository
            .execute_shadow_alliance_command(
                &actor,
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: request_id.to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command,
                },
                200,
            )
            .await
            .unwrap()
            .value
            .version;
    }

    let forfeited = repository
        .execute_shadow_alliance_command(
            &participant("first"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "forfeit-flow-forfeit".to_owned(),
                expected_version: version,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Forfeit,
            },
            300,
        )
        .await
        .unwrap();
    assert_eq!(forfeited.value.result_ids.len(), 1);
    version = forfeited.value.version;

    for (request_id, command) in [
        (
            "forfeit-flow-submit",
            ShadowAllianceIntent::Submit { number: 46 },
        ),
        ("forfeit-flow-reveal", ShadowAllianceIntent::Reveal),
        ("forfeit-flow-postround", ShadowAllianceIntent::Postround),
    ] {
        let actor = if matches!(&command, ShadowAllianceIntent::Submit { .. }) {
            participant("second")
        } else {
            host()
        };
        let response = repository
            .execute_shadow_alliance_command(
                &actor,
                &session_id,
                &ShadowAllianceCommandRequest {
                    request_id: request_id.to_owned(),
                    expected_version: version,
                    command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                    command,
                },
                400,
            )
            .await
            .unwrap();
        assert!(response.value.result_ids.is_empty());
        version = response.value.version;
    }

    let finished = repository
        .execute_shadow_alliance_command(
            &host(),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "forfeit-flow-finish".to_owned(),
                expected_version: version,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Finish,
            },
            500,
        )
        .await
        .unwrap();
    assert_eq!(finished.value.result_ids.len(), 1);
    assert_eq!(repository.state.lock().await.game_result_ids.len(), 2);
}

#[tokio::test]
async fn shadow_alliance_stale_version_returns_authoritative_snapshot() {
    let (repository, session_id) = setup_shadow_alliance().await;
    repository
        .execute_shadow_alliance_command(
            &participant("first"),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "join-first".to_owned(),
                expected_version: 0,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::Join,
            },
            200,
        )
        .await
        .unwrap();
    let error = repository
        .execute_shadow_alliance_command(
            &host(),
            &session_id,
            &ShadowAllianceCommandRequest {
                request_id: "stale-host-settings".to_owned(),
                expected_version: 0,
                command_schema_version: SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION,
                command: ShadowAllianceIntent::UpdateSettings {
                    editable: false,
                    timer_sec: 30,
                },
            },
            300,
        )
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        RepositoryError::ShadowAllianceVersionConflict { current }
            if current.version == 1
    ));
}
