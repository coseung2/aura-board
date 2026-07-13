# Canva Connect integration submission draft

Replace every bracketed placeholder and complete the production checks in
`docs/canva-review-checklist.md` before submitting.

## Developer overview

**Company or developer name**

Aura

**Technical contact details**

Sim Boseung  
Email: mallagaenge@gmail.com

**User contact details**

Aura Support  
Email: mallagaenge@gmail.com  
https://aura-board.com/support

**Terms of Service**

https://aura-board.com/terms

**Privacy Policy**

https://aura-board.com/privacy

## Integration overview

Aura Board is a classroom collaboration platform for teachers and students.
Its Canva integration lets teachers connect their Canva account, attach Canva
designs to collaborative boards, display design previews, and export selected
designs as PDF files for classroom use. Teachers can also browse Canva folder
contents and organize board-related designs into folders named after Aura
Board sections. The integration reduces repetitive download and organization
work while helping teachers move smoothly between Canva’s design tools and
their classroom workflows.

## Integration functionality

1. Teachers connect their Canva account using OAuth 2.0 Authorization Code
   flow with PKCE.
2. Aura Board reads design metadata to show titles, thumbnails, and design
   links on collaborative board cards.
3. Teachers export selected Canva designs as PDF files for classroom use.
4. Teachers create Canva folders, list folder contents, and move selected
   designs into those folders.
5. Teachers can disconnect Canva. Aura Board revokes the Canva
   refresh-token lineage from its backend and immediately deletes the locally
   stored OAuth credentials and temporary authentication data.

## Integration testing

Application URL: https://aura-board.com

Direct reviewer login URL: https://aura-board.com/login?review=canva

Teacher account:

- Email: integrations-support@canva.com
- Password: [TEST PASSWORD]

Prepared demo board:

- Name: `test for review`
- URL: https://aura-board.com/board/board-mrirxqwp

Steps:

1. Sign in to Aura Board with the teacher test account.
2. Open the prepared board named `test for review`.
3. Open teacher settings and connect a Canva account available to the review team.
4. In the section named `test`, use `Canva에서 가져오기`, browse a folder,
   select a design, and confirm its title and thumbnail appear on the board.
5. Export the selected Canva design as PDF using the review-approved export mode.
6. Use `Canva 폴더로 정리` and confirm the Canva folder is named after the
   Aura Board section (`test`).
7. Disconnect Canva in teacher settings and confirm the disconnected state remains after
   reloading the page.

No paid Aura subscription is required for the review account.

## Scope rationale

- `design:content:read`: Export user-selected Canva designs as PDF files.
- `design:meta:read`: Read title, page count, thumbnail, and design URLs.
- `folder:read`: List Canva folder contents for the folder picker.
- `folder:write`: Create folders and move user-selected designs into them.
- All write-design, asset, permission, comment, and brand template scopes:
  `n/a`.

## Security practices

**Data retention policy**

Customer data is retained while the user’s Aura Board account, classroom, or
associated content remains active and as necessary to provide the requested
service. Canva OAuth credentials are retained only while the Canva connection
is active. Canva design identifiers, user-provided design links, thumbnails,
and related board content are retained while the associated board or card
remains active. Records required by applicable law are retained only for the
legally required period.

**Data archival/removal policy**

Customer data is removed when a user deletes the associated content, deletes
their account, or submits a deletion request to Aura Support. When a user
disconnects Canva, Aura Board requests revocation of the Canva refresh token
and its access-token lineage, then immediately deletes the stored access token,
refresh token, and PKCE data. Legally required records and backups are removed
according to their applicable statutory or backup lifecycle.

**Data storage policy**

Account, classroom, board, and Canva connection data is stored in managed
PostgreSQL infrastructure with access restricted to the application backend.
Uploaded files are stored in managed object storage. Data is transmitted using
HTTPS/TLS. Canva OAuth tokens and PKCE data are encrypted using AES-256-GCM
before database storage. Client secrets and encryption keys are stored as
server-only environment variables and are not exposed to browser code.

**Hosting**

Aura Board is cloud-hosted. The web application and backend functions are
hosted on Vercel. Managed PostgreSQL and object storage are provided through
Supabase infrastructure.

**Date of last pen test**

Leave blank unless an external penetration test has actually been completed.

**Security contact**

Security concerns can be reported to mallagaenge@gmail.com or through
https://aura-board.com/support. Reports should include impact and reproduction
steps but must not include passwords or active access tokens.

**Normal traffic levels**

Average: below 0.1 requests per second. Observed peak: approximately 2
requests per second during active user operations. Expected peak remains below
5 requests per second. Measurement source: Vercel production runtime logs,
24-hour window ending 13 July 2026.

## Questionnaire selections

- Respects Canva API and developer terms: **Pending — do not submit Yes** until
  the multi-design PDF processing terms and under-age user terms are resolved
- Reviewed against OWASP Top 10: **Yes** (code review; not a penetration test)
- Revokes OAuth tokens and deletes personal data within 30 days: **No**, until
  the teacher account-deletion path also revokes Canva consent/token lineage
- Client secrets encrypted at rest on a secure backend: **Yes** — production
  uses server-only protected environment variables and a dedicated Canva token
  encryption key
- SSO: **No**
- SAML: **No**
- Dedicated security team: **No**
- Vulnerability disclosure or bug bounty program: **No**
- Third-party connections required: **Yes**
- Owns redirect and webhook domains: **Yes** for `aura-board.com`
- Verifies webhook signatures: **No** — the integration does not register or
  process Canva webhook events
