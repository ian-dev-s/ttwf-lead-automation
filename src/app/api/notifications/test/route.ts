import { auth } from '@/lib/auth';
import { decryptIfPresent } from '@/lib/crypto';
import { teamSettingsDoc } from '@/lib/firebase/collections';
import { TelegramProvider } from '@/lib/notifications';
import {
  verifyBotToken,
  detectChatId,
} from '@/lib/notifications/providers/telegram';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const testSchema = z.object({
  channel: z.enum(['telegram', 'slack']),
  // Action: 'verify' validates token & auto-detects chatId, 'test' sends a test message
  action: z.enum(['verify', 'test']).optional().default('test'),
  // Optional overrides — if provided, use these instead of stored settings.
  botToken: z.string().optional(),
  chatId: z.string().optional(),
});

// POST /api/notifications/test — verify credentials or send a test notification
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can test notifications' },
        { status: 403 },
      );
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const data = testSchema.parse(body);

    if (data.channel === 'telegram') {
      let botToken = data.botToken?.trim();

      // Fall back to stored (encrypted) token if not provided
      if (!botToken) {
        const snap = await teamSettingsDoc(teamId).get();
        const stored = snap.data() ?? {};
        botToken = decryptIfPresent(stored.telegramBotToken) || undefined;
      }

      if (!botToken) {
        return NextResponse.json(
          { success: false, error: 'Bot token is required' },
          { status: 400 },
        );
      }

      // ─── Verify action: validate token + auto-detect chat ID ───
      if (data.action === 'verify') {
        // Step 1: Verify the bot token
        const verifyResult = await verifyBotToken(botToken);
        if (!verifyResult.success) {
          return NextResponse.json({
            success: false,
            error: verifyResult.error,
          });
        }

        // Step 2: Auto-detect chat ID from recent messages
        const detectResult = await detectChatId(botToken);
        if (!detectResult.success) {
          return NextResponse.json({
            success: false,
            error: detectResult.error,
            bot: verifyResult.bot,
            // Token is valid but no chat found yet
            tokenValid: true,
          });
        }

        return NextResponse.json({
          success: true,
          bot: verifyResult.bot,
          chatId: detectResult.chatId,
          chatTitle: detectResult.chatTitle,
        });
      }

      // ─── Test action: send a test message ───
      let chatId = data.chatId?.trim();

      // Fall back to stored chat ID if not provided
      if (!chatId) {
        const snap = await teamSettingsDoc(teamId).get();
        const stored = snap.data() ?? {};
        chatId = decryptIfPresent(stored.telegramChatId) || undefined;
      }

      if (!chatId) {
        return NextResponse.json(
          { success: false, error: 'Chat ID is required. Click "Detect Chat ID" first.' },
          { status: 400 },
        );
      }

      const provider = new TelegramProvider(botToken, chatId);
      const result = await provider.testConnection();
      return NextResponse.json(result);
    }

    // Future: Slack, WhatsApp
    return NextResponse.json(
      { success: false, error: `Channel "${data.channel}" is not yet supported` },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error testing notification:', error);
    return NextResponse.json({ error: 'Failed to test notification' }, { status: 500 });
  }
}
