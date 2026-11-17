/** Shared classes for the Account settings cards, from the design canvas. */
export const CARD =
  'flex min-w-0 flex-col gap-[1.125rem] rounded-2xl border border-line bg-surface p-5 sm:p-7'
export const CARD_TITLE = 'text-xl leading-[1.3] font-semibold text-fg'

const BUTTON =
  'inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-[10px] border bg-surface px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'
export const SECONDARY = `${BUTTON} border-edge text-fg hover:bg-tint`
export const DESTRUCTIVE = `${BUTTON} border-edge text-warn hover:bg-warn-soft`
