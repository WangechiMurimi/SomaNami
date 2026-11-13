import { useState } from 'react'
import type { ComponentProps } from 'react'
import TextField from './TextField.tsx'

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  'type' | 'trailing'
> & {
  autoComplete: 'current-password' | 'new-password'
}

/** A password input with a show/hide toggle. Paste is never blocked. */
export default function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      // Stop the browser rewriting a revealed password.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={props.id}
          className="h-10 min-w-[44px] rounded-[8px] px-3 text-[13px] font-medium text-accent hover:bg-tint"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
    />
  )
}
