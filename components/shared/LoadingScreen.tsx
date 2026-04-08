import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { ThinLine } from '@/components/design-system/ThinLine'

interface LoadingScreenProps {
  title?: string
  subtitle?: string
  steps?: string[]
}

export function LoadingScreen({
  title = 'Yükleniyor',
  subtitle,
  steps = [],
}: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5 flex items-center">
      <div className="max-w-lg mx-auto w-full">
        <GlassCard strong padding="lg" rounded="xl">
          <div className="flex flex-col items-center text-center gap-6">
            <SectionLabel className="justify-center">İşleniyor</SectionLabel>
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-[rgba(196,163,90,0.2)] bg-[rgba(255,254,249,0.65)]">
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#C4A35A] border-r-[#2D5F5D] animate-spin" />
              <div className="w-12 h-12 rounded-full bg-[rgba(196,163,90,0.08)]" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[clamp(24px,4vw,36px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
                {title}
              </h1>
              {subtitle && (
                <p className="font-body text-[14px] text-[rgba(26,26,46,0.65)] leading-relaxed">{subtitle}</p>
              )}
            </div>
            {steps.length > 0 && (
              <>
                <ThinLine width={64} />
                <div className="w-full flex flex-col gap-3">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-[12px] border border-[rgba(196,163,90,0.12)] bg-[rgba(255,254,249,0.55)] px-4 py-3"
                      style={{ animationDelay: `${i * 180}ms` }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#C4A35A] flex-shrink-0" />
                      <span className="font-body text-[15px] text-[rgba(26,26,46,0.62)]">{step}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
