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
import { Input } from '@/components/ui/input';
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
  CheckCircle,
  Edit2,
  ExternalLink,
  Facebook,
  Globe,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Save,
  Sparkles,
  Star,
  X,
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
  const [isQualifying, setIsQualifying] = useState(false);
  
  // Editing states
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingWebsite, setIsEditingWebsite] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit values
  const [editPhone, setEditPhone] = useState(lead.phone || '');
  const [editEmail, setEditEmail] = useState(lead.email || '');
  const [editWebsite, setEditWebsite] = useState(lead.website || '');
  const [editNotes, setEditNotes] = useState(lead.notes || '');

  const handleSaveField = async (field: 'phone' | 'email' | 'website' | 'notes', value: string) => {
    setIsSaving(true);
    try {
      // Send empty string to clear the field, or the actual value
      // The API will convert empty strings to null for fields that need it
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: value,
        }),
      });

      if (!response.ok) throw new Error(`Failed to update ${field}`);

      // Reset editing state
      if (field === 'phone') setIsEditingPhone(false);
      if (field === 'email') setIsEditingEmail(false);
      if (field === 'website') setIsEditingWebsite(false);
      if (field === 'notes') setIsEditingNotes(false);

      router.refresh();
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      alert(`Failed to update ${field}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = (field: 'phone' | 'email' | 'website' | 'notes') => {
    if (field === 'phone') {
      setEditPhone(lead.phone || '');
      setIsEditingPhone(false);
    }
    if (field === 'email') {
      setEditEmail(lead.email || '');
      setIsEditingEmail(false);
    }
    if (field === 'website') {
      setEditWebsite(lead.website || '');
      setIsEditingWebsite(false);
    }
    if (field === 'notes') {
      setEditNotes(lead.notes || '');
      setIsEditingNotes(false);
    }
  };

  const handleQualifyLead = async () => {
    setIsQualifying(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'QUALIFIED',
        }),
      });

      if (!response.ok) throw new Error('Failed to qualify lead');

      router.refresh();
    } catch (error) {
      console.error('Error qualifying lead:', error);
    } finally {
      setIsQualifying(false);
    }
  };

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
          status: 'REJECTED',
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

                {/* Phone Number - Editable */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>Phone Number</span>
                    </div>
                    {!isEditingPhone && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingPhone(true)}
                        className="h-7 px-2"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingPhone ? (
                    <div className="ml-6 space-y-2">
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Enter phone number"
                        disabled={isSaving}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveField('phone', editPhone)}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelEdit('phone')}
                          disabled={isSaving}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-6">
                      {lead.phone ? (
                        <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                          <div className="flex-1">
                            <p className="font-medium">{formatPhoneNumber(lead.phone)}</p>
                            <div className="flex gap-2 mt-1">
                              <a
                                href={getWhatsAppUrl(lead.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-600 hover:underline"
                              >
                                WhatsApp
                              </a>
                              <a
                                href={`tel:${lead.phone}`}
                                className="text-xs text-primary hover:underline"
                              >
                                Call
                              </a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No phone number</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Email Address - Editable */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>Email Address</span>
                    </div>
                    {!isEditingEmail && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingEmail(true)}
                        className="h-7 px-2"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingEmail ? (
                    <div className="ml-6 space-y-2">
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Enter email address"
                        disabled={isSaving}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveField('email', editEmail)}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelEdit('email')}
                          disabled={isSaving}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-6">
                      {lead.email ? (
                        <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                          <a
                            href={`mailto:${lead.email}`}
                            className="flex-1 font-medium hover:underline"
                          >
                            {lead.email}
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No email address</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Online Presence */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Online Presence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Website - Editable */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <span>Website</span>
                    </div>
                    {!isEditingWebsite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingWebsite(true)}
                        className="h-7 px-2"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingWebsite ? (
                    <div className="ml-6 space-y-2">
                      <Input
                        type="url"
                        value={editWebsite}
                        onChange={(e) => setEditWebsite(e.target.value)}
                        placeholder="https://example.com"
                        disabled={isSaving}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveField('website', editWebsite)}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelEdit('website')}
                          disabled={isSaving}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-6">
                      {lead.website ? (
                        <div>
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
                            <p className="text-sm text-muted-foreground mt-1">
                              Quality Score: {lead.websiteQuality}/100
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-green-600 font-medium">No website - Great prospect!</p>
                      )}
                    </div>
                  )}
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

          {/* Lead Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Actions</CardTitle>
              <CardDescription>
                Update the lead status or reject this lead
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              {lead.status !== 'QUALIFIED' && lead.status !== 'NOT_INTERESTED' && lead.status !== 'REJECTED' && lead.status !== 'INVALID' && (
                <Button
                  onClick={handleQualifyLead}
                  disabled={isQualifying}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isQualifying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {isQualifying ? 'Qualifying...' : 'Qualify Lead'}
                </Button>
              )}
              {lead.status !== 'NOT_INTERESTED' && lead.status !== 'REJECTED' && lead.status !== 'INVALID' && (
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Lead
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Notes - Editable */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Notes</CardTitle>
                {!isEditingNotes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingNotes(true)}
                    className="h-7 px-2"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes about this lead..."
                    rows={6}
                    disabled={isSaving}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveField('notes', editNotes)}
                      disabled={isSaving}
                    >
                      {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancelEdit('notes')}
                      disabled={isSaving}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  {lead.notes ? (
                    <p className="whitespace-pre-wrap">{lead.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet. Click edit to add notes.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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
