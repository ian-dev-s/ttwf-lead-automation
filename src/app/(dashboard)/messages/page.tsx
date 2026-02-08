'use client';

import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  CheckCircle,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────

interface Lead {
  id: string;
  businessName: string;
  email: string | null;
}

interface InboundEmail {
  id: string;
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
  isRead: boolean;
  isProcessed: boolean;
  status: 'pending' | 'approved' | 'rejected';
  leadId: string | null;
  aiReplyContent: string | null;
  aiReplySubject: string | null;
  lead?: Lead | null;
}

interface Counts {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

// ─── Helpers ────────────────────────────────────────────────

function extractSenderEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from.trim();
}

function extractSenderName(from: string): string {
  const match = from.match(/^(.+?)\s*<.+?>/);
  return match ? match[1].trim() : from.trim();
}

function formatRelativeDate(dateValue: unknown): string {
  let date: Date;
  if (typeof dateValue === 'object' && dateValue !== null && 'seconds' in dateValue) {
    const ts = dateValue as { seconds: number; nanoseconds?: number };
    date = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000);
  } else {
    date = new Date(dateValue as string | number);
  }
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(dateValue: unknown): string {
  let date: Date;
  if (typeof dateValue === 'object' && dateValue !== null && 'seconds' in dateValue) {
    const ts = dateValue as { seconds: number; nanoseconds?: number };
    date = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000);
  } else {
    date = new Date(dateValue as string | number);
  }
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getSnippet(email: InboundEmail, maxLen = 80): string {
  const text = email.bodyText || email.bodyHtml?.replace(/<[^>]+>/g, ' ').trim() || '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).trimEnd() + '...';
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">Pending</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100">Approved</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getDetailStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">Pending Review</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100">Approved</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">Rejected</Badge>;
    default:
      return null;
  }
}

// ─── Component ──────────────────────────────────────────────

