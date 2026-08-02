use play_domain::lifecycle::{GameResultRecord, LifecycleError};
use serde::Serialize;
use sqlx::{Postgres, Transaction};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GameResultRepositoryError {
    #[error(transparent)]
    Invalid(#[from] LifecycleError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("existing idempotency row belongs to another result identity")]
    IdempotencyConflict,
    #[error("enum value could not be serialized")]
    InvalidEnum,
}

fn wire_value<T: Serialize>(value: &T) -> Result<String, GameResultRepositoryError> {
    let encoded =
        serde_json::to_string(value).map_err(|_| GameResultRepositoryError::InvalidEnum)?;
    encoded
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .map(ToOwned::to_owned)
        .ok_or(GameResultRepositoryError::InvalidEnum)
}

/// Appends one result row in the caller's transaction.
///
/// The deterministic id and `ON CONFLICT` behavior make an exact replay return
/// the original row. Reusing the key for another source/student is rejected.
pub async fn append_game_result(
    tx: &mut Transaction<'_, Postgres>,
    record: &GameResultRecord,
) -> Result<String, GameResultRepositoryError> {
    record.validate()?;
    let game_kind = wire_value(&record.game_kind)?;
    let outcome = wire_value(&record.outcome)?;
    let result_id = format!("play-result:{}", record.idempotency_key);

    let inserted = sqlx::query_scalar::<_, String>(
        r#"
        INSERT INTO public."GameResult" (
            "id", "gameKind", "boardId", "classroomId", "studentId",
            "sourceType", "sourceId", "outcome", "score", "durationMs",
            "metrics", "startedAt", "completedAt", "idempotencyKey",
            "rulesVersion", "stateSchemaVersion"
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, to_timestamp($12::double precision / 1000.0),
            to_timestamp($13::double precision / 1000.0), $14, $15, $16
        )
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id"
        "#,
    )
    .bind(&result_id)
    .bind(&game_kind)
    .bind(&record.board_id)
    .bind(&record.classroom_id)
    .bind(&record.student_id)
    .bind(&record.source_type)
    .bind(&record.source_id)
    .bind(&outcome)
    .bind(record.score)
    .bind(record.duration_ms)
    .bind(&record.metrics)
    .bind(record.started_at_ms)
    .bind(record.completed_at_ms)
    .bind(&record.idempotency_key)
    .bind(record.rules_version)
    .bind(record.state_schema_version)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(id) = inserted {
        return Ok(id);
    }

    let existing = sqlx::query_as::<_, (String, String, String, String, String, String)>(
        r#"
        SELECT "id", "gameKind", "boardId", "studentId", "sourceType", "sourceId"
        FROM public."GameResult"
        WHERE "idempotencyKey" = $1
        "#,
    )
    .bind(&record.idempotency_key)
    .fetch_one(&mut **tx)
    .await?;

    if existing.1 == game_kind
        && existing.2 == record.board_id
        && existing.3 == record.student_id
        && existing.4 == record.source_type
        && existing.5 == record.source_id
    {
        Ok(existing.0)
    } else {
        Err(GameResultRepositoryError::IdempotencyConflict)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use play_domain::{
        GameKind,
        lifecycle::{GameOutcome, GameResultRecord},
    };

    #[test]
    fn wire_values_use_public_hyphenated_contract() {
        assert_eq!(
            wire_value(&GameKind::ShadowAlliance).unwrap(),
            "shadow-alliance"
        );
        assert_eq!(wire_value(&GameOutcome::HostEnded).unwrap(), "host-ended");
    }

    #[test]
    fn deterministic_result_id_is_bound_to_the_idempotency_key() {
        let record = GameResultRecord {
            game_kind: GameKind::Omok,
            board_id: "board-1".into(),
            classroom_id: "class-1".into(),
            student_id: "student-1".into(),
            source_type: "play_session".into(),
            source_id: "session-1".into(),
            outcome: GameOutcome::Win,
            score: None,
            duration_ms: Some(100),
            metrics: serde_json::json!({"side":"black","moveCount":5,"reason":"five"}),
            started_at_ms: 10,
            completed_at_ms: 110,
            idempotency_key: "omok:session-1:student-1".into(),
            rules_version: Some(1),
            state_schema_version: Some(1),
        };
        assert_eq!(
            format!("play-result:{}", record.idempotency_key),
            "play-result:omok:session-1:student-1"
        );
    }
}
