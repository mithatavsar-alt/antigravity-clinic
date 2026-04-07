/**
 * Server-side doctor verification helper.
 *
 * Verifies that a request comes from an authenticated Supabase user
 * who also has an active admin/doctor role in the admin_users table.
 *
 * Used by /api/doctor/* routes to enforce role-based access.
 */

import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from './admin'

export interface DoctorVerifyResult {
  authorized: boolean
  userId?: string
  role?: string
  reason?: string
}

export async function verifyDoctorFromRequest(request: NextRequest): Promise<DoctorVerifyResult> {
  // Step 1: Check Supabase auth session from cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Read-only context — middleware handles refresh
        },
      },
    },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) {
    console.error('[verifyDoctor] Auth check failed:', authError.message)
  }

  if (!user) {
    return { authorized: false, reason: 'not_authenticated' }
  }

  // Step 2: Verify admin_users role using service-role client
  const sb = createAdminClient()

  const { data: row, error: dbError } = await sb
    .from('admin_users')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (dbError) {
    console.error('[verifyDoctor] admin_users query failed:', dbError.message, '| userId:', user.id)
  }

  // Fallback by email
  let finalRow = row
  if (!finalRow && user.email) {
    const { data: byEmail } = await sb
      .from('admin_users')
      .select('id, role, is_active')
      .eq('email', user.email)
      .maybeSingle()
    finalRow = byEmail
  }

  if (!finalRow) {
    console.warn('[verifyDoctor] No admin record for user:', user.id)
    return { authorized: false, userId: user.id, reason: 'no_admin_record' }
  }

  if (finalRow.is_active === false) {
    return { authorized: false, userId: user.id, reason: 'inactive' }
  }

  if (!['admin', 'doctor'].includes(finalRow.role)) {
    return { authorized: false, userId: user.id, reason: 'wrong_role' }
  }

  return { authorized: true, userId: user.id, role: finalRow.role }
}
