use super::*;
use play_domain::song_guess::{
    SONG_GUESS_LEGACY_RULES_VERSION, SONG_GUESS_LEGACY_STATE_SCHEMA_VERSION,
    SONG_GUESS_RULES_VERSION as DOMAIN_SONG_GUESS_RULES_VERSION,
    SONG_GUESS_STATE_SCHEMA_VERSION as DOMAIN_SONG_GUESS_STATE_SCHEMA_VERSION, SongGuessAnswerMode,
    SongGuessChoice, SongGuessGuessResult, SongGuessParticipantSeed, SongGuessPhase,
    SongGuessRoundSeed, SongGuessState,
};
pub const SONG_GUESS_RULES_VERSION: u16 = DOMAIN_SONG_GUESS_RULES_VERSION;
pub const SONG_GUESS_STATE_SCHEMA_VERSION: u16 = DOMAIN_SONG_GUESS_STATE_SCHEMA_VERSION;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SongGuessAnswerTarget {
    #[default]
    Title,
    Artist,
    ArtistTitle,
}

fn is_title_target(target: &SongGuessAnswerTarget) -> bool {
    *target == SongGuessAnswerTarget::Title
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessSessionRecord {
    #[serde(default)]
    pub answer_target: SongGuessAnswerTarget,
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
    #[serde(default)]
    pub joined: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round_score: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_rank: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessRoundSnapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choices: Option<Vec<SongGuessChoice>>,
    pub round_id: String,
    pub order: u32,
    pub accessibility_clue: Option<String>,
    pub revealed_answer: Option<String>,
    pub current_clip: Option<SongGuessClipSnapshot>,
    // Waiting snapshots must include explicit nulls for the v2 wire contract.
    pub started_at_ms: Option<i64>,
    pub deadline_at_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_score: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessViewer {
    #[serde(default)]
    pub answered_current_round: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_choice_id: Option<String>,
    pub role: ActorRole,
    pub scored_current_round: bool,
    #[serde(default)]
    pub joined: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant_index: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessSnapshot {
    #[serde(default)]
    pub answer_target: SongGuessAnswerTarget,
    #[serde(default)]
    pub answer_mode: SongGuessAnswerMode,
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
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum SongGuessIntent {
    OpenLobby,
    Join,
    Start,
    UnlockClip,
    Guess {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        choice_id: Option<String>,
        #[serde(default, rename = "round_id", alias = "roundId")]
        round_id: Option<String>,
    },
    Reveal,
    NextRound,
    Finish,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSongGuessSessionRequest {
    #[serde(default, skip_serializing_if = "is_title_target")]
    pub answer_target: SongGuessAnswerTarget,
    #[serde(default, skip_serializing_if = "is_text_mode")]
    pub answer_mode: SongGuessAnswerMode,
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

fn is_text_mode(mode: &SongGuessAnswerMode) -> bool {
    *mode == SongGuessAnswerMode::Text
}

#[cfg(test)]
#[path = "model_song_guess_tests.rs"]
mod choice_tests;

impl SongGuessSessionRecord {
    pub fn with_answer_target(mut self, target: SongGuessAnswerTarget) -> Self {
        self.answer_target = target;
        self
    }
    pub fn with_answer_mode(self, mode: SongGuessAnswerMode) -> Result<Self, ModelError> {
        if self.state.answer_mode != mode {
            return Err(ModelError::InvalidRequest);
        }
        Ok(self)
    }

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
            answer_target: SongGuessAnswerTarget::Title,
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
            || !matches!(
                (self.rules_version, self.state_schema_version),
                (SONG_GUESS_RULES_VERSION, SONG_GUESS_STATE_SCHEMA_VERSION)
                    | (
                        SONG_GUESS_LEGACY_RULES_VERSION,
                        SONG_GUESS_LEGACY_STATE_SCHEMA_VERSION
                    )
            )
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
        let viewer_index = self
            .state
            .participants
            .iter()
            .position(|participant| participant.actor_subject == actor.subject)
            .and_then(|index| u32::try_from(index).ok());
        let viewer_joined = is_host
            || viewer_index
                .and_then(|index| self.state.participants.get(index as usize))
                .is_some_and(|participant| participant.joined);
        let has_v2_round_metrics = self.rules_version == SONG_GUESS_RULES_VERSION;
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
            answer_target: self.answer_target,
            answer_mode: self.state.answer_mode,
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
                choices: (self.state.answer_mode == SongGuessAnswerMode::MultipleChoice
                    && !matches!(
                        self.state.phase,
                        SongGuessPhase::Draft | SongGuessPhase::Lobby
                    ))
                .then(|| round.choices.clone()),
                round_id: round.round_id.clone(),
                order: round.order,
                accessibility_clue,
                revealed_answer: round_is_revealed.then(|| round.representative_answer.clone()),
                current_clip,
                started_at_ms: round.started_at_ms,
                deadline_at_ms: round.deadline_at_ms,
                max_score: (self.rules_version == SONG_GUESS_RULES_VERSION)
                    .then_some(round.max_score),
            },
            participants: self
                .state
                .participants
                .iter()
                .map(|participant| SongGuessParticipantSnapshot {
                    display_name: participant.display_name.clone(),
                    score: participant.score,
                    joined: participant.joined,
                    round_score: has_v2_round_metrics.then(|| {
                        round
                            .round_scores
                            .iter()
                            .find(|entry| entry.actor_subject == participant.actor_subject)
                            .map(|entry| entry.score)
                            .unwrap_or(0)
                    }),
                    previous_rank: if has_v2_round_metrics && participant.joined {
                        Some({
                            let round_score = round
                                .round_scores
                                .iter()
                                .find(|entry| entry.actor_subject == participant.actor_subject)
                                .map(|entry| entry.score)
                                .unwrap_or(0);
                            let previous_score = participant.score.saturating_sub(round_score);
                            1 + self
                                .state
                                .participants
                                .iter()
                                .filter(|candidate| {
                                    candidate.joined && {
                                        let candidate_round_score = round
                                            .round_scores
                                            .iter()
                                            .find(|entry| {
                                                entry.actor_subject == candidate.actor_subject
                                            })
                                            .map(|entry| entry.score)
                                            .unwrap_or(0);
                                        candidate.score.saturating_sub(candidate_round_score)
                                            > previous_score
                                    }
                                })
                                .count() as u32
                        })
                    } else {
                        None
                    },
                    scored_current_round: round
                        .correct_participants
                        .iter()
                        .any(|subject| subject == &participant.actor_subject),
                })
                .collect(),
            viewer: SongGuessViewer {
                answered_current_round: round
                    .selections
                    .iter()
                    .any(|selection| !is_host && selection.actor_subject == actor.subject)
                    || scored_current_round,
                selected_choice_id: round
                    .selections
                    .iter()
                    .find(|selection| !is_host && selection.actor_subject == actor.subject)
                    .map(|selection| selection.choice_id.clone()),
                role: actor.role,
                scored_current_round,
                joined: viewer_joined,
                participant_index: viewer_index,
            },
        })
    }

    pub fn apply(
        &mut self,
        actor: &ActorContext,
        intent: &SongGuessIntent,
    ) -> Result<Option<SongGuessGuessResult>, ModelError> {
        self.apply_at(actor, intent, self.created_at_ms)
    }

    pub fn apply_at(
        &mut self,
        actor: &ActorContext,
        intent: &SongGuessIntent,
        now_ms: i64,
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
            SongGuessIntent::Join => {
                if is_host {
                    return Err(ModelError::Forbidden);
                }
                self.state
                    .join(&actor.subject)
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::Start => {
                require_host(is_host)?;
                let transition = if self.rules_version == SONG_GUESS_RULES_VERSION {
                    self.state.start_at(now_ms)
                } else {
                    self.state.start()
                };
                transition.map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::UnlockClip => {
                require_host(is_host)?;
                self.state
                    .unlock_clip()
                    .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                None
            }
            SongGuessIntent::Guess {
                text,
                choice_id,
                round_id,
            } => {
                if is_host {
                    return Err(ModelError::Forbidden);
                }
                if let Some(round_id) = round_id {
                    let current_round = self
                        .state
                        .current_round()
                        .map_err(|error| ModelError::DomainRejected(error.to_string()))?;
                    if round_id != &current_round.round_id {
                        return Err(ModelError::InvalidPhase);
                    }
                }
                let result = match (self.state.answer_mode, text, choice_id) {
                    (SongGuessAnswerMode::Text, Some(text), None) => {
                        self.state.guess_at(&actor.subject, text, now_ms)
                    }
                    (SongGuessAnswerMode::MultipleChoice, None, Some(id)) => {
                        let round = self
                            .state
                            .current_round()
                            .map_err(|_| ModelError::InvalidState)?;
                        if round
                            .selections
                            .iter()
                            .any(|selection| selection.actor_subject == actor.subject)
                        {
                            return Err(ModelError::DomainRejected("already_answered".to_owned()));
                        }
                        if !round.choices.iter().any(|choice| &choice.id == id) {
                            return Err(ModelError::DomainRejected("invalid_choice".to_owned()));
                        }
                        self.state.choose_at(&actor.subject, id, now_ms)
                    }
                    _ => return Err(ModelError::InvalidRequest),
                };
                Some(result.map_err(|error| ModelError::DomainRejected(error.to_string()))?)
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
                let transition = if self.rules_version == SONG_GUESS_RULES_VERSION {
                    self.state.next_round_at(now_ms)
                } else {
                    self.state.next_round()
                };
                transition.map_err(|error| ModelError::DomainRejected(error.to_string()))?;
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
