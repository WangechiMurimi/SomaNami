import { useEffect, useRef, useState } from 'react'

/**
 * After a failed submit, moves focus to the first invalid field, or to the
 * form's alert when the problem isn't tied to one field. Call `reportError()`
 * whenever a submit fails.
 */
export function useFocusFirstError<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (attempt === 0) return
    const target = ref.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], [role="alert"]',
    )
    target?.focus()
  }, [attempt])

  return { formRef: ref, reportError: () => setAttempt((n) => n + 1) }
}
