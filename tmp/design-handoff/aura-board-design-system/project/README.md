# Aura-board Design System

A Notion-inspired, warm-neutral design system for **Aura-board** — a Korean K-12
classroom collaboration product (think Padlet clone, Google-Classroom-adjacent)
built as a Next.js app. The product lets teachers create shared **boards** of
cards, run **assignments** and **quizzes**, manage **classrooms**, and pair
parents and students through invite codes and Canva OAuth.

Everything in this system is locked to the real source of truth:
`src/styles/base.css` (product tokens) and the component CSS in `src/styles/*.css`.
The theme was locked on **2026-04-10** ("phase6"); Figma and Miro variants are
archived in the product repo.

---

## Sources

- **Codebase (local mount):** `src/` — Next.js 14 App Router, TypeScript. Primary
  source of truth for tokens, components, copy, product surfaces. Not checked in
  here — access via the agent's local-read tools.
- **Docs (local mount):** `docs/` — product + setup docs. Not checked in here.
- **GitHub:** `coseung2/padlet` (read on demand). A mirror of the same app.

Everything visual in this design system was derived from **code**, not
screenshots, per the system's "code over screenshots" rule.

---

## Products / Surfaces

Aura-board is one product with **four audience surfaces**, all served from the
same Next.js app:

1. **Teacher web app** — the main app. Dashboard of boards, board canvas
   (freeform / grid / stream / columns / assignment / quiz layouts), classroom
   management, student roster, assignment grading.
2. **Student web app** — simple code-based login (6-char uppercase token), board
   viewing, card creation, assignment submission, quiz-taking.
3. **Parent web app** — approval flow (link parent to child via classroom
   invite), weekly activity digest, notification preferences.
4. **Transactional emails** — React Email templates for invite codes,
   approvals, weekly digests, expiration warnings.

A Canva Content Publisher integration ("Aura-board에 게시" button) lets students
push Canva designs directly to a board card.

---

## Content fundamentals

**Language.** Korean-first. All user-facing copy is Korean. English appears only
in brand marks ("Aura-board"), integration names ("Canva"), and developer-facing
strings. The product name is **always** written "Aura-board" (capital A,
hyphenated). Email subjects always prefix `[Aura-board]`.

**Tone.** Warm, direct, short. Feels like a competent teacher speaking to
students and parents — not corporate, not playful-to-a-fault. Confirmations are
plain questions ("이 보드를 삭제하시겠습니까?"), errors are one sentence
("네트워크 오류가 발생했습니다"). No exclamation marks in system copy.

**Person.** Students and parents are addressed with the polite "-습니다 / -세요"
forms. Teacher-facing UI uses the same register — no casual "-해" voice. The app
does **not** refer to itself in first person ("I'll send this…") — it describes
what will happen in passive or imperative.

**Sentence shape.** Very short. Buttons are 2–4 characters where possible
("로그인", "삭제", "복제", "새 보드 만들기"). Dialog questions are a single
sentence ending in "-겠습니까?" or "-하시겠습니까?".

**Examples from the codebase (verbatim):**
- `"학생 로그인"` — page title on student login
- `"코드 입력"` — input placeholder
- `"확인 중..."` — button busy state
- `"새 보드 만들기"` — primary CTA in dashboard
- `"이 보드를 삭제하시겠습니까? 모든 카드가 함께 삭제됩니다."` — confirm dialog
- `"학급 관리 →"` — inline nav link with trailing arrow, never an icon
- `"[Aura-board] 학급 초대 코드가 갱신되었습니다"` — email subject
- `"[Aura-board] ${classroom.name} 자동 만료 요약"` — templated subject, curly
  placeholders use interpolation

**Emoji usage.** Yes — but as **functional icons**, not decoration. The
dashboard uses emoji per board layout (`🎯 freeform`, `🔲 grid`, `📜 stream`,
`📊 columns`, `📋 assignment`, `🎮 quiz`); the role picker uses one emoji per
role card. Never inside body copy, never in email subjects, never in error
messages. Treat emoji as the product's iconography (see Iconography below).

