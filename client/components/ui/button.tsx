import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:opacity-85',
  secondary: 'bg-surface-2 text-fg hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--line)]',
  outline: 'border border-line bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-accent hover:bg-surface-2',
  danger: 'border border-bad/40 text-bad hover:bg-bad-bg',
};
const SIZES: Record<Size, string> = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-[background-color,box-shadow,opacity,transform] duration-300 ease-sarvam active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
