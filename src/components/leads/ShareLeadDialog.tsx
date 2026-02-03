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
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
}

interface ShareLeadDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShareMethod = 'email' | 'whatsapp' | 'telegram';

export function ShareLeadDialog({ lead, open, onOpenChange }: ShareLeadDialogProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [shareMethod, setShareMethod] = useState<ShareMethod>('email');
  const [customRecipient, setCustomRecipient] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    telegramId: '',
  });
  const [isAddingContact, setIsAddingContact] = useState(false);

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
      lines.push(`📝 Notes: ${lead.notes}`);
    }

    return lines.join('\n');
  }, [lead]);

  // Initialize custom message with lead summary
  useEffect(() => {
    if (open) {
      setCustomMessage(generateLeadSummary());
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

  const handleAddContact = async () => {
    if (!newContact.name || (!newContact.email && !newContact.phone && !newContact.telegramId)) {
      return;
    }

    setIsAddingContact(true);
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });

      if (response.ok) {
        const contact = await response.json();
        setContacts((prev) => [contact, ...prev]);
        setSelectedContact(contact);
        setShowAddContact(false);
        setNewContact({ name: '', email: '', phone: '', telegramId: '' });
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    } finally {
      setIsAddingContact(false);
    }
  };

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

  const handleShare = () => {
    const recipient = getRecipient();
    const message = encodeURIComponent(customMessage);

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
              <div className="flex items-center justify-between">
                <Label>Select Contact</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddContact(!showAddContact)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Contact
                </Button>
              </div>

              {/* Add Contact Form */}
              {showAddContact && (
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="new-name">Name *</Label>
                      <Input
                        id="new-name"
                        placeholder="Contact name"
                        value={newContact.name}
                        onChange={(e) =>
                          setNewContact({ ...newContact, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-email">Email</Label>
                      <Input
                        id="new-email"
                        type="email"
                        placeholder="email@example.com"
                        value={newContact.email}
                        onChange={(e) =>
                          setNewContact({ ...newContact, email: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-phone">Phone (WhatsApp)</Label>
                      <Input
                        id="new-phone"
                        placeholder="+1234567890"
                        value={newContact.phone}
                        onChange={(e) =>
                          setNewContact({ ...newContact, phone: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-telegram">Telegram</Label>
                      <Input
                        id="new-telegram"
                        placeholder="@username"
                        value={newContact.telegramId}
                        onChange={(e) =>
                          setNewContact({ ...newContact, telegramId: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddContact(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddContact}
                      disabled={isAddingContact || !newContact.name}
                    >
                      {isAddingContact ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Plus className="h-4 w-4 mr-1" />
                      )}
                      Save Contact
                    </Button>
                  </div>
                </div>
              )}

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
                    No contacts found. Add one above!
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
                          onClick={() => hasMethod && setSelectedContact(contact)}
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={!canShare()}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open {shareMethod === 'email' ? 'Email' : shareMethod === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
