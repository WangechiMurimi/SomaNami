import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Eye, EyeOff } from '../../components/icons.tsx'
import TextField from './TextField.tsx'

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  'type' | 'trailing'
> & {
  autoComplete: 'current-password' | 'new-password'
}

/**
 * A password input with an eye toggle that appears once something is typed.
 * Paste is never blocked.
 */
export default function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const hasValue = String(props.value ?? '').length > 0
  // An emptied field goes back to hidden, so the next password starts masked.
  const revealed = visible && hasValue
  return (
    <TextField
      {...props}
      type={revealed ? 'text' : 'password'}
      // Stop the browser rewriting a revealed password.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        hasValue ? (
          <button
            type="button"
            onClick={() => setVisible(!revealed)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-controls={props.id}
            className="flex size-10 items-center justify-center rounded-[8px] text-muted hover:bg-tint hover:text-fg"
          >
            {revealed ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        ) : undefined
      }
    />
  )
}
