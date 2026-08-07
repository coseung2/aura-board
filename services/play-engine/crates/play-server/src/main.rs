use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use play_server::{AppState, AssertionVerifier, PlayRepository, PostgresRepository, router};

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

    eprintln!("play-server: initializing repository");
    let repository: Arc<dyn PlayRepository> =
        Arc::new(PostgresRepository::connect(&database_url).await?);
    eprintln!("play-server: initializing assertion verifier");
    let verifier = AssertionVerifier::new(assertion_secret.as_bytes())?;
    let app = router(AppState::new(
        repository,
        verifier,
        Arc::<str>::from(internal_secret),
    ));
    eprintln!("play-server: binding {bind}");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    eprintln!("play-server: listening on {bind}");
    axum::serve(listener, app).await?;
    Ok(())
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
