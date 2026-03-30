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
  primary: 'bg-gradient-to-br from-[#2D5F5D] to-[#3A7F6A] text-white border-transparent shadow-[0_4px_16px_rgba(45,95,93,0.20)] hover:shadow-[0_12px_32px_rgba(45,95,93,0.35)] hover:-translate-y-1 active:translate-y-0 active:shadow-[0_4px_12px_rgba(45,95,93,0.25)]',
  secondary: 'bg-transparent text-[#D6B98C] border border-[rgba(214,185,140,0.25)] hover:bg-[rgba(214,185,140,0.06)] hover:border-[rgba(214,185,140,0.4)] hover:-translate-y-0.5',
  gold: 'bg-gradient-to-r from-[#C4A35A] via-[#D4B96A] to-[#C9AD5E] text-[#1A1410] border-transparent shadow-[0_4px_20px_rgba(196,163,90,0.25)] hover:shadow-[0_12px_36px_rgba(196,163,90,0.40)] hover:-translate-y-1 active:translate-y-0',
  ghost: 'btn-ghost bg-transparent text-[rgba(248,246,242,0.5)] border border-[rgba(214,185,140,0.12)] hover:text-[rgba(248,246,242,0.85)] hover:border-[rgba(214,185,140,0.25)] hover:bg-[rgba(248,246,242,0.03)]',
}

const sizes = {
  sm: 'px-5 py-2.5 text-[10px] rounded-[12px] min-h-[36px]',
  md: 'px-7 py-3.5 text-[11px] rounded-[14px] min-h-[44px]',
  lg: 'px-10 py-4.5 text-[12px] rounded-[16px] min-h-[52px]',
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
        'font-body font-medium tracking-[0.16em] uppercase transition-all duration-300 ease-out inline-flex items-center gap-2.5',
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
