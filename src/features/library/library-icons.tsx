import { Icon, type IconProps } from '../../components/icons.tsx'

/** A magnifier for the library search field; decorative, the field is labelled. */
export const SearchIcon = ({ strokeWidth = 1.9, ...props }: IconProps) => (
  <Icon strokeWidth={strokeWidth} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)
