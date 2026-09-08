use super::*;

fn clip(asset_id: &str, tier_ms: u32) -> SongGuessClip {
    SongGuessClip {
        asset_id: asset_id.to_owned(),
        tier_ms,
        mime_type: "audio/webm".to_owned(),
        size_bytes: 100,
        duration_ms: tier_ms,
    }
}

fn state() -> SongGuessState {
    let mut state = SongGuessState::new(
        vec![SongGuessParticipantSeed {
            actor_subject: "student:1".to_owned(),
            display_name: "One".to_owned(),
        }],
        vec![SongGuessRoundSeed {
            choices: Vec::new(),
            round_id: "round-1".to_owned(),
            representative_answer: "Blue Moon".to_owned(),
            normalized_answer: "blue moon".to_owned(),
            aliases: vec!["BlueMoon".to_owned()],
            normalized_aliases: vec!["bluemoon".to_owned()],
            accessibility_clue: Some("A classic".to_owned()),
            clips: vec![
                clip("clip-500", 500),
                clip("clip-1000", 1_000),
                clip("clip-1500", 1_500),
            ],
        }],
    )
    .unwrap();
    // Existing scoring tests model a participant who already entered the
    // lobby; the join transition itself is covered separately below.
    state.participants[0].joined = true;
    state
}

#[test]
fn normalization_collapses_unicode_whitespace_without_fuzzy_matching() {
    assert_eq!(normalize_answer("  Bℓue\u{00a0}Moon  "), "blue moon");
    assert_ne!(normalize_answer("blue-moon"), "blue moon");
}

#[test]
fn accepts_deterministic_browser_pcm_wav_clips() {
    let mut wav = clip("clip-wav", 500);
    wav.mime_type = "audio/wav".to_owned();
    assert_eq!(validate_clip(&wav), Ok(()));
}

#[test]
fn accepts_host_only_youtube_playback_metadata_for_highlights() {
    let youtube = SongGuessClip {
        asset_id: "youtube-opaque-asset".to_owned(),
        tier_ms: SONG_GUESS_LONG_CLIP_TIER_MS,
        mime_type: "video/youtube".to_owned(),
        size_bytes: 0,
        duration_ms: SONG_GUESS_LONG_CLIP_TIER_MS,
    };
    assert_eq!(validate_clip(&youtube), Ok(()));
    let state = SongGuessState::new(
        vec![SongGuessParticipantSeed {
            actor_subject: "student:youtube".to_owned(),
            display_name: "YouTube".to_owned(),
        }],
        vec![SongGuessRoundSeed {
            choices: Vec::new(),
            round_id: "round-youtube".to_owned(),
            representative_answer: "Blue Moon".to_owned(),
            normalized_answer: "blue moon".to_owned(),
            aliases: vec![],
            normalized_aliases: vec![],
            accessibility_clue: None,
            clips: vec![youtube],
        }],
    );
    assert!(state.is_ok());
}

#[test]
fn rejects_invalid_youtube_playback_metadata() {
    let mut youtube = SongGuessClip {
        asset_id: "youtube-opaque-asset".to_owned(),
        tier_ms: SONG_GUESS_LONG_CLIP_TIER_MS,
        mime_type: "video/youtube".to_owned(),
        size_bytes: 1,
        duration_ms: SONG_GUESS_LONG_CLIP_TIER_MS,
    };
    assert_eq!(validate_clip(&youtube), Err(DomainError::InvalidValue));
    youtube.size_bytes = 0;
    youtube.tier_ms = 1_000;
    assert_eq!(validate_clip(&youtube), Err(DomainError::InvalidValue));
    youtube.tier_ms = SONG_GUESS_LONG_CLIP_TIER_MS;
    youtube.duration_ms = 1_500;
    assert_eq!(validate_clip(&youtube), Err(DomainError::InvalidValue));
    youtube.duration_ms = SONG_GUESS_LONG_CLIP_TIER_MS;
    youtube.mime_type = "audio/wav".to_owned();
    assert_eq!(validate_clip(&youtube), Err(DomainError::InvalidValue));
}

