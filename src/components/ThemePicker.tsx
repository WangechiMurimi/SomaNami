import { useTheme, type ThemePreference } from '../lib/theme/use-theme.ts'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** Light, dark or follow the system, as a segmented radio group. */
export default function ThemePicker() {
  const { preference, setPreference } = useTheme()

  return (
    <fieldset>
      <legend className="text-[15px] leading-[1.5] font-medium">Theme</legend>
      <div className="mt-2 inline-flex flex-wrap gap-1 rounded-[12px] border border-line bg-ground p-1">
        {OPTIONS.map((option) => (
          // Native radios keep arrow-key behaviour; the label is the visible pill.
          <label
            key={option.value}
            className="relative inline-flex h-11 cursor-pointer items-center rounded-[10px] px-4 text-sm text-muted transition-colors hover:text-fg has-checked:bg-surface has-checked:font-medium has-checked:text-accent has-checked:shadow-[0_1px_2px_rgb(0_0_0/0.08)] has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => setPreference(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
