/** Minimum password length; must match Supabase Auth > Providers > Email. */
export const MIN_PASSWORD = 10

/**
 * Wireframe classes for the account screens (#142): the final auth design
 * isn't done, so these are deliberately plain (monochrome, square, no fills
 * but the primary action). What stays is what accessibility needs: 48 px
 * inputs and 44 px buttons, ≥ 3:1 borders, visible focus, and a distinct
 * error state that doesn't rely on colour alone.
 */
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg'

export const LABEL = 'block text-[15px] leading-[1.5] font-medium text-fg'
export const HINT = 'mt-1 text-[13px] leading-[1.5] text-muted'
export const FIELD_ERROR =
  'mt-1.5 text-[13px] leading-[1.5] font-medium text-warn'
export const INPUT = `mt-1.5 block h-12 w-full border bg-surface px-3 text-[15px] text-fg placeholder:text-muted ${FOCUS}`
export const INPUT_OK = 'border-edge'
export const INPUT_ERROR = 'border-2 border-warn'
export const CHECKBOX = `mt-0.5 size-5 flex-none ${FOCUS}`
export const PRIMARY_BUTTON = `inline-flex h-11 w-full items-center justify-center border border-fg bg-fg px-4 text-sm font-medium text-ground disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`
export const SECONDARY_BUTTON = `inline-flex h-11 items-center justify-center border border-fg px-4 text-sm font-medium text-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`
export const TEXT_LINK = `font-medium text-fg underline underline-offset-2 hover:no-underline ${FOCUS}`
