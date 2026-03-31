'use client'

import Image from 'next/image'
import { useState } from 'react'

interface ImageWithFallbackProps {
  src: string
  alt: string
  fill?: boolean
  className?: string
  sizes?: string
  priority?: boolean
  fallbackIcon?: 'face' | 'treatment' | 'skincare' | 'glow'
}

const icons: Record<string, React.ReactNode> = {
  face: (
    <svg className="w-16 h-16" viewBox="0 0 200 280" fill="none" stroke="currentColor" strokeWidth="1" opacity={0.18}>
      <ellipse cx="100" cy="130" rx="70" ry="95" />
      <path d="M50 100 Q65 88 85 92" />
      <path d="M115 92 Q135 88 150 100" />
      <ellipse cx="75" cy="110" rx="15" ry="8" />
      <ellipse cx="125" cy="110" rx="15" ry="8" />
      <path d="M88 145 Q100 155 112 145" />
      <path d="M80 170 Q90 162 100 165 Q110 162 120 170" />
      <path d="M80 170 Q100 182 120 170" />
    </svg>
  ),
  treatment: (
    <svg className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24" opacity={0.18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  ),
  skincare: (
    <svg className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24" opacity={0.18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  ),
  glow: (
    <svg className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24" opacity={0.18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
}

const gradients: Record<string, string> = {
  face: 'linear-gradient(160deg, #F5EDE2 0%, #EDE4DB 40%, #E8D5C4 100%)',
  treatment: 'linear-gradient(160deg, #F0EBE4 0%, #E8E0D6 50%, #DDD5CB 100%)',
  skincare: 'linear-gradient(160deg, #F5EDE2 0%, #F0E6DA 50%, #E8D5C4 100%)',
  glow: 'linear-gradient(160deg, #EDE4DB 0%, #E8D5C4 50%, #DDD0C2 100%)',
}

export function ImageWithFallback({
  src,
  alt,
  fill = true,
  className = '',
  sizes,
  priority = false,
  fallbackIcon = 'face',
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div
        className={`absolute inset-0 flex items-center justify-center text-[#C4A35A] ${className}`}
        style={{ background: gradients[fallbackIcon] }}
      >
        {icons[fallbackIcon]}
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      className={className}
      sizes={sizes}
      priority={priority}
      onError={() => setHasError(true)}
    />
  )
}