#[test]
fn rejects_path_traversal_clip_identity() {
    let mut traversal = clip("..", SONG_GUESS_LONG_CLIP_TIER_MS);
    traversal.mime_type = "video/youtube".to_owned();
    traversal.size_bytes = 0;
    assert_eq!(validate_clip(&traversal), Err(DomainError::InvalidValue));
}

#[test]
fn scores_fixed_clip_tiers() {
    assert_eq!(score_for_tier(500), Ok(1_000));
    assert_eq!(score_for_tier(1_000), Ok(700));
    assert_eq!(score_for_tier(1_500), Ok(400));
    assert_eq!(score_for_tier(750), Err(DomainError::InvalidValue));
}

#[test]
fn first_correct_answer_scores_once_and_wrong_is_zero() {
    let mut state = state();
    state.open_lobby().unwrap();
    state.start().unwrap();
    let wrong = state.guess("student:1", "not it").unwrap();
    assert_eq!(wrong.score, 0);
    let correct = state.guess("student:1", " BLUE   MOON ").unwrap();
    assert_eq!(correct.score, 1_000);
    let duplicate = state.guess("student:1", "blue moon").unwrap();
    assert!(duplicate.already_scored);
    assert_eq!(duplicate.score, 0);
    assert_eq!(state.participants[0].score, 1_000);
    assert_eq!(state.current_round().unwrap().round_scores[0].score, 1_000);
}

#[test]
fn lobby_join_is_required_before_guessing_and_start_allows_partial_roster() {
    let mut state = SongGuessState::new(
        vec![
            SongGuessParticipantSeed {
                actor_subject: "student:1".to_owned(),
                display_name: "One".to_owned(),
            },
            SongGuessParticipantSeed {
                actor_subject: "student:2".to_owned(),
                display_name: "Two".to_owned(),
            },
        ],
        vec![SongGuessRoundSeed {
            choices: Vec::new(),
            round_id: "round-1".to_owned(),
            representative_answer: "Blue Moon".to_owned(),
            normalized_answer: "blue moon".to_owned(),
            aliases: vec![],
            normalized_aliases: vec![],
            accessibility_clue: None,
            clips: vec![
                clip("clip-500", 500),
                clip("clip-1000", 1_000),
                clip("clip-1500", 1_500),
            ],
        }],
    )
    .unwrap();
    state.open_lobby().unwrap();
    assert_eq!(state.start(), Err(DomainError::ParticipantsNotReady));
    state.join("student:1").unwrap();
    state.start().unwrap();
    assert_eq!(
        state.guess("student:2", "blue moon"),
        Err(DomainError::NotJoined)
    );
}

#[test]
fn round_scores_survive_multiple_rounds_and_state_reload() {
    let make_round = |round_id: &str, answer: &str| SongGuessRoundSeed {
        choices: Vec::new(),
        round_id: round_id.to_owned(),
        representative_answer: answer.to_owned(),
        normalized_answer: normalize_answer(answer),
        aliases: vec![],
        normalized_aliases: vec![],
        accessibility_clue: None,
        clips: vec![
            clip(&format!("{round_id}-500"), 500),
            clip(&format!("{round_id}-1000"), 1_000),
            clip(&format!("{round_id}-1500"), 1_500),
        ],
    };
    let mut state = SongGuessState::new(
        vec![
            SongGuessParticipantSeed {
                actor_subject: "student:1".to_owned(),
                display_name: "One".to_owned(),
            },
            SongGuessParticipantSeed {
                actor_subject: "student:2".to_owned(),
                display_name: "Two".to_owned(),
            },
        ],
        vec![
            make_round("round-1", "Blue Moon"),
            make_round("round-2", "Red Sun"),
        ],
    )
    .unwrap();
    state.open_lobby().unwrap();
    state.join("student:1").unwrap();
    state.join("student:2").unwrap();
    state.start_at(1_000).unwrap();
    assert_eq!(
        state
            .guess_at("student:1", "blue moon", 1_000)
            .unwrap()
            .score,
        1_000
    );
    state.reveal().unwrap();
    state.next_round_at(2_000).unwrap();
    assert_eq!(
        state.guess_at("student:2", "red sun", 2_000).unwrap().score,
        1_000
    );

    let restored: SongGuessState =
        serde_json::from_value(serde_json::to_value(&state).unwrap()).unwrap();
    assert_eq!(restored.participants[0].score, 1_000);
    assert_eq!(restored.participants[1].score, 1_000);
    assert_eq!(restored.rounds[0].round_scores[0].score, 1_000);
    assert_eq!(restored.rounds[1].round_scores[0].score, 1_000);
}

