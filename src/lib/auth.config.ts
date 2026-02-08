import type { NextAuthConfig } from 'next-auth';

// Auth configuration that can be used in Edge runtime (middleware)
// This file should NOT import anything that uses Node.js-specific modules

// Protected routes that require authentication (dashboard routes)
const protectedRoutes = ['/', '/leads', '/messages', '/scraper', '/settings', '/training', '/templates'];

export const authConfig: NextAuthConfig = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [], // Providers are added in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === '/login';
      const isOnRegister = nextUrl.pathname === '/register';
      const isOnSetup = nextUrl.pathname === '/setup';
      const isProtectedRoute = protectedRoutes.some(
        route => nextUrl.pathname === route || nextUrl.pathname.startsWith(route + '/')
      );
      
      // Always allow access to the setup page (checked server-side for eligibility)
      if (isOnSetup) {
        return true;
      }
      
      // Allow access to login and register pages
      if (isOnLogin || isOnRegister) {
        if (isLoggedIn) {
          // Redirect logged-in users to home (dashboard)
          return Response.redirect(new URL('/', nextUrl));
        }
        return true;
      }
      
      // Protect dashboard routes - redirect to login if not authenticated
      if (isProtectedRoute && !isLoggedIn) {
        return false; // NextAuth will redirect to signIn page
      }
      
      return true;
    },
  },
};
