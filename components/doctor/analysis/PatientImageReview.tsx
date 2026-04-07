'use client'

import { useState } from 'react'
import { useSignedUrls, resolvePhotoSrc } from '@/lib/supabase/use-signed-urls'

interface PatientImageReviewProps {
  frontPhoto?: string
  leftPhoto?: string
  rightPhoto?: string
  additionalPhotos?: string[]
}

const labels: Record<string, string> = {
  front: 'Ön',
  left: 'Sol',
  right: 'Sağ',
}

export function PatientImageReview({ frontPhoto, leftPhoto, rightPhoto, additionalPhotos = [] }: PatientImageReviewProps) {
  const allPaths = [frontPhoto, leftPhoto, rightPhoto, ...additionalPhotos].filter(Boolean) as string[]
  const signedUrls = useSignedUrls(allPaths)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  const photos = [
    { key: 'front', path: frontPhoto },
    { key: 'left', path: leftPhoto },
    { key: 'right', path: rightPhoto },
  ].filter((p) => p.path)

  if (photos.length === 0 && additionalPhotos.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(14,11,9,0.4)] p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[rgba(248,246,242,0.03)] flex items-center justify-center">
          <svg className="w-5 h-5 text-[rgba(248,246,242,0.2)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5V19.5a1.5 1.5 0 001.5 1.5z" />
          </svg>
        </div>
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.3)]">Hasta fotoğrafı mevcut değil</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {photos.map(({ key, path }) => {
          const src = resolvePhotoSrc(path, signedUrls) ?? path
          return (
            <button
              key={key}
              onClick={() => src && setPreviewSrc(src)}
              className="group relative aspect-[3/4] rounded-xl overflow-hidden border border-[rgba(248,246,242,0.06)] bg-[rgba(14,11,9,0.6)] hover:border-[rgba(214,185,140,0.2)] transition-colors"
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={labels[key]} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-[rgba(248,246,242,0.04)] animate-pulse" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                <span className="font-body text-[10px] tracking-[0.1em] uppercase text-white/80">{labels[key]}</span>
              </div>
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
              </div>
            </button>
          )
        })}
      </div>

      {/* Lightbox */}
      {previewSrc && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            onClick={() => setPreviewSrc(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="Büyütülmüş görüntü"
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
