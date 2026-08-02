use play_domain::GameKind;

#[test]
fn game_kind_wire_values_match_the_public_platform_contract() {
    assert_eq!(serde_json::to_string(&GameKind::Omok).unwrap(), "\"omok\"");
    assert_eq!(
        serde_json::to_string(&GameKind::SongGuess).unwrap(),
        "\"song-guess\""
    );
    assert_eq!(
        serde_json::to_string(&GameKind::ShadowAlliance).unwrap(),
        "\"shadow-alliance\""
    );

    assert_eq!(
        serde_json::from_str::<GameKind>("\"shadow-alliance\"").unwrap(),
        GameKind::ShadowAlliance
    );
    assert!(serde_json::from_str::<GameKind>("\"shadow_alliance\"").is_err());
}
