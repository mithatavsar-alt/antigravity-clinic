import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /doctor/* routes guard — login hariç
  if (pathname.startsWith('/doctor') && pathname !== '/doctor/login') {
    // Client-side auth (localStorage) middleware'de erişilemez
    // Bu yüzden cookie-based check yapıyoruz
    const token = request.cookies.get('ag_auth_token')
    if (!token) {
      return NextResponse.redirect(new URL('/doctor/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/doctor/:path*'],
}
