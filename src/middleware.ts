export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - api/auth (NextAuth routes)
     * - login/register pages
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth|login|register).*)',
  ],
};
