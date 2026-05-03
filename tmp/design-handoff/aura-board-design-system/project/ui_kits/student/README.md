# Aura-board — Student UI kit

Hi-fi recreation of the student-facing surfaces in Aura-board.

## Components
- `LoginCard` — 6-char uppercase code input (centered, letter-spaced, monospaced)
- `StudentDashboard` — greeting + classroom badge + board grid
- `BoardView` — assignment-style submission with textarea and submitted state

## Flow demonstrated in index.html
1. Student logs in with code → dashboard
2. Taps a board card → board view with textarea
3. Submits → view flips to "제출됨" pill + their submission + follow-up note

Styles live in `../shared.css`. Real copy lifted from
`src/components/StudentLoginForm.tsx` and `src/components/StudentDashboard.tsx`.
