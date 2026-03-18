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
          <div key={s} className="flex-1 h-0.5 rounded-full overflow-hidden bg-[rgba(248,246,242,0.06)]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: currentStep >= s ? '100%' : '0%',
                background: 'linear-gradient(90deg, #D6B98C, #C4A35A)',
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
            style={{ color: currentStep >= i + 1 ? '#D6B98C' : 'rgba(248,246,242,0.25)' }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
