'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingScreen } from '@/components/shared/LoadingScreen'

// Step 3 of the analysis form is now a dedicated route.
// This component bridges the in-form wizard to the /analysis/media route.
export function FormStepPhotoConsent() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/analysis/media')
  }, [router])

  return <LoadingScreen title="Fotoğraf adımına yönlendiriliyor" />
}
