import { Header } from '@/components/layout/Header';
import { ApprovalGate } from '@/components/messages/ApprovalGate';
import { MessagePreview } from '@/components/messages/MessagePreview';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { prisma } from '@/lib/db';
import { CheckCircle, Clock, MessageSquare, Send } from 'lucide-react';

async function getMessages() {
  return prisma.message.findMany({
    include: {
      lead: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export default async function MessagesPage() {
  const messages = await getMessages();

  const pendingMessages = messages.filter(
    (m) => m.status === 'DRAFT' || m.status === 'PENDING_APPROVAL'
  );
  const approvedMessages = messages.filter((m) => m.status === 'APPROVED');
  const sentMessages = messages.filter((m) => m.status === 'SENT');

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Messages"
        description="Review and approve outreach messages"
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending ({pendingMessages.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Approved ({approvedMessages.length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Send className="h-4 w-4" />
              Sent ({sentMessages.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingMessages.length > 0 ? (
              pendingMessages.map((message) => (
                <ApprovalGate key={message.id} message={message} />
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No pending messages. Generate messages from lead details to see them here.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            {approvedMessages.length > 0 ? (
              approvedMessages.map((message) => (
                <MessagePreview key={message.id} message={message} />
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No approved messages waiting to be sent.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sent" className="space-y-4">
            {sentMessages.length > 0 ? (
              sentMessages.map((message) => (
                <MessagePreview key={message.id} message={message} />
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No messages sent yet. Approve some messages to get started!
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
