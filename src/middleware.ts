import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

// Protected routes that require authentication
const protectedPrefixes = ['/', '/leads', '/messages', '/scraper', '/settings', '/training', '/templates', '/contacts', '/history'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isLoggedIn = !!sessionCookie;

  const isLoginPage = pathname === '/login';
  const isRegisterPage = pathname === '/register';
  const isSetupPage = pathname === '/setup';
  const isAuthApi = pathname.startsWith('/api/auth');
  const isSetupApi = pathname.startsWith('/api/setup');

  // Always allow auth and setup API routes
  if (isAuthApi || isSetupApi) {
    return NextResponse.next();
  }

  // Always allow setup page
  if (isSetupPage) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from login/register
  if ((isLoginPage || isRegisterPage) && isLoggedIn) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Allow access to login and register pages
  if (isLoginPage || isRegisterPage) {
    return NextResponse.next();
  }

  // Protect dashboard routes
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  );

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
