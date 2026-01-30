'use client';

import { ApprovalGate } from '@/components/messages/ApprovalGate';
import { MessagePreview } from '@/components/messages/MessagePreview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    formatDateTime,
    formatPhoneNumber,
    getWhatsAppUrl,
    leadStatusColors,
    leadStatusLabels,
} from '@/lib/utils';
import { Lead, Message, MessageType, StatusHistory } from '@prisma/client';
import {
    ExternalLink,
    Facebook,
    Globe,
    History,
    Loader2,
    Mail,
    MapPin,
    MessageSquare,
    Phone,
    Sparkles,
    Star,
    XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface LeadWithRelations extends Lead {
  messages: Message[];
  statusHistory: (StatusHistory & {
    changedBy: { name: string | null; email: string } | null;
  })[];
  createdBy: { name: string | null; email: string } | null;
}

interface LeadDetailProps {
  lead: LeadWithRelations;
}

export function LeadDetail({ lead }: LeadDetailProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<MessageType | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const handleRejectLead = async () => {
    setIsRejecting(true);
    try {
      const existingNotes = lead.notes || '';
      const timestamp = new Date().toLocaleDateString();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n--- Rejected on ${timestamp} ---\n${rejectReason}`
        : `--- Rejected on ${timestamp} ---\n${rejectReason}`;

      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'NOT_INTERESTED',
          notes: newNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to reject lead');

      setShowRejectDialog(false);
      setRejectReason('');
      router.refresh();
    } catch (error) {
      console.error('Error rejecting lead:', error);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleGenerateMessage = async (type: MessageType) => {
    setIsGenerating(true);
    setGeneratingType(type);

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          type,
          useAI: true,
          saveMessage: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate message');

      router.refresh();
    } catch (error) {
      console.error('Error generating message:', error);
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const pendingMessages = lead.messages.filter(
    (m) => m.status === 'DRAFT' || m.status === 'PENDING_APPROVAL'
  );
  const approvedMessages = lead.messages.filter((m) => m.status === 'APPROVED');
  const sentMessages = lead.messages.filter((m) => m.status === 'SENT');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{lead.businessName}</h1>
          <p className="text-muted-foreground">{lead.industry || 'No industry specified'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={leadStatusColors[lead.status]}>
            {leadStatusLabels[lead.status]}
          </Badge>
          <Badge variant="secondary">Score: {lead.score}</Badge>
          {lead.status !== 'NOT_INTERESTED' && lead.status !== 'INVALID' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowRejectDialog(true)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject Lead
            </Button>
          )}
        </div>
      </div>

      {/* Reject Lead Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Lead</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this lead. This will be saved to the notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Textarea
                id="reject-reason"
                placeholder="e.g., Not a good fit, Already has a provider, Duplicate entry..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectReason('');
              }}
              disabled={isRejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectLead}
              disabled={isRejecting || !rejectReason.trim()}
            >
              {isRejecting ? 'Rejecting...' : 'Reject Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="messages">
            Messages ({lead.messages.length})
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{lead.location}</p>
                    {lead.address && (
                      <p className="text-sm text-muted-foreground">{lead.address}</p>
                    )}
                  </div>
                </div>

                {/* All Phone Numbers */}
                {(() => {
                  const metadata = lead.metadata as { phones?: string[]; emails?: string[] } | null;
                  const allPhones = metadata?.phones || (lead.phone ? [lead.phone] : []);
                  
                  if (allPhones.length > 0) {
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>Phone Numbers ({allPhones.length})</span>
                        </div>
                        <div className="ml-6 space-y-2">
                          {allPhones.map((phone, index) => (
                            <div key={index} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                              <div className="flex-1">
                                <p className="font-medium">{formatPhoneNumber(phone)}</p>
                                <div className="flex gap-2 mt-1">
                                  <a
                                    href={getWhatsAppUrl(phone)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-600 hover:underline"
                                  >
                                    WhatsApp
                                  </a>
                                  <a
                                    href={`tel:${phone}`}
                                    className="text-xs text-primary hover:underline"
                                  >
                                    Call
                                  </a>
                                </div>
                              </div>
                              {index === 0 && (
                                <Badge variant="secondary" className="text-xs">Primary</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Phone className="h-5 w-5" />
                      <span className="text-sm">No phone numbers found</span>
                    </div>
                  );
                })()}

                {/* All Email Addresses */}
                {(() => {
                  const metadata = lead.metadata as { phones?: string[]; emails?: string[] } | null;
                  const allEmails = metadata?.emails || (lead.email ? [lead.email] : []);
                  
                  if (allEmails.length > 0) {
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          <span>Email Addresses ({allEmails.length})</span>
                        </div>
                        <div className="ml-6 space-y-2">
                          {allEmails.map((email, index) => (
                            <div key={index} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                              <a
                                href={`mailto:${email}`}
                                className="flex-1 font-medium hover:underline"
                              >
                                {email}
                              </a>
                              {index === 0 && (
                                <Badge variant="secondary" className="text-xs">Primary</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Mail className="h-5 w-5" />
                      <span className="text-sm">No email addresses found</span>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Online Presence */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Online Presence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    {lead.website ? (
                      <>
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline flex items-center gap-1"
                        >
                          {lead.website}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {lead.websiteQuality && (
                          <p className="text-sm text-muted-foreground">
                            Quality Score: {lead.websiteQuality}/100
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-green-600 font-medium">No website - Great prospect!</p>
                    )}
                  </div>
                </div>

                {lead.googleRating && (
                  <div className="flex items-center gap-3">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <div>
                      <p className="font-medium">{lead.googleRating} stars</p>
                      <p className="text-sm text-muted-foreground">
                        {lead.reviewCount} reviews on Google
                      </p>
                    </div>
                  </div>
                )}

                {lead.googleMapsUrl && (
                  <a
                    href={lead.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View on Google Maps
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {lead.facebookUrl && (
                  <div className="flex items-center gap-3">
                    <Facebook className="h-5 w-5 text-blue-600" />
                    <a
                      href={lead.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      Facebook Page
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {lead.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{lead.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Generate Message Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generate Message</CardTitle>
              <CardDescription>
                Use AI to generate a personalized outreach message
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button
                onClick={() => handleGenerateMessage('WHATSAPP')}
                disabled={isGenerating || !lead.phone}
              >
                {isGenerating && generatingType === 'WHATSAPP' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate WhatsApp Message
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGenerateMessage('EMAIL')}
                disabled={isGenerating}
              >
                {isGenerating && generatingType === 'EMAIL' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Email
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-4">
          {pendingMessages.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Pending Messages</h3>
              {pendingMessages.map((message) => (
                <ApprovalGate
                  key={message.id}
                  message={{ ...message, lead }}
                />
              ))}
            </div>
          )}

          {approvedMessages.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-green-600">Approved Messages (Ready to Send)</h3>
              {approvedMessages.map((message) => (
                <MessagePreview
                  key={message.id}
                  message={{ ...message, lead }}
                />
              ))}
            </div>
          )}

          {sentMessages.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Sent Messages</h3>
              {sentMessages.map((message) => (
                <MessagePreview
                  key={message.id}
                  message={{ ...message, lead }}
                />
              ))}
            </div>
          )}

          {lead.messages.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No messages yet. Generate a message to get started.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status History</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.statusHistory.length > 0 ? (
                <div className="space-y-4">
                  {lead.statusHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-4">
                      <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={leadStatusColors[entry.fromStatus]}>
                            {leadStatusLabels[entry.fromStatus]}
                          </Badge>
                          <span className="text-muted-foreground">→</span>
                          <Badge variant="outline" className={leadStatusColors[entry.toStatus]}>
                            {leadStatusLabels[entry.toStatus]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDateTime(entry.changedAt)}
                          {entry.changedBy && ` by ${entry.changedBy.name || entry.changedBy.email}`}
                        </p>
                        {entry.notes && (
                          <p className="text-sm mt-1">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No status changes yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
