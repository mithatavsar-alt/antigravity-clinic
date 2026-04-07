import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchLeadsWithResults } from '@/lib/supabase/queries'
import { verifyDoctorFromRequest } from '@/lib/supabase/verify-doctor'

export const runtime = 'nodejs'

/**
 * GET /api/doctor/leads
 *
 * Returns all analysis sessions with joined patient/result data.
 *
 * Security: verifies both Supabase auth AND admin_users role.
 * Reads data with service-role client to bypass RLS.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyDoctorFromRequest(request)
    if (!auth.authorized) {
      console.warn('[DoctorLeads] Access denied:', auth.userId ?? 'no-session', '| reason:', auth.reason)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sb = createAdminClient()
    const { data, error } = await fetchLeadsWithResults(sb)

    if (error) {
      console.error('[DoctorLeads] fetch failed:', error.message, '| doctor:', auth.userId)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    console.log('[DoctorLeads] Returned', data?.length ?? 0, 'leads | doctor:', auth.userId)
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('[DoctorLeads] Unexpected error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
