use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::contract::GameKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionPhase {
    #[serde(rename = "lobby")]
    Lobby,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "finished")]
    Finished,
    #[serde(rename = "abandoned")]
    Abandoned,
    #[serde(rename = "host-ended")]
    HostEnded,
}

impl SessionPhase {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Finished | Self::Abandoned | Self::HostEnded)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ParticipantPhase {
    #[serde(rename = "invited")]
    Invited,
    #[serde(rename = "joined")]
    Joined,
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "forfeited")]
    Forfeited,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TerminalReason {
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "participant-forfeit")]
    ParticipantForfeit,
    #[serde(rename = "host-ended")]
    HostEnded,
    #[serde(rename = "deadline")]
    Deadline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameOutcome {
    #[serde(rename = "win")]
    Win,
    #[serde(rename = "loss")]
    Loss,
    #[serde(rename = "draw")]
    Draw,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "forfeit")]
    Forfeit,
    #[serde(rename = "abandoned")]
    Abandoned,
    #[serde(rename = "host-ended")]
    HostEnded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantIdentity {
    pub student_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameResultRecord {
    pub game_kind: GameKind,
    pub board_id: String,
    pub classroom_id: String,
    pub student_id: String,
    pub source_type: String,
    pub source_id: String,
    pub outcome: GameOutcome,
    pub score: Option<i64>,
    pub duration_ms: Option<i64>,
    pub metrics: Value,
    pub started_at_ms: i64,
    pub completed_at_ms: i64,
    pub idempotency_key: String,
    pub rules_version: Option<i32>,
    pub state_schema_version: Option<i32>,
}

impl GameResultRecord {
    pub fn validate(&self) -> Result<(), LifecycleError> {
        if self.board_id.trim().is_empty()
            || self.classroom_id.trim().is_empty()
            || self.student_id.trim().is_empty()
            || self.source_type.trim().is_empty()
            || self.source_id.trim().is_empty()
            || self.idempotency_key.trim().is_empty()
        {
            return Err(LifecycleError::MissingIdentity);
        }
        if self.completed_at_ms < self.started_at_ms {
            return Err(LifecycleError::InvalidCompletionTime);
        }
        if self.score.is_some_and(|score| score < 0)
            || self.duration_ms.is_some_and(|duration| duration < 0)
        {
            return Err(LifecycleError::NegativeCounter);
        }
        Ok(())
    }
}

pub fn validate_session_transition(
    current: SessionPhase,
    next: SessionPhase,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (current, next),
        (SessionPhase::Lobby, SessionPhase::Lobby)
            | (SessionPhase::Lobby, SessionPhase::Running)
            | (SessionPhase::Lobby, SessionPhase::HostEnded)
            | (SessionPhase::Running, SessionPhase::Running)
            | (SessionPhase::Running, SessionPhase::Finished)
            | (SessionPhase::Running, SessionPhase::Abandoned)
            | (SessionPhase::Running, SessionPhase::HostEnded)
            | (SessionPhase::Finished, SessionPhase::Finished)
            | (SessionPhase::Abandoned, SessionPhase::Abandoned)
            | (SessionPhase::HostEnded, SessionPhase::HostEnded)
    );
    if allowed {
        Ok(())
    } else {
        Err(LifecycleError::InvalidSessionTransition { current, next })
    }
}

pub fn validate_participant_transition(
    current: ParticipantPhase,
    next: ParticipantPhase,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (current, next),
        (ParticipantPhase::Invited, ParticipantPhase::Invited)
            | (ParticipantPhase::Invited, ParticipantPhase::Joined)
            | (ParticipantPhase::Invited, ParticipantPhase::Forfeited)
            | (ParticipantPhase::Joined, ParticipantPhase::Joined)
            | (ParticipantPhase::Joined, ParticipantPhase::Ready)
            | (ParticipantPhase::Joined, ParticipantPhase::Forfeited)
            | (ParticipantPhase::Ready, ParticipantPhase::Ready)
            | (ParticipantPhase::Ready, ParticipantPhase::Forfeited)
            | (ParticipantPhase::Forfeited, ParticipantPhase::Forfeited)
    );
    if allowed {
        Ok(())
    } else {
        Err(LifecycleError::InvalidParticipantTransition { current, next })
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum LifecycleError {
    #[error("missing lifecycle identity")]
    MissingIdentity,
    #[error("completion precedes start")]
    InvalidCompletionTime,
    #[error("negative score or duration")]
    NegativeCounter,
    #[error("invalid session transition: {current:?} -> {next:?}")]
    InvalidSessionTransition {
        current: SessionPhase,
        next: SessionPhase,
    },
    #[error("invalid participant transition: {current:?} -> {next:?}")]
    InvalidParticipantTransition {
        current: ParticipantPhase,
        next: ParticipantPhase,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_sessions_cannot_be_reopened() {
        assert!(
            validate_session_transition(SessionPhase::Finished, SessionPhase::Running).is_err()
        );
        assert!(validate_session_transition(SessionPhase::HostEnded, SessionPhase::Lobby).is_err());
    }

    #[test]
    fn forfeited_participants_cannot_rejoin() {
        assert!(
            validate_participant_transition(ParticipantPhase::Forfeited, ParticipantPhase::Joined)
                .is_err()
        );
    }

    #[test]
    fn result_requires_monotonic_time_and_non_negative_counters() {
        let mut result = GameResultRecord {
            game_kind: GameKind::ShadowAlliance,
            board_id: "board-1".into(),
            classroom_id: "class-1".into(),
            student_id: "student-1".into(),
            source_type: "shadow_session".into(),
            source_id: "session-1".into(),
            outcome: GameOutcome::Win,
            score: Some(10),
            duration_ms: Some(1_000),
            metrics: serde_json::json!({"team":"blue","rank":1}),
            started_at_ms: 10,
            completed_at_ms: 20,
            idempotency_key: "shadow-alliance:session-1:student-1".into(),
            rules_version: Some(1),
            state_schema_version: Some(1),
        };
        assert_eq!(result.validate(), Ok(()));
        result.completed_at_ms = 9;
        assert_eq!(
            result.validate(),
            Err(LifecycleError::InvalidCompletionTime)
        );
    }
}
