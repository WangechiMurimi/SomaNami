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
Workspace · New chat (pick the materials the chat may use) · Chat (answers with
"From your materials" citations; replies the materials can't support are
labelled "Not answered from your materials") · Library · Saved conversations ·
Account settings · Help · How your data is handled.

Chats are either **loose** (started from Home or the Library; they live in the
hidden default workspace, appear under Recents and may use any material) or
**workspace chats** (user-organised; they may use only that workspace's
materials, US-08 AC3). Either kind can be saved.

Screen details the code depends on:

- **Home:** one composer. Files attach inside the input box: a ghost chip
  while a file is read and saved, then a chip with its type icon and a remove
  button (removing deletes the file it added). The question is typed in the
  same box. The box glows on focus (`.composer:focus-within`, the only
  shadow). Send needs a question and at least one ready file, and opens the
  new loose chat directly, asking the question there.
- **Workspaces:** the default workspace is never listed (`userWorkspaces()`);
  pinned workspaces come first. The whole card opens the workspace; a
  vertical-dots menu (visible on hover and keyboard focus, always on touch)
  offers Open, Add sources, Remove sources, Rename, Pin/Unpin and Delete. Delete
  confirms and says the workspace's chats and materials go with it. Removing a
  source moves it out of the workspace; it stays in My library.
- **Workspace:** content starts directly under a compact header (name, Add
  sources, Remove sources). Chats (each with an "N sources" disclosure, Save
  toggle and Continue) sit beside "Your materials"; a question asked from the
  workspace uses only the ticked materials.
- **Chat:** the header lists the chat's sources with type icons and has a
  Save / Saved toggle (`aria-pressed`). Cited passages open in place from their
  chip. Under the latest grounded answer, "Show another format" (Example,
  Summary) asks a follow-up in the same chat; level and format settings need
  server work (TODO #28, #40). A failed request shows "Couldn't get an answer.
  Try again."; there is no offline state. When the model's server is asleep
  (#201), an assistant-shaped bubble says "Starting up the tutor" with three
  pulsing `accent` dots and "This takes about a minute. Your question will be
  sent as soon as it's ready." The question stays in the transcript, the
  composer is disabled, and the question is resent automatically with backoff;
  after about four minutes a retryable warning takes over.
- **Library:** a search field filters conversations and file names, grouped
  under Conversations and Files. Type filters use the file types the app
  records (All · PDF · Word · Text). Clicking a file starts a loose chat with
  it.
- **Saved conversations** (`/conversations`): saved chats from Recents and from
  workspaces, each labelled with its workspace or "Recents", with Unsave, a
  title search and a workspace filter.
- **Account settings:** cards for Profile (display name from the profile,
  with "Change your name", and the email) and Appearance (theme), then the
  Sign out section: this device, every device, and Erase my materials. There
  is no device or connection status.
- **Help** (`/help`): six numbered topic cards (adding materials, asking and
  following up, checking the source, workspaces, Recents, saving chats), a
  panel explaining the "From your materials" and "Not answered from your
  materials" labels, and a link to the data page. The lede carries the one
  grounding sentence.
- **How your data is handled** (public `/your-data`) and **Terms of Use**
  (public `/terms`): reading pages. Anything the owner hasn't confirmed shows
  as a visible `[CONFIRM: …]` placeholder. Neither names the development
  model provider.

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

**Auth screens.** Sign in ("Welcome back") · Create account · A few details
(display name, "I'm 13 or older") · Forgot and new password · Signing you in
(`/auth/callback`). They share one two-panel layout (`AuthLayout`): a brand
panel on `side` with three feature rows and a link to "How your data is
handled" (`/your-data`), and a form column up to 420 px wide that comes first on
phones and in the source order. An outlined "Continue with Google" button comes
first, then an "or use your email" rule and the email form, with the taller
`SUBMIT_BUTTON` as the strongest action. Classes live in
`src/features/auth/auth-ui.ts`: 48 px inputs, 44 px buttons (48 px submit),
≥ 3:1 borders, visible focus and errors that don't rely on colour alone. The
restyle (#176) replaces the earlier plain wireframes (ADR 0001) as the auth
design. How your data is handled uses the same layout's single wide reading
column.

Row 2 of the canvas holds the screens proposed after the first pass. Create
account, Saved conversations, Help and the data note are built from them, with
copy rewritten so the one product claim is that answers come only from the
sources the learner adds. Chat level/format controls and the remaining empty
states are not built yet.

## Scope

The design shows only what the PRD covers. Workspaces implement US-08; links
and pasted text implement US-01 criterion 3. Items that were in early drafts but
are outside the PRD (study plans, saved answers, study streak, workspace
"intention") were removed; their places hold in-scope features.
