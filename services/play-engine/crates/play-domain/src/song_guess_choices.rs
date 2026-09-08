use super::*;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SongGuessAnswerMode {
    #[default]
    Text,
    MultipleChoice,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SongGuessChoice {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongGuessSelection {
    pub actor_subject: String,
    pub choice_id: String,
}

pub(super) fn validate_choices(
    mode: SongGuessAnswerMode,
    round: &SongGuessRound,
    participants: &HashSet<&str>,
) -> DomainResult<()> {
    if mode == SongGuessAnswerMode::Text {
        return if round.choices.is_empty() && round.selections.is_empty() {
            Ok(())
        } else {
            Err(DomainError::InvalidState)
        };
    }
    let mut ids = HashSet::new();
    let mut labels = HashSet::new();
    let mut correct_count = 0;
    for choice in &round.choices {
        let normalized = normalize_answer(&choice.label);
        if choice.id.is_empty()
            || choice.id.len() > 128
            || !choice
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
            || normalized.is_empty()
            || choice.label.chars().count() > 200
            || !ids.insert(choice.id.as_str())
            || !labels.insert(normalized.clone())
        {
            return Err(DomainError::InvalidState);
        }
        if normalized == round.normalized_answer {
            correct_count += 1;
        } else if round.normalized_aliases.contains(&normalized) {
            return Err(DomainError::InvalidState);
        }
    }
    if ids.len() != 4 || correct_count != 1 {
        return Err(DomainError::InvalidState);
    }
    let mut answered = HashSet::new();
    for selection in &round.selections {
        if !participants.contains(selection.actor_subject.as_str())
            || !ids.contains(selection.choice_id.as_str())
            || !answered.insert(selection.actor_subject.as_str())
        {
            return Err(DomainError::InvalidState);
        }
    }
    Ok(())
}

impl SongGuessState {
    /// The private option label feeds the existing score calculation only after
    /// ID validation. Commit the cloned state only when the whole attempt succeeds.
    pub fn choose_at(
        &mut self,
        actor_subject: &str,
        choice_id: &str,
        now_ms: i64,
    ) -> DomainResult<SongGuessGuessResult> {
        self.validate()?;
        if self.answer_mode != SongGuessAnswerMode::MultipleChoice {
            return Err(DomainError::InvalidValue);
        }
        let round = self.current_round()?;
        if round
            .selections
            .iter()
            .any(|selection| selection.actor_subject == actor_subject)
        {
            return Err(DomainError::SubmissionLocked);
        }
        let label = round
            .choices
            .iter()
            .find(|choice| choice.id == choice_id)
            .ok_or(DomainError::InvalidValue)?
            .label
            .clone();
        let mut next = self.clone();
        let result = next.guess_internal(actor_subject, &label, Some(now_ms))?;
        next.current_round_mut()?
            .selections
            .push(SongGuessSelection {
                actor_subject: actor_subject.to_owned(),
                choice_id: choice_id.to_owned(),
            });
        next.validate()?;
        *self = next;
        Ok(result)
    }
}
