'use client'

import { useRef, useState } from 'react'
import { CameraCapture } from './CameraCapture'
import { FaceGuideCapture } from './FaceGuideCapture'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { cn } from '@/lib/utils'

type TabId = 'frontal' | 'expression' | 'video'

export interface MediaSlots {
  front: string | null
  rightProfile: string | null
  leftProfile: string | null
  eyebrow: string | null
  smile: string | null
  video: string | null
}

const EMPTY_SLOTS: MediaSlots = {
  front: null, rightProfile: null, leftProfile: null,
  eyebrow: null, smile: null, video: null,
}

interface PhotoSlotProps {
  label: string
  value: string | null
  required?: boolean
  onUpload: (dataUrl: string) => void
  onRemove: () => void
  onCamera: () => void
}

function PhotoSlot({ label, value, required, onUpload, onRemove, onCamera }: PhotoSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => { if (e.target?.result) onUpload(e.target.result as string) }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.4)]">
        {label}{required && ' *'}
      </span>
      <div className="rounded-[12px] border border-[rgba(214,185,140,0.15)] overflow-hidden aspect-square bg-[rgba(20,18,15,0.4)] relative">
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="w-full h-full object-cover" />
            <button
              onClick={onRemove}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[rgba(26,26,46,0.6)] flex items-center justify-center hover:bg-[rgba(26,26,46,0.8)] transition-colors"
            >
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-3 h-full">
            <div className="w-8 h-8 rounded-full bg-[rgba(214,185,140,0.08)] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <div className="flex gap-1">
              <button onClick={() => fileRef.current?.click()} className="font-body text-[9px] tracking-[0.1em] text-[#D6B98C] hover:underline uppercase">Yükle</button>
              <span className="font-body text-[9px] text-[rgba(248,246,242,0.2)]">/</span>
              <button onClick={onCamera} className="font-body text-[9px] tracking-[0.1em] text-[#3D9B7A] hover:underline uppercase">Çek</button>
            </div>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
}

interface MediaUploadGridProps {
  value: MediaSlots
  onChange: (slots: MediaSlots) => void
}

export function MediaUploadGrid({ value, onChange }: MediaUploadGridProps) {
  const [activeTab, setActiveTab] = useState<TabId>('frontal')
  const [cameraTarget, setCameraTarget] = useState<keyof MediaSlots | null>(null)
  const [multiCaptureOpen, setMultiCaptureOpen] = useState(false)

  const update = (key: keyof MediaSlots, dataUrl: string | null) => {
    if (key === 'video' && value.video?.startsWith('blob:')) {
      URL.revokeObjectURL(value.video)
    }
    onChange({ ...value, [key]: dataUrl })
  }

  const tabClass = (id: TabId) => cn(
    'font-body text-[11px] tracking-[0.12em] uppercase px-4 py-2 rounded-full transition-all',
    activeTab === id
      ? 'bg-[rgba(214,185,140,0.12)] text-[#D6B98C]'
      : 'text-[rgba(248,246,242,0.35)] hover:text-[#F8F6F2]'
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2 flex-wrap">
        {(['frontal', 'expression', 'video'] as TabId[]).map((id) => (
          <button key={id} className={tabClass(id)} onClick={() => setActiveTab(id)}>
            {id === 'frontal' ? 'Önden' : id === 'expression' ? 'Mimik' : 'Video'}
          </button>
        ))}
      </div>

      {activeTab === 'frontal' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <PhotoSlot label="Önden" required value={value.front} onUpload={(v) => update('front', v)} onRemove={() => update('front', null)} onCamera={() => setCameraTarget('front')} />
            <PhotoSlot label="Sağ Profil" value={value.rightProfile} onUpload={(v) => update('rightProfile', v)} onRemove={() => update('rightProfile', null)} onCamera={() => setCameraTarget('rightProfile')} />
            <PhotoSlot label="Sol Profil" value={value.leftProfile} onUpload={(v) => update('leftProfile', v)} onRemove={() => update('leftProfile', null)} onCamera={() => setCameraTarget('leftProfile')} />
          </div>
          {/* Multi-capture shortcut */}
          {!value.front && (
            <button
              type="button"
              onClick={() => setMultiCaptureOpen(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-[12px] border border-dashed border-[rgba(61,155,122,0.25)] bg-[rgba(61,155,122,0.04)] hover:bg-[rgba(61,155,122,0.08)] transition-colors"
            >
              <svg className="w-4 h-4 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              <span className="font-body text-[11px] tracking-[0.1em] uppercase text-[#3D9B7A] font-medium">
                3 Fotoğrafı birden çek
              </span>
            </button>
          )}
        </div>
      )}

      {activeTab === 'expression' && (
        <div className="grid grid-cols-2 gap-3">
          <PhotoSlot label="Kaş Kaldırma" value={value.eyebrow} onUpload={(v) => update('eyebrow', v)} onRemove={() => update('eyebrow', null)} onCamera={() => setCameraTarget('eyebrow')} />
          <PhotoSlot label="Gülümseme" value={value.smile} onUpload={(v) => update('smile', v)} onRemove={() => update('smile', null)} onCamera={() => setCameraTarget('smile')} />
        </div>
      )}

      {activeTab === 'video' && (
        <div className="flex flex-col gap-3 items-center py-4">
          <p className="font-body text-[12px] text-[rgba(248,246,242,0.5)] text-center">
            İsteğe bağlı: Maks. 10 saniyelik yüz videosunu yükleyebilirsiniz.
          </p>
          {value.video ? (
            <div className="flex flex-col items-center gap-3">
              <video src={value.video} controls className="rounded-[12px] max-h-48" />
              <PremiumButton variant="ghost" size="md" onClick={() => update('video', null)}>Kaldır</PremiumButton>
            </div>
          ) : (
            <label className="cursor-pointer inline-block">
              <span className="font-body font-medium tracking-[0.15em] uppercase transition-all duration-300 inline-flex items-center gap-2 bg-gradient-to-br from-[#D6B98C] to-[#C4A35A] text-[#0E0B09] border-transparent px-7 py-3.5 text-[12px] rounded-[14px] cursor-pointer">
                Video Seç
              </span>
              <input type="file" accept="video/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  update('video', URL.createObjectURL(f))
                }} />
            </label>
          )}
        </div>
      )}

      {/* Single-slot guided capture */}
      {cameraTarget && cameraTarget !== 'video' && (
        <FaceGuideCapture
          onCapture={(dataUrl) => { update(cameraTarget, dataUrl); setCameraTarget(null) }}
          onClose={() => setCameraTarget(null)}
        />
      )}

      {/* Multi-capture flow: front → left → right */}
      {multiCaptureOpen && (
        <FaceGuideCapture
          mode="multi"
          onCapture={(dataUrl) => {
            // Fallback if onMultiCapture isn't triggered
            update('front', dataUrl)
            setMultiCaptureOpen(false)
          }}
          onMultiCapture={(photos) => {
            onChange({ ...value, front: photos.front, leftProfile: photos.left, rightProfile: photos.right })
            setMultiCaptureOpen(false)
          }}
          onClose={() => setMultiCaptureOpen(false)}
        />
      )}
    </div>
  )
}

export { EMPTY_SLOTS }
