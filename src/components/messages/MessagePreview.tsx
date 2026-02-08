'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/utils';
import { Lead, Message } from '@/types';
import {
    Bot,
    Check,
    Copy,
    Edit2,
    FileText,
    Mail,
    RefreshCw,
    Reply,
    RotateCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface MessageWithLead extends Message {
  lead: Lead;
}

interface MessagePreviewProps {
  message: MessageWithLead;
  onUpdate?: () => void;
}

export function MessagePreview({ message, onUpdate }: MessagePreviewProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });

      if (!response.ok) throw new Error('Failed to save');

      setIsEditing(false);
      onUpdate?.();
      router.refresh();
    } catch (error) {
      console.error('Error saving message:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: message.lead.id,
          type: 'EMAIL',
          useAI: true,
          saveMessage: false,
        }),
      });

      if (!response.ok) throw new Error('Failed to regenerate');

      const data = await response.json();
      setEditedContent(data.content);
      setIsEditing(true);
    } catch (error) {
      console.error('Error regenerating message:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      const response = await fetch(`/api/messages/${message.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to resend');

      router.refresh();
    } catch (error) {
      console.error('Error resending message:', error);
    } finally {
      setIsResending(false);
    }
  };

  const handleCreateFollowUp = async () => {
    setIsCreatingFollowUp(true);
    try {
      const response = await fetch('/api/messages/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: message.lead.id,
          previousMessageId: message.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to create follow-up');

      router.refresh();
    } catch (error) {
      console.error('Error creating follow-up:', error);
    } finally {
      setIsCreatingFollowUp(false);
    }
  };

  const isAIGenerated = message.generatedBy === 'ai';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Email Message</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* AI/Template Badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={isAIGenerated ? 'default' : 'outline'}
                    className={isAIGenerated 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : 'border-amber-500 text-amber-600 dark:text-amber-400'
                    }
                  >
                    {isAIGenerated ? (
                      <>
                        <Bot className="h-3 w-3 mr-1" />
                        AI
                      </>
                    ) : (
                      <>
                        <FileText className="h-3 w-3 mr-1" />
                        Template
                      </>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {isAIGenerated 
                    ? `Generated by AI (${message.aiProvider}/${message.aiModel})`
                    : 'Generated from template'
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {message.status === 'FAILED' ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="destructive">
                      FAILED
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {message.error || 'Message failed to send'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Badge
                variant={message.status === 'APPROVED' ? 'default' : 'secondary'}
              >
                {message.status}
              </Badge>
            )}
          </div>
        </div>
        {message.sentAt && (
          <div className="text-xs text-muted-foreground mt-1">
            Sent: {formatDateTime(message.sentAt)}
          </div>
        )}
        <div className="text-sm text-muted-foreground">
          To: <span className="font-medium">{message.lead.businessName}</span>
          {message.lead.email && (
            <span> ({message.lead.email})</span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {message.subject && (
          <div className="mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              Subject:
            </span>
            <p className="font-medium">{message.subject}</p>
          </div>
        )}

        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
            {message.content}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditedContent(message.content);
              setIsEditing(true);
            }}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`}
            />
            Regenerate
          </Button>

          {(message.status === 'SENT' || message.status === 'FAILED') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResend}
              disabled={isResending}
            >
              <RotateCw
                className={`h-4 w-4 mr-2 ${isResending ? 'animate-spin' : ''}`}
              />
              Resend
            </Button>
          )}

          {message.status === 'SENT' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateFollowUp}
              disabled={isCreatingFollowUp}
            >
              <Reply
                className={`h-4 w-4 mr-2 ${isCreatingFollowUp ? 'animate-spin' : ''}`}
              />
              Create Follow-up
            </Button>
          )}
        </div>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
            <DialogDescription>
              Modify the message content before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {editedContent.length} characters
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
