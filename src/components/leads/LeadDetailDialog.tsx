"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Lead } from "@prisma/client"
import { Edit2, ExternalLink, Globe, Loader2, Mail, MapPin, Phone, Save, Star, X, XCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { formatPhoneNumber, getWhatsAppUrl, leadStatusColors, leadStatusLabels } from "@/lib/utils"

interface LeadDetailDialogProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadDetailDialog({ lead, open, onOpenChange }: LeadDetailDialogProps) {
  const router = useRouter()
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)
  
  // Editing states
  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [isEditingWebsite, setIsEditingWebsite] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Edit values
  const [editPhone, setEditPhone] = useState(lead?.phone || '')
  const [editEmail, setEditEmail] = useState(lead?.email || '')
  const [editWebsite, setEditWebsite] = useState(lead?.website || '')
  const [editNotes, setEditNotes] = useState(lead?.notes || '')

  if (!lead) return null

  // Helper to safely get metadata arrays
  const metadata = lead.metadata as { phones?: string[]; emails?: string[] } | null
  const allPhones = metadata?.phones || (lead.phone ? [lead.phone] : [])
  const allEmails = metadata?.emails || (lead.email ? [lead.email] : [])

  const handleSaveField = async (field: 'phone' | 'email' | 'website' | 'notes', value: string) => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: value || null,
        }),
      })

      if (!response.ok) throw new Error(`Failed to update ${field}`)

      // Reset editing state
      if (field === 'phone') setIsEditingPhone(false)
      if (field === 'email') setIsEditingEmail(false)
      if (field === 'website') setIsEditingWebsite(false)
      if (field === 'notes') setIsEditingNotes(false)

      router.refresh()
    } catch (error) {
      console.error(`Error updating ${field}:`, error)
      alert(`Failed to update ${field}. Please try again.`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = (field: 'phone' | 'email' | 'website' | 'notes') => {
    if (field === 'phone') {
      setEditPhone(lead.phone || '')
      setIsEditingPhone(false)
    }
    if (field === 'email') {
      setEditEmail(lead.email || '')
      setIsEditingEmail(false)
    }
    if (field === 'website') {
      setEditWebsite(lead.website || '')
      setIsEditingWebsite(false)
    }
    if (field === 'notes') {
      setEditNotes(lead.notes || '')
      setIsEditingNotes(false)
    }
  }

  const handleRejectLead = async () => {
    setIsRejecting(true)
    try {
      const existingNotes = lead.notes || ''
      const timestamp = new Date().toLocaleDateString()
      const newNotes = existingNotes
        ? `${existingNotes}\n\n--- Rejected on ${timestamp} ---\n${rejectReason}`
        : `--- Rejected on ${timestamp} ---\n${rejectReason}`

      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REJECTED',
          notes: newNotes,
        }),
      })

      if (!response.ok) throw new Error('Failed to reject lead')

      setShowRejectDialog(false)
      setRejectReason('')
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error('Error rejecting lead:', error)
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="text-xl font-bold">{lead.businessName}</DialogTitle>
              <DialogDescription className="mt-1">
                {lead.industry || "No industry specified"}
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className={leadStatusColors[lead.status]}>
                {leadStatusLabels[lead.status]}
              </Badge>
              <Badge variant="secondary">Score: {lead.score}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Contact Details</h4>
            
            <div className="grid gap-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium">{lead.location}</p>
                  {lead.address && <p className="text-muted-foreground">{lead.address}</p>}
                </div>
              </div>

              {/* Phone - Editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>Phone</span>
                  </div>
                  {!isEditingPhone && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingPhone(true)}
                      className="h-6 px-2"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {isEditingPhone ? (
                  <div className="space-y-2">
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Enter phone number"
                      disabled={isSaving}
                      className="text-sm"
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
                  <div>
                    {lead.phone ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{formatPhoneNumber(lead.phone)}</span>
                        <a
                          href={getWhatsAppUrl(lead.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-600 hover:underline"
                        >
                          WhatsApp
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No phone number</p>
                    )}
                  </div>
                )}
              </div>

              {/* Email - Editable */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>Email</span>
                  </div>
                  {!isEditingEmail && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingEmail(true)}
                      className="h-6 px-2"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {isEditingEmail ? (
                  <div className="space-y-2">
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Enter email address"
                      disabled={isSaving}
                      className="text-sm"
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
                  <div>
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        className="block text-sm font-medium hover:underline"
                      >
                        {lead.email}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground">No email address</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Online Presence */}
          <div className="space-y-4">
             <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Online Presence</h4>
             
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
                     className="h-6 px-2"
                   >
                     <Edit2 className="h-3 w-3" />
                   </Button>
                 )}
               </div>
               {isEditingWebsite ? (
                 <div className="space-y-2">
                   <Input
                     type="url"
                     value={editWebsite}
                     onChange={(e) => setEditWebsite(e.target.value)}
                     placeholder="https://example.com"
                     disabled={isSaving}
                     className="text-sm"
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
                 <div>
                   {lead.website ? (
                     <a 
                       href={lead.website}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="flex items-center gap-1 text-sm font-medium hover:underline"
                     >
                       Visit Website <ExternalLink className="h-3 w-3" />
                     </a>
                   ) : (
                     <p className="text-sm font-medium text-green-600">No Website - Great prospect!</p>
                   )}
                 </div>
               )}
             </div>

             {lead.googleRating && (
               <div className="space-y-1">
                 <span className="text-xs text-muted-foreground">Rating</span>
                 <div className="flex items-center gap-1 text-sm font-medium">
                   <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                   {lead.googleRating} ({lead.reviewCount})
                 </div>
               </div>
             )}
          </div>
          
          <Separator />
          
          {/* Notes - Editable */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Notes</h4>
              {!isEditingNotes && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingNotes(true)}
                  className="h-6 px-2"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            {isEditingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                  rows={4}
                  disabled={isSaving}
                  className="text-sm"
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
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                    {lead.notes}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet. Click edit to add notes.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4">
            {lead.status !== 'NOT_INTERESTED' && lead.status !== 'REJECTED' && lead.status !== 'INVALID' && (
              <Button
                variant="destructive"
                onClick={() => setShowRejectDialog(true)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject Lead
              </Button>
            )}
            <Button asChild className={lead.status === 'NOT_INTERESTED' || lead.status === 'REJECTED' || lead.status === 'INVALID' ? '' : 'ml-auto'}>
              <Link href={`/leads/${lead.id}`}>View Full Details</Link>
            </Button>
          </div>
        </div>
      </DialogContent>

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
              <Label htmlFor="reject-reason-dialog">Rejection Reason</Label>
              <Textarea
                id="reject-reason-dialog"
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
                setShowRejectDialog(false)
                setRejectReason('')
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
    </Dialog>
  )
}
