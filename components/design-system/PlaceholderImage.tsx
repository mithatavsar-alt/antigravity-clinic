import { cn } from '@/lib/utils'

type PlaceholderVariant = 'portrait' | 'editorial' | 'treatment' | 'media' | 'before-after' | 'upload'

interface PlaceholderImageProps {
  variant?: PlaceholderVariant
  className?: string
  label?: string
  aspectRatio?: string
}

export function PlaceholderImage({
  variant = 'portrait',
  className,
  label,
  aspectRatio,
}: PlaceholderImageProps) {
  const configs: Record<PlaceholderVariant, { bg: string; content: React.ReactNode }> = {
    portrait: {
      bg: 'bg-gradient-to-b from-[#F5E6D3] via-[#F0DDD5] to-[#E8E4EF]',
      content: (
        <div className="flex flex-col items-center gap-6">
          {/* Face silhouette */}
          <div className="relative">
            <div className="w-28 h-36 rounded-[50%_50%_45%_45%_/_35%_35%_42%_42%] bg-gradient-to-b from-[#E8D5C4] to-[#D4C4B0] opacity-60" />
            <div className="absolute inset-0 rounded-[50%_50%_45%_45%_/_35%_35%_42%_42%] ring-1 ring-[rgba(196,163,90,0.3)]" />
          </div>
          <div className="w-16 h-px bg-[rgba(196,163,90,0.4)]" />
          <p className="font-body text-[11px] tracking-[0.25em] uppercase text-[rgba(26,26,46,0.35)]">
            Portrait
          </p>
        </div>
      ),
    },
    editorial: {
      bg: 'bg-gradient-to-br from-[#F0DDD5] via-[#F5E6D3] to-[#E8E4EF]',
      content: (
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border border-[rgba(196,163,90,0.4)] flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border border-[rgba(196,163,90,0.25)]">
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-display text-2xl font-light text-[rgba(196,163,90,0.5)]">AG</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    treatment: {
      bg: 'bg-gradient-to-br from-[#F5E6D3] to-[#E8E4EF]',
      content: (
        <span className="text-5xl text-[rgba(196,163,90,0.5)]">◉</span>
      ),
    },
    media: {
      bg: 'bg-[rgba(255,254,249,0.6)]',
      content: (
        <div className="flex flex-col items-center gap-2">
          <svg className="w-8 h-8 text-[rgba(26,26,46,0.2)]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="font-body text-[11px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.3)]">
            {label ?? 'Fotoğraf bekleniyor'}
          </p>
        </div>
      ),
    },
    'before-after': {
      bg: 'bg-[#FAF6F1]',
      content: (
        <div className="flex flex-col items-center gap-2">
          <p className="font-display text-sm italic text-[rgba(26,26,46,0.35)]">
            {label ?? 'Henüz görsel eklenmedi'}
          </p>
        </div>
      ),
    },
    upload: {
      bg: 'bg-gradient-platinum',
      content: (
        <div className="flex flex-col items-center gap-3">
          <svg className="w-10 h-10 text-[rgba(139,127,168,0.5)]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="font-body text-[13px] text-[rgba(26,26,46,0.5)] text-center">
            Fotoğraf yüklemek için tıklayın<br/>
            <span className="text-[12px] text-[rgba(26,26,46,0.35)]">veya sürükleyip bırakın</span>
          </p>
          <p className="font-body text-[11px] text-[rgba(26,26,46,0.3)] tracking-[0.1em] uppercase">
            JPEG · PNG · WebP · Maks 5MB
          </p>
        </div>
      ),
    },
  }

  const { bg, content } = configs[variant]
  const borderStyle = variant === 'upload' || variant === 'media' || variant === 'before-after'
    ? 'border border-dashed border-[rgba(196,163,90,0.25)]'
    : ''

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[16px] overflow-hidden',
        bg,
        borderStyle,
        className
      )}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {content}
    </div>
  )
}
