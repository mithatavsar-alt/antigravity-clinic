export function HeroWireframe() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none hidden lg:flex">
      <svg
        viewBox="0 0 200 280"
        className="h-[55vh] w-auto"
        fill="none"
        stroke="rgba(214,185,140,0.03)"
        strokeWidth="0.5"
      >
        {/* Face oval */}
        <ellipse cx="100" cy="130" rx="70" ry="95" />
        {/* Brow lines */}
        <path d="M50 100 Q65 88 85 92" />
        <path d="M115 92 Q135 88 150 100" />
        {/* Eyes */}
        <ellipse cx="75" cy="110" rx="15" ry="8" />
        <ellipse cx="125" cy="110" rx="15" ry="8" />
        {/* Nose */}
        <path d="M100 100 L100 145" />
        <path d="M88 145 Q100 155 112 145" />
        {/* Lips */}
        <path d="M80 170 Q90 162 100 165 Q110 162 120 170" />
        <path d="M80 170 Q100 182 120 170" />
        {/* Jawline */}
        <path d="M30 130 Q35 190 65 220 Q85 240 100 245" />
        <path d="M170 130 Q165 190 135 220 Q115 240 100 245" />
        {/* Guide lines */}
        <line x1="100" y1="35" x2="100" y2="245" strokeDasharray="4 8" />
        <line x1="40" y1="110" x2="160" y2="110" strokeDasharray="4 8" />
        <line x1="50" y1="145" x2="150" y2="145" strokeDasharray="4 8" />
        <line x1="55" y1="170" x2="145" y2="170" strokeDasharray="4 8" />
      </svg>
    </div>
  )
}
