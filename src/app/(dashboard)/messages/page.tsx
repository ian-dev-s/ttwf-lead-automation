'use client';

import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  RefreshCw,
  Send,
  XCircle,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

interface Lead {
  id: string;
  businessName: string;
  email: string | null;
}

interface OutboundMessage {
  id: string;
  leadId: string;
  type: string;
  subject: string | null;
  content: string;
  status: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  lead: Lead;
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
  leadId: string | null;
  lead: Lead | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="outline">Draft</Badge>;
    case 'PENDING_APPROVAL':
      return <Badge variant="outline" className="border-amber-500 text-amber-600">Pending</Badge>;
    case 'APPROVED':
      return <Badge variant="default" className="bg-blue-600">Approved</Badge>;
    case 'SENT':
      return <Badge variant="default" className="bg-green-600">Sent</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function EmailPage() {
  const [outboundMessages, setOutboundMessages] = useState<OutboundMessage[]>([]);
  const [inboundEmails, setInboundEmails] = useState<InboundEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('inbox');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [messagesRes, inboxRes] = await Promise.all([
        fetch('/api/messages'),
        fetch('/api/email/inbox'),
      ]);

      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setOutboundMessages(Array.isArray(data) ? data : data.data || data.messages || []);
      }
      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setInboundEmails(data.emails || []);
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFetchEmails = async () => {
    setIsFetching(true);
    try {
      const response = await fetch('/api/email/inbox', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        await fetchData();
      } else {
        console.error('Fetch failed:', data.error);
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleApprove = async (messageId: string) => {
    setActionLoading(messageId);
    try {
      const response = await fetch(`/api/messages/${messageId}/approve`, {
        method: 'POST',
      });
      if (response.ok) await fetchData();
    } catch (error) {
      console.error('Error approving:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResend = async (messageId: string) => {
    setActionLoading(messageId);
    try {
      const response = await fetch(`/api/messages/${messageId}/resend`, {
        method: 'POST',
      });
      if (response.ok) await fetchData();
    } catch (error) {
      console.error('Error resending:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Categorize outbound messages
  const drafts = outboundMessages.filter(
    (m) => m.status === 'DRAFT' || m.status === 'PENDING_APPROVAL'
  );
  const sentMessages = outboundMessages.filter((m) => m.status === 'SENT');
  const failedMessages = outboundMessages.filter((m) => m.status === 'FAILED');
  const approvedMessages = outboundMessages.filter((m) => m.status === 'APPROVED');

  const unreadCount = inboundEmails.filter((e) => !e.isRead).length;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Email" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Email"
        description="Manage inbound and outbound email communications"
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="inbox" className="gap-2">
                <Inbox className="h-4 w-4" />
                Inbox
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="outbox" className="gap-2">
                <ArrowUpFromLine className="h-4 w-4" />
                Outbox ({drafts.length + approvedMessages.length})
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-2">
                <Send className="h-4 w-4" />
                Sent ({sentMessages.length})
              </TabsTrigger>
              {failedMessages.length > 0 && (
                <TabsTrigger value="failed" className="gap-2">
                  <XCircle className="h-4 w-4" />
                  Failed ({failedMessages.length})
                </TabsTrigger>
              )}
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFetchEmails}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Fetch Emails
            </Button>
          </div>

          {/* Inbox Tab */}
          <TabsContent value="inbox" className="space-y-2">
            {inboundEmails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No inbound emails yet.</p>
                  <p className="text-sm text-muted-foreground">
                    Click &quot;Fetch Emails&quot; to check for new messages.
                  </p>
                </CardContent>
              </Card>
            ) : (
              inboundEmails.map((email) => (
                <Card
                  key={email.id}
                  className={`cursor-pointer transition-colors ${
                    !email.isRead ? 'border-primary/30 bg-primary/5' : ''
                  }`}
                  onClick={() =>
                    setExpandedId(expandedId === `in-${email.id}` ? null : `in-${email.id}`)
                  }
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {email.isRead ? (
                          <MailOpen className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Mail className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm truncate ${
                              !email.isRead ? 'font-semibold' : 'font-medium'
                            }`}
                          >
                            {email.from.replace(/<.*>/, '').trim() || email.from}
                          </span>
                          {email.lead && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {email.lead.businessName}
                            </Badge>
                          )}
                        </div>
                        <p
                          className={`text-sm truncate ${
                            !email.isRead ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {email.subject}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(email.receivedAt)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          <ArrowDownToLine className="h-3 w-3 mr-1" />
                          In
                        </Badge>
                        {expandedId === `in-${email.id}` ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedId === `in-${email.id}` && (
                      <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                          <div>
                            <span className="font-medium">From:</span> {email.from}
                          </div>
                          <div>
                            <span className="font-medium">To:</span> {email.to}
                          </div>
                          <div>
                            <span className="font-medium">Date:</span>{' '}
                            {new Date(email.receivedAt).toLocaleString()}
                          </div>
                          {email.lead && (
                            <div>
                              <span className="font-medium">Linked Lead:</span>{' '}
                              {email.lead.businessName}
                            </div>
                          )}
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-sm">
                          {email.bodyHtml ? (
                            <div
                              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                              className="prose prose-sm max-w-none dark:prose-invert"
                            />
                          ) : (
                            <pre className="whitespace-pre-wrap font-sans">
                              {email.bodyText || '(No content)'}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Outbox Tab */}
          <TabsContent value="outbox" className="space-y-2">
            {[...drafts, ...approvedMessages].length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ArrowUpFromLine className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No pending outbound emails.
                  </p>
                </CardContent>
              </Card>
            ) : (
              [...drafts, ...approvedMessages].map((msg) => (
                <Card key={msg.id}>
                  <CardContent className="py-3 px-4">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() =>
                        setExpandedId(
                          expandedId === `out-${msg.id}` ? null : `out-${msg.id}`
                        )
                      }
                    >
                      <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            To: {msg.lead.businessName}
                          </span>
                          {getStatusBadge(msg.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {msg.subject || '(No subject)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.createdAt)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          <ArrowUpFromLine className="h-3 w-3 mr-1" />
                          Out
                        </Badge>
                        {expandedId === `out-${msg.id}` ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedId === `out-${msg.id}` && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                          <div>
                            <span className="font-medium">To:</span>{' '}
                            {msg.lead.email || 'No email'}
                          </div>
                          <div>
                            <span className="font-medium">Subject:</span>{' '}
                            {msg.subject || '(No subject)'}
                          </div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-sm">
                          <div
                            dangerouslySetInnerHTML={{ __html: msg.content }}
                            className="prose prose-sm max-w-none dark:prose-invert"
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
                          {(msg.status === 'DRAFT' || msg.status === 'PENDING_APPROVAL') && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(msg.id)}
                              disabled={actionLoading === msg.id}
                            >
                              {actionLoading === msg.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              Approve & Send
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Sent Tab */}
          <TabsContent value="sent" className="space-y-2">
            {sentMessages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No emails sent yet.</p>
                </CardContent>
              </Card>
            ) : (
              sentMessages.map((msg) => (
                <Card key={msg.id}>
                  <CardContent className="py-3 px-4">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() =>
                        setExpandedId(
                          expandedId === `sent-${msg.id}` ? null : `sent-${msg.id}`
                        )
                      }
                    >
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            To: {msg.lead.businessName}
                          </span>
                          {getStatusBadge(msg.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {msg.subject || '(No subject)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {msg.sentAt ? formatDate(msg.sentAt) : formatDate(msg.createdAt)}
                        </span>
                        {expandedId === `sent-${msg.id}` ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedId === `sent-${msg.id}` && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="bg-muted/30 rounded-lg p-4 text-sm">
                          <div
                            dangerouslySetInnerHTML={{ __html: msg.content }}
                            className="prose prose-sm max-w-none dark:prose-invert"
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(msg.id)}
                            disabled={actionLoading === msg.id}
                          >
                            {actionLoading === msg.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4 mr-1" />
                            )}
                            Resend
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Failed Tab */}
          <TabsContent value="failed" className="space-y-2">
            {failedMessages.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No failed emails.</p>
                </CardContent>
              </Card>
            ) : (
              failedMessages.map((msg) => (
                <Card key={msg.id} className="border-destructive/30">
                  <CardContent className="py-3 px-4">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() =>
                        setExpandedId(
                          expandedId === `fail-${msg.id}` ? null : `fail-${msg.id}`
                        )
                      }
                    >
                      <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            To: {msg.lead.businessName}
                          </span>
                          {getStatusBadge(msg.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {msg.subject || '(No subject)'}
                        </p>
                        {msg.error && (
                          <p className="text-xs text-destructive truncate mt-1">
                            {msg.error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.createdAt)}
                        </span>
                        {expandedId === `fail-${msg.id}` ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedId === `fail-${msg.id}` && (
                      <div className="mt-4 pt-4 border-t">
                        {msg.error && (
                          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive mb-3">
                            <strong>Error:</strong> {msg.error}
                          </div>
                        )}
                        <div className="bg-muted/30 rounded-lg p-4 text-sm">
                          <div
                            dangerouslySetInnerHTML={{ __html: msg.content }}
                            className="prose prose-sm max-w-none dark:prose-invert"
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(msg.id)}
                            disabled={actionLoading === msg.id}
                          >
                            {actionLoading === msg.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4 mr-1" />
                            )}
                            Retry Send
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
