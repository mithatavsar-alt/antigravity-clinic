import { cn } from '@/lib/utils'

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass rounded-[16px] p-6 overflow-hidden', className)}>
      <div className="skeleton h-4 w-1/3 rounded mb-4" />
      <div className="skeleton h-6 w-2/3 rounded mb-3" />
      <div className="skeleton h-4 w-full rounded mb-2" />
      <div className="skeleton h-4 w-5/6 rounded" />
    </div>
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4 rounded"
          style={{ width: `${[100, 88, 76, 92, 68][i % 5]}%` }}
        />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[rgba(196,163,90,0.15)]">
      <div className="bg-[#F5F5F4] px-4 py-3 flex gap-4">
        {[120, 100, 80, 100, 80].map((w, i) => (
          <div key={i} className="skeleton h-3 rounded" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-4 flex gap-4 border-t border-[rgba(196,163,90,0.08)]">
          {[120, 100, 80, 100, 80].map((w, j) => (
            <div key={j} className="skeleton h-4 rounded" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  )
}
