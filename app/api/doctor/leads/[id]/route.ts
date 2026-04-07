import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSessionById } from '@/lib/supabase/queries'
import { verifyDoctorFromRequest } from '@/lib/supabase/verify-doctor'

export const runtime = 'nodejs'

/**
 * GET /api/doctor/leads/:id
 *
 * Returns a single analysis session with all joined data.
 *
 * Security: verifies both Supabase auth AND admin_users role.
 * Reads with service-role client to bypass RLS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const auth = await verifyDoctorFromRequest(request)
    if (!auth.authorized) {
      console.warn('[DoctorLeadDetail] Access denied:', auth.userId ?? 'no-session', '| reason:', auth.reason)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // UUID format check
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      console.warn('[DoctorLeadDetail] Invalid session ID format:', id)
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const sb = createAdminClient()
    const { data, error } = await fetchSessionById(sb, id)

    if (error) {
      console.error('[DoctorLeadDetail] fetch failed:', error.message, '| sessionId:', id, '| doctor:', auth.userId)
      return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    console.log('[DoctorLeadDetail] Returned session:', id, '| doctor:', auth.userId)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[DoctorLeadDetail] Unexpected error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
