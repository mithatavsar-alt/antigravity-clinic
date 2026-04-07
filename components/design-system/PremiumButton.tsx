'use client'

import { cn } from '@/lib/utils'

interface PremiumButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'gold' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  className?: string
}

/**
 * Premium Button — unified CTA component.
 *
 * Variants:
 * - primary: teal gradient — main CTA on light + dark surfaces
 * - secondary: gold outline — dark surface secondary action
 * - gold: gold gradient — premium emphasis CTA
 * - ghost: transparent + subtle border — dark surface tertiary
 *
 * Colors reference design-tokens via CSS variables where possible.
 */

const variants = {
  primary: [
    'bg-gradient-to-br from-medical-trust to-[#3A7F6A]',
    'text-white border-transparent',
    'shadow-[0_4px_20px_rgba(45,95,93,0.25)]',
    'hover:shadow-[0_12px_36px_rgba(45,95,93,0.40)] hover:-translate-y-1',
    'active:translate-y-0 active:shadow-[0_4px_16px_rgba(45,95,93,0.30)]',
  ].join(' '),
  secondary: [
    'bg-transparent border',
    'text-[var(--color-gold)] border-[var(--color-border-gold)]',
    'hover:bg-[rgba(214,185,140,0.06)] hover:border-[rgba(214,185,140,0.4)]',
    'hover:-translate-y-0.5',
  ].join(' '),
  gold: [
    'bg-gradient-to-r from-medical-gold via-medical-goldLight to-[#C9AD5E]',
    'text-[#1A1410] border-transparent',
    'shadow-gold-glow',
    'hover:shadow-[0_12px_36px_rgba(196,163,90,0.40)] hover:-translate-y-1',
    'active:translate-y-0',
  ].join(' '),
  ghost: [
    'btn-ghost bg-transparent border',
    'text-[var(--color-text-muted)] border-[var(--color-border)]',
    'hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]',
    'hover:bg-[rgba(237,234,230,0.03)]',
  ].join(' '),
}

const sizes = {
  sm: 'px-5 py-2.5 text-[11px] rounded-[10px] min-h-[38px]',
  md: 'px-7 py-3 text-[12px] rounded-xl min-h-[46px]',
  lg: 'px-9 py-4 text-[13px] rounded-xl min-h-[50px]',
}

export function PremiumButton({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  disabled,
  className,
}: PremiumButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'font-body font-medium tracking-[0.14em] uppercase',
        'transition-all duration-300 ease-out',
        'inline-flex items-center justify-center gap-2.5',
        variants[variant],
        sizes[size],
        disabled && 'opacity-40 cursor-not-allowed hover:translate-y-0 hover:shadow-none',
        className
      )}
    >
      {children}
    </button>
  )
}
