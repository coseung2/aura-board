use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::lifecycle::{GameOutcome, ParticipantPhase, TerminalReason};

const ROUND_REWARD_POOL: u64 = 10_000;
const MIN_COMMAND: u32 = 30;
const COMMAND_SPAN: u64 = 41;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AllianceTeam {
    #[serde(rename = "unassigned")]
    Unassigned,
    #[serde(rename = "black")]
    Black,
    #[serde(rename = "white")]
    White,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ShadowAlliancePhase {
    #[serde(rename = "lobby")]
    Lobby,
    #[serde(rename = "playing")]
    Playing,
    #[serde(rename = "revealing")]
    Revealing,
    #[serde(rename = "postround")]
    Postround,
    #[serde(rename = "finished")]
    Finished,
    #[serde(rename = "host-ended")]
    HostEnded,
}

impl ShadowAlliancePhase {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Finished | Self::HostEnded)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceParticipant {
    pub student_id: String,
    pub join_order: u32,
    pub team: AllianceTeam,
    pub phase: ParticipantPhase,
    pub power: u64,
    pub last_gain: u64,
    pub round_wins: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceRoundPlayer {
    pub student_id: String,
    pub team: AllianceTeam,
    pub number: Option<u32>,
    pub gain: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceRoundResult {
    pub round: u32,
    pub command: u32,
    pub winner: Option<AllianceTeam>,
    pub black_average: Option<f64>,
    pub white_average: Option<f64>,
    pub black_difference: Option<f64>,
    pub white_difference: Option<f64>,
    pub players: Vec<ShadowAllianceRoundPlayer>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowAllianceState {
    pub version: u64,
    pub phase: ShadowAlliancePhase,
    pub terminal_reason: Option<TerminalReason>,
    pub current_round: u32,
    pub total_rounds: u32,
    pub command_seed: u64,
    pub command: Option<u32>,
    pub editable: bool,
    pub round_duration_ms: u64,
    pub round_ends_at_ms: Option<i64>,
    pub paused_remaining_ms: Option<u64>,
    pub participants: BTreeMap<String, ShadowAllianceParticipant>,
    pub submissions: BTreeMap<String, u32>,
    pub history: Vec<ShadowAllianceRoundResult>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShadowAlliancePlayerResult {
    pub outcome: GameOutcome,
    pub score: u64,
    pub rank: u32,
    pub team: AllianceTeam,
    pub round_wins: u32,
    pub completed_rounds: u32,
    pub total_rounds: u32,
}

impl ShadowAllianceState {
    pub fn new(total_rounds: u32, command_seed: u64) -> Result<Self, ShadowAllianceError> {
        if !(1..=20).contains(&total_rounds) {
            return Err(ShadowAllianceError::InvalidRoundCount);
        }
        Ok(Self {
            version: 0,
            phase: ShadowAlliancePhase::Lobby,
            terminal_reason: None,
            current_round: 0,
            total_rounds,
            command_seed,
            command: None,
            editable: true,
            round_duration_ms: 300_000,
            round_ends_at_ms: None,
            paused_remaining_ms: None,
            participants: BTreeMap::new(),
            submissions: BTreeMap::new(),
            history: Vec::new(),
        })
    }

    pub fn invite(&mut self, student_id: String) -> Result<(), ShadowAllianceError> {
        if student_id.trim().is_empty() {
            return Err(ShadowAllianceError::MissingStudentId);
        }
        if self.phase != ShadowAlliancePhase::Lobby {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        if self.participants.contains_key(&student_id) {
            return Ok(());
        }
        let join_order = u32::try_from(self.participants.len())
            .map_err(|_| ShadowAllianceError::TooManyParticipants)?;
        self.participants.insert(
            student_id.clone(),
            ShadowAllianceParticipant {
                student_id,
                join_order,
                team: AllianceTeam::Unassigned,
                phase: ParticipantPhase::Invited,
                power: 0,
                last_gain: 0,
                round_wins: 0,
            },
        );
        self.bump_version();
        Ok(())
    }

    pub fn join(&mut self, student_id: &str) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Lobby {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let (black_count, white_count) = self.joined_team_counts();
        let participant = self
            .participants
            .get_mut(student_id)
            .ok_or(ShadowAllianceError::ParticipantNotInvited)?;
        match participant.phase {
            ParticipantPhase::Invited => {
                participant.phase = ParticipantPhase::Joined;
                participant.team = if black_count <= white_count {
                    AllianceTeam::Black
                } else {
                    AllianceTeam::White
                };
            }
            ParticipantPhase::Joined | ParticipantPhase::Ready => return Ok(()),
            ParticipantPhase::Forfeited => {
                return Err(ShadowAllianceError::ParticipantForfeited);
            }
        }
        self.bump_version();
        Ok(())
    }

    pub fn ready(&mut self, student_id: &str) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Lobby {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let participant = self
            .participants
            .get_mut(student_id)
            .ok_or(ShadowAllianceError::ParticipantNotInvited)?;
        match participant.phase {
            ParticipantPhase::Joined | ParticipantPhase::Ready => {
                participant.phase = ParticipantPhase::Ready;
            }
            ParticipantPhase::Invited => {
                return Err(ShadowAllianceError::ParticipantNotJoined);
            }
            ParticipantPhase::Forfeited => {
                return Err(ShadowAllianceError::ParticipantForfeited);
            }
        }
        self.bump_version();
        Ok(())
    }

    pub fn forfeit(&mut self, student_id: &str) -> Result<(), ShadowAllianceError> {
        if self.phase.is_terminal() {
            return Err(ShadowAllianceError::SessionTerminal);
        }
        let participant = self
            .participants
            .get_mut(student_id)
            .ok_or(ShadowAllianceError::ParticipantNotInvited)?;
        match participant.phase {
            ParticipantPhase::Invited => {
                return Err(ShadowAllianceError::ParticipantNotJoined);
            }
            ParticipantPhase::Forfeited => return Ok(()),
            ParticipantPhase::Joined | ParticipantPhase::Ready => {
                participant.phase = ParticipantPhase::Forfeited;
            }
        }
        self.submissions.remove(student_id);
        self.bump_version();
        Ok(())
    }

    pub fn update_settings(
        &mut self,
        editable: bool,
        timer_sec: u32,
    ) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Lobby || !(10..=3_600).contains(&timer_sec) {
            return Err(ShadowAllianceError::InvalidSettings);
        }
        self.editable = editable;
        self.round_duration_ms = u64::from(timer_sec) * 1_000;
        self.bump_version();
        Ok(())
    }

    pub fn rebalance(&mut self) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Lobby {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let mut joined = self
            .participants
            .values_mut()
            .filter(|participant| {
                matches!(
                    participant.phase,
                    ParticipantPhase::Joined | ParticipantPhase::Ready
                )
            })
            .collect::<Vec<_>>();
        joined.sort_by_key(|participant| participant.join_order);
        for (index, participant) in joined.into_iter().enumerate() {
            participant.team = if index % 2 == 0 {
                AllianceTeam::Black
            } else {
                AllianceTeam::White
            };
        }
        self.bump_version();
        Ok(())
    }

    pub fn start(&mut self, now_ms: i64) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Lobby {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let joined = self.active_participants().collect::<Vec<_>>();
        if joined.len() < 2 {
            return Err(ShadowAllianceError::NotEnoughParticipants);
        }
        if joined
            .iter()
            .any(|participant| participant.phase != ParticipantPhase::Ready)
        {
            return Err(ShadowAllianceError::ParticipantsNotReady);
        }
        if !joined
            .iter()
            .any(|participant| participant.team == AllianceTeam::Black)
            || !joined
                .iter()
                .any(|participant| participant.team == AllianceTeam::White)
        {
            return Err(ShadowAllianceError::TeamsNotBalanced);
        }
        for participant in self.participants.values_mut() {
            participant.power = 0;
            participant.last_gain = 0;
            participant.round_wins = 0;
        }
        self.history.clear();
        self.current_round = 1;
        self.begin_round(now_ms);
        self.bump_version();
        Ok(())
    }

    pub fn submit_number(
        &mut self,
        student_id: &str,
        number: u32,
        now_ms: i64,
    ) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Playing {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        if !(1..=100).contains(&number) {
            return Err(ShadowAllianceError::InvalidNumber);
        }
        if self.time_left_ms(now_ms) == 0 {
            return Err(ShadowAllianceError::RoundExpired);
        }
        let participant = self
            .participants
            .get(student_id)
            .ok_or(ShadowAllianceError::ParticipantNotInvited)?;
        if !matches!(
            participant.phase,
            ParticipantPhase::Joined | ParticipantPhase::Ready
        ) {
            return Err(if participant.phase == ParticipantPhase::Forfeited {
                ShadowAllianceError::ParticipantForfeited
            } else {
                ShadowAllianceError::ParticipantNotJoined
            });
        }
        if self.submissions.contains_key(student_id) && !self.editable {
            return Err(ShadowAllianceError::AlreadySubmitted);
        }
        self.submissions.insert(student_id.to_owned(), number);
        self.bump_version();
        Ok(())
    }

    pub fn pause(&mut self, now_ms: i64) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Playing || self.paused_remaining_ms.is_some() {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let remaining = self.time_left_ms(now_ms);
        self.round_ends_at_ms = None;
        self.paused_remaining_ms = Some(remaining);
        self.bump_version();
        Ok(())
    }

    pub fn resume(&mut self, now_ms: i64) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Playing {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let remaining = self
            .paused_remaining_ms
            .take()
            .ok_or(ShadowAllianceError::InvalidPhase)?;
        self.round_ends_at_ms = Some(add_ms(now_ms, remaining));
        self.bump_version();
        Ok(())
    }

    pub fn materialize_deadline(&mut self, now_ms: i64) {
        if self.phase == ShadowAlliancePhase::Playing
            && self.paused_remaining_ms.is_none()
            && self
                .round_ends_at_ms
                .is_some_and(|ends_at| ends_at <= now_ms)
        {
            self.round_ends_at_ms = None;
            self.paused_remaining_ms = Some(0);
        }
    }

    pub fn reveal(&mut self) -> Result<ShadowAllianceRoundResult, ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Playing {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        let command = self.command.ok_or(ShadowAllianceError::InvalidPhase)?;
        let result = compute_shadow_alliance_round(
            self.current_round,
            command,
            &self.participants,
            &self.submissions,
        );
        for participant in self.participants.values_mut() {
            let gain = result
                .players
                .iter()
                .find(|player| player.student_id == participant.student_id)
                .map(|player| player.gain)
                .unwrap_or(0);
            participant.last_gain = gain;
            participant.power = participant.power.saturating_add(gain);
            if matches!(
                participant.phase,
                ParticipantPhase::Joined | ParticipantPhase::Ready
            ) && result.winner == Some(participant.team)
            {
                participant.round_wins = participant.round_wins.saturating_add(1);
            }
        }
        self.history.push(result.clone());
        self.phase = ShadowAlliancePhase::Revealing;
        self.round_ends_at_ms = None;
        self.paused_remaining_ms = None;
        self.bump_version();
        Ok(result)
    }

    pub fn move_to_postround(&mut self) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Revealing {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        self.phase = ShadowAlliancePhase::Postround;
        self.bump_version();
        Ok(())
    }

    pub fn next_round(&mut self, now_ms: i64) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Postround || self.current_round >= self.total_rounds {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        self.current_round = self.current_round.saturating_add(1);
        self.begin_round(now_ms);
        self.bump_version();
        Ok(())
    }

    pub fn finish(&mut self) -> Result<(), ShadowAllianceError> {
        if self.phase != ShadowAlliancePhase::Postround || self.current_round < self.total_rounds {
            return Err(ShadowAllianceError::InvalidPhase);
        }
        self.phase = ShadowAlliancePhase::Finished;
        self.terminal_reason = Some(TerminalReason::Completed);
        self.command = None;
        self.submissions.clear();
        self.round_ends_at_ms = None;
        self.paused_remaining_ms = None;
        self.bump_version();
        Ok(())
    }

    pub fn host_end(&mut self) -> Result<(), ShadowAllianceError> {
        if self.phase.is_terminal() {
            return Err(ShadowAllianceError::SessionTerminal);
        }
        self.phase = ShadowAlliancePhase::HostEnded;
        self.terminal_reason = Some(TerminalReason::HostEnded);
        self.command = None;
        self.submissions.clear();
        self.round_ends_at_ms = None;
        self.paused_remaining_ms = None;
        self.bump_version();
        Ok(())
    }

    pub fn time_left_ms(&self, now_ms: i64) -> u64 {
        if self.phase != ShadowAlliancePhase::Playing {
            return 0;
        }
        if let Some(remaining) = self.paused_remaining_ms {
            return remaining;
        }
        self.round_ends_at_ms
            .map(|ends_at| u64::try_from(ends_at.saturating_sub(now_ms)).unwrap_or(0))
            .unwrap_or(0)
    }

    pub fn timer_running(&self, now_ms: i64) -> bool {
        self.phase == ShadowAlliancePhase::Playing
            && self.paused_remaining_ms.is_none()
            && self.time_left_ms(now_ms) > 0
    }

    pub fn result_for(
        &self,
        student_id: &str,
    ) -> Result<ShadowAlliancePlayerResult, ShadowAllianceError> {
        let participant = self
            .participants
            .get(student_id)
            .ok_or(ShadowAllianceError::ParticipantNotInvited)?;
        if participant.phase == ParticipantPhase::Invited {
            return Err(ShadowAllianceError::ParticipantNotJoined);
        }
        if participant.team == AllianceTeam::Unassigned {
            return Err(ShadowAllianceError::ParticipantNotJoined);
        }
        let outcome = if participant.phase == ParticipantPhase::Forfeited {
            GameOutcome::Forfeit
        } else {
            match self.phase {
                ShadowAlliancePhase::Finished => GameOutcome::Completed,
                ShadowAlliancePhase::HostEnded => GameOutcome::HostEnded,
                _ => return Err(ShadowAllianceError::SessionNotTerminal),
            }
        };
        let rank = self
            .rankings()
            .iter()
            .position(|candidate| candidate.student_id == student_id)
            .map(|index| u32::try_from(index + 1).unwrap_or(u32::MAX))
            .ok_or(ShadowAllianceError::ParticipantNotInvited)?;
        Ok(ShadowAlliancePlayerResult {
            outcome,
            score: participant.power,
            rank,
            team: participant.team,
            round_wins: participant.round_wins,
            completed_rounds: u32::try_from(self.history.len()).unwrap_or(u32::MAX),
            total_rounds: self.total_rounds,
        })
    }

    pub fn rankings(&self) -> Vec<&ShadowAllianceParticipant> {
        let mut participants = self
            .participants
            .values()
            .filter(|participant| participant.phase != ParticipantPhase::Invited)
            .collect::<Vec<_>>();
        participants.sort_by(|left, right| {
            right
                .power
                .cmp(&left.power)
                .then_with(|| left.join_order.cmp(&right.join_order))
        });
        participants
    }

    fn begin_round(&mut self, now_ms: i64) {
        self.phase = ShadowAlliancePhase::Playing;
        self.command = Some(command_for_round(self.command_seed, self.current_round));
        self.submissions.clear();
        self.paused_remaining_ms = None;
        self.round_ends_at_ms = Some(add_ms(now_ms, self.round_duration_ms));
        for participant in self.participants.values_mut() {
            participant.last_gain = 0;
        }
    }

    fn active_participants(&self) -> impl Iterator<Item = &ShadowAllianceParticipant> {
        self.participants.values().filter(|participant| {
            matches!(
                participant.phase,
                ParticipantPhase::Joined | ParticipantPhase::Ready
            )
        })
    }

    fn joined_team_counts(&self) -> (usize, usize) {
        self.active_participants()
            .fold((0, 0), |counts, participant| match participant.team {
                AllianceTeam::Black => (counts.0 + 1, counts.1),
                AllianceTeam::White => (counts.0, counts.1 + 1),
                AllianceTeam::Unassigned => counts,
            })
    }

    fn bump_version(&mut self) {
        self.version = self.version.saturating_add(1);
    }
}

pub fn compute_shadow_alliance_round(
    round: u32,
    command: u32,
    participants: &BTreeMap<String, ShadowAllianceParticipant>,
    submissions: &BTreeMap<String, u32>,
) -> ShadowAllianceRoundResult {
    let black = submitted_team_stats(AllianceTeam::Black, participants, submissions, command);
    let white = submitted_team_stats(AllianceTeam::White, participants, submissions, command);
    let winner = match (black.count, white.count) {
        (0, 0) => None,
        (0, _) => Some(AllianceTeam::White),
        (_, 0) => Some(AllianceTeam::Black),
        _ => {
            let left = black.distance_numerator.saturating_mul(white.count);
            let right = white.distance_numerator.saturating_mul(black.count);
            if left == right {
                None
            } else if left < right {
                Some(AllianceTeam::Black)
            } else {
                Some(AllianceTeam::White)
            }
        }
    };
    let gains = winner
        .map(|team| {
            allocate_rewards(
                participants
                    .values()
                    .filter(|participant| participant.team == team)
                    .filter_map(|participant| {
                        submissions
                            .get(&participant.student_id)
                            .map(|number| (participant.student_id.clone(), *number))
                    })
                    .collect(),
            )
        })
        .unwrap_or_default();
    let players = participants
        .values()
        .filter(|participant| participant.phase != ParticipantPhase::Invited)
        .map(|participant| ShadowAllianceRoundPlayer {
            student_id: participant.student_id.clone(),
            team: participant.team,
            number: submissions.get(&participant.student_id).copied(),
            gain: gains.get(&participant.student_id).copied().unwrap_or(0),
        })
        .collect();
    ShadowAllianceRoundResult {
        round,
        command,
        winner,
        black_average: rounded_average(black.sum, black.count),
        white_average: rounded_average(white.sum, white.count),
        black_difference: rounded_difference(black.sum, black.count, command),
        white_difference: rounded_difference(white.sum, white.count, command),
        players,
    }
}

#[derive(Debug, Clone, Copy)]
struct TeamStats {
    sum: u64,
    count: u64,
    distance_numerator: u64,
}

fn submitted_team_stats(
    team: AllianceTeam,
    participants: &BTreeMap<String, ShadowAllianceParticipant>,
    submissions: &BTreeMap<String, u32>,
    command: u32,
) -> TeamStats {
    let (sum, count) = participants
        .values()
        .filter(|participant| participant.team == team)
        .filter_map(|participant| submissions.get(&participant.student_id))
        .fold((0_u64, 0_u64), |(sum, count), number| {
            (sum.saturating_add(u64::from(*number)), count + 1)
        });
    let target = u64::from(command).saturating_mul(count);
    TeamStats {
        sum,
        count,
        distance_numerator: sum.abs_diff(target),
    }
}

fn allocate_rewards(players: Vec<(String, u32)>) -> BTreeMap<String, u64> {
    let total = players
        .iter()
        .map(|(_, number)| u64::from(*number))
        .sum::<u64>();
    if total == 0 {
        return BTreeMap::new();
    }
    let mut allocations = players
        .into_iter()
        .map(|(student_id, number)| {
            let numerator = ROUND_REWARD_POOL.saturating_mul(u64::from(number));
            (student_id, numerator / total, numerator % total)
        })
        .collect::<Vec<_>>();
    let allocated = allocations.iter().map(|(_, floor, _)| *floor).sum::<u64>();
    let remaining = ROUND_REWARD_POOL.saturating_sub(allocated);
    allocations.sort_by(|left, right| right.2.cmp(&left.2).then_with(|| left.0.cmp(&right.0)));
    allocations
        .into_iter()
        .enumerate()
        .map(|(index, (student_id, floor, _))| {
            let bonus = u64::from(u64::try_from(index).unwrap_or(u64::MAX) < remaining);
            (student_id, floor.saturating_add(bonus))
        })
        .collect()
}

fn rounded_average(sum: u64, count: u64) -> Option<f64> {
    (count > 0).then(|| round_one_decimal(sum as f64 / count as f64))
}

fn rounded_difference(sum: u64, count: u64, command: u32) -> Option<f64> {
    (count > 0).then(|| round_one_decimal((sum as f64 / count as f64 - f64::from(command)).abs()))
}

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn command_for_round(seed: u64, round: u32) -> u32 {
    let mixed = seed
        .wrapping_add(u64::from(round).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .rotate_left(round % 63);
    MIN_COMMAND + u32::try_from(mixed % COMMAND_SPAN).unwrap_or(0)
}

fn add_ms(now_ms: i64, duration_ms: u64) -> i64 {
    now_ms.saturating_add(i64::try_from(duration_ms).unwrap_or(i64::MAX))
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ShadowAllianceError {
    #[error("invalid round count")]
    InvalidRoundCount,
    #[error("missing student id")]
    MissingStudentId,
    #[error("too many participants")]
    TooManyParticipants,
    #[error("participant not invited")]
    ParticipantNotInvited,
    #[error("participant not joined")]
    ParticipantNotJoined,
    #[error("participant forfeited")]
    ParticipantForfeited,
    #[error("not enough participants")]
    NotEnoughParticipants,
    #[error("participants not ready")]
    ParticipantsNotReady,
    #[error("teams not balanced")]
    TeamsNotBalanced,
    #[error("invalid settings")]
    InvalidSettings,
    #[error("invalid number")]
    InvalidNumber,
    #[error("already submitted")]
    AlreadySubmitted,
    #[error("round expired")]
    RoundExpired,
    #[error("invalid phase")]
    InvalidPhase,
    #[error("session terminal")]
    SessionTerminal,
    #[error("session not terminal")]
    SessionNotTerminal,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct ParityFixture {
        version: u32,
        cases: Vec<ParityCase>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ParityCase {
        name: String,
        command: u32,
        players: Vec<ParityPlayer>,
        expected: ParityExpected,
    }

    #[derive(Deserialize)]
    struct ParityPlayer {
        id: String,
        team: AllianceTeam,
        number: Option<u32>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ParityExpected {
        winner: String,
        black_average: Option<f64>,
        white_average: Option<f64>,
        black_difference: Option<f64>,
        white_difference: Option<f64>,
        gains: BTreeMap<String, u64>,
    }

    fn participant(
        id: &str,
        team: AllianceTeam,
        number: Option<u32>,
    ) -> (String, ShadowAllianceParticipant, Option<(String, u32)>) {
        (
            id.to_owned(),
            ShadowAllianceParticipant {
                student_id: id.to_owned(),
                join_order: 0,
                team,
                phase: ParticipantPhase::Ready,
                power: 0,
                last_gain: 0,
                round_wins: 0,
            },
            number.map(|value| (id.to_owned(), value)),
        )
    }

    #[test]
    fn shared_json_parity_fixture_matches_rust_engine() {
        let fixture: ParityFixture = serde_json::from_str(include_str!(
            "../../../contracts/shadow-alliance-parity-v1.json"
        ))
        .unwrap();
        assert_eq!(fixture.version, 1);
        for test_case in fixture.cases {
            let participants = test_case
                .players
                .iter()
                .enumerate()
                .map(|(index, player)| {
                    (
                        player.id.clone(),
                        ShadowAllianceParticipant {
                            student_id: player.id.clone(),
                            join_order: u32::try_from(index).unwrap(),
                            team: player.team,
                            phase: ParticipantPhase::Ready,
                            power: 0,
                            last_gain: 0,
                            round_wins: 0,
                        },
                    )
                })
                .collect();
            let submissions = test_case
                .players
                .iter()
                .filter_map(|player| player.number.map(|number| (player.id.clone(), number)))
                .collect();
            let result =
                compute_shadow_alliance_round(1, test_case.command, &participants, &submissions);
            let winner = result.winner.map(|team| match team {
                AllianceTeam::Black => "black",
                AllianceTeam::White => "white",
                AllianceTeam::Unassigned => "unassigned",
            });
            let gains = result
                .players
                .iter()
                .map(|player| (player.student_id.clone(), player.gain))
                .collect::<BTreeMap<_, _>>();
            assert_eq!(
                winner.unwrap_or("tie"),
                test_case.expected.winner,
                "{} winner",
                test_case.name
            );
            assert_eq!(
                result.black_average, test_case.expected.black_average,
                "{} black average",
                test_case.name
            );
            assert_eq!(
                result.white_average, test_case.expected.white_average,
                "{} white average",
                test_case.name
            );
            assert_eq!(
                result.black_difference, test_case.expected.black_difference,
                "{} black difference",
                test_case.name
            );
            assert_eq!(
                result.white_difference, test_case.expected.white_difference,
                "{} white difference",
                test_case.name
            );
            assert_eq!(gains, test_case.expected.gains, "{} gains", test_case.name);
        }
    }

    #[test]
    fn proportional_rewards_match_the_shared_parity_fixture() {
        let rows = [
            participant("black-1", AllianceTeam::Black, Some(44)),
            participant("black-2", AllianceTeam::Black, Some(46)),
            participant("white-1", AllianceTeam::White, Some(70)),
        ];
        let participants = rows
            .iter()
            .map(|(id, participant, _)| (id.clone(), participant.clone()))
            .collect();
        let submissions = rows
            .into_iter()
            .filter_map(|(_, _, submission)| submission)
            .collect();
        let result = compute_shadow_alliance_round(1, 45, &participants, &submissions);
        assert_eq!(result.winner, Some(AllianceTeam::Black));
        assert_eq!(result.black_average, Some(45.0));
        assert_eq!(result.white_difference, Some(25.0));
        let gains = result
            .players
            .iter()
            .map(|player| (player.student_id.as_str(), player.gain))
            .collect::<BTreeMap<_, _>>();
        assert_eq!(gains["black-1"], 4_889);
        assert_eq!(gains["black-2"], 5_111);
        assert_eq!(gains["white-1"], 0);
    }

    #[test]
    fn exact_rational_ties_do_not_allocate_rewards() {
        let rows = [
            participant("black-1", AllianceTeam::Black, Some(27)),
            participant("black-2", AllianceTeam::Black, Some(28)),
            participant("black-3", AllianceTeam::Black, Some(28)),
            participant("white-1", AllianceTeam::White, Some(32)),
            participant("white-2", AllianceTeam::White, Some(32)),
            participant("white-3", AllianceTeam::White, Some(33)),
        ];
        let participants = rows
            .iter()
            .map(|(id, participant, _)| (id.clone(), participant.clone()))
            .collect();
        let submissions = rows
            .into_iter()
            .filter_map(|(_, _, submission)| submission)
            .collect();
        let result = compute_shadow_alliance_round(1, 30, &participants, &submissions);
        assert_eq!(result.winner, None);
        assert_eq!(result.black_difference, Some(2.3));
        assert_eq!(result.white_difference, Some(2.3));
        assert!(result.players.iter().all(|player| player.gain == 0));
    }

    #[test]
    fn largest_remainder_breaks_ties_by_student_id() {
        let rows = [
            participant("zulu", AllianceTeam::Black, Some(1)),
            participant("alpha", AllianceTeam::Black, Some(1)),
            participant("mike", AllianceTeam::Black, Some(1)),
            participant("white", AllianceTeam::White, None),
        ];
        let participants = rows
            .iter()
            .map(|(id, participant, _)| (id.clone(), participant.clone()))
            .collect();
        let submissions = rows
            .into_iter()
            .filter_map(|(_, _, submission)| submission)
            .collect();
        let result = compute_shadow_alliance_round(1, 30, &participants, &submissions);
        let gains = result
            .players
            .iter()
            .map(|player| (player.student_id.as_str(), player.gain))
            .collect::<BTreeMap<_, _>>();
        assert_eq!(gains["alpha"], 3_334);
        assert_eq!(gains["mike"], 3_333);
        assert_eq!(gains["zulu"], 3_333);
    }

    #[test]
    fn deadline_materializes_without_inventing_a_winner() {
        let mut state = ShadowAllianceState::new(1, 7).unwrap();
        for id in ["a", "b"] {
            state.invite(id.into()).unwrap();
            state.join(id).unwrap();
            state.ready(id).unwrap();
        }
        state.update_settings(true, 10).unwrap();
        state.start(100).unwrap();
        state.materialize_deadline(10_100);
        assert_eq!(state.time_left_ms(10_100), 0);
        assert!(!state.timer_running(10_100));
        assert_eq!(state.phase, ShadowAlliancePhase::Playing);
        assert!(state.history.is_empty());
        assert_eq!(state.paused_remaining_ms, Some(0));
    }

    #[test]
    fn forfeited_participant_does_not_gain_later_round_wins() {
        let mut state = ShadowAllianceState::new(1, 7).unwrap();
        for id in ["a", "b", "c"] {
            state.invite(id.into()).unwrap();
            state.join(id).unwrap();
            state.ready(id).unwrap();
        }
        state.start(100).unwrap();
        state.forfeit("a").unwrap();
        state.submit_number("b", 30, 110).unwrap();
        state.submit_number("c", 100, 110).unwrap();
        let forfeited_team = state.participants["a"].team;
        let result = state.reveal().unwrap();
        assert_ne!(result.winner, None);
        if result.winner == Some(forfeited_team) {
            assert_eq!(state.participants["a"].round_wins, 0);
        }
    }

    #[test]
    fn lifecycle_keeps_numbers_private_until_reveal() {
        let mut state = ShadowAllianceState::new(1, 7).unwrap();
        for id in ["a", "b"] {
            state.invite(id.into()).unwrap();
            state.join(id).unwrap();
            state.ready(id).unwrap();
        }
        state.start(100).unwrap();
        state.submit_number("a", 40, 110).unwrap();
        state.submit_number("b", 60, 110).unwrap();
        assert_eq!(state.submissions["a"], 40);
        let result = state.reveal().unwrap();
        assert_eq!(result.players.len(), 2);
        state.move_to_postround().unwrap();
        state.finish().unwrap();
        assert_eq!(state.phase, ShadowAlliancePhase::Finished);
        assert_eq!(state.result_for("a").unwrap().completed_rounds, 1);
    }
}
