'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/components/providers/SessionProvider';
import { cn } from '@/lib/utils';
import {
    BookUser,
    Brain,
    ChevronDown,
    FileText,
    History,
    Inbox,
    LayoutDashboard,
    LogOut,
    Search,
    Settings,
    Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Inbox', href: '/messages', icon: Inbox, badgeKey: 'inboxPending' as const },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'AI Training', href: '/training', icon: Brain },
  { name: 'Contacts', href: '/contacts', icon: BookUser },
  { name: 'Scraper', href: '/scraper', icon: Search },
  { name: 'History', href: '/history', icon: History },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();
  const [pendingCount, setPendingCount] = useState(0);

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user?.email?.[0].toUpperCase() || '?';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  // Fetch pending inbox count
  useEffect(() => {
    let mounted = true;
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/email/inbox?filter=pending&limit=1');
        if (res.ok) {
          const data = await res.json();
          if (mounted) setPendingCount(data.counts?.pending || 0);
        }
      } catch {
        // Ignore errors silently
      }
    };

    fetchPendingCount();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPendingCount, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="flex flex-col h-full w-64 bg-card border-r">
      {/* Logo */}
      <div className="p-6 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold">T</span>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">TTWF</h1>
            <p className="text-xs text-muted-foreground">Lead Generator</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const badgeCount = item.badgeKey === 'inboxPending' ? pendingCount : 0;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
              {badgeCount > 0 && (
                <span className={cn(
                  'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-destructive text-destructive-foreground'
                )}>
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Menu */}
      <div className="p-4 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-auto py-2"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium truncate">
                  {user?.name || user?.email}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role?.toLowerCase()}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
