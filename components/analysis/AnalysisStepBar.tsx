'use client'

interface AnalysisStepBarProps {
  currentStep: 1 | 2 | 3
  labels?: [string, string, string]
}

const defaultLabels: [string, string, string] = ['Kişisel Bilgiler', 'Fotoğraf', 'Onay']

export function AnalysisStepBar({
  currentStep,
  labels = defaultLabels,
}: AnalysisStepBarProps) {
  return (
    <div className="flex flex-col gap-3 mb-8">
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1 h-0.5 rounded-full overflow-hidden bg-[rgba(196,163,90,0.12)]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: currentStep >= s ? '100%' : '0%',
                background: 'linear-gradient(90deg, #C4A35A, #D4B96A)',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {labels.map((label, i) => (
          <span
            key={label}
            className="font-body text-[10px] tracking-[0.12em] uppercase transition-colors"
            style={{ color: currentStep >= i + 1 ? '#C4A35A' : 'rgba(26,26,46,0.3)' }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
