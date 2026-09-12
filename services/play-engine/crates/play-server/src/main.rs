use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use play_server::{
    AppState, AssertionVerifier, PlayRepository, PostgresRepository, RealtimeConfig,
    RealtimeTicketVerifier, router,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("play-server: loading configuration");
    let database_url = required_env("DATABASE_URL")?;
    let assertion_secret = required_env("PLAY_ENGINE_ASSERTION_SECRET")?;
    let internal_secret = required_env("PLAY_ENGINE_INTERNAL_SECRET")?;
    if internal_secret.len() < 32 {
        return Err("PLAY_ENGINE_INTERNAL_SECRET must be at least 32 bytes".into());
    }
    let bind: SocketAddr = env::var("PLAY_ENGINE_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8081".to_owned())
        .parse()?;
    let db_max_connections = bounded_u32_env("PLAY_ENGINE_DB_MAX_CONNECTIONS", 16, 1, 64)?;

    eprintln!("play-server: initializing repository (max_connections={db_max_connections})",);
    let repository: Arc<dyn PlayRepository> = Arc::new(
        PostgresRepository::connect_with_max_connections(&database_url, db_max_connections).await?,
    );
    eprintln!("play-server: initializing assertion verifier");
    let verifier = AssertionVerifier::new(assertion_secret.as_bytes())?;
    let mut state = AppState::new(repository, verifier, Arc::<str>::from(internal_secret));
    if let Some(realtime) = realtime_config() {
        state = state.with_realtime(realtime);
    }
    let app = router(state);
    eprintln!("play-server: binding {bind}");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    eprintln!("play-server: listening on {bind}");
    axum::serve(listener, app).await?;
    Ok(())
}

fn realtime_config() -> Option<RealtimeConfig> {
    let enabled = env::var("PLAY_ENGINE_REALTIME_ENABLED")
        .ok()
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true"));
    let allowed_origins = env::var("PLAY_ENGINE_REALTIME_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    realtime_config_from_values(
        enabled,
        env::var("PLAY_ENGINE_REALTIME_TICKET_SECRET").ok(),
        allowed_origins,
    )
}

fn realtime_config_from_values(
    enabled: bool,
    secret: Option<String>,
    allowed_origins: Vec<String>,
) -> Option<RealtimeConfig> {
    if !enabled {
        eprintln!("play-server: realtime disabled");
        return None;
    }

    let Some(secret) = secret else {
        eprintln!("play-server: realtime disabled (ticket secret is not configured)");
        return None;
    };
    let Ok(ticket_verifier) = RealtimeTicketVerifier::new(secret.as_bytes()) else {
        eprintln!("play-server: realtime disabled (ticket verifier configuration is invalid)");
        return None;
    };
    if allowed_origins.is_empty() {
        eprintln!("play-server: realtime disabled (allowed origin list is empty)");
        return None;
    }
    Some(RealtimeConfig::new(ticket_verifier, allowed_origins))
}

fn bounded_u32_env(
    name: &str,
    fallback: u32,
    min: u32,
    max: u32,
) -> Result<u32, Box<dyn std::error::Error>> {
    let Some(raw) = env::var(name).ok() else {
        return Ok(fallback);
    };
    let value: u32 = raw
        .parse()
        .map_err(|_| format!("{name} must be an integer between {min} and {max}"))?;
    if !(min..=max).contains(&value) {
        return Err(format!("{name} must be between {min} and {max}").into());
    }
    Ok(value)
}

fn required_env(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    env::var(name)
        .map_err(|_| format!("{name} is required").into())
        .and_then(|value| {
            if value.trim().is_empty() {
                Err(format!("{name} must not be empty").into())
            } else {
                Ok(value)
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn realtime_is_disabled_when_enabled_with_an_empty_origin_allowlist() {
        assert!(realtime_config_from_values(true, Some("x".repeat(32)), Vec::new()).is_none());
    }

    #[test]
    fn realtime_requires_an_explicit_non_empty_origin_allowlist() {
        assert!(
            realtime_config_from_values(
                true,
                Some("x".repeat(32)),
                vec!["https://aura-board.com".to_owned()],
            )
            .is_some()
        );
    }
}