#[test]
fn phase_transitions_only_unlock_the_current_clip() {
    let mut state = state();
    assert_eq!(state.open_lobby(), Ok(()));
    assert_eq!(state.start(), Ok(()));
    assert_eq!(state.current_round().unwrap().unlocked_tier_ms, 500);
    assert_eq!(state.unlock_clip(), Ok(1_000));
    assert_eq!(state.unlock_clip(), Ok(1_500));
    assert_eq!(state.unlock_clip(), Err(DomainError::InvalidValue));
    assert_eq!(state.reveal(), Ok(()));
    assert_eq!(state.finish(), Ok(()));
}

#[test]
fn timed_scoring_decreases_with_server_elapsed_time_and_expires_at_deadline() {
    let mut early_state = state();
    early_state.open_lobby().unwrap();
    early_state.start_at(1_000).unwrap();
    assert_eq!(
        early_state.current_round().unwrap().started_at_ms,
        Some(1_000)
    );
    assert_eq!(
        early_state.current_round().unwrap().deadline_at_ms,
        Some(31_000)
    );
    let early = early_state
        .guess_at("student:1", "blue moon", 1_000)
        .unwrap();
    assert_eq!(early.score, 1_000);

    let mut later = state();
    later.open_lobby().unwrap();
    later.start_at(1_000).unwrap();
    let later_result = later.guess_at("student:1", "blue moon", 16_000).unwrap();
    assert_eq!(later_result.score, 550);

    let mut expired = state();
    expired.open_lobby().unwrap();
    expired.start_at(1_000).unwrap();
    let expired_result = expired.guess_at("student:1", "blue moon", 31_000).unwrap();
    assert!(expired_result.correct);
    assert_eq!(expired_result.score, 0);
    assert!(expired_result.timed_out);
    assert!(
        expired
            .current_round()
            .unwrap()
            .correct_participants
            .is_empty()
    );

    let mut expired_wrong = state();
    expired_wrong.open_lobby().unwrap();
    expired_wrong.start_at(1_000).unwrap();
    let expired_wrong_result = expired_wrong
        .guess_at("student:1", "not it", 31_000)
        .unwrap();
    assert!(!expired_wrong_result.correct);
    assert!(expired_wrong_result.timed_out);
}

#[test]
fn long_clip_pack_is_valid_and_starts_unlocked() {
    let long = SongGuessState::new(
        vec![SongGuessParticipantSeed {
            actor_subject: "student:1".to_owned(),
            display_name: "One".to_owned(),
        }],
        vec![SongGuessRoundSeed {
            choices: Vec::new(),
            round_id: "round-long".to_owned(),
            representative_answer: "Blue Moon".to_owned(),
            normalized_answer: "blue moon".to_owned(),
            aliases: vec![],
            normalized_aliases: vec![],
            accessibility_clue: None,
            clips: vec![clip("clip-long", SONG_GUESS_LONG_CLIP_TIER_MS)],
        }],
    )
    .unwrap();
    assert_eq!(long.current_round().unwrap().unlocked_tier_ms, 15_000);
}
