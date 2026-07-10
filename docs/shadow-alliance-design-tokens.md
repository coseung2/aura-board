# Shadow Alliance visual tokens

The Shadow Alliance board intentionally uses a separate dark editorial visual
language. These tokens are scoped to `.shadow-alliance-game` and are the source
of truth for its surfaces, team accents, spacing, shape, and elevation.

| Token | Value | Role |
|---|---|---|
| `--sa-black` | `#08090d` | page background |
| `--sa-panel` | `#141720` | command and panel surface |
| `--sa-panel-soft` | `#1c202b` | form/control surface |
| `--sa-line` | `#343a4a` | primary divider and control border |
| `--sa-line-soft` | `rgba(52, 58, 74, 0.64)` | quiet divider |
| `--sa-text` | `#f5f1e7` | primary text |
| `--sa-muted` | `#a9afbd` | secondary text |
| `--sa-gold` | `#e4c778` | CTA, active state, game emphasis |
| `--sa-black-team` | `#7180a4` | black alliance accent |
| `--sa-white-team` | `#f0e5c3` | white alliance accent |
| `--sa-space-1` to `--sa-space-5` | `8px` to `32px` | spacing rhythm |
| `--sa-radius-panel` | `12px` | independent panel surface |
| `--sa-radius-control` | `8px` | buttons and compact controls |
| `--sa-shadow-panel` | `0 18px 48px rgba(0, 0, 0, 0.18)` | guide and command elevation |

The roster uses hierarchy through alignment, team-colored rules, and row
dividers rather than nested cards. Long Korean copy uses a bounded reading
width and `keep-all` wrapping.

## Copy and punctuation rules

- Do not use the em dash character (`—`) in Shadow Alliance UI copy, separators,
  or empty states.
- Use plain text for decorative sentence prefixes, and use contextual labels
  such as `없음`, `미제출`, or `미공개` for empty values.
