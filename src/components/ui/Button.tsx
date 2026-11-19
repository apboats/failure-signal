import { LoaderCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'bg-surface-2 text-text hover:bg-surface-2/70',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  /** Destructive confirm only. Dark text on --color-neg keeps 4.5:1. */
  danger: 'bg-neg text-bg hover:bg-neg/90',
}

interface ButtonBase {
  variant?: ButtonVariant
  size?: ButtonSize
  /** A lucide icon element, rendered at 16px before the label. */
  icon?: ReactNode
  loading?: boolean
  className?: string
}

/** An icon-only button (no children) must carry an aria-label. */
type Labelled =
  | { children: ReactNode; 'aria-label'?: string }
  | { children?: undefined; 'aria-label': string }

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  iconOnly: boolean,
  className?: string,
): string {
  return cx(
    'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
    size === 'sm'
      ? iconOnly
        ? 'p-1.5 text-xs'
        : 'px-2.5 py-1.5 text-xs'
      : iconOnly
        ? 'p-2 text-sm'
        : 'px-3 py-2 text-sm',
    VARIANT[variant],
    className,
  )
}

function Icon({ icon, loading }: { icon?: ReactNode; loading?: boolean }) {
  if (loading)
    return <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
  if (!icon) return null
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-4">
      {icon}
    </span>
  )
}

export type ButtonProps = ButtonBase &
  Labelled &
  Omit<ComponentProps<'button'>, 'children' | 'aria-label' | 'className'>

export function Button(props: ButtonProps) {
  const {
    variant = 'secondary',
    size = 'md',
    icon,
    loading = false,
    className,
    children,
    'aria-label': ariaLabel,
    disabled,
    type = 'button',
    ...rest
  } = props
  const iconOnly = children === undefined || children === null
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={classes(variant, size, iconOnly, className)}
      {...rest}
    >
      <Icon icon={icon} loading={loading} />
      {children}
    </button>
  )
}

export type ButtonLinkProps = ButtonBase &
  Labelled &
  Omit<LinkProps, 'children' | 'aria-label' | 'className'>

/** A react-router Link styled as a Button (e.g. "Create alert", "Open position"). */
export function ButtonLink(props: ButtonLinkProps) {
  const {
    variant = 'secondary',
    size = 'md',
    icon,
    className,
    children,
    'aria-label': ariaLabel,
    ...rest
  } = props
  const iconOnly = children === undefined || children === null
  return (
    <Link
      aria-label={ariaLabel}
      className={classes(variant, size, iconOnly, className)}
      {...rest}
    >
      <Icon icon={icon} />
      {children}
    </Link>
  )
}