**Arrows & punctuation.** Trailing `→` marks inline links to another page. `···`
(three middle dots) is the board-card kebab menu. `+` is always a new-item
affordance. Backticks/quotes are standard-Korean (`"…"`).

---

## Visual foundations

**Color philosophy.** Warm neutral, high surface contrast, one confident accent
blue. The background is **not** white — it is `#f6f5f4` (a warm off-white,
Notion-style). Cards are true white `#ffffff` on top of that warm background, so
elevation reads as "a white card floating on warm paper" rather than the
dashboard-grey convention.

- **Accent** — one blue `#0075de` (active `#005bab`, tinted bg `#f2f9ff`, tinted
  text `#097fe8`). Used sparingly: primary buttons, links, focus rings, "new"
  badges.
- **Plant-roadmap greens** — `#27a35f / #b8dfc7 / #d0cfcd` (active / visited /
  upcoming) for the "plant" progress metaphor in quiz mode.
- **Status pills** — submitted (blue), reviewed (green), returned (red). Paired
  bg+text tokens, all WCAG AA.
- **Semantic** — warning `#f59e0b`, danger `#c62828`, quiz-medium `#c9a227`.
- **Text** — `rgba(0,0,0,0.95)` primary, `#615d59` muted, `#a39e98` faint. Pure
  black is never used; the 95%-black primary gives a subtle warmth that matches
  the background.

**Type.** Inter across the board — both display and body. Display tracking is
tight (`-0.5px`), body tracking is 0. There are 8 defined type roles (Display
26/700, Title 20/700, Subtitle 16/700, Section 15/700, Body 15/400, Label
13/600, Badge 12/600, Micro 11/600). The type hierarchy works almost entirely
through **weight**, not size — 15px body and 15px section headers share a size
and differ only in weight and letter-spacing.

**Spacing.** The base grid is **4px**. Component padding clusters at **16/20/24/
32/40/48px**. Card grids gap at **16–20px**, dashboard grid at **16px**,
stream at **16px**. No fluid spacing tokens — values are specific to component.

**Radii.** Three sizes, used intentionally: **12px** (cards, modals),
**4px** (buttons, inputs), **9999px** (pills, badges, status chips). The 12px
card radius is the system's signature — it's large enough to feel soft but not
so large it reads as "friendly app", which would break the classroom tone.

**Shadows.** The signature is a **multi-layer soft shadow** borrowed from
Notion — four stacked shadows at increasing blur and decreasing opacity, never a
single hard drop-shadow. There are three tiers:
- `--shadow-card` — resting state for every card and modal
- `--shadow-card-hover` — slightly stronger two-layer on hover
- `--shadow-accent` / `--shadow-accent-hover` — blue-tinted lift for primary
  CTAs

**Borders.** Hairline `rgba(0,0,0,0.1)` on every card; deepens to
`rgba(0,0,0,0.15)` on hover. The border + shadow + white fill combo is how
every surface reads as elevated.

**Backgrounds.** Warm flat color. **No gradients**, no photographic backgrounds,
no patterns, no full-bleed imagery, no textures, no grain. The product's
visual content is the cards themselves — backgrounds stay out of the way. The
only acceptable gradient is nothing; there are zero gradients in the system.

**Animation.** Conservative. Transitions are **120–200ms ease** (no cubic
easings, no springs, no bounce). Common motions:
- Hover lift: `transform: translateY(-2px)` + box-shadow + border-color swap
  (180ms)
- Modal enter: fade + 4px rise (200ms)
- Focus: instant outline (no animation)

No page transitions, no scroll-linked animations, no parallax.

**Hover states.** Three patterns only:
1. Cards: border darkens + shadow grows + optional 2–3px lift
2. Buttons: background one step darker (e.g. accent → accent-active)
3. Links: color → accent-active

