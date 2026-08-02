use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use crate::{DomainError, DomainResult};

pub const SONG_GUESS_RULES_VERSION: u16 = 1;
pub const SONG_GUESS_STATE_SCHEMA_VERSION: u16 = 1;
pub const SONG_GUESS_CLIP_TIERS_MS: [u32; 3] = [500, 1_000, 1_500];
pub const SONG_GUESS_CLIP_SCORES: [u32; 3] = [1_000, 700, 400];
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
                })
            })
            .collect::<DomainResult<Vec<_>>>()?;

        let rounds = rounds
            .into_iter()
            .enumerate()
            .map(|(index, round)| {
                validate_round_seed(&round)?;
                Ok(SongGuessRound {
                    round_id: round.round_id,
                    order: u32::try_from(index).map_err(|_| DomainError::InvalidValue)?,
                    representative_answer: round.representative_answer,
                    normalized_answer: round.normalized_answer,
                    aliases: round.aliases,
                    normalized_aliases: round.normalized_aliases,
                    accessibility_clue: round.accessibility_clue,
                    clips: round.clips,
                    unlocked_tier_ms: SONG_GUESS_CLIP_TIERS_MS[0],
                    correct_participants: Vec::new(),
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

        for (index, round) in self.rounds.iter().enumerate() {
            if round.order != u32::try_from(index).map_err(|_| DomainError::InvalidState)? {
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
            if matches!(self.phase, SongGuessPhase::Draft | SongGuessPhase::Lobby)
                && round.unlocked_tier_ms != SONG_GUESS_CLIP_TIERS_MS[0]
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
        self.validate()?;
        if self.phase != SongGuessPhase::Lobby {
            return Err(DomainError::InvalidPhase);
        }
        self.phase = SongGuessPhase::Guessing;
        Ok(())
    }

    pub fn unlock_clip(&mut self) -> DomainResult<u32> {
        self.validate()?;
        if self.phase != SongGuessPhase::Guessing {
            return Err(DomainError::InvalidPhase);
        }
        let round = self.current_round_mut()?;
        let next = match round.unlocked_tier_ms {
            500 => 1_000,
            1_000 => 1_500,
            1_500 => return Err(DomainError::InvalidValue),
            _ => return Err(DomainError::InvalidState),
        };
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

        let round = self.current_round_mut()?;
        let already_scored = round
            .correct_participants
            .iter()
            .any(|subject| subject == actor_subject);
        let tier_ms = round.unlocked_tier_ms;
        let round_id = round.round_id.clone();
        if already_scored {
            return Ok(SongGuessGuessResult {
                round_id,
                tier_ms,
                correct: true,
                already_scored: true,
                score: 0,
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
            });
        }

        let score = score_for_tier(tier_ms)?;
        round.correct_participants.push(actor_subject.to_owned());
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
    if round.clips.len() != SONG_GUESS_CLIP_TIERS_MS.len()
        || round
            .clips
            .iter()
            .map(|clip| clip.tier_ms)
            .collect::<HashSet<_>>()
            .len()
            != SONG_GUESS_CLIP_TIERS_MS.len()
    {
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
    if !SONG_GUESS_CLIP_TIERS_MS.contains(&round.unlocked_tier_ms) {
        return Err(DomainError::InvalidState);
    }
    Ok(())
}

fn validate_clip(clip: &SongGuessClip) -> DomainResult<()> {
    let valid_mime = matches!(
        clip.mime_type.as_str(),
        "audio/wav" | "audio/mp4" | "audio/webm" | "audio/ogg"
    );
    let (minimum_duration, maximum_duration) = match clip.tier_ms {
        500 => (450, 550),
        1_000 => (950, 1_050),
        1_500 => (1_450, 1_550),
        _ => return Err(DomainError::InvalidValue),
    };
    if clip.asset_id.is_empty()
        || clip.asset_id.len() > 255
        || !clip
            .asset_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
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
        SongGuessState::new(
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
        .unwrap()
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
}
