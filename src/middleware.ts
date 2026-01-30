import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// Use the edge-compatible auth config for middleware
export const { auth: middleware } = NextAuth(authConfig);

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
