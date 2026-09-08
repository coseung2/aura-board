use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use crate::{DomainError, DomainResult};

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
        self.guess_internal(actor_subject, submitted, None)
    }

    pub fn guess_at(
        &mut self,
        actor_subject: &str,
        submitted: &str,
        server_time_ms: i64,
    ) -> DomainResult<SongGuessGuessResult> {
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
mod tests {
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
}