**Press states.** Inherit hover. No scale-down. No state change on `:active`
beyond what the browser does by default.

**Focus states.** Always `outline: 2px solid var(--color-accent-tinted-text)`
with 2px offset. Never removed.

**Transparency / blur.** Almost never. `rgba(0,0,0,0.05)` for
`--color-surface-alt` (used as input fill / hover fill) and `rgba(0,0,0,0.1)`
for borders — that's it. **No backdrop-filter**. No frosted glass.

**Imagery.** The product is a content canvas — images come from user-uploaded
cards, and the system does not prescribe tone. There are no brand-owned
illustrations, stock photos, or mascot characters. Placeholders in this design
system are drawn with CSS.

**Cards.** Every surface with real content is a card: white fill, 12px radius,
hairline border, multi-layer shadow. Padding clusters at 20px (grid), 24px
(stream), 32–40px (modal, login).

**Layout rules.**
- The main content column is **max-width: 960px** centered, with 32px side
  padding on desktop.
- Forms and login cards max out at 400px (single-column) or 720px (multi-card).
- Modals cap at `min(92vw, 640px)`.
- Minimum tap target is **44px** (documented in tokens-responsive.css).
- Safe-area-inset padding is reserved for iOS FAB bottoms.

---

## Iconography

**Emoji as icons.** Aura-board uses emoji as its primary iconography — this is
deliberate and documented in the product tokens. Each board layout has a fixed
emoji in `src/components/Dashboard.tsx`:

| Layout      | Emoji | Korean label |
| ----------- | ----- | ------------ |
| freeform    | 🎯    | 자유 배치    |
| grid        | 🔲    | 그리드       |
| stream      | 📜    | 스트림       |
| columns     | 📊    | 칼럼         |
| assignment  | 📋    | 과제 배부    |
| quiz        | 🎮    | 퀴즈         |

Role picker (login hub) uses 👨‍🏫 teacher / 👶 student / 👪 parent.

**Unicode symbols as UI chrome.** `→` for nav links, `···` for kebab menus,
`+` for add, `×` for close. These are **not** SVGs — they are literal Unicode
characters styled with font-weight and font-size. This keeps the type rhythm
consistent with surrounding text.

**No icon font, no SVG sprite.** The product ships no Lucide, Heroicons, Font
Awesome, or custom SVG sprite. There is no `/public/icons` folder. If an
icon-like mark is needed and no emoji fits, use a Unicode symbol or write one
inline in CSS (e.g. the `+` inside `.board-grid-new-icon`).

**Brand mark.** There is **no logo asset.** The wordmark "Aura-board" is drawn
with the display font; on the login page it is rendered inside a 56×56 blue
square with radius 14 and the letter "A" at 28px/800 — this is the de-facto
logomark, generated in CSS, not an image.

Images in `assets/` here are synthesized CSS-only stand-ins for previews.

---

## Index

- `colors_and_type.css` — canonical tokens (copy into new designs)
- `fonts/` — Inter webfonts (Google-Fonts fallback: we use Google Fonts Inter;
  if you need local copies, download from rsms.me/inter)
- `assets/` — logo placeholder + CSS-generated brand marks
- `preview/` — small HTML cards that render on the Design System tab
- `ui_kits/teacher/` — Teacher dashboard + board views (JSX components)
- `ui_kits/student/` — Student login + submission flow
- `SKILL.md` — skill manifest for Claude Code

---

## Caveats & substitutions

- **Fonts.** No font files were shipped with the source repo — it uses the
  system font stack with Inter as a preferred fallback. This design system links
  Inter from Google Fonts. If you need offline copies, download from
  https://rsms.me/inter/ and drop the `.woff2` files into `fonts/`.
- **Logo.** There is no SVG/PNG logo in the codebase; the login page generates
  the "A" mark in CSS. `assets/logo-mark.html` reproduces this verbatim.
- **Icons.** See iconography — emoji + Unicode, no sprite. Nothing to download.
