use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use crate::{DomainError, DomainResult};

#[path = "song_guess_choices.rs"]
mod choices;
pub use choices::{SongGuessAnswerMode, SongGuessChoice, SongGuessSelection};

pub const SONG_GUESS_RULES_VERSION: u16 = 2;
pub const SONG_GUESS_STATE_SCHEMA_VERSION: u16 = 2;
pub const SONG_GUESS_LEGACY_RULES_VERSION: u16 = 1;
pub const SONG_GUESS_LEGACY_STATE_SCHEMA_VERSION: u16 = 1;
pub const SONG_GUESS_CLIP_TIERS_MS: [u32; 3] = [500, 1_000, 1_500];
pub const SONG_GUESS_LONG_CLIP_TIER_MS: u32 = 15_000;
pub const SONG_GUESS_CLIP_SCORES: [u32; 3] = [1_000, 700, 400];
pub const SONG_GUESS_ANSWER_WINDOW_MS: i64 = 30_000;
pub const SONG_GUESS_MAX_SCORE: u32 = 1_000;
pub const SONG_GUESS_MIN_SCORE: u32 = 100;
pub const SONG_GUESS_MAX_ROUNDS: usize = 50;
pub const SONG_GUESS_MAX_CLIP_SIZE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SongGuessPhase {
    Draft,
    Lobby,
    Guessing,
    Reveal,
    Finished,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessClip {
    pub asset_id: String,
    pub tier_ms: u32,
    pub mime_type: String,
    pub size_bytes: u64,
    pub duration_ms: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessParticipantSeed {
    pub actor_subject: String,
    pub display_name: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessRoundSeed {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<SongGuessChoice>,
    pub round_id: String,
    pub representative_answer: String,
    pub normalized_answer: String,
    pub aliases: Vec<String>,
    pub normalized_aliases: Vec<String>,
    pub accessibility_clue: Option<String>,
    pub clips: Vec<SongGuessClip>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessParticipant {
    pub actor_subject: String,
    pub display_name: String,
    pub score: u32,
    /// Legacy persisted sessions did not track lobby entry; those states
    /// deserialize as joined so they remain playable after the upgrade.
    #[serde(default = "default_joined")]
    pub joined: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessRoundScore {
    pub actor_subject: String,
    pub score: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessRound {
    #[serde(default)]
    pub choices: Vec<SongGuessChoice>,
    #[serde(default)]
    pub selections: Vec<SongGuessSelection>,
    pub round_id: String,
    pub order: u32,
    pub representative_answer: String,
    pub normalized_answer: String,
    pub aliases: Vec<String>,
    pub normalized_aliases: Vec<String>,
    pub accessibility_clue: Option<String>,
    pub clips: Vec<SongGuessClip>,
    pub unlocked_tier_ms: u32,
    pub correct_participants: Vec<String>,
    /// Authoritative points earned by each participant in this round.
    ///
    /// This is kept separately from the cumulative participant score so a
    /// reveal snapshot can show round points and calculate movement after a
    /// reload. The default keeps pre-v2 persisted sessions readable.
    #[serde(default)]
    pub round_scores: Vec<SongGuessRoundScore>,
    #[serde(default)]
    pub started_at_ms: Option<i64>,
    #[serde(default)]
    pub deadline_at_ms: Option<i64>,
    #[serde(default = "default_max_score")]
    pub max_score: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessState {
    #[serde(default)]
    pub answer_mode: SongGuessAnswerMode,
    pub phase: SongGuessPhase,
    pub participants: Vec<SongGuessParticipant>,
    pub current_round_index: u32,
    pub rounds: Vec<SongGuessRound>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessGuessResult {
    pub round_id: String,
    pub tier_ms: u32,
    pub correct: bool,
    pub already_scored: bool,
    pub score: u32,
    #[serde(default)]
    pub timed_out: bool,
}

pub fn normalize_answer(value: &str) -> String {
    let mut result = String::new();
    let mut pending_space = false;
    for character in value
        .nfkc()
        .filter(|character| !matches!(*character, '\u{200b}'..='\u{200d}' | '\u{feff}'))
        .flat_map(char::to_lowercase)
    {
        if character.is_whitespace() {
            pending_space = !result.is_empty();
            continue;
        }
        if pending_space {
            result.push(' ');
            pending_space = false;
        }
        result.push(character);
    }
    result
}

pub fn score_for_tier(tier_ms: u32) -> DomainResult<u32> {
    match tier_ms {
        500 => Ok(1_000),
        1_000 => Ok(700),
        1_500 => Ok(400),
        _ => Err(DomainError::InvalidValue),
    }
}

fn default_max_score() -> u32 {
    SONG_GUESS_MAX_SCORE
}

fn default_joined() -> bool {
    true
}

impl SongGuessState {
    pub fn new(
        participants: Vec<SongGuessParticipantSeed>,
        rounds: Vec<SongGuessRoundSeed>,
    ) -> DomainResult<Self> {
        if participants.is_empty()
            || participants.len() > 100
            || rounds.is_empty()
            || rounds.len() > SONG_GUESS_MAX_ROUNDS
        {
            return Err(DomainError::InvalidValue);
        }

        let mut actor_subjects = HashSet::new();
        let participants = participants
            .into_iter()
            .map(|participant| {
                if participant.actor_subject.is_empty()
                    || participant.actor_subject.len() > 255
                    || !actor_subjects.insert(participant.actor_subject.clone())
                    || participant.display_name.trim().is_empty()
                    || participant.display_name.chars().count() > 100
                {
                    return Err(DomainError::InvalidValue);
                }
                Ok(SongGuessParticipant {
                    actor_subject: participant.actor_subject,
                    display_name: participant.display_name,
                    score: 0,
                    joined: false,
                })
            })
            .collect::<DomainResult<Vec<_>>>()?;

        let answer_mode = if rounds.iter().any(|round| !round.choices.is_empty()) {
            SongGuessAnswerMode::MultipleChoice
        } else {
            SongGuessAnswerMode::Text
        };
        let rounds = rounds
            .into_iter()
            .enumerate()
            .map(|(index, round)| {
                validate_round_seed(&round)?;
                let unlocked_tier_ms = round
                    .clips
                    .iter()
                    .map(|clip| clip.tier_ms)
                    .min()
                    .ok_or(DomainError::InvalidValue)?;
                Ok(SongGuessRound {
                    choices: round.choices,
                    selections: Vec::new(),
                    round_id: round.round_id,
                    order: u32::try_from(index).map_err(|_| DomainError::InvalidValue)?,
                    representative_answer: round.representative_answer,
                    normalized_answer: round.normalized_answer,
                    aliases: round.aliases,
                    normalized_aliases: round.normalized_aliases,
                    accessibility_clue: round.accessibility_clue,
                    clips: round.clips,
                    unlocked_tier_ms,
                    correct_participants: Vec::new(),
                    round_scores: Vec::new(),
                    started_at_ms: None,
                    deadline_at_ms: None,
                    max_score: SONG_GUESS_MAX_SCORE,
                })
            })
            .collect::<DomainResult<Vec<_>>>()?;

        let state = Self {
            answer_mode,
            phase: SongGuessPhase::Draft,
            participants,
            current_round_index: 0,
            rounds,
        };
        state.validate()?;
        Ok(state)
    }

    pub fn validate(&self) -> DomainResult<()> {
        if self.participants.is_empty()
            || self.participants.len() > 100
            || self.rounds.is_empty()
            || self.rounds.len() > SONG_GUESS_MAX_ROUNDS
            || usize::try_from(self.current_round_index)
                .ok()
                .filter(|index| *index < self.rounds.len())
                .is_none()
        {
            return Err(DomainError::InvalidState);
        }

        let participant_subjects = self
            .participants
            .iter()
            .map(|participant| participant.actor_subject.as_str())
            .collect::<HashSet<_>>();
        if participant_subjects.len() != self.participants.len()
            || self.participants.iter().any(|participant| {
                participant.actor_subject.is_empty()
                    || participant.display_name.trim().is_empty()
                    || participant.display_name.chars().count() > 100
            })
        {
            return Err(DomainError::InvalidState);
        }

        let mut round_ids = HashSet::new();
        for (index, round) in self.rounds.iter().enumerate() {
            if round.order != u32::try_from(index).map_err(|_| DomainError::InvalidState)? {
                return Err(DomainError::InvalidState);
            }
            if !round_ids.insert(round.round_id.as_str()) {
                return Err(DomainError::InvalidState);
            }
            validate_round(round)?;
            choices::validate_choices(self.answer_mode, round, &participant_subjects)?;
            if round
                .correct_participants
                .iter()
                .any(|subject| !participant_subjects.contains(subject.as_str()))
                || round.correct_participants.len()
                    != round
                        .correct_participants
                        .iter()
                        .collect::<HashSet<_>>()
                        .len()
            {
                return Err(DomainError::InvalidState);
            }
            let mut round_score_subjects = HashSet::new();
            if round.round_scores.iter().any(|entry| {
                !participant_subjects.contains(entry.actor_subject.as_str())
                    || !round
                        .correct_participants
                        .iter()
                        .any(|subject| subject == &entry.actor_subject)
                    || !round_score_subjects.insert(entry.actor_subject.as_str())
                    || entry.score > round.max_score
            }) {
                return Err(DomainError::InvalidState);
            }
            if matches!(self.phase, SongGuessPhase::Draft | SongGuessPhase::Lobby)
                && round.unlocked_tier_ms
                    != round
                        .clips
                        .iter()
                        .map(|clip| clip.tier_ms)
                        .min()
                        .unwrap_or(0)
            {
                return Err(DomainError::InvalidState);
            }
            if round.max_score != SONG_GUESS_MAX_SCORE
                || round.started_at_ms.is_some() != round.deadline_at_ms.is_some()
                || round.started_at_ms.zip(round.deadline_at_ms).is_some_and(
                    |(started, deadline)| {
                        deadline < started || deadline - started != SONG_GUESS_ANSWER_WINDOW_MS
                    },
                )
            {
                return Err(DomainError::InvalidState);
            }
        }
        Ok(())
    }

    pub fn open_lobby(&mut self) -> DomainResult<()> {
        self.validate()?;
        if self.phase != SongGuessPhase::Draft {
            return Err(DomainError::InvalidPhase);
        }
        self.phase = SongGuessPhase::Lobby;
        Ok(())
    }

    pub fn start(&mut self) -> DomainResult<()> {
        self.start_internal(None)
    }

    pub fn start_at(&mut self, server_time_ms: i64) -> DomainResult<()> {
        self.start_internal(Some(server_time_ms))
    }

    fn start_internal(&mut self, server_time_ms: Option<i64>) -> DomainResult<()> {
        self.validate()?;
        if self.phase != SongGuessPhase::Lobby {
            return Err(DomainError::InvalidPhase);
        }
        if !self
            .participants
            .iter()
            .any(|participant| participant.joined)
        {
            return Err(DomainError::ParticipantsNotReady);
        }
        self.phase = SongGuessPhase::Guessing;
        let round = self.current_round_mut()?;
        if let Some(started_at_ms) = server_time_ms {
            round.started_at_ms = Some(started_at_ms);
            round.deadline_at_ms = Some(
                started_at_ms
                    .checked_add(SONG_GUESS_ANSWER_WINDOW_MS)
                    .ok_or(DomainError::InvalidState)?,
            );
        } else {
            round.started_at_ms = None;
            round.deadline_at_ms = None;
        }
        Ok(())
    }

    pub fn join(&mut self, actor_subject: &str) -> DomainResult<()> {
        self.validate()?;
        if self.phase != SongGuessPhase::Lobby {
            return Err(DomainError::InvalidPhase);
        }
        let participant = self
            .participants
            .iter_mut()
            .find(|participant| participant.actor_subject == actor_subject)
            .ok_or(DomainError::UnknownParticipant)?;
        participant.joined = true;
        Ok(())
    }

    pub fn unlock_clip(&mut self) -> DomainResult<u32> {
        self.validate()?;
        if self.phase != SongGuessPhase::Guessing {
            return Err(DomainError::InvalidPhase);
        }
        let round = self.current_round_mut()?;
        let next = round
            .clips
            .iter()
            .map(|clip| clip.tier_ms)
            .filter(|tier| *tier > round.unlocked_tier_ms)
            .min()
            .ok_or(DomainError::InvalidValue)?;
        round.unlocked_tier_ms = next;
        Ok(next)
    }

    pub fn reveal(&mut self) -> DomainResult<()> {
        self.validate()?;
        if self.phase != SongGuessPhase::Guessing {
            return Err(DomainError::InvalidPhase);
        }
        self.phase = SongGuessPhase::Reveal;
        Ok(())
    }

    pub fn next_round(&mut self) -> DomainResult<()> {
        self.next_round_internal(None)
    }

    pub fn next_round_at(&mut self, server_time_ms: i64) -> DomainResult<()> {
        self.next_round_internal(Some(server_time_ms))
    }

    fn next_round_internal(&mut self, server_time_ms: Option<i64>) -> DomainResult<()> {
        self.validate()?;
        if self.phase != SongGuessPhase::Reveal {
            return Err(DomainError::InvalidPhase);
        }
        let next = self
            .current_round_index
            .checked_add(1)
            .ok_or(DomainError::InvalidState)?;
        if usize::try_from(next).map_err(|_| DomainError::InvalidState)? >= self.rounds.len() {
            return Err(DomainError::InvalidPhase);
        }
        self.current_round_index = next;
        self.phase = SongGuessPhase::Guessing;
        let round = self.current_round_mut()?;
        if let Some(started_at_ms) = server_time_ms {
            round.started_at_ms = Some(started_at_ms);
            round.deadline_at_ms = Some(
                started_at_ms
                    .checked_add(SONG_GUESS_ANSWER_WINDOW_MS)
                    .ok_or(DomainError::InvalidState)?,
            );
        } else {
            round.started_at_ms = None;
            round.deadline_at_ms = None;
        }
        Ok(())
    }

    pub fn finish(&mut self) -> DomainResult<()> {
        self.validate()?;
        if self.phase != SongGuessPhase::Reveal {
            return Err(DomainError::InvalidPhase);
        }
        self.phase = SongGuessPhase::Finished;
        Ok(())
    }

    pub fn guess(
        &mut self,
        actor_subject: &str,
        submitted: &str,
    ) -> DomainResult<SongGuessGuessResult> {
        if self.answer_mode != SongGuessAnswerMode::Text {
            return Err(DomainError::InvalidValue);
        }
        self.guess_internal(actor_subject, submitted, None)
    }

    pub fn guess_at(
        &mut self,
        actor_subject: &str,
        submitted: &str,
        server_time_ms: i64,
    ) -> DomainResult<SongGuessGuessResult> {
        if self.answer_mode != SongGuessAnswerMode::Text {
            return Err(DomainError::InvalidValue);
        }
        self.guess_internal(actor_subject, submitted, Some(server_time_ms))
    }

    fn guess_internal(
        &mut self,
        actor_subject: &str,
        submitted: &str,
        server_time_ms: Option<i64>,
    ) -> DomainResult<SongGuessGuessResult> {
        self.validate()?;
        if self.phase != SongGuessPhase::Guessing || submitted.chars().count() > 200 {
            return Err(DomainError::InvalidPhase);
        }
        let participant_exists = self
            .participants
            .iter()
            .any(|participant| participant.actor_subject == actor_subject);
        if !participant_exists {
            return Err(DomainError::UnknownParticipant);
        }
        if !self
            .participants
            .iter()
            .any(|participant| participant.actor_subject == actor_subject && participant.joined)
        {
            return Err(DomainError::NotJoined);
        }

        let round = self.current_round_mut()?;
        let already_scored = round
            .correct_participants
            .iter()
            .any(|subject| subject == actor_subject);
        let tier_ms = round.unlocked_tier_ms;
        let round_id = round.round_id.clone();
        let timed_out = match (round.started_at_ms, round.deadline_at_ms, server_time_ms) {
            (Some(started_at_ms), Some(deadline_at_ms), Some(now_ms)) => {
                if now_ms < started_at_ms {
                    return Err(DomainError::InvalidValue);
                }
                now_ms >= deadline_at_ms
            }
            _ => false,
        };
        if already_scored {
            return Ok(SongGuessGuessResult {
                round_id,
                tier_ms,
                correct: true,
                already_scored: true,
                score: 0,
                timed_out: false,
            });
        }

        let normalized = normalize_answer(submitted);
        let correct = normalized == round.normalized_answer
            || round
                .normalized_aliases
                .iter()
                .any(|alias| alias == &normalized);
        if !correct {
            return Ok(SongGuessGuessResult {
                round_id,
                tier_ms,
                correct: false,
                already_scored: false,
                score: 0,
                timed_out,
            });
        }

        let score = match (round.started_at_ms, server_time_ms) {
            (Some(started_at_ms), Some(now_ms)) if !timed_out => speed_score(
                round.max_score,
                now_ms
                    .checked_sub(started_at_ms)
                    .ok_or(DomainError::InvalidValue)?,
            )?,
            _ if timed_out => 0,
            _ => score_for_tier(tier_ms)?,
        };
        if timed_out {
            return Ok(SongGuessGuessResult {
                round_id,
                tier_ms,
                correct: true,
                already_scored: false,
                score: 0,
                timed_out: true,
            });
        }
        round.correct_participants.push(actor_subject.to_owned());
        round.round_scores.push(SongGuessRoundScore {
            actor_subject: actor_subject.to_owned(),
            score,
        });
        let participant = self
            .participants
            .iter_mut()
            .find(|participant| participant.actor_subject == actor_subject)
            .ok_or(DomainError::UnknownParticipant)?;
        participant.score = participant
            .score
            .checked_add(score)
            .ok_or(DomainError::InvalidState)?;
        Ok(SongGuessGuessResult {
            round_id,
            tier_ms,
            correct: true,
            already_scored: false,
            score,
            timed_out: false,
        })
    }

    pub fn current_round(&self) -> DomainResult<&SongGuessRound> {
        self.rounds
            .get(usize::try_from(self.current_round_index).map_err(|_| DomainError::InvalidState)?)
            .ok_or(DomainError::InvalidState)
    }

    fn current_round_mut(&mut self) -> DomainResult<&mut SongGuessRound> {
        self.rounds
            .get_mut(
                usize::try_from(self.current_round_index).map_err(|_| DomainError::InvalidState)?,
            )
            .ok_or(DomainError::InvalidState)
    }
}

fn validate_round_seed(round: &SongGuessRoundSeed) -> DomainResult<()> {
    if round.round_id.is_empty()
        || round.round_id.len() > 128
        || round.representative_answer.trim().is_empty()
        || round.representative_answer.chars().count() > 200
        || round.normalized_answer != normalize_answer(&round.representative_answer)
        || round.aliases.len() != round.normalized_aliases.len()
        || round.aliases.len() > 20
        || round
            .accessibility_clue
            .as_ref()
            .is_some_and(|clue| clue.chars().count() > 500)
    {
        return Err(DomainError::InvalidValue);
    }
    let mut aliases = HashSet::new();
    for (alias, normalized) in round.aliases.iter().zip(&round.normalized_aliases) {
        if alias.trim().is_empty()
            || alias.chars().count() > 200
            || normalized != &normalize_answer(alias)
            || !aliases.insert(normalized)
        {
            return Err(DomainError::InvalidValue);
        }
    }
    let tiers = round
        .clips
        .iter()
        .map(|clip| clip.tier_ms)
        .collect::<HashSet<_>>();
    let valid_pack = (round.clips.len() == SONG_GUESS_CLIP_TIERS_MS.len()
        && tiers.len() == SONG_GUESS_CLIP_TIERS_MS.len()
        && SONG_GUESS_CLIP_TIERS_MS
            .iter()
            .all(|tier| tiers.contains(tier)))
        || (round.clips.len() == 1 && tiers.contains(&SONG_GUESS_LONG_CLIP_TIER_MS));
    if !valid_pack {
        return Err(DomainError::InvalidValue);
    }
    for clip in &round.clips {
        validate_clip(clip)?;
    }
    Ok(())
}

fn validate_round(round: &SongGuessRound) -> DomainResult<()> {
    validate_round_seed(&SongGuessRoundSeed {
        choices: Vec::new(),
        round_id: round.round_id.clone(),
        representative_answer: round.representative_answer.clone(),
        normalized_answer: round.normalized_answer.clone(),
        aliases: round.aliases.clone(),
        normalized_aliases: round.normalized_aliases.clone(),
        accessibility_clue: round.accessibility_clue.clone(),
        clips: round.clips.clone(),
    })?;
    if !round
        .clips
        .iter()
        .any(|clip| clip.tier_ms == round.unlocked_tier_ms)
    {
        return Err(DomainError::InvalidState);
    }
    Ok(())
}

fn validate_clip(clip: &SongGuessClip) -> DomainResult<()> {
    if clip.mime_type == "video/youtube" {
        if clip.tier_ms != SONG_GUESS_LONG_CLIP_TIER_MS
            || clip.duration_ms != SONG_GUESS_LONG_CLIP_TIER_MS
            || clip.size_bytes != 0
        {
            return Err(DomainError::InvalidValue);
        }
        return if validate_clip_identity(clip) {
            Ok(())
        } else {
            Err(DomainError::InvalidValue)
        };
    }
    let valid_mime = matches!(
        clip.mime_type.as_str(),
        "audio/wav" | "audio/mp4" | "audio/webm" | "audio/ogg"
    );
    let (minimum_duration, maximum_duration) = match clip.tier_ms {
        500 => (450, 550),
        1_000 => (950, 1_050),
        1_500 => (1_450, 1_550),
        15_000 => (14_950, 15_050),
        _ => return Err(DomainError::InvalidValue),
    };
    if !validate_clip_identity(clip)
        || !valid_mime
        || clip.size_bytes == 0
        || clip.size_bytes > SONG_GUESS_MAX_CLIP_SIZE_BYTES
        || clip.duration_ms < minimum_duration
        || clip.duration_ms > maximum_duration
    {
        return Err(DomainError::InvalidValue);
    }
    Ok(())
}

fn validate_clip_identity(clip: &SongGuessClip) -> bool {
    !clip.asset_id.is_empty()
        && clip.asset_id != "."
        && clip.asset_id != ".."
        && clip.asset_id.len() <= 255
        && clip
            .asset_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn speed_score(max_score: u32, elapsed_ms: i64) -> DomainResult<u32> {
    if !(0..SONG_GUESS_ANSWER_WINDOW_MS).contains(&elapsed_ms) {
        return Err(DomainError::InvalidValue);
    }
    let denominator = SONG_GUESS_ANSWER_WINDOW_MS as u64;
    let remaining = u64::from(max_score)
        .checked_mul(denominator)
        .and_then(|value| value.checked_sub((elapsed_ms as u64).checked_mul(900)?))
        .ok_or(DomainError::InvalidState)?;
    let rounded = (remaining + denominator / 2) / denominator;
    u32::try_from(rounded.max(u64::from(SONG_GUESS_MIN_SCORE)))
        .map_err(|_| DomainError::InvalidState)
}

#[cfg(test)]
#[path = "song_guess_tests.rs"]
mod tests;
