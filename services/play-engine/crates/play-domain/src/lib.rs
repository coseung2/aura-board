//! Deterministic game rules for Aura Board's play platform.
//!
//! This crate deliberately has no database, clock, network, or random-number
//! dependencies. Callers must provide generated identifiers, random choices,
//! and time-derived values explicitly so commands can be replayed and compared.

mod contract;
mod error;

pub mod lifecycle;
pub mod omok;
pub mod shadow_alliance;
pub mod song_guess;

pub use contract::{CommandEnvelope, GameKind, SnapshotEnvelope};
pub use error::{DomainError, DomainResult};
