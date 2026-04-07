import { NextRequest, NextResponse } from 'next/server'
import { verifyDoctorFromRequest } from '@/lib/supabase/verify-doctor'

export const runtime = 'nodejs'

/**
 * POST /api/doctor/verify
 *
 * Verifies that the currently authenticated Supabase user has a matching
 * admin_users row with an active doctor/admin role.
 *
 * Security: reads identity from session cookies (server-side), not body.
 */
export async function POST(request: NextRequest) {
  try {
    const result = await verifyDoctorFromRequest(request)

    if (result.authorized) {
      console.log('[DoctorVerify] Authorized:', result.userId, '| role:', result.role)
    } else {
      console.warn('[DoctorVerify] Denied:', result.userId ?? 'no-session', '| reason:', result.reason)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[DoctorVerify] Unexpected error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
