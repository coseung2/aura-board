use std::collections::{BTreeMap, HashSet};

use play_domain::GameKind;
use play_domain::lifecycle::{GameOutcome, GameResultRecord, ParticipantPhase};
use play_domain::shadow_alliance::{
    AllianceTeam, ShadowAllianceError, ShadowAlliancePhase, ShadowAllianceRoundResult,
    ShadowAllianceState,
};
use serde::{Deserialize, Serialize};

use crate::model::{ActorContext, ActorRole, MAX_SAFE_VERSION, ModelError, validate_request_id};

pub const SHADOW_ALLIANCE_RULES_VERSION: u16 = 1;
pub const SHADOW_ALLIANCE_STATE_SCHEMA_VERSION: u16 = 1;
pub const SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION: u16 = 1;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceParticipantSeed {
    pub actor_subject: String,
    pub student_id: String,
    pub display_name: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceParticipantIdentity {
    pub actor_subject: String,
    pub student_id: String,
    pub display_name: String,
    pub joined_at_ms: Option<i64>,
    pub ready_at_ms: Option<i64>,
    pub forfeited_at_ms: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceSessionRecord {
    pub session_id: String,
    pub board_id: String,
    pub classroom_id: String,
    pub host_subject: String,
    pub version: u64,
    pub rules_version: u16,
    pub state_schema_version: u16,
    pub previous_session_id: Option<String>,
    pub created_at_ms: i64,
    pub started_at_ms: Option<i64>,
    pub completed_at_ms: Option<i64>,
    pub participants: BTreeMap<String, ShadowAllianceParticipantIdentity>,
    pub state: ShadowAllianceState,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceParticipantSnapshot {
    pub student_id: String,
    pub name: String,
    pub team: AllianceTeam,
    pub joined_at: Option<i64>,
    pub ready_at: Option<i64>,
    pub forfeited_at: Option<i64>,
    pub power: u64,
    pub last_gain: u64,
    pub round_wins: u32,
    pub submitted: bool,
    pub is_self: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub own_number: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceRoundPlayerSnapshot {
    pub student_id: String,
    pub name: String,
    pub team: AllianceTeam,
    pub number: Option<u32>,
    pub gain: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceRoundResultSnapshot {
    pub round: u32,
    pub command: u32,
    pub winner: String,
    pub black_average: Option<f64>,
    pub white_average: Option<f64>,
    pub black_difference: Option<f64>,
    pub white_difference: Option<f64>,
    pub players: Vec<ShadowAllianceRoundPlayerSnapshot>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceSnapshot {
    pub id: String,
    pub board_id: String,
    pub classroom_id: String,
    pub version: u64,
    pub phase: ShadowAlliancePhase,
    pub terminal_reason: Option<String>,
    pub round: u32,
    pub total_rounds: u32,
    pub command: Option<u32>,
    pub editable: bool,
    pub time_left_ms: u64,
    pub timer_running: bool,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub participants: Vec<ShadowAllianceParticipantSnapshot>,
    pub last_result: Option<ShadowAllianceRoundResultSnapshot>,
    pub all_submitted: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum ShadowAllianceIntent {
    Join,
    Ready,
    Forfeit,
    Submit { number: u32 },
    UpdateSettings { editable: bool, timer_sec: u32 },
    Rebalance,
    Start,
    Pause,
    Resume,
    Reveal,
    Postround,
    NextRound,
    Finish,
    HostEnd,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShadowAllianceSessionRequest {
    pub request_id: String,
    pub classroom_id: String,
    pub total_rounds: u32,
    pub participants: Vec<ShadowAllianceParticipantSeed>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceCommandRequest {
    pub request_id: String,
    pub expected_version: u64,
    #[serde(default = "shadow_command_schema_version")]
    pub command_schema_version: u16,
    pub command: ShadowAllianceIntent,
}

fn shadow_command_schema_version() -> u16 {
    SHADOW_ALLIANCE_COMMAND_SCHEMA_VERSION
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceCommandResponse {
    pub request_id: String,
    pub previous_version: u64,
    pub version: u64,
    pub snapshot: ShadowAllianceSnapshot,
    pub result_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceSessionResponse {
    pub request_id: String,
    pub snapshot: ShadowAllianceSnapshot,
}

impl ShadowAllianceSessionRecord {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_id: String,
        board_id: String,
        classroom_id: String,
        host_subject: String,
        participants: Vec<ShadowAllianceParticipantSeed>,
        total_rounds: u32,
        previous_session_id: Option<String>,
        created_at_ms: i64,
    ) -> Result<Self, ModelError> {
        if participants.len() < 2 || participants.len() > 100 {
            return Err(ModelError::InvalidRequest);
        }
        let mut state = ShadowAllianceState::new(total_rounds, stable_seed(&session_id))
            .map_err(domain_error)?;
        let mut identities = BTreeMap::new();
        let mut actor_subjects = HashSet::new();
        for participant in participants {
            validate_seed(&participant, &host_subject)?;
            if !actor_subjects.insert(participant.actor_subject.clone())
                || identities.contains_key(&participant.student_id)
            {
                return Err(ModelError::InvalidRequest);
            }
            state
                .invite(participant.student_id.clone())
                .map_err(domain_error)?;
            identities.insert(
                participant.student_id.clone(),
                ShadowAllianceParticipantIdentity {
                    actor_subject: participant.actor_subject,
                    student_id: participant.student_id,
                    display_name: participant.display_name.trim().to_owned(),
                    joined_at_ms: None,
                    ready_at_ms: None,
                    forfeited_at_ms: None,
                },
            );
        }
        state.version = 0;
        let record = Self {
            session_id,
            board_id,
            classroom_id,
            host_subject,
            version: state.version,
            rules_version: SHADOW_ALLIANCE_RULES_VERSION,
            state_schema_version: SHADOW_ALLIANCE_STATE_SCHEMA_VERSION,
            previous_session_id,
            created_at_ms,
            started_at_ms: None,
            completed_at_ms: None,
            participants: identities,
            state,
        };
        record.validate()?;
        Ok(record)
    }

    pub fn validate(&self) -> Result<(), ModelError> {
        if self.session_id.trim().is_empty()
            || self.board_id.trim().is_empty()
            || self.classroom_id.trim().is_empty()
            || self.host_subject.trim().is_empty()
            || self.version > MAX_SAFE_VERSION
            || self.version != self.state.version
            || self.rules_version != SHADOW_ALLIANCE_RULES_VERSION
            || self.state_schema_version != SHADOW_ALLIANCE_STATE_SCHEMA_VERSION
            || self.state.total_rounds == 0
            || self.state.total_rounds > 20
            || self.state.current_round > self.state.total_rounds
            || self.participants.len() != self.state.participants.len()
        {
            return Err(ModelError::InvalidState);
        }
        match self.state.phase {
            ShadowAlliancePhase::Lobby
                if self.started_at_ms.is_some() || self.completed_at_ms.is_some() =>
            {
                return Err(ModelError::InvalidState);
            }
            ShadowAlliancePhase::Playing
            | ShadowAlliancePhase::Revealing
            | ShadowAlliancePhase::Postround
                if self.started_at_ms.is_none() || self.completed_at_ms.is_some() =>
            {
                return Err(ModelError::InvalidState);
            }
            phase
                if phase.is_terminal()
                    && (self.started_at_ms.is_none() || self.completed_at_ms.is_none()) =>
            {
                return Err(ModelError::InvalidState);
            }
            _ => {}
        }
        if self
            .completed_at_ms
            .zip(self.started_at_ms)
            .is_some_and(|(completed, started)| completed < started)
        {
            return Err(ModelError::InvalidState);
        }
        for (student_id, identity) in &self.participants {
            if student_id != &identity.student_id
                || identity.actor_subject != format!("student:{student_id}")
                || identity.display_name.trim().is_empty()
                || identity.display_name.chars().count() > 100
                || !self.state.participants.contains_key(student_id)
                || identity
                    .ready_at_ms
                    .zip(identity.joined_at_ms)
                    .is_some_and(|(ready, joined)| ready < joined)
                || identity
                    .forfeited_at_ms
                    .zip(identity.joined_at_ms)
                    .is_some_and(|(forfeited, joined)| forfeited < joined)
            {
                return Err(ModelError::InvalidState);
            }
        }
        Ok(())
    }

    pub fn authorize(&self, actor: &ActorContext) -> Result<(), ModelError> {
        match actor.role {
            ActorRole::Host => Ok(()),
            ActorRole::Participant
                if self
                    .participants
                    .values()
                    .any(|identity| identity.actor_subject == actor.subject) =>
            {
                Ok(())
            }
            _ => Err(ModelError::Forbidden),
        }
    }

    pub fn apply(
        &mut self,
        actor: &ActorContext,
        intent: &ShadowAllianceIntent,
        now_ms: i64,
    ) -> Result<(), ModelError> {
        self.authorize(actor)?;
        let previous_version = self.version;
        self.state.materialize_deadline(now_ms);
        match (actor.role, intent) {
            (ActorRole::Participant, ShadowAllianceIntent::Join) => {
                let student_id = self.student_id_for_actor(actor)?;
                self.state.join(&student_id).map_err(domain_error)?;
                self.participants
                    .get_mut(&student_id)
                    .ok_or(ModelError::InvalidState)?
                    .joined_at_ms
                    .get_or_insert(now_ms);
            }
            (ActorRole::Participant, ShadowAllianceIntent::Ready) => {
                let student_id = self.student_id_for_actor(actor)?;
                self.state.ready(&student_id).map_err(domain_error)?;
                self.participants
                    .get_mut(&student_id)
                    .ok_or(ModelError::InvalidState)?
                    .ready_at_ms
                    .get_or_insert(now_ms);
            }
            (ActorRole::Participant, ShadowAllianceIntent::Forfeit) => {
                let student_id = self.student_id_for_actor(actor)?;
                self.state.forfeit(&student_id).map_err(domain_error)?;
                let identity = self
                    .participants
                    .get_mut(&student_id)
                    .ok_or(ModelError::InvalidState)?;
                identity.joined_at_ms.get_or_insert(now_ms);
                identity.forfeited_at_ms.get_or_insert(now_ms);
            }
            (ActorRole::Participant, ShadowAllianceIntent::Submit { number }) => {
                let student_id = self.student_id_for_actor(actor)?;
                self.state
                    .submit_number(&student_id, *number, now_ms)
                    .map_err(domain_error)?;
            }
            (
                ActorRole::Host,
                ShadowAllianceIntent::UpdateSettings {
                    editable,
                    timer_sec,
                },
            ) => self
                .state
                .update_settings(*editable, *timer_sec)
                .map_err(domain_error)?,
            (ActorRole::Host, ShadowAllianceIntent::Rebalance) => {
                self.state.rebalance().map_err(domain_error)?;
            }
            (ActorRole::Host, ShadowAllianceIntent::Start) => {
                self.state.start(now_ms).map_err(domain_error)?;
                self.started_at_ms = Some(now_ms);
            }
            (ActorRole::Host, ShadowAllianceIntent::Pause) => {
                self.state.pause(now_ms).map_err(domain_error)?;
            }
            (ActorRole::Host, ShadowAllianceIntent::Resume) => {
                self.state.resume(now_ms).map_err(domain_error)?;
            }
            (ActorRole::Host, ShadowAllianceIntent::Reveal) => {
                self.state.reveal().map_err(domain_error)?;
            }
            (ActorRole::Host, ShadowAllianceIntent::Postround) => {
                self.state.move_to_postround().map_err(domain_error)?;
            }
            (ActorRole::Host, ShadowAllianceIntent::NextRound) => {
                self.state.next_round(now_ms).map_err(domain_error)?;
            }
            (ActorRole::Host, ShadowAllianceIntent::Finish) => {
                self.state.finish().map_err(domain_error)?;
                self.completed_at_ms = Some(now_ms);
            }
            (ActorRole::Host, ShadowAllianceIntent::HostEnd) => {
                self.state.host_end().map_err(domain_error)?;
                self.started_at_ms.get_or_insert(now_ms);
                self.completed_at_ms = Some(now_ms);
            }
            _ => return Err(ModelError::Forbidden),
        }
        self.version = self.state.version;
        if self.version <= previous_version || self.version > MAX_SAFE_VERSION {
            return Err(ModelError::InvalidState);
        }
        self.validate()
    }

    pub fn snapshot(
        &self,
        actor: &ActorContext,
        now_ms: i64,
    ) -> Result<ShadowAllianceSnapshot, ModelError> {
        self.authorize(actor)?;
        let viewer_student_id = if actor.role == ActorRole::Participant {
            Some(self.student_id_for_actor(actor)?)
        } else {
            None
        };
        let participants = self
            .participants
            .iter()
            .map(|(student_id, identity)| {
                let participant = self
                    .state
                    .participants
                    .get(student_id)
                    .ok_or(ModelError::InvalidState)?;
                let is_self = viewer_student_id.as_deref() == Some(student_id.as_str());
                Ok(ShadowAllianceParticipantSnapshot {
                    student_id: student_id.clone(),
                    name: identity.display_name.clone(),
                    team: participant.team,
                    joined_at: identity.joined_at_ms,
                    ready_at: identity.ready_at_ms,
                    forfeited_at: identity.forfeited_at_ms,
                    power: participant.power,
                    last_gain: participant.last_gain,
                    round_wins: participant.round_wins,
                    submitted: self.state.submissions.contains_key(student_id),
                    is_self,
                    own_number: is_self
                        .then(|| self.state.submissions.get(student_id).copied())
                        .flatten(),
                })
            })
            .collect::<Result<Vec<_>, ModelError>>()?;
        let active_ids = self
            .state
            .participants
            .iter()
            .filter_map(|(student_id, participant)| {
                matches!(
                    participant.phase,
                    ParticipantPhase::Joined | ParticipantPhase::Ready
                )
                .then_some(student_id)
            })
            .collect::<Vec<_>>();
        let all_submitted = !active_ids.is_empty()
            && active_ids
                .iter()
                .all(|student_id| self.state.submissions.contains_key(*student_id));
        Ok(ShadowAllianceSnapshot {
            id: self.session_id.clone(),
            board_id: self.board_id.clone(),
            classroom_id: self.classroom_id.clone(),
            version: self.version,
            phase: self.state.phase,
            terminal_reason: terminal_reason_wire(self.state.terminal_reason),
            round: self.state.current_round,
            total_rounds: self.state.total_rounds,
            command: self.state.command,
            editable: self.state.editable,
            time_left_ms: self.state.time_left_ms(now_ms),
            timer_running: self.state.timer_running(now_ms),
            started_at: self.started_at_ms,
            completed_at: self.completed_at_ms,
            participants,
            last_result: self
                .state
                .history
                .last()
                .map(|result| self.result_snapshot(result)),
            all_submitted,
        })
    }

    pub fn result_student_ids(&self) -> HashSet<String> {
        self.participants
            .keys()
            .filter(|student_id| self.should_write_result(student_id))
            .cloned()
            .collect()
    }

    pub fn result_records(&self) -> Result<Vec<GameResultRecord>, ModelError> {
        self.result_student_ids()
            .iter()
            .map(|student_id| self.result_record(student_id))
            .collect()
    }

    pub fn rematch(&self, session_id: String, now_ms: i64) -> Result<Self, ModelError> {
        if !self.state.phase.is_terminal() {
            return Err(ModelError::InvalidState);
        }
        let seeds = self
            .participants
            .values()
            .map(|identity| ShadowAllianceParticipantSeed {
                actor_subject: identity.actor_subject.clone(),
                student_id: identity.student_id.clone(),
                display_name: identity.display_name.clone(),
            })
            .collect();
        Self::new(
            session_id,
            self.board_id.clone(),
            self.classroom_id.clone(),
            self.host_subject.clone(),
            seeds,
            self.state.total_rounds,
            Some(self.session_id.clone()),
            now_ms,
        )
    }

    fn should_write_result(&self, student_id: &str) -> bool {
        self.state
            .participants
            .get(student_id)
            .is_some_and(|participant| {
                participant.phase == ParticipantPhase::Forfeited
                    || (self.state.phase.is_terminal()
                        && participant.phase != ParticipantPhase::Invited)
            })
    }

    fn result_record(&self, student_id: &str) -> Result<GameResultRecord, ModelError> {
        let result = self.state.result_for(student_id).map_err(domain_error)?;
        let identity = self
            .participants
            .get(student_id)
            .ok_or(ModelError::InvalidState)?;
        let completed_at_ms = if result.outcome == GameOutcome::Forfeit {
            identity.forfeited_at_ms.ok_or(ModelError::InvalidState)?
        } else {
            self.completed_at_ms.ok_or(ModelError::InvalidState)?
        };
        let started_at_ms = self.started_at_ms.unwrap_or(self.created_at_ms);
        let reason = match result.outcome {
            GameOutcome::Forfeit => "participant_forfeit",
            GameOutcome::HostEnded => "host_ended",
            _ => "completed",
        };
        Ok(GameResultRecord {
            game_kind: GameKind::ShadowAlliance,
            board_id: self.board_id.clone(),
            classroom_id: self.classroom_id.clone(),
            student_id: student_id.to_owned(),
            source_type: "play_session".into(),
            source_id: self.session_id.clone(),
            outcome: result.outcome,
            score: Some(i64::try_from(result.score).map_err(|_| ModelError::InvalidState)?),
            duration_ms: Some(completed_at_ms.saturating_sub(started_at_ms)),
            metrics: serde_json::json!({
                "rank": result.rank,
                "team": team_wire(result.team),
                "roundWins": result.round_wins,
                "completedRounds": result.completed_rounds,
                "totalRounds": result.total_rounds,
                "reason": reason,
            }),
            started_at_ms,
            completed_at_ms,
            idempotency_key: format!("shadow-alliance:{}:{student_id}", self.session_id),
            rules_version: Some(i32::from(self.rules_version)),
            state_schema_version: Some(i32::from(self.state_schema_version)),
        })
    }

    fn result_snapshot(
        &self,
        result: &ShadowAllianceRoundResult,
    ) -> ShadowAllianceRoundResultSnapshot {
        ShadowAllianceRoundResultSnapshot {
            round: result.round,
            command: result.command,
            winner: result.winner.map(team_wire).unwrap_or("tie").to_owned(),
            black_average: result.black_average,
            white_average: result.white_average,
            black_difference: result.black_difference,
            white_difference: result.white_difference,
            players: result
                .players
                .iter()
                .map(|player| ShadowAllianceRoundPlayerSnapshot {
                    student_id: player.student_id.clone(),
                    name: self
                        .participants
                        .get(&player.student_id)
                        .map(|identity| identity.display_name.clone())
                        .unwrap_or_else(|| "Unknown".into()),
                    team: player.team,
                    number: player.number,
                    gain: player.gain,
                })
                .collect(),
        }
    }

    fn student_id_for_actor(&self, actor: &ActorContext) -> Result<String, ModelError> {
        self.participants
            .values()
            .find(|identity| identity.actor_subject == actor.subject)
            .map(|identity| identity.student_id.clone())
            .ok_or(ModelError::NotParticipant)
    }
}

pub fn validate_shadow_request_id(value: &str) -> Result<(), ModelError> {
    validate_request_id(value)
}

fn validate_seed(
    participant: &ShadowAllianceParticipantSeed,
    host_subject: &str,
) -> Result<(), ModelError> {
    if participant.student_id.trim().is_empty()
        || participant.actor_subject != format!("student:{}", participant.student_id)
        || participant.actor_subject == host_subject
        || participant.display_name.trim().is_empty()
        || participant.display_name.chars().count() > 100
    {
        return Err(ModelError::InvalidRequest);
    }
    Ok(())
}

fn stable_seed(value: &str) -> u64 {
    value
        .as_bytes()
        .iter()
        .fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
            hash.wrapping_mul(0x0000_0100_0000_01b3) ^ u64::from(*byte)
        })
}

fn team_wire(team: AllianceTeam) -> &'static str {
    match team {
        AllianceTeam::Unassigned => "unassigned",
        AllianceTeam::Black => "black",
        AllianceTeam::White => "white",
    }
}

fn terminal_reason_wire(reason: Option<play_domain::lifecycle::TerminalReason>) -> Option<String> {
    reason.map(|reason| match reason {
        play_domain::lifecycle::TerminalReason::Completed => "completed".to_owned(),
        play_domain::lifecycle::TerminalReason::HostEnded => "host_ended".to_owned(),
        play_domain::lifecycle::TerminalReason::ParticipantForfeit => {
            "participant_forfeit".to_owned()
        }
        play_domain::lifecycle::TerminalReason::Deadline => "deadline".to_owned(),
    })
}

fn domain_error(error: ShadowAllianceError) -> ModelError {
    let code = match error {
        ShadowAllianceError::InvalidRoundCount => "invalid_round_count",
        ShadowAllianceError::MissingStudentId => "missing_student_id",
        ShadowAllianceError::TooManyParticipants => "too_many_participants",
        ShadowAllianceError::ParticipantNotInvited => "participant_not_invited",
        ShadowAllianceError::ParticipantNotJoined => "participant_not_joined",
        ShadowAllianceError::ParticipantForfeited => "participant_forfeited",
        ShadowAllianceError::NotEnoughParticipants => "not_enough_participants",
        ShadowAllianceError::ParticipantsNotReady => "participants_not_ready",
        ShadowAllianceError::TeamsNotBalanced => "teams_not_balanced",
        ShadowAllianceError::InvalidSettings => "invalid_settings",
        ShadowAllianceError::InvalidNumber => "invalid_number",
        ShadowAllianceError::AlreadySubmitted => "already_submitted",
        ShadowAllianceError::RoundExpired => "round_expired",
        ShadowAllianceError::InvalidPhase => "invalid_state",
        ShadowAllianceError::SessionTerminal => "session_terminal",
        ShadowAllianceError::SessionNotTerminal => "session_not_terminal",
    };
    ModelError::DomainRejected(code.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeds() -> Vec<ShadowAllianceParticipantSeed> {
        ["student-a", "student-b"]
            .into_iter()
            .map(|student_id| ShadowAllianceParticipantSeed {
                actor_subject: format!("student:{student_id}"),
                student_id: student_id.into(),
                display_name: student_id.into(),
            })
            .collect()
    }

    fn host() -> ActorContext {
        ActorContext {
            subject: "teacher:1".into(),
            role: ActorRole::Host,
        }
    }

    fn participant(student_id: &str) -> ActorContext {
        ActorContext {
            subject: format!("student:{student_id}"),
            role: ActorRole::Participant,
        }
    }

    #[test]
    fn snapshot_hides_other_players_numbers_until_reveal() {
        let mut record = ShadowAllianceSessionRecord::new(
            "session-1".into(),
            "board-1".into(),
            "class-1".into(),
            host().subject,
            seeds(),
            1,
            None,
            10,
        )
        .unwrap();
        for student_id in ["student-a", "student-b"] {
            let actor = participant(student_id);
            record
                .apply(&actor, &ShadowAllianceIntent::Join, 20)
                .unwrap();
            record
                .apply(&actor, &ShadowAllianceIntent::Ready, 30)
                .unwrap();
        }
        record
            .apply(&host(), &ShadowAllianceIntent::Start, 40)
            .unwrap();
        record
            .apply(
                &participant("student-a"),
                &ShadowAllianceIntent::Submit { number: 44 },
                50,
            )
            .unwrap();
        let snapshot = record.snapshot(&participant("student-b"), 50).unwrap();
        let submitted = snapshot
            .participants
            .iter()
            .find(|candidate| candidate.student_id == "student-a")
            .unwrap();
        assert!(submitted.submitted);
        assert_eq!(submitted.own_number, None);
        assert_eq!(snapshot.last_result, None);
    }

    #[test]
    fn terminal_results_are_personal_and_metric_whitelisted() {
        let mut record = ShadowAllianceSessionRecord::new(
            "session-1".into(),
            "board-1".into(),
            "class-1".into(),
            host().subject,
            seeds(),
            1,
            None,
            10,
        )
        .unwrap();
        for student_id in ["student-a", "student-b"] {
            let actor = participant(student_id);
            record
                .apply(&actor, &ShadowAllianceIntent::Join, 20)
                .unwrap();
            record
                .apply(&actor, &ShadowAllianceIntent::Ready, 30)
                .unwrap();
        }
        record
            .apply(&host(), &ShadowAllianceIntent::Start, 40)
            .unwrap();
        for (student_id, number) in [("student-a", 44), ("student-b", 46)] {
            record
                .apply(
                    &participant(student_id),
                    &ShadowAllianceIntent::Submit { number },
                    50,
                )
                .unwrap();
        }
        record
            .apply(&host(), &ShadowAllianceIntent::Reveal, 60)
            .unwrap();
        record
            .apply(&host(), &ShadowAllianceIntent::Postround, 70)
            .unwrap();
        record
            .apply(&host(), &ShadowAllianceIntent::Finish, 80)
            .unwrap();
        let results = record.result_records().unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].source_type, "play_session");
        assert_eq!(results[0].metrics["completedRounds"], 1);
        assert!(results[0].metrics.get("number").is_none());
    }
}
