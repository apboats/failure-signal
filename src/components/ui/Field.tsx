import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'

export interface FieldProps {
  label: ReactNode
  /** The control's id; the label points at it. */
  htmlFor: string
  hint?: ReactNode
  /** Inline validation message (role="alert"). */
  error?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Label + control + hint/error. Hint and error carry the ids `${htmlFor}-hint`
 * and `${htmlFor}-error` for an aria-describedby on the control.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-neg">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'focus-ring w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-neg'

export type InputProps = ComponentProps<'input'> & { invalid?: boolean }

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(CONTROL, className)}
      {...props}
    />
  )
}

export type SelectProps = ComponentProps<'select'> & { invalid?: boolean }

export function Select({
  className,
  invalid,
  children,
  ...props
}: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cx(CONTROL, className)}
      {...props}
    >
      {children}
    </select>
  )
}

export type TextareaProps = ComponentProps<'textarea'> & { invalid?: boolean }

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cx(CONTROL, 'min-h-20', className)}
      {...props}
    />
  )
}

export interface RangeProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'step' | 'className'
> {
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  /** How the live value reads, e.g. formatScore. */
  format?: (value: number) => string
  className?: string
}

/** Range slider with its current value shown in a meta span and announced via aria-valuetext. */
export function Range({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  format = String,
  className,
  ...props
}: RangeProps) {
  return (
    <span className={cx('flex items-center gap-3', className)}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-valuetext={format(value)}
        onChange={(event) => onValueChange(event.target.valueAsNumber)}
        className="focus-ring h-2 w-full cursor-pointer rounded-full accent-accent"
        {...props}
      />
      <span
        aria-hidden="true"
        className="w-12 shrink-0 text-right text-xs text-muted tabular-nums"
      >
        {format(value)}
      </span>
    </span>
  )
}

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  id: string
  label: ReactNode
}

export function Checkbox({ id, label, className, ...props }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cx(
        'inline-flex items-center gap-2 text-sm text-text',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="focus-ring size-4 rounded accent-accent"
        {...props}
      />
      {label}
    </label>
  )
}
