'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatPhoneNumber } from '@/lib/utils';
import { Contact } from '@prisma/client';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Send,
  Star,
  User,
  UserPlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Message {
  id: string;
  type: 'EMAIL' | 'WHATSAPP';
  subject: string | null;
  content: string;
  status: string;
  createdAt: Date;
}

interface Lead {
  id: string;
  businessName: string;
  industry: string | null;
  location: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  facebookUrl: string | null;
  notes: string | null;
  score: number;
  messages?: Message[];
}

interface ShareLeadDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShareMethod = 'email' | 'whatsapp' | 'telegram';

export function ShareLeadDialog({ lead, open, onOpenChange }: ShareLeadDialogProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [shareMethod, setShareMethod] = useState<ShareMethod>('email');
  const [customRecipient, setCustomRecipient] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  // Contact save dialog state
  const [showSaveContactDialog, setShowSaveContactDialog] = useState(false);
  const [saveContactMode, setSaveContactMode] = useState<'new' | 'update' | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [contactToUpdate, setContactToUpdate] = useState<Contact | null>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [pendingShareAction, setPendingShareAction] = useState(false);

  // Generate lead summary for sharing
  const generateLeadSummary = useCallback(() => {
    const lines = [
      `🏢 *${lead.businessName}*`,
      '',
    ];

    if (lead.industry) lines.push(`📌 Industry: ${lead.industry}`);
    lines.push(`📍 Location: ${lead.location}`);
    if (lead.address) lines.push(`🏠 Address: ${lead.address}`);
    if (lead.phone) lines.push(`📞 Phone: ${formatPhoneNumber(lead.phone)}`);
    if (lead.email) lines.push(`📧 Email: ${lead.email}`);
    if (lead.website) lines.push(`🌐 Website: ${lead.website}`);
    if (lead.googleRating) {
      lines.push(`⭐ Google Rating: ${lead.googleRating} (${lead.reviewCount || 0} reviews)`);
    }
    if (lead.googleMapsUrl) lines.push(`🗺️ Maps: ${lead.googleMapsUrl}`);
    if (lead.facebookUrl) lines.push(`📘 Facebook: ${lead.facebookUrl}`);
    lines.push('');
    lines.push(`📊 Lead Score: ${lead.score}/100`);
    
    if (lead.notes) {
      lines.push('');
      lines.push(`📝 Notes:`);
      lines.push(lead.notes);
    }

    // Include messages if available
    if (lead.messages && lead.messages.length > 0) {
      lines.push('');
      lines.push('═══════════════════════════════');
      lines.push('📨 MESSAGES');
      lines.push('═══════════════════════════════');
      
      lead.messages.forEach((message, index) => {
        lines.push('');
        lines.push(`--- Message ${index + 1} (${message.type}) ---`);
        if (message.subject) {
          lines.push(`Subject: ${message.subject}`);
        }
        lines.push(`Status: ${message.status}`);
        lines.push('');
        // Strip HTML tags for sharing in plain text
        const plainContent = message.content
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        lines.push(plainContent);
      });
    }

    return lines.join('\n');
  }, [lead]);

  // Initialize custom message with lead summary
  useEffect(() => {
    if (open) {
      setCustomMessage(generateLeadSummary());
      // Reset state when dialog opens
      setShowSaveContactDialog(false);
      setSaveContactMode(null);
      setNewContactName('');
      setContactToUpdate(null);
      setPendingShareAction(false);
    }
  }, [open, generateLeadSummary]);

  // Fetch contacts
  useEffect(() => {
    if (open) {
      fetchContacts();
    }
  }, [open]);

  const fetchContacts = async (search = '') => {
    setIsLoadingContacts(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      
      const response = await fetch(`/api/contacts?${params}`);
      if (response.ok) {
        const data = await response.json();
        setContacts(data);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) {
        fetchContacts(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open]);

  const handleToggleFavorite = async (contact: Contact) => {
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !contact.isFavorite }),
      });

      if (response.ok) {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id ? { ...c, isFavorite: !c.isFavorite } : c
          )
        );
      }
    } catch (error) {
      console.error('Error updating contact:', error);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(customMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const getRecipient = () => {
    if (selectedContact) {
      switch (shareMethod) {
        case 'email':
          return selectedContact.email || '';
        case 'whatsapp':
          return selectedContact.phone || '';
        case 'telegram':
          return selectedContact.telegramId || '';
      }
    }
    return customRecipient;
  };

  // Check if the recipient exists in contacts
  const findMatchingContact = (recipient: string): Contact | null => {
    if (!recipient) return null;
    
    return contacts.find((contact) => {
      switch (shareMethod) {
        case 'email':
          return contact.email?.toLowerCase() === recipient.toLowerCase();
        case 'whatsapp':
          const cleanRecipient = recipient.replace(/[^0-9+]/g, '');
          const cleanContactPhone = contact.phone?.replace(/[^0-9+]/g, '') || '';
          return cleanContactPhone === cleanRecipient;
        case 'telegram':
          return contact.telegramId?.toLowerCase() === recipient.toLowerCase();
        default:
          return false;
      }
    }) || null;
  };

  const executeShare = async () => {
    const recipient = getRecipient();
    const message = encodeURIComponent(customMessage);

    setIsSharing(true);

    try {
      // Save the message to the lead and update status to PENDING_APPROVAL
      const messageResponse = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          type: shareMethod === 'email' ? 'EMAIL' : 'WHATSAPP',
          subject: `Lead: ${lead.businessName}`,
          content: customMessage,
          status: 'PENDING_APPROVAL',
        }),
      });

      if (!messageResponse.ok) {
        console.error('Failed to save message');
      }

      // Update lead status to PENDING_APPROVAL
      await fetch(`/api/leads/${lead.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PENDING_APPROVAL',
        }),
      });

      // Open the external app
      switch (shareMethod) {
        case 'email': {
          const subject = encodeURIComponent(`Lead: ${lead.businessName}`);
          const emailBody = encodeURIComponent(customMessage.replace(/\*/g, ''));
          window.open(`mailto:${recipient}?subject=${subject}&body=${emailBody}`);
          break;
        }
        case 'whatsapp': {
          // Clean phone number for WhatsApp
          const cleanPhone = recipient.replace(/[^0-9+]/g, '');
          window.open(`https://wa.me/${cleanPhone}?text=${message}`);
          break;
        }
        case 'telegram': {
          // Telegram can share via username or chat
          if (recipient.startsWith('@')) {
            window.open(`https://t.me/${recipient.slice(1)}?text=${message}`);
          } else {
            // Use Telegram share URL
            window.open(`https://t.me/share/url?url=${encodeURIComponent(lead.googleMapsUrl || lead.website || '')}&text=${message}`);
          }
          break;
        }
      }

      // Close dialog and refresh
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error('Error sharing lead:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShare = async () => {
    const recipient = getRecipient();
    
    // If using a selected contact, just share directly
    if (selectedContact) {
      await executeShare();
      return;
    }

    // Check if the manually entered recipient exists in contacts
    const existingContact = findMatchingContact(recipient);
    
    if (existingContact) {
      // Contact exists, share directly
      await executeShare();
    } else {
      // Contact doesn't exist, show save dialog
      setPendingShareAction(true);
      setShowSaveContactDialog(true);
    }
  };

  const handleSaveNewContact = async () => {
    if (!newContactName.trim()) return;

    setIsSavingContact(true);
    try {
      const contactData: Record<string, string> = {
        name: newContactName.trim(),
      };

      // Add the appropriate contact method based on share method
      const recipient = getRecipient();
      switch (shareMethod) {
        case 'email':
          contactData.email = recipient;
          break;
        case 'whatsapp':
          contactData.phone = recipient;
          break;
        case 'telegram':
          contactData.telegramId = recipient;
          break;
      }

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData),
      });

      if (response.ok) {
        const newContact = await response.json();
        setContacts((prev) => [newContact, ...prev]);
        setSelectedContact(newContact);
        setShowSaveContactDialog(false);
        setNewContactName('');
        setSaveContactMode(null);

        // If there was a pending share action, execute it
        if (pendingShareAction) {
          setPendingShareAction(false);
          await executeShare();
        }
      }
    } catch (error) {
      console.error('Error saving contact:', error);
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleUpdateExistingContact = async () => {
    if (!contactToUpdate) return;

    setIsSavingContact(true);
    try {
      const updateData: Record<string, string> = {};
      const recipient = getRecipient();

      // Add the appropriate contact method based on share method
      switch (shareMethod) {
        case 'email':
          updateData.email = recipient;
          break;
        case 'whatsapp':
          updateData.phone = recipient;
          break;
        case 'telegram':
          updateData.telegramId = recipient;
          break;
      }

      const response = await fetch(`/api/contacts/${contactToUpdate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const updatedContact = await response.json();
        setContacts((prev) =>
          prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
        );
        setSelectedContact(updatedContact);
        setShowSaveContactDialog(false);
        setContactToUpdate(null);
        setSaveContactMode(null);

        // If there was a pending share action, execute it
        if (pendingShareAction) {
          setPendingShareAction(false);
          await executeShare();
        }
      }
    } catch (error) {
      console.error('Error updating contact:', error);
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleSkipSaveContact = async () => {
    setShowSaveContactDialog(false);
    setSaveContactMode(null);
    setNewContactName('');
    setContactToUpdate(null);

    // If there was a pending share action, execute it anyway
    if (pendingShareAction) {
      setPendingShareAction(false);
      await executeShare();
    }
  };

  const canShare = () => {
    const recipient = getRecipient();
    if (!recipient) return false;
    
    switch (shareMethod) {
      case 'email':
        return recipient.includes('@');
      case 'whatsapp':
        return recipient.replace(/[^0-9]/g, '').length >= 10;
      case 'telegram':
        return recipient.length > 0;
      default:
        return false;
    }
  };

  const getContactMethodLabel = () => {
    switch (shareMethod) {
      case 'email':
        return 'email';
      case 'whatsapp':
        return 'phone number';
      case 'telegram':
        return 'Telegram ID';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Share Lead
          </DialogTitle>
          <DialogDescription>
            Share {lead.businessName} details via Email, WhatsApp, or Telegram
          </DialogDescription>
        </DialogHeader>

        {/* Save Contact Dialog */}
        {showSaveContactDialog && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <h4 className="font-medium">Save Contact?</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              This {getContactMethodLabel()} isn&apos;t in your address book. Would you like to save it?
            </p>

            {!saveContactMode && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveContactMode('new')}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add New Contact
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveContactMode('update')}
                >
                  <User className="h-4 w-4 mr-1" />
                  Update Existing
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkipSaveContact}
                >
                  Skip
                </Button>
              </div>
            )}

            {saveContactMode === 'new' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="new-contact-name">Contact Name</Label>
                  <Input
                    id="new-contact-name"
                    placeholder="Enter contact name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNewContact}
                    disabled={!newContactName.trim() || isSavingContact}
                  >
                    {isSavingContact ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Save & Share
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSaveContactMode(null);
                      setNewContactName('');
                    }}
                    disabled={isSavingContact}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {saveContactMode === 'update' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Select Contact to Update</Label>
                  <div className="border rounded-lg max-h-[150px] overflow-y-auto">
                    {contacts.length === 0 ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">
                        No contacts found
                      </div>
                    ) : (
                      <div className="divide-y">
                        {contacts.map((contact) => (
                          <div
                            key={contact.id}
                            className={`p-2 flex items-center gap-2 cursor-pointer transition-colors ${
                              contactToUpdate?.id === contact.id
                                ? 'bg-primary/10'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => setContactToUpdate(contact)}
                          >
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">
                                {contact.name}
                              </span>
                              <span className="text-xs text-muted-foreground truncate block">
                                {contact.email || contact.phone || contact.telegramId}
                              </span>
                            </div>
                            {contactToUpdate?.id === contact.id && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleUpdateExistingContact}
                    disabled={!contactToUpdate || isSavingContact}
                  >
                    {isSavingContact ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Update & Share
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSaveContactMode(null);
                      setContactToUpdate(null);
                    }}
                    disabled={isSavingContact}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {!showSaveContactDialog && (
          <>
            <Tabs value={shareMethod} onValueChange={(v) => setShareMethod(v as ShareMethod)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  WhatsApp
                </TabsTrigger>
                <TabsTrigger value="telegram" className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Telegram
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 space-y-4">
                {/* Contact Selection */}
                <div className="space-y-3">
                  <Label>Select Contact or Enter Recipient</Label>

                  {/* Contact Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Contact List */}
                  <div className="border rounded-lg max-h-[180px] overflow-y-auto">
                    {isLoadingContacts ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </div>
                    ) : contacts.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        No contacts found. Enter a recipient below.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {contacts.map((contact) => {
                          const hasMethod =
                            (shareMethod === 'email' && contact.email) ||
                            (shareMethod === 'whatsapp' && contact.phone) ||
                            (shareMethod === 'telegram' && contact.telegramId);

                          return (
                            <div
                              key={contact.id}
                              className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                                selectedContact?.id === contact.id
                                  ? 'bg-primary/10'
                                  : 'hover:bg-muted/50'
                              } ${!hasMethod ? 'opacity-50' : ''}`}
                              onClick={() => {
                                if (hasMethod) {
                                  setSelectedContact(contact);
                                  setCustomRecipient('');
                                }
                              }}
                            >
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">
                                    {contact.name}
                                  </span>
                                  {contact.isFavorite && (
                                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {shareMethod === 'email' && contact.email}
                                  {shareMethod === 'whatsapp' && contact.phone && formatPhoneNumber(contact.phone)}
                                  {shareMethod === 'telegram' && contact.telegramId}
                                  {!hasMethod && (
                                    <span className="text-red-500">
                                      No {shareMethod} contact info
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFavorite(contact);
                                }}
                              >
                                <Star
                                  className={`h-4 w-4 ${
                                    contact.isFavorite
                                      ? 'text-yellow-500 fill-yellow-500'
                                      : 'text-muted-foreground'
                                  }`}
                                />
                              </Button>
                              {selectedContact?.id === contact.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Or enter manually */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or enter manually
                      </span>
                    </div>
                  </div>

                  <TabsContent value="email" className="mt-0">
                    <Input
                      type="email"
                      placeholder="recipient@example.com"
                      value={customRecipient}
                      onChange={(e) => {
                        setCustomRecipient(e.target.value);
                        setSelectedContact(null);
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="whatsapp" className="mt-0">
                    <Input
                      type="tel"
                      placeholder="+1234567890"
                      value={customRecipient}
                      onChange={(e) => {
                        setCustomRecipient(e.target.value);
                        setSelectedContact(null);
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="telegram" className="mt-0">
                    <Input
                      placeholder="@username or chat ID"
                      value={customRecipient}
                      onChange={(e) => {
                        setCustomRecipient(e.target.value);
                        setSelectedContact(null);
                      }}
                    />
                  </TabsContent>
                </div>

                <Separator />

                {/* Message Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Message</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyToClipboard}
                      className="h-7"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    This message will be saved to the lead and can be reused for Email or WhatsApp.
                  </p>
                </div>
              </div>
            </Tabs>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {selectedContact && (
                  <Badge variant="secondary">
                    To: {selectedContact.name}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSharing}>
                  Cancel
                </Button>
                <Button onClick={handleShare} disabled={!canShare() || isSharing}>
                  {isSharing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  {isSharing ? 'Sharing...' : `Share via ${shareMethod === 'email' ? 'Email' : shareMethod === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
