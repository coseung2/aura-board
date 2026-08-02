use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type DomainResult<T> = Result<T, DomainError>;

/// Stable rule-level errors that API adapters can map without parsing text.
#[derive(Clone, Copy, Debug, Deserialize, Error, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DomainError {
    #[error("the command is not valid in the current phase")]
    InvalidPhase,
    #[error("the command was issued by an unknown participant")]
    UnknownParticipant,
    #[error("the command was issued by the wrong participant")]
    WrongParticipant,
    #[error("the requested position is outside the game board")]
    OutOfBounds,
    #[error("the requested position is already occupied")]
    Occupied,
    #[error("the submitted value is outside the allowed range")]
    InvalidValue,
    #[error("the stored game state violates the domain contract")]
    InvalidState,
    #[error("the game does not have enough participants")]
    NotEnoughParticipants,
    #[error("the participant has already submitted and editing is disabled")]
    SubmissionLocked,
}
