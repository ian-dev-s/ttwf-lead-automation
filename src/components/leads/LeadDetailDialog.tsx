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
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Lead } from "@prisma/client"
import { ExternalLink, Mail, MapPin, Phone, Star, XCircle } from "lucide-react"
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

  if (!lead) return null

  // Helper to safely get metadata arrays
  const metadata = lead.metadata as { phones?: string[]; emails?: string[] } | null
  const allPhones = metadata?.phones || (lead.phone ? [lead.phone] : [])
  const allEmails = metadata?.emails || (lead.email ? [lead.email] : [])

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
          status: 'NOT_INTERESTED',
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

              {allPhones.length > 0 && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="space-y-1">
                    {allPhones.map((phone, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{formatPhoneNumber(phone)}</span>
                        <a
                          href={getWhatsAppUrl(phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-600 hover:underline"
                        >
                          WhatsApp
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allEmails.length > 0 && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="space-y-1">
                    {allEmails.map((email, i) => (
                      <a
                        key={i}
                        href={`mailto:${email}`}
                        className="block text-sm font-medium hover:underline"
                      >
                        {email}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Online Presence */}
          <div className="space-y-4">
             <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Online Presence</h4>
             
             <div className="grid grid-cols-2 gap-4">
                {lead.website ? (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Website</span>
                    <a 
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      Visit Website <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Website</span>
                    <p className="text-sm font-medium text-green-600">No Website</p>
                  </div>
                )}

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
          </div>
          
          {lead.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Notes</h4>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                  {lead.notes}
                </p>
              </div>
            </>
          )}

          <div className="flex justify-between pt-4">
            {lead.status !== 'NOT_INTERESTED' && lead.status !== 'INVALID' && (
              <Button
                variant="destructive"
                onClick={() => setShowRejectDialog(true)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject Lead
              </Button>
            )}
            <Button asChild className={lead.status === 'NOT_INTERESTED' || lead.status === 'INVALID' ? '' : 'ml-auto'}>
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
