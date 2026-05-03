# Aura-board — Teacher UI kit

Hi-fi recreation of the teacher-facing surfaces.

## Components
- `TeacherDashboard` — 960px-capped header + board grid with dashed new-board tile and kebab menu (복제 / 삭제).
- `CreateBoardModal` — title input + 6-layout picker (freeform / grid / stream / columns / assignment / quiz). Emoji + Korean label + description match `src/components/CreateBoardModal.tsx`.
- `GridBoardView` — opened board. Author pill + body text per card, "카드 추가" primary CTA.

## Flow demonstrated in index.html
1. Dashboard with 5 seeded boards
2. Click "새 보드 만들기" → modal → pick layout + title → creates and prepends
3. Click a board tile → grid view, add a card
4. Kebab menu → 복제 (duplicate) / 삭제 (confirm, delete)

Styles live in `../shared.css`.
