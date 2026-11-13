# SomaNami design

The source of truth for visuals is the design canvas
(https://claude.ai/artifact/FVaFnBJsjyosrSxEmzodsc, ask the owner for access).
This file records the decisions the code depends on; when the two disagree,
update whichever is wrong in the same pull request.

## Principles

- **Your materials, nothing else.** Every surface repeats that answers come only
  from what the learner added ("Locked to your content").
- **Calm and readable.** One accent on a warm neutral ground, generous spacing,
  Inter throughout.
- **Accessible as drawn.** Text ≥ 4.5:1, interactive borders and focus rings
  ≥ 3:1, real buttons, links, labels and tables, 44 px touch targets.

## Tokens

Defined in `src/index.css` as CSS variables and exposed to Tailwind as
`bg-*`, `text-*`, `border-*` utilities.

| Token        | Light     | Dark      | Use                                        |
| ------------ | --------- | --------- | ------------------------------------------ |
| `ground`     | `#F8F7F4` | `#17161C` | Page background                            |
| `surface`    | `#FFFFFF` | `#22212B` | Cards, inputs, panels                      |
| `side`       | `#F1F0EC` | `#1D1C24` | Sidebar                                    |
| `fg`         | `#292B35` | `#F1F0F5` | Primary text                               |
| `muted`      | `#555965` | `#B4B5C0` | Secondary text (6.5:1 / 8.8:1 on ground)   |
| `line`       | `#E5E4DF` | `#34333E` | Decorative dividers and card borders only  |
| `edge`       | `#84868F` | `#6E6F7C` | Borders of interactive elements (≥ 3.2:1)  |
| `accent`     | `#5754A6` | `#A9A6F0` | Primary actions, links, active nav, focus  |
| `on-accent`  | `#FFFFFF` | `#17161C` | Text and icons on `accent`                 |
| `tint`       | `#EBE9F7` | `#2D2B45` | Active nav, icon tiles, selected chips     |
| `tag`        | `#ECE9F8` | `#2F2D48` | Topic tag background                       |
| `tile`       | `#F3F1EA` | `#25242E` | "Ways of understanding" tiles              |
| `success`    | `#2B7350` | `#7AD6A8` | Success text (on `success-soft` ≥ 4.9:1)   |
| `online`     | `#2F8F5B` | `#5FC98C` | Online status dot (not for text)           |
| `warn`       | `#9A3B26` | `#F2A58E` | Warnings, unanswerable replies (≥ 6:1)     |

Soft backgrounds: `success-soft` `#E4F1E9` / `#1E3328`, `warn-soft` `#FBEDE8` /
`#3A2420`.

**Theme.** Follows the system until the learner picks one with the theme
toggle; the choice is stored on the device (`somanami-theme`) and applied as
`data-theme` on `<html>` before first paint.

## Type

Inter 400/500/600 for everything; Manjari 700 for the "SomaNami" wordmark only.

| Role               | Size  | Weight | Line height | Notes          |
| ------------------ | ----- | ------ | ----------- | -------------- |
| Page title (H1)    | 45 px | 400    | 1.25        | −0.01em        |
| Section title (H2) | 22 px | 400    | 1.4         |                |
| Card title (H3)    | 20 px | 500    | 1.3         |                |
| Body / lede        | 15 px | 400    | 1.6         | `muted`        |
| Label, list title  | 15 px | 500    | 1.5         |                |
| Nav, buttons       | 14 px | 400/500| 1.5         | active nav 600 |
| Meta               | 13 px | 400    | 1.5         | `muted`        |
| Tag, table header  | 12 px | 500    | 1.5         | uppercase 0.06em |

## Shape and spacing

Radii: 6 tags · 10 buttons, inputs, nav items · 12 cards · 16 large panels ·
24 composer · pill for chips. Buttons and chips are 44 px high; inputs 48 px.
Main content: max width 1376 px, padding 64/48/96 px, 56 px between sections.
The only shadow is the composer's soft glow.

## Screens

Home · Workspaces · New workspace (2 steps: name and topic, add materials) ·
Workspace · New chat (pick the materials the chat may use; Send disabled until
one is picked) · Chat (answers with "From your materials" citations; replies
the materials can't support are labelled "Not answered from your materials") ·
Library (a real table with type filters).

The persistent sidebar holds: New workspace, Home, Workspaces, My library,
Saved conversations, Recent chats, an "On this device" status card, and the
profile row.

## Scope

The design shows only what the PRD covers. Workspaces implement US-08; links
and pasted text implement US-01 criterion 3. Items that were in early drafts but
are outside the PRD (study plans, saved answers, study streak, workspace
"intention") were removed; their places hold in-scope features.
