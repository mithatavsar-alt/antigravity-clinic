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
  href?: string
}

const variants = {
  primary: 'bg-gradient-to-br from-[#2D5F5D] to-[#3D7A5F] text-white border-transparent hover:shadow-[0_8px_24px_rgba(45,95,93,0.3)] hover:-translate-y-0.5',
  secondary: 'bg-transparent text-[#C4A35A] border border-[#C4A35A] hover:bg-[rgba(196,163,90,0.06)] hover:-translate-y-0.5',
  gold: 'bg-gradient-to-r from-[#C4A35A] to-[#D4B96A] text-white border-transparent hover:shadow-[0_8px_24px_rgba(196,163,90,0.35)] hover:-translate-y-0.5',
  ghost: 'btn-ghost bg-transparent text-[#78716C] border border-[rgba(196,163,90,0.2)] hover:text-[#1A1A2E] hover:border-[rgba(196,163,90,0.4)]',
}

const sizes = {
  sm: 'px-5 py-2.5 text-[11px] rounded-[10px]',
  md: 'px-7 py-3.5 text-[12px] rounded-[14px]',
  lg: 'px-9 py-4 text-[13px] rounded-[14px]',
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
        'font-body font-medium tracking-[0.15em] uppercase transition-all duration-300 inline-flex items-center gap-2',
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none',
        className
      )}
    >
      {children}
    </button>
  )
}
