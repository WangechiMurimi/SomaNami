/** Minimum password length; must match Supabase Auth > Providers > Email. */
export const MIN_PASSWORD = 10

/** Shared classes for the account screens (DESIGN.md: 48px inputs, 44px buttons). */
export const LABEL = 'block text-[15px] leading-[1.5] font-semibold text-fg'
export const HINT = 'mt-1 text-[13px] leading-[1.5] text-muted'
export const FIELD_ERROR =
  'mt-1.5 text-[13px] leading-[1.5] font-medium text-warn'
export const INPUT =
  'mt-2 block h-12 w-full rounded-[10px] border bg-surface px-3.5 text-base text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
export const INPUT_OK = 'border-edge'
export const INPUT_ERROR = 'border-warn border-2'
export const PRIMARY_BUTTON =
  'inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
/** The one submit on a sign-in screen: taller than PRIMARY_BUTTON, as drawn. */
export const SUBMIT_BUTTON =
  'inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-accent px-[18px] text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60'
/** "Continue with Google": outlined so the form's own submit stays the strongest button. */
export const GOOGLE_BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] border border-edge bg-surface px-4 text-[15px] font-medium text-fg transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60'
/** A labelled checkbox row ("Keep me signed in", "I'm 13 or older"); 44px tall to tap. */
export const CHECKBOX_ROW =
  'flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-[1.5] text-fg'
export const CHECKBOX = 'mt-0.5 size-5 flex-none accent-accent'
/** "Step 1 of 2" above a multi-step form. */
export const STEP_LABEL =
  'text-xs leading-[1.5] font-medium tracking-[0.06em] text-muted uppercase'
export const SECONDARY_BUTTON =
  'inline-flex h-11 items-center justify-center rounded-[10px] border border-edge px-[18px] text-sm font-medium text-fg transition-colors hover:bg-tint'
export const TEXT_LINK =
  'font-medium text-accent underline underline-offset-2 hover:no-underline'
/** A link standing alone beside a label, so it needs no underline to read as one. */
export const SMALL_LINK =
  'text-sm leading-[1.5] font-medium text-accent hover:underline underline-offset-2'
/** The centred "New to SomaNami? Create an account" line under a form. */
export const AUTH_FOOTER =
  'mt-6 text-center text-[15px] leading-[1.5] text-muted'
// Keeps the underline: inside a sentence, colour alone wouldn't mark it as a link.
export const FOOTER_LINK =
  'font-semibold text-accent underline underline-offset-2 hover:no-underline'
