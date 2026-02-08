'use client';

import { LeadDetailDialog } from '@/components/leads/LeadDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, formatPhoneNumber, getWhatsAppUrl, determineOutreachType, outreachTypeLabels } from '@/lib/utils';
import { Draggable } from '@hello-pangea/dnd';
import { Lead, OutreachType } from '@/types';
import {
    CheckCircle,
    ExternalLink,
    Eye,
    Mail,
    MapPin,
    MessageCircle,
    MessageSquare,
    MoreVertical,
    Phone,
    Star,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface LeadMessage {
  id: string;
  type: 'EMAIL' | 'WHATSAPP';
  status: string;
}

interface LeadWithMessages extends Lead {
  messages?: LeadMessage[];
  _count?: {
    messages: number;
  };
}

interface LeadCardProps {
  lead: LeadWithMessages;
  index: number;
}

export function LeadCard({ lead, index }: LeadCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const hasHighScore = lead.score >= 70;
  const hasMediumScore = lead.score >= 40 && lead.score < 70;
  
  // Get all phones and emails from metadata
  const metadata = lead.metadata as { phones?: string[]; emails?: string[] } | null;
  const phoneCount = metadata?.phones?.length || (lead.phone ? 1 : 0);
  const emailCount = metadata?.emails?.length || (lead.email ? 1 : 0);
  
  // Check if lead has messages
  const messageCount = lead._count?.messages || lead.messages?.length || 0;
  const hasEmailMessage = lead.messages?.some(m => m.type === 'EMAIL') || false;
  const hasWhatsAppMessage = lead.messages?.some(m => m.type === 'WHATSAPP') || false;

  // Determine outreach type (with fallback for un-migrated leads)
  const outreachType: OutreachType = lead.outreachType || determineOutreachType(lead);
  const OutreachIcon = outreachType === 'EMAIL' ? Mail : outreachType === 'WHATSAPP' ? MessageCircle : Phone;
  const outreachColor = outreachType === 'EMAIL'
    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
    : outreachType === 'WHATSAPP'
    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
    : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';

  return (
    <>
      <LeadDetailDialog 
        lead={lead} 
        open={showDetails} 
        onOpenChange={setShowDetails} 
      />
      <Draggable draggableId={lead.id} index={index}>
        {(provided, snapshot) => (
          <Card
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={cn(
              'cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
              snapshot.isDragging && 'shadow-lg rotate-2'
            )}
            onClick={() => setShowDetails(true)}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">
                    {lead.businessName}
                  </h4>
                  {lead.industry && (
                    <p className="text-xs text-muted-foreground truncate">
                      {lead.industry}
                    </p>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem asChild>
                      <Link href={`/leads/${lead.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/leads/${lead.id}?tab=messages`}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Messages
                      </Link>
                    </DropdownMenuItem>
                    {lead.phone && (
                      <DropdownMenuItem asChild>
                        <a
                          href={getWhatsAppUrl(lead.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open WhatsApp
                        </a>
                      </DropdownMenuItem>
                    )}
                    {lead.googleMapsUrl && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <a
                            href={lead.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MapPin className="h-4 w-4 mr-2" />
                            View on Maps
                          </a>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{lead.location}</span>
                </div>

                {/* Phone numbers with count */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {phoneCount > 0 ? (
                    <span>
                      {formatPhoneNumber(lead.phone || (metadata?.phones?.[0] ?? ''))}
                      {phoneCount > 1 && (
                        <span className="ml-1 text-green-600 font-medium">+{phoneCount - 1} more</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">No phone</span>
                  )}
                </div>

                {/* Email with count */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {emailCount > 0 ? (
                    <span className="truncate">
                      {lead.email || metadata?.emails?.[0]}
                      {emailCount > 1 && (
                        <span className="ml-1 text-green-600 font-medium">+{emailCount - 1} more</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">No email</span>
                  )}
                </div>

                {lead.googleRating && (
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    <span className="font-medium">{lead.googleRating}</span>
                    {lead.reviewCount && (
                      <span className="text-muted-foreground">
                        ({lead.reviewCount} reviews)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Message Indicators */}
              {messageCount > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  {hasEmailMessage && (
                    <div className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400" title="Has email message">
                      <Mail className="h-3 w-3" />
                      <CheckCircle className="h-2.5 w-2.5" />
                    </div>
                  )}
                  {hasWhatsAppMessage && (
                    <div className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400" title="Has WhatsApp message">
                      <MessageSquare className="h-3 w-3" />
                      <CheckCircle className="h-2.5 w-2.5" />
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {messageCount} msg{messageCount > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {messageCount === 0 && !['NEW', 'REJECTED', 'INVALID', 'NOT_INTERESTED'].includes(lead.status) && (
                <div className="mt-2 flex items-center gap-1">
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                    ⚠️ No Messages
                  </Badge>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={cn('text-xs flex items-center gap-1', outreachColor)}>
                    <OutreachIcon className="h-3 w-3" />
                    {outreachTypeLabels[outreachType]}
                  </Badge>
                  {!lead.website && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                      No Website
                    </Badge>
                  )}
                  {lead.website && lead.websiteQuality && lead.websiteQuality < 50 && (
                    <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800">
                      Low Quality Site
                    </Badge>
                  )}
                </div>

                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs',
                    hasHighScore && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                    hasMediumScore && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
                    !hasHighScore && !hasMediumScore && 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                  )}
                >
                  Score: {lead.score}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </Draggable>
    </>
  );
}
