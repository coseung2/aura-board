use std::collections::HashSet;

use play_domain::omok::{OmokPosition, OmokSide, OmokState, OmokStatus};
use play_domain::song_guess::{
    SongGuessGuessResult, SongGuessParticipantSeed, SongGuessPhase, SongGuessRoundSeed,
    SongGuessState,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const OMOK_RULES_VERSION: u16 = 1;
pub const SESSION_STATE_SCHEMA_VERSION: u16 = 1;
pub const COMMAND_SCHEMA_VERSION: u16 = 1;
pub const SONG_GUESS_RULES_VERSION: u16 = 1;
pub const SONG_GUESS_STATE_SCHEMA_VERSION: u16 = 1;
pub const MAX_SAFE_VERSION: u64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActorRole {
    Host,
    Participant,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActorContext {
    pub subject: String,
    pub role: ActorRole,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OmokSlot {
    First,
    Second,
}

impl OmokSlot {
    pub fn side(self) -> OmokSide {
        match self {
            Self::First => OmokSide::First,
            Self::Second => OmokSide::Second,
        }
    }

    pub fn opponent(self) -> Self {
        match self {
            Self::First => Self::Second,
            Self::Second => Self::First,
        }
    }
}

impl From<OmokSide> for OmokSlot {
    fn from(value: OmokSide) -> Self {
        match value {
            OmokSide::First => Self::First,
            OmokSide::Second => Self::Second,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomStatus {
    Waiting,
    Ready,
    Active,
    Finished,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    FiveInARow,
    Draw,
    Resignation,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionOutcome {
    pub winner: Option<OmokSlot>,
    pub reason: FinishReason,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantSeed {
    pub actor_subject: String,
    pub display_name: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionParticipant {
    pub actor_subject: String,
    pub display_name: String,
    pub slot: OmokSlot,
    pub ready: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmokSessionState {
    pub room_status: RoomStatus,
    pub participants: Vec<SessionParticipant>,
    pub game: OmokState,
    pub outcome: Option<SessionOutcome>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub session_id: String,
    pub board_id: String,
    pub host_subject: String,
    pub version: u64,
    pub rules_version: u16,
    pub state_schema_version: u16,
    pub previous_session_id: Option<String>,
    pub created_at_ms: i64,
    pub state: OmokSessionState,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicParticipant {
    pub display_name: String,
    pub slot: OmokSlot,
    pub ready: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerProjection {
    pub role: ActorRole,
    pub slot: Option<OmokSlot>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_id: String,
    pub board_id: String,
    pub game_kind: String,
    pub version: u64,
    pub server_time_ms: i64,
    pub rules_version: u16,
    pub state_schema_version: u16,
    pub previous_session_id: Option<String>,
    pub room_status: RoomStatus,
    pub participants: Vec<PublicParticipant>,
    pub viewer: ViewerProjection,
    pub game: OmokState,
    pub outcome: Option<SessionOutcome>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum OmokIntent {
    Ready,
    Start,
    PlaceStone { position: OmokPosition },
    Resign,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequest {
    pub request_id: String,
    pub expected_version: u64,
    #[serde(default = "command_schema_version")]
    pub command_schema_version: u16,
    pub command: OmokIntent,
}

fn command_schema_version() -> u16 {
    COMMAND_SCHEMA_VERSION
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse {
    pub request_id: String,
    pub previous_version: u64,
    pub version: u64,
    pub snapshot: SessionSnapshot,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub request_id: String,
    pub participants: Vec<ParticipantSeed>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RematchRequest {
    pub request_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponse {
    pub request_id: String,
    pub snapshot: SessionSnapshot,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessSessionRecord {
    pub session_id: String,
    pub board_id: String,
    pub host_subject: String,
    pub version: u64,
    pub rules_version: u16,
    pub state_schema_version: u16,
    pub previous_session_id: Option<String>,
    pub created_at_ms: i64,
    pub state: SongGuessState,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessClipSnapshot {
    pub asset_id: String,
    pub tier_ms: u32,
    pub mime_type: String,
    pub duration_ms: u32,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessParticipantSnapshot {
    pub display_name: String,
    pub score: u32,
    pub scored_current_round: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessRoundSnapshot {
    pub round_id: String,
    pub order: u32,
    pub accessibility_clue: Option<String>,
    pub revealed_answer: Option<String>,
    pub current_clip: Option<SongGuessClipSnapshot>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessViewer {
    pub role: ActorRole,
    pub scored_current_round: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessSnapshot {
    pub session_id: String,
    pub board_id: String,
    pub game_kind: String,
    pub version: u64,
    pub server_time_ms: i64,
    pub rules_version: u16,
    pub state_schema_version: u16,
    pub previous_session_id: Option<String>,
    pub phase: SongGuessPhase,
    pub current_round: SongGuessRoundSnapshot,
    pub participants: Vec<SongGuessParticipantSnapshot>,
    pub viewer: SongGuessViewer,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum SongGuessIntent {
    OpenLobby,
    Start,
    UnlockClip,
    Guess { text: String },
    Reveal,
    NextRound,
    Finish,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSongGuessSessionRequest {
    pub request_id: String,
    pub participants: Vec<SongGuessParticipantSeed>,
    pub rounds: Vec<SongGuessRoundSeed>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessCommandRequest {
    pub request_id: String,
    pub expected_version: u64,
    #[serde(default = "command_schema_version")]
    pub command_schema_version: u16,
    pub command: SongGuessIntent,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessCommandResponse {
    pub request_id: String,
    pub previous_version: u64,
    pub version: u64,
    pub snapshot: SongGuessSnapshot,
    pub result: Option<SongGuessGuessResult>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessSessionResponse {
    pub request_id: String,
    pub snapshot: SongGuessSnapshot,
}

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum ModelError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("invalid_request")]
    InvalidRequest,
    #[error("invalid_state")]
    InvalidState,
    #[error("invalid_phase")]
    InvalidPhase,
    #[error("already_ready")]
    AlreadyReady,
    #[error("not_a_participant")]
    NotParticipant,
    #[error("domain_rejected:{0}")]
    DomainRejected(String),
}

impl SessionRecord {
    pub fn new(
        session_id: String,
        board_id: String,
        host_subject: String,
        participants: [ParticipantSeed; 2],
        previous_session_id: Option<String>,
        created_at_ms: i64,
    ) -> Result<Self, ModelError> {
        let record = Self {
            session_id,
            board_id,
            host_subject,
            version: 0,
            rules_version: OMOK_RULES_VERSION,
            state_schema_version: SESSION_STATE_SCHEMA_VERSION,
            previous_session_id,
            created_at_ms,
            state: OmokSessionState {
                room_status: RoomStatus::Waiting,
                participants: vec![
                    SessionParticipant {
                        actor_subject: participants[0].actor_subject.clone(),
                        display_name: participants[0].display_name.clone(),
                        slot: OmokSlot::First,
                        ready: false,
                    },
                    SessionParticipant {
                        actor_subject: participants[1].actor_subject.clone(),
                        display_name: participants[1].display_name.clone(),
                        slot: OmokSlot::Second,
                        ready: false,
                    },
                ],
                game: OmokState::new(),
                outcome: None,
            },
        };
        record.validate()?;
        Ok(record)
    }

    pub fn validate(&self) -> Result<(), ModelError> {
        if self.session_id.is_empty()
            || self.board_id.is_empty()
            || self.host_subject.is_empty()
            || self.version > MAX_SAFE_VERSION
            || self.rules_version != OMOK_RULES_VERSION
            || self.state_schema_version != SESSION_STATE_SCHEMA_VERSION
            || self.state.participants.len() != 2
        {
            return Err(ModelError::InvalidState);
        }
        self.state
            .game
            .validate()
            .map_err(|_| ModelError::InvalidState)?;

        let mut subjects = HashSet::new();
        let mut slots = HashSet::new();
        for participant in &self.state.participants {
            if participant.actor_subject.is_empty()
                || participant.actor_subject == self.host_subject
                || participant.display_name.trim().is_empty()
                || participant.display_name.chars().count() > 100
                || !subjects.insert(participant.actor_subject.as_str())
                || !slots.insert(participant.slot)
            {
                return Err(ModelError::InvalidState);
            }
        }
        if slots != HashSet::from([OmokSlot::First, OmokSlot::Second]) {
            return Err(ModelError::InvalidState);
        }

        let all_ready = self
            .state
            .participants
            .iter()
            .all(|participant| participant.ready);
        match self.state.room_status {
            RoomStatus::Waiting => {
                if all_ready
                    || self.state.outcome.is_some()
                    || self.state.game.move_count != 0
                    || self.state.game.status != OmokStatus::Playing
                {
                    return Err(ModelError::InvalidState);
                }
            }
            RoomStatus::Ready => {
                if !all_ready
                    || self.state.outcome.is_some()
                    || self.state.game.move_count != 0
                    || self.state.game.status != OmokStatus::Playing
                {
                    return Err(ModelError::InvalidState);
                }
            }
            RoomStatus::Active => {
                if !all_ready
                    || self.state.outcome.is_some()
                    || self.state.game.status != OmokStatus::Playing
                {
                    return Err(ModelError::InvalidState);
                }
            }
            RoomStatus::Finished => {
                if !all_ready || self.state.outcome.is_none() {
                    return Err(ModelError::InvalidState);
                }
                self.validate_outcome()?;
            }
        }
        Ok(())
    }

    fn validate_outcome(&self) -> Result<(), ModelError> {
        let outcome = self
            .state
            .outcome
            .as_ref()
            .ok_or(ModelError::InvalidState)?;
        match (outcome.reason, self.state.game.status) {
            (FinishReason::FiveInARow, OmokStatus::Won { winner })
                if outcome.winner == Some(winner.into()) =>
            {
                Ok(())
            }
            (FinishReason::Draw, OmokStatus::Draw) if outcome.winner.is_none() => Ok(()),
            (FinishReason::Resignation, OmokStatus::Playing) if outcome.winner.is_some() => Ok(()),
            _ => Err(ModelError::InvalidState),
        }
    }

    pub fn authorize(&self, actor: &ActorContext) -> Result<Option<OmokSlot>, ModelError> {
        match actor.role {
            ActorRole::Host if actor.subject == self.host_subject => Ok(None),
            ActorRole::Participant => self
                .state
                .participants
                .iter()
                .find(|participant| participant.actor_subject == actor.subject)
                .map(|participant| Some(participant.slot))
                .ok_or(ModelError::Forbidden),
            _ => Err(ModelError::Forbidden),
        }
    }

    pub fn snapshot(
        &self,
        actor: &ActorContext,
        server_time_ms: i64,
    ) -> Result<SessionSnapshot, ModelError> {
        let slot = self.authorize(actor)?;
        Ok(SessionSnapshot {
            session_id: self.session_id.clone(),
            board_id: self.board_id.clone(),
            game_kind: "omok".to_owned(),
            version: self.version,
            server_time_ms,
            rules_version: self.rules_version,
            state_schema_version: self.state_schema_version,
            previous_session_id: self.previous_session_id.clone(),
            room_status: self.state.room_status,
            participants: self
                .state
                .participants
                .iter()
                .map(|participant| PublicParticipant {
                    display_name: participant.display_name.clone(),
                    slot: participant.slot,
                    ready: participant.ready,
                })
                .collect(),
            viewer: ViewerProjection {
                role: actor.role,
                slot,
            },
            game: self.state.game.clone(),
            outcome: self.state.outcome.clone(),
        })
    }

    pub fn apply(&mut self, actor: &ActorContext, intent: &OmokIntent) -> Result<(), ModelError> {
        self.validate()?;
        match intent {
            OmokIntent::Ready => self.ready(actor),
            OmokIntent::Start => self.start(actor),
            OmokIntent::PlaceStone { position } => self.place_stone(actor, *position),
            OmokIntent::Resign => self.resign(actor),
        }?;
        self.validate()?;
        Ok(())
    }

    fn ready(&mut self, actor: &ActorContext) -> Result<(), ModelError> {
        if actor.role != ActorRole::Participant
            || !matches!(self.state.room_status, RoomStatus::Waiting)
        {
            return Err(ModelError::InvalidPhase);
        }
        let participant = self
            .state
            .participants
            .iter_mut()
            .find(|participant| participant.actor_subject == actor.subject)
            .ok_or(ModelError::NotParticipant)?;
        if participant.ready {
            return Err(ModelError::AlreadyReady);
        }
        participant.ready = true;
        if self.state.participants.iter().all(|current| current.ready) {
            self.state.room_status = RoomStatus::Ready;
        }
        Ok(())
    }

    fn start(&mut self, actor: &ActorContext) -> Result<(), ModelError> {
        if actor.role != ActorRole::Host || actor.subject != self.host_subject {
            return Err(ModelError::Forbidden);
        }
        if self.state.room_status != RoomStatus::Ready {
            return Err(ModelError::InvalidPhase);
        }
        self.state.room_status = RoomStatus::Active;
        Ok(())
    }

    fn place_stone(
        &mut self,
        actor: &ActorContext,
        position: OmokPosition,
    ) -> Result<(), ModelError> {
        if self.state.room_status != RoomStatus::Active {
            return Err(ModelError::InvalidPhase);
        }
        let slot = self.authorize(actor)?.ok_or(ModelError::NotParticipant)?;
        self.state
            .game
            .place_stone(slot.side(), position)
            .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
        match self.state.game.status {
            OmokStatus::Playing => {}
            OmokStatus::Won { winner } => {
                self.state.room_status = RoomStatus::Finished;
                self.state.outcome = Some(SessionOutcome {
                    winner: Some(winner.into()),
                    reason: FinishReason::FiveInARow,
                });
            }
            OmokStatus::Draw => {
                self.state.room_status = RoomStatus::Finished;
                self.state.outcome = Some(SessionOutcome {
                    winner: None,
                    reason: FinishReason::Draw,
                });
            }
        }
        Ok(())
    }

    fn resign(&mut self, actor: &ActorContext) -> Result<(), ModelError> {
        if self.state.room_status != RoomStatus::Active {
            return Err(ModelError::InvalidPhase);
        }
        let slot = self.authorize(actor)?.ok_or(ModelError::NotParticipant)?;
        self.state.room_status = RoomStatus::Finished;
        self.state.outcome = Some(SessionOutcome {
            winner: Some(slot.opponent()),
            reason: FinishReason::Resignation,
        });
        Ok(())
    }

    pub fn rematch(&self, new_session_id: String, created_at_ms: i64) -> Result<Self, ModelError> {
        self.validate()?;
        if self.state.room_status != RoomStatus::Finished {
            return Err(ModelError::InvalidPhase);
        }
        let first = self
            .state
            .participants
            .iter()
            .find(|participant| participant.slot == OmokSlot::Second)
            .ok_or(ModelError::InvalidState)?;
        let second = self
            .state
            .participants
            .iter()
            .find(|participant| participant.slot == OmokSlot::First)
            .ok_or(ModelError::InvalidState)?;
        Self::new(
            new_session_id,
            self.board_id.clone(),
            self.host_subject.clone(),
            [
                ParticipantSeed {
                    actor_subject: first.actor_subject.clone(),
                    display_name: first.display_name.clone(),
                },
                ParticipantSeed {
                    actor_subject: second.actor_subject.clone(),
                    display_name: second.display_name.clone(),
                },
            ],
            Some(self.session_id.clone()),
            created_at_ms,
        )
    }
}

impl SongGuessSessionRecord {
    pub fn new(
        session_id: String,
        board_id: String,
        host_subject: String,
        participants: Vec<SongGuessParticipantSeed>,
        rounds: Vec<SongGuessRoundSeed>,
        previous_session_id: Option<String>,
        created_at_ms: i64,
    ) -> Result<Self, ModelError> {
        let record = Self {
            session_id,
            board_id,
            host_subject,
            version: 0,
            rules_version: SONG_GUESS_RULES_VERSION,
            state_schema_version: SONG_GUESS_STATE_SCHEMA_VERSION,
            previous_session_id,
            created_at_ms,
            state: SongGuessState::new(participants, rounds)
                .map_err(|error| ModelError::DomainRejected(error.to_string()))?,
        };
        record.validate()?;
        Ok(record)
    }

    pub fn validate(&self) -> Result<(), ModelError> {
        if self.session_id.is_empty()
            || self.board_id.is_empty()
            || self.host_subject.is_empty()
            || self.version > MAX_SAFE_VERSION
            || self.rules_version != SONG_GUESS_RULES_VERSION
            || self.state_schema_version != SONG_GUESS_STATE_SCHEMA_VERSION
            || self
                .state
                .participants
                .iter()
                .any(|participant| participant.actor_subject == self.host_subject)
        {
            return Err(ModelError::InvalidState);
        }
        self.state
            .validate()
            .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
        Ok(())
    }

    /// Returns true for the teacher host and false for an authorized student.
    pub fn authorize(&self, actor: &ActorContext) -> Result<bool, ModelError> {
        match actor.role {
            ActorRole::Host if actor.subject == self.host_subject => Ok(true),
            ActorRole::Participant
                if self
                    .state
                    .participants
                    .iter()
                    .any(|participant| participant.actor_subject == actor.subject) =>
            {
                Ok(false)
            }
            ActorRole::Participant => Err(ModelError::NotParticipant),
            _ => Err(ModelError::Forbidden),
        }
    }

    pub fn snapshot(
        &self,
        actor: &ActorContext,
        server_time_ms: i64,
    ) -> Result<SongGuessSnapshot, ModelError> {
        let is_host = self.authorize(actor)?;
        let round = self
            .state
            .current_round()
            .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
        let scored_current_round = !is_host
            && round
                .correct_participants
                .iter()
                .any(|subject| subject == &actor.subject);
        let current_clip = if self.state.phase == SongGuessPhase::Guessing {
            round
                .clips
                .iter()
                .find(|clip| clip.tier_ms == round.unlocked_tier_ms)
                .map(|clip| SongGuessClipSnapshot {
                    asset_id: clip.asset_id.clone(),
                    tier_ms: clip.tier_ms,
                    mime_type: clip.mime_type.clone(),
                    duration_ms: clip.duration_ms,
                    size_bytes: clip.size_bytes,
                })
        } else {
            None
        };
        let round_is_revealed = matches!(
            self.state.phase,
            SongGuessPhase::Reveal | SongGuessPhase::Finished
        );
        let accessibility_clue = if matches!(
            self.state.phase,
            SongGuessPhase::Guessing | SongGuessPhase::Reveal | SongGuessPhase::Finished
        ) {
            round.accessibility_clue.clone()
        } else {
            None
        };

        Ok(SongGuessSnapshot {
            session_id: self.session_id.clone(),
            board_id: self.board_id.clone(),
            game_kind: "song-guess".to_owned(),
            version: self.version,
            server_time_ms,
            rules_version: self.rules_version,
            state_schema_version: self.state_schema_version,
            previous_session_id: self.previous_session_id.clone(),
            phase: self.state.phase,
            current_round: SongGuessRoundSnapshot {
                round_id: round.round_id.clone(),
                order: round.order,
                accessibility_clue,
                revealed_answer: round_is_revealed.then(|| round.representative_answer.clone()),
                current_clip,
            },
            participants: self
                .state
                .participants
                .iter()
                .map(|participant| SongGuessParticipantSnapshot {
                    display_name: participant.display_name.clone(),
                    score: participant.score,
                    scored_current_round: round
                        .correct_participants
                        .iter()
                        .any(|subject| subject == &participant.actor_subject),
                })
                .collect(),
            viewer: SongGuessViewer {
                role: actor.role,
                scored_current_round,
            },
        })
    }

    pub fn apply(
        &mut self,
        actor: &ActorContext,
        intent: &SongGuessIntent,
    ) -> Result<Option<SongGuessGuessResult>, ModelError> {
        self.validate()?;
        let is_host = self.authorize(actor)?;
        let result = match intent {
            SongGuessIntent::OpenLobby => {
                require_host(is_host)?;
                self.state
                    .open_lobby()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::Start => {
                require_host(is_host)?;
                self.state
                    .start()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::UnlockClip => {
                require_host(is_host)?;
                self.state
                    .unlock_clip()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::Guess { text } => {
                if is_host {
                    return Err(ModelError::Forbidden);
                }
                Some(
                    self.state
                        .guess(&actor.subject, text)
                        .map_err(|error| ModelError::DomainRejected(error.to_string()))?,
                )
            }
            SongGuessIntent::Reveal => {
                require_host(is_host)?;
                self.state
                    .reveal()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::NextRound => {
                require_host(is_host)?;
                self.state
                    .next_round()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::Finish => {
                require_host(is_host)?;
                self.state
                    .finish()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
        };
        self.validate()?;
        Ok(result)
    }
}

fn require_host(is_host: bool) -> Result<(), ModelError> {
    if is_host {
        Ok(())
    } else {
        Err(ModelError::Forbidden)
    }
}

pub fn validate_request_id(value: &str) -> Result<(), ModelError> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
    if valid {
        Ok(())
    } else {
        Err(ModelError::InvalidRequest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(id: &str) -> ParticipantSeed {
        ParticipantSeed {
            actor_subject: format!("student:{id}"),
            display_name: id.to_owned(),
        }
    }

    fn actor(id: &str) -> ActorContext {
        ActorContext {
            subject: format!("student:{id}"),
            role: ActorRole::Participant,
        }
    }

    fn host() -> ActorContext {
        ActorContext {
            subject: "teacher:1".to_owned(),
            role: ActorRole::Host,
        }
    }

    fn session() -> SessionRecord {
        SessionRecord::new(
            "session-1".to_owned(),
            "board-1".to_owned(),
            host().subject,
            [seed("first"), seed("second")],
            None,
            100,
        )
        .unwrap()
    }

    #[test]
    fn requires_both_participants_ready_and_host_start() {
        let mut session = session();
        session.apply(&actor("first"), &OmokIntent::Ready).unwrap();
        assert_eq!(session.state.room_status, RoomStatus::Waiting);
        session.apply(&actor("second"), &OmokIntent::Ready).unwrap();
        assert_eq!(session.state.room_status, RoomStatus::Ready);
        session.apply(&host(), &OmokIntent::Start).unwrap();
        assert_eq!(session.state.room_status, RoomStatus::Active);
    }

    #[test]
    fn actor_slot_is_server_owned() {
        let mut session = session();
        session.apply(&actor("first"), &OmokIntent::Ready).unwrap();
        session.apply(&actor("second"), &OmokIntent::Ready).unwrap();
        session.apply(&host(), &OmokIntent::Start).unwrap();
        let before = session.clone();
        let error = session
            .apply(
                &actor("second"),
                &OmokIntent::PlaceStone {
                    position: OmokPosition { row: 7, column: 7 },
                },
            )
            .unwrap_err();
        assert!(matches!(error, ModelError::DomainRejected(_)));
        assert_eq!(session, before);
    }

    #[test]
    fn resign_finishes_and_rematch_swaps_slots() {
        let mut session = session();
        session.apply(&actor("first"), &OmokIntent::Ready).unwrap();
        session.apply(&actor("second"), &OmokIntent::Ready).unwrap();
        session.apply(&host(), &OmokIntent::Start).unwrap();
        session.apply(&actor("first"), &OmokIntent::Resign).unwrap();
        assert_eq!(
            session.state.outcome,
            Some(SessionOutcome {
                winner: Some(OmokSlot::Second),
                reason: FinishReason::Resignation,
            })
        );

        let rematch = session.rematch("session-2".to_owned(), 200).unwrap();
        assert_eq!(rematch.previous_session_id.as_deref(), Some("session-1"));
        let first = rematch
            .state
            .participants
            .iter()
            .find(|participant| participant.slot == OmokSlot::First)
            .unwrap();
        assert_eq!(first.actor_subject, "student:second");
        assert_eq!(rematch.state.room_status, RoomStatus::Waiting);
    }
}
