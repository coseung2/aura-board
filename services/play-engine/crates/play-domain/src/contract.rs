use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GameKind {
    Omok,
    #[serde(rename = "song-guess")]
    SongGuess,
    #[serde(rename = "shadow-alliance")]
    ShadowAlliance,
}

/// Metadata every persisted command needs for deduplication and concurrency.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandEnvelope<C> {
    pub request_id: String,
    pub expected_version: u64,
    pub command: C,
}

/// Full recovery payload used after app resume, reconnect, or version conflict.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEnvelope<S> {
    pub session_id: String,
    pub version: u64,
    pub server_time_ms: i64,
    pub state: S,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn mobile_wire_contract_uses_camel_case_versions() {
        let envelope = SnapshotEnvelope {
            session_id: "session-1".to_owned(),
            version: 7,
            server_time_ms: 1_725_000_000_000,
            state: GameKind::Omok,
        };

        assert_eq!(
            serde_json::to_value(envelope).unwrap(),
            json!({
                "sessionId": "session-1",
                "version": 7,
                "serverTimeMs": 1_725_000_000_000_i64,
                "state": "omok"
            })
        );
    }
}
