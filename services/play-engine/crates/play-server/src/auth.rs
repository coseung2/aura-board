use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use thiserror::Error;

use crate::model::{ActorContext, ActorRole};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorAssertion {
    pub actor_subject: String,
    pub role: ActorRole,
    pub expires_at_ms: i64,
}

#[derive(Clone)]
pub struct AssertionVerifier {
    secret: Vec<u8>,
}

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum AssertionError {
    #[error("invalid_assertion")]
    Invalid,
    #[error("expired_assertion")]
    Expired,
}

impl AssertionVerifier {
    pub fn new(secret: impl AsRef<[u8]>) -> Result<Self, AssertionError> {
        let secret = secret.as_ref();
        if secret.len() < 32 {
            return Err(AssertionError::Invalid);
        }
        Ok(Self {
            secret: secret.to_vec(),
        })
    }

    pub fn verify(&self, encoded: &str, now_ms: i64) -> Result<ActorContext, AssertionError> {
        let (payload_b64, signature_b64) =
            encoded.split_once('.').ok_or(AssertionError::Invalid)?;
        let signature = URL_SAFE_NO_PAD
            .decode(signature_b64)
            .map_err(|_| AssertionError::Invalid)?;
        let mut mac =
            HmacSha256::new_from_slice(&self.secret).map_err(|_| AssertionError::Invalid)?;
        mac.update(payload_b64.as_bytes());
        mac.verify_slice(&signature)
            .map_err(|_| AssertionError::Invalid)?;

        let payload = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|_| AssertionError::Invalid)?;
        let assertion: ActorAssertion =
            serde_json::from_slice(&payload).map_err(|_| AssertionError::Invalid)?;
        if assertion.actor_subject.is_empty() || assertion.expires_at_ms <= now_ms {
            return Err(if assertion.expires_at_ms <= now_ms {
                AssertionError::Expired
            } else {
                AssertionError::Invalid
            });
        }
        Ok(ActorContext {
            subject: assertion.actor_subject,
            role: assertion.role,
        })
    }

    #[cfg(test)]
    pub(crate) fn sign_for_test(&self, assertion: &ActorAssertion) -> String {
        let payload = serde_json::to_vec(assertion).unwrap();
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload);
        let mut mac = HmacSha256::new_from_slice(&self.secret).unwrap();
        mac.update(payload_b64.as_bytes());
        let signature = mac.finalize().into_bytes();
        format!("{payload_b64}.{}", URL_SAFE_NO_PAD.encode(signature))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_actor_and_rejects_expired_or_tampered_assertions() {
        let verifier = AssertionVerifier::new([7_u8; 32]).unwrap();
        let encoded = verifier.sign_for_test(&ActorAssertion {
            actor_subject: "student:1".to_owned(),
            role: ActorRole::Participant,
            expires_at_ms: 2_000,
        });
        assert_eq!(
            verifier.verify(&encoded, 1_000).unwrap(),
            ActorContext {
                subject: "student:1".to_owned(),
                role: ActorRole::Participant,
            }
        );
        assert_eq!(
            verifier.verify(&encoded, 2_000),
            Err(AssertionError::Expired)
        );

        let mut tampered = encoded.into_bytes();
        let last = tampered.len() - 1;
        tampered[last] = if tampered[last] == b'A' { b'B' } else { b'A' };
        assert_eq!(
            verifier.verify(std::str::from_utf8(&tampered).unwrap(), 1_000),
            Err(AssertionError::Invalid)
        );
    }
}
