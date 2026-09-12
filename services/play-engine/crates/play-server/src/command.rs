use std::sync::Arc;

use crate::model::{
    ActorContext, ActorRole, CommandRequest, CommandResponse, RematchRequest, RoomStatus,
    SessionRecord, SessionResponse, SessionSnapshot,
};
use crate::realtime::{HubEvent, SessionHub};
use crate::repository::{Execution, PlayRepository, RepositoryError};

#[derive(Clone)]
pub struct CommandService {
    repository: Arc<dyn PlayRepository>,
    hub: SessionHub,
}

impl CommandService {
    pub fn new(repository: Arc<dyn PlayRepository>, hub: SessionHub) -> Self {
        Self { repository, hub }
    }

    pub async fn execute(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &CommandRequest,
        now_ms: i64,
    ) -> Result<Execution<CommandResponse>, RepositoryError> {
        let execution = self
            .repository
            .execute_command(actor, session_id, request, now_ms)
            .await?;
        if !execution.replayed {
            self.hub.publish(
                session_id,
                HubEvent::SessionChanged {
                    version: execution.value.version,
                },
            );
        }
        Ok(execution)
    }

    pub async fn rematch(
        &self,
        actor: &ActorContext,
        session_id: &str,
        request: &RematchRequest,
        now_ms: i64,
    ) -> Result<Execution<SessionResponse>, RepositoryError> {
        let execution = self
            .repository
            .rematch(actor, session_id, request, now_ms)
            .await?;
        if !execution.replayed {
            self.hub.publish(
                session_id,
                HubEvent::SessionReplaced {
                    session_id: execution.value.snapshot.session_id.clone(),
                },
            );
        }
        Ok(execution)
    }

    pub async fn snapshot(
        &self,
        actor: &ActorContext,
        session_id: &str,
        now_ms: i64,
    ) -> Result<SessionSnapshot, RepositoryError> {
        let record = self.repository.get_session(session_id).await?;
        self.project_record(actor, &record, now_ms).await
    }

    pub async fn project_record(
        &self,
        actor: &ActorContext,
        record: &SessionRecord,
        now_ms: i64,
    ) -> Result<SessionSnapshot, RepositoryError> {
        let mut snapshot = record.snapshot(actor, now_ms)?;
        if actor.role == ActorRole::Host && record.state.room_status == RoomStatus::Finished {
            snapshot.viewer.capabilities.can_rematch = self
                .repository
                .current_session(&record.board_id)
                .await?
                .is_some_and(|current| current.session_id == record.session_id);
        }
        Ok(snapshot)
    }

    pub fn repository(&self) -> &Arc<dyn PlayRepository> {
        &self.repository
    }

    pub fn hub(&self) -> &SessionHub {
        &self.hub
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ActorRole, CreateSessionRequest, OmokIntent, ParticipantSeed};
    use crate::repository::MemoryRepository;

    fn host() -> ActorContext {
        ActorContext {
            subject: "teacher:1".to_owned(),
            role: ActorRole::Host,
        }
    }

    fn participant(subject: &str) -> ActorContext {
        ActorContext {
            subject: subject.to_owned(),
            role: ActorRole::Participant,
        }
    }

    async fn service_with_session() -> (CommandService, String) {
        let repository: Arc<dyn PlayRepository> = Arc::new(MemoryRepository::new());
        let created = repository
            .create_session(
                &host(),
                "board-1",
                &CreateSessionRequest {
                    request_id: "create-1".to_owned(),
                    participants: vec![
                        ParticipantSeed {
                            actor_subject: "student:1".to_owned(),
                            display_name: "One".to_owned(),
                        },
                        ParticipantSeed {
                            actor_subject: "student:2".to_owned(),
                            display_name: "Two".to_owned(),
                        },
                    ],
                    auto_start: false,
                },
                1_000,
            )
            .await
            .unwrap();
        let session_id = created.value.snapshot.session_id;
        (
            CommandService::new(repository, SessionHub::default()),
            session_id,
        )
    }

    #[tokio::test]
    async fn publishes_once_after_success_and_not_for_receipt_replay() {
        let (service, session_id) = service_with_session().await;
        let mut subscriber = service.hub().subscribe(&session_id);
        let request = CommandRequest {
            request_id: "ready-1".to_owned(),
            expected_version: 0,
            command_schema_version: 1,
            command: OmokIntent::Ready,
        };

        let applied = service
            .execute(&participant("student:1"), &session_id, &request, 1_001)
            .await
            .unwrap();
        assert!(!applied.replayed);
        subscriber.changed().await.unwrap();
        assert_eq!(
            subscriber.borrow_and_update().clone(),
            HubEvent::SessionChanged { version: 1 }
        );

        let replay = service
            .execute(&participant("student:1"), &session_id, &request, 1_002)
            .await
            .unwrap();
        assert!(replay.replayed);
        assert!(!subscriber.has_changed().unwrap());
    }

    #[tokio::test]
    async fn failures_do_not_publish() {
        let (service, session_id) = service_with_session().await;
        let subscriber = service.hub().subscribe(&session_id);
        let error = service
            .execute(
                &participant("student:1"),
                &session_id,
                &CommandRequest {
                    request_id: "stale-1".to_owned(),
                    expected_version: 9,
                    command_schema_version: 1,
                    command: OmokIntent::Ready,
                },
                1_001,
            )
            .await;
        assert!(matches!(
            error,
            Err(RepositoryError::VersionConflict { .. })
        ));
        assert!(!subscriber.has_changed().unwrap());
    }
}