export default function InboxPage() {
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [pollingInterval, setPollingInterval] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Data fetching ─────────────────────────────────────

  const fetchEmails = useCallback(async (filter?: FilterTab) => {
    try {
      const f = filter || activeFilter;
      const url = f === 'all' ? '/api/email/inbox' : `/api/email/inbox?filter=${f}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (error) {
      console.error('Error fetching inbox:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setPollingInterval(data.imapPollingIntervalMinutes || 0);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchEmails();
    fetchSettings();
  }, [fetchEmails, fetchSettings]);

  // Re-fetch when filter changes
  useEffect(() => {
    fetchEmails(activeFilter);
  }, [activeFilter, fetchEmails]);

  // ─── Auto-polling ──────────────────────────────────────

  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (pollingInterval > 0) {
      const intervalMs = pollingInterval * 60 * 1000;
      pollTimerRef.current = setInterval(async () => {
        try {
          await fetch('/api/email/inbox', { method: 'POST' });
          setLastChecked(new Date());
          await fetchEmails();
        } catch {
          // Ignore auto-poll errors
        }
      }, intervalMs);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [pollingInterval, fetchEmails]);

  // ─── Actions ───────────────────────────────────────────

  const handleCheckMail = async () => {
    setIsFetching(true);
    try {
      const res = await fetch('/api/email/inbox', { method: 'POST' });
      if (res.ok) {
        setLastChecked(new Date());
        await fetchEmails();
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleReplyAction = async (emailId: string, action: 'approve' | 'reject' | 'regenerate') => {
    setActionLoading(`${action}-${emailId}`);
    try {
      const res = await fetch(`/api/email/inbox/${emailId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update the email in local state
        setEmails((prev) =>
          prev.map((e) => {
            if (e.id !== emailId) return e;
            return {
              ...e,
              status: data.status || e.status,
              ...(data.aiReplyContent !== undefined && { aiReplyContent: data.aiReplyContent }),
              ...(data.aiReplySubject !== undefined && { aiReplySubject: data.aiReplySubject }),
            };
          })
        );
        // Re-fetch to update counts
        await fetchEmails();
      }
    } catch (error) {
      console.error(`Error ${action}:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  const selectedEmail = emails.find((e) => e.id === selectedId) || null;

  // ─── Filter tabs ───────────────────────────────────────

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  // ─── Loading state ────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Inbox" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Inbox"
        description="Manage incoming emails and AI responses"
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Panel: Email List ─────────────────────── */}
        <div className="w-[420px] flex-shrink-0 border-r flex flex-col bg-background">
          {/* Filter tabs */}
          <div className="px-4 pt-4 pb-2 border-b">
            <div className="flex items-center gap-1 flex-wrap">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeFilter === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs opacity-80">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Check mail + status bar */}
          <div className="px-4 py-2 border-b flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {lastChecked
                ? `Last checked: ${formatRelativeDate(lastChecked)}`
                : pollingInterval > 0
                ? `Auto-checking every ${pollingInterval} min`
                : ''}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCheckMail}
              disabled={isFetching}
              className="h-7 text-xs gap-1.5"
            >
              {isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Check Mail
            </Button>
          </div>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto">
            {emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No emails found.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click &quot;Check Mail&quot; to fetch new messages.
                </p>
              </div>
            ) : (
              emails.map((email) => {
                const isSelected = selectedId === email.id;
                const senderEmail = extractSenderEmail(email.from);
                const status = email.status || 'pending';
                return (
                  <button
                    key={email.id}
                    onClick={() => setSelectedId(email.id)}
                    className={`w-full text-left px-4 py-3 border-b transition-colors ${
                      isSelected
                        ? 'bg-primary/5 border-l-2 border-l-primary'
                        : 'hover:bg-muted/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        <Mail className={`h-4 w-4 ${!email.isRead ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span
                            className={`text-sm truncate ${
                              !email.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                            }`}
                          >
                            {senderEmail}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatRelativeDate(email.receivedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className={`text-sm truncate ${!email.isRead ? 'font-medium' : 'text-muted-foreground'}`}>
                            {email.subject}
                          </p>
                          {getStatusBadge(status)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {getSnippet(email)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right Panel: Email Detail ──────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
          {selectedEmail ? (
            <>
              {/* Detail header */}
              <div className="px-6 py-4 bg-background border-b">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-lg font-semibold">{selectedEmail.subject}</h2>
                  {getDetailStatusBadge(selectedEmail.status || 'pending')}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {extractSenderEmail(selectedEmail.from)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatFullDate(selectedEmail.receivedAt)}
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Incoming email card */}
                <div className="bg-background rounded-lg border shadow-sm">
                  <div className="px-5 py-3 border-b flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Incoming Email</span>
                  </div>
                  <div className="p-5">
                    {selectedEmail.bodyHtml ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                        className="prose prose-sm max-w-none dark:prose-invert"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
                        {selectedEmail.bodyText || '(No content)'}
                      </pre>
                    )}
                  </div>
                </div>

                {/* AI Response card */}
                <div className="bg-background rounded-lg border shadow-sm">
                  <div className="px-5 py-3 border-b flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-sm">AI Response</span>
                  </div>
                  <div className="p-5">
                    {selectedEmail.aiReplyContent ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: selectedEmail.aiReplyContent }}
                        className="prose prose-sm max-w-none dark:prose-invert"
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No AI response generated yet.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => handleReplyAction(selectedEmail.id, 'regenerate')}
                          disabled={actionLoading === `regenerate-${selectedEmail.id}`}
                        >
                          {actionLoading === `regenerate-${selectedEmail.id}` ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-1" />
                          )}
                          Generate Response
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {(selectedEmail.status || 'pending') === 'pending' && selectedEmail.aiReplyContent && (
                <div className="px-6 py-4 bg-background border-t flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReplyAction(selectedEmail.id, 'regenerate')}
                    disabled={!!actionLoading}
                    className="text-muted-foreground"
                  >
                    {actionLoading === `regenerate-${selectedEmail.id}` ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    Regenerate
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    onClick={() => handleReplyAction(selectedEmail.id, 'reject')}
                    disabled={!!actionLoading}
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {actionLoading === `reject-${selectedEmail.id}` ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1.5" />
                    )}
                    Reject Response
                  </Button>
                  <Button
                    onClick={() => handleReplyAction(selectedEmail.id, 'approve')}
                    disabled={!!actionLoading}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {actionLoading === `approve-${selectedEmail.id}` ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                    )}
                    Approve Response
                  </Button>
                </div>
              )}

              {/* Approved/Rejected state footer */}
              {selectedEmail.status === 'approved' && (
                <div className="px-6 py-3 bg-green-50 border-t border-green-200 dark:bg-green-950/30 dark:border-green-900">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    This response has been approved and sent.
                  </div>
                </div>
              )}
              {selectedEmail.status === 'rejected' && (
                <div className="px-6 py-3 bg-red-50 border-t border-red-200 dark:bg-red-950/30 dark:border-red-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                      <XCircle className="h-4 w-4" />
                      This response was rejected.
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReplyAction(selectedEmail.id, 'regenerate')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === `regenerate-${selectedEmail.id}` ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-primary/60" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No Email Selected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select an email from the list to view details and AI response
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
