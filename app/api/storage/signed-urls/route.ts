import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET, SIGNED_URL_EXPIRY_SECONDS } from '@/lib/supabase/storage'

/**
 * POST /api/storage/signed-urls
 *
 * Accepts: { paths: string[] }
 * Returns: { urls: Record<path, signedUrl> }
 *
 * Authentication: verified via the caller's Supabase session cookie.
 * Signed URL generation: uses service-role client (anon-key clients
 * cannot create signed URLs on private buckets without a SELECT RLS policy).
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()

    // Build a user-scoped client purely for auth verification
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              )
            } catch {
              // Server component context
            }
          },
        },
      },
    )

    // Verify authentication — caller must have a valid Supabase session
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const paths: string[] = body.paths

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: 'paths array required' }, { status: 400 })
    }

    // Limit batch size to prevent abuse
    if (paths.length > 20) {
      return NextResponse.json({ error: 'Max 20 paths per request' }, { status: 400 })
    }

    // Validate paths don't escape the bucket
    for (const p of paths) {
      if (p.includes('..') || p.startsWith('/')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
      }
    }

    // Generate signed URLs using service-role client (bypasses RLS).
    // The anon-key client cannot create signed URLs on a private bucket
    // unless the bucket has a SELECT RLS policy for authenticated users.
    const adminSb = createAdminClient()
    const { data, error } = await adminSb.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS)

    if (error || !data) {
      console.error('[SignedURL] Generation failed:', error?.message)
      return NextResponse.json({ error: 'Failed to generate signed URLs' }, { status: 500 })
    }

    const urls: Record<string, string> = {}
    for (const item of data) {
      if (item.signedUrl && !item.error) {
        urls[item.path!] = item.signedUrl
      }
    }

    return NextResponse.json({ urls })
  } catch (e) {
    console.error('[SignedURL] Unexpected error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
