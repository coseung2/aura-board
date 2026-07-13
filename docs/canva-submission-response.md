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
Its Canva integration lets users connect their Canva accounts, attach Canva
designs to collaborative boards, display design previews, and export selected
designs for classroom use. Teachers can organize board-related designs into
Canva folders. Students can create a personalized Aura card: Aura Board
generates a QR-code image, uploads it to the student’s Canva account, and
creates an editable Canva design containing that asset. The integration
reduces manual download and re-upload work and helps teachers and students
move smoothly between Canva’s design tools and Aura Board’s classroom
workflows.

## Integration functionality

1. Teachers and students connect their Canva account using OAuth 2.0
   Authorization Code flow with PKCE.
2. Aura Board reads design metadata to show titles, thumbnails, and design
   links on collaborative board cards.
3. Teachers export selected Canva designs as PDF files for classroom use.
4. Teachers create Canva folders, list folder contents, and move selected
   designs into those folders.
5. Aura Board uploads a generated QR-code image to a student’s Canva account
   and creates an editable personalized Aura card design.
6. Teachers and students can disconnect Canva. Aura Board revokes the Canva
   refresh-token lineage from its backend and immediately deletes the locally
   stored OAuth credentials and temporary authentication data.

## Integration testing

Application URL: https://aura-board.com

Direct reviewer login URL: https://aura-board.com/login?review=canva

Teacher account:

- Email: integrations-support@canva.com
- Password: [TEST PASSWORD]

Student account:

- Classroom/code: [CLASSROOM OR LOGIN CODE]
- Student name/number: [STUDENT LOGIN]
- PIN/password, if applicable: [STUDENT SECRET]

Steps:

1. Sign in to Aura Board with the teacher test account.
2. Open the prepared demo classroom and board named `[BOARD NAME]`.
3. Open teacher settings and connect a Canva test account.
4. Add or open a card with a Canva design and confirm its title and thumbnail.
5. Export the prepared Canva cards as PDF.
6. Create a Canva folder from the board and move the test design into it.
7. Sign out and sign in with the prepared student credentials.
8. Open My Wallet, connect Canva, and create the student’s Aura card design.
9. Confirm the QR-code asset and editable design were created in Canva.
10. Disconnect Canva from both test accounts and confirm the disconnected
    state remains after reloading the page.

No paid Aura subscription is required for the review account.

## Scope rationale

- `design:content:read`: Export user-selected Canva designs as PDF files.
- `design:content:write`: Create an editable personalized Aura card design.
- `design:meta:read`: Read title, page count, thumbnail, and design URLs.
- `folder:read`: List Canva folder contents for the folder picker.
- `folder:write`: Create folders and move user-selected designs into them.
- `asset:read`: Poll the status and result of Aura Board’s asset upload job.
- `asset:write`: Upload the generated Aura card QR-code image.
- All permission, comment, and brand template scopes: `n/a`.

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

Use production observability data. Do not submit an estimate until average and
peak/P99 Canva API request rates have been measured.

## Questionnaire selections

- Respects Canva API and developer terms: **Yes**
- Reviewed against OWASP Top 10: **Yes** (code review; not a penetration test)
- Revokes OAuth tokens and deletes personal data within 30 days: **Yes**, only
  after production deployment and disconnect-flow verification
- Client secrets encrypted at rest on a secure backend: **Yes**, only after
  confirming production server-only environment configuration
- SSO: **No**
- SAML: **No**
- Dedicated security team: **No**
- Vulnerability disclosure or bug bounty program: **No**
- Third-party connections required: **Yes**
- Owns redirect and webhook domains: **Yes** for `aura-board.com`
- Verifies webhook signatures: **No** — the integration does not register or
  process Canva webhook events
