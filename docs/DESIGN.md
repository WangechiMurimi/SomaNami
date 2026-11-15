# SomaNami design

The source of truth for visuals is the design canvas
(https://claude.ai/artifact/FVaFnBJsjyosrSxEmzodsc, ask the owner for access).
This file records the decisions the code depends on; when the two disagree,
update whichever is wrong in the same pull request.

## Principles

- **Your materials, nothing else.** Answers come only from the sources the
  learner provided (uploads, pasted text, links). Say it lightly, at most once
  per screen; never in titles or on every message. Make no privacy claims about
  uploads and show no online/offline status: learners are treated as online.
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
| `warn`       | `#9A3B26` | `#F2A58E` | Warnings, unanswerable replies (≥ 6:1)     |

Soft backgrounds: `success-soft` `#E4F1E9` / `#1E3328`, `warn-soft` `#FBEDE8` /
`#3A2420`. (The `online` status-dot token was removed with the connection
status UI.)

**Theme.** Light, Dark or System, chosen in Account settings (System is the
default). A fixed choice is kept in the browser (`somanami-theme`) and applied
as `data-theme` on `<html>` before first paint; System removes the attribute so
the CSS media query follows the OS live.

## Type

Inter 400/500/600 for everything; Manjari 700 for the "SomaNami" wordmark only.

| Role               | Size  | Weight | Line height | Notes          |
| ------------------ | ----- | ------ | ----------- | -------------- |
| Page title (H1)    | 40 px | 400    | 1.25        | −0.01em        |
| Auth form title    | 32 px | 400    | 1.25        | −0.01em        |
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
Library (a real table with type filters) · Account settings.

Screen details the code depends on:

- **Workspace:** Chats (each with an "N sources" disclosure and Continue) beside
  "Your materials". Materials carry checkboxes, and a question asked from the
  workspace uses only the ticked ones; Send is disabled while none are ticked.
- **Chat:** a tinted lock chip names the materials in use. Cited passages open
  in place from their chip. Under the latest grounded answer, "Show another
  format" (Example, Summary) asks a follow-up in the same chat; there is no
  server-side format or level setting yet.
- **Library:** filters use the file types the app records (All · PDF · Word ·
  Text), not notes/readings/slides, which aren't tracked.
- **Account settings:** cards for Profile (email, read-only until profiles
  exist), Appearance (theme), Privacy and data (a link to "How your data is
  handled" and "Remove my materials and sign out", with no privacy promises),
  Sign out, and Two-step verification. There is no device or connection status.
- **Help** (`/help`): six numbered topic cards (adding materials, asking and
  following up, checking the source, workspaces, Recents, saving chats), a
  panel explaining the "From your materials" and "Not answered from your
  materials" labels, and a link to the data page. The lede carries the one
  grounding sentence.
- **How your data is handled** (public `/privacy`): one reading column of
  cards (what we keep, where it's stored, how answers are made, removing your
  data). It states only what the code does; anything unconfirmed (storage and
  retention, model and hosting, account deletion, contact, date) shows as a
  visible `[CONFIRM: …]` placeholder for the owner. It never names the
  development model provider.

The persistent sidebar (260 px, sticky to the viewport) holds: New workspace,
Home, Workspaces, My library, Saved conversations, Recents, and the account
menu. Recents lists loose chats only (conversations in the default workspace,
`isLooseWorkspace`), newest first; chats in a workspace stay with it. The
account row is a menu button (`aria-haspopup="menu"`) that opens Account
settings and Log out; arrow keys move between items, and Escape, Tab or a click
outside close it, with Escape returning focus to the button.

On `md` and up the sidebar collapses to an 80 px icon rail: brand mark, New
workspace, the four nav icons and the account avatar, each with an accessible
name and a `title` tooltip; Recents is hidden. The choice persists in
localStorage (`somanami-sidebar`, default expanded). Below `md` the sidebar is
an overlay drawer and always shows in full. There is no offline notice or
connection status anywhere.

The top bar holds the sidebar toggle ("Collapse sidebar" / "Expand sidebar";
a menu button below `md`), the page's breadcrumb trail (`useBreadcrumbs` in
`src/app/breadcrumbs.ts`) and Help. The theme lives in Account settings; Log
out is in the account menu and Account settings.

Auth screens (sign in, sign up, password reset, MFA) share one two-panel
layout: a brand panel on `side` with three feature rows and an ownership line, and
a form column up to 420 px wide. The form comes first on phones and in the
source order.

Proposed screens not yet built (Create account per #142, Saved conversations,
chat level/format and edge states, empty states) are in row 2 of the canvas,
marked as proposals. Help and the data note are built from their artboards,
with copy rewritten for the source-scoping message (see
`docs/notes/comments.md`).

## Scope

The design shows only what the PRD covers. Workspaces implement US-08; links
and pasted text implement US-01 criterion 3. Items that were in early drafts but
are outside the PRD (study plans, saved answers, study streak, workspace
"intention") were removed; their places hold in-scope features.
