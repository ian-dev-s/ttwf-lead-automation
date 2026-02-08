import { auth } from '@/lib/auth';
import { encrypt, decryptIfPresent, maskSecret } from '@/lib/crypto';
import { teamSettingsDoc } from '@/lib/firebase/collections';
import { invalidateNotificationCache, DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/notifications';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const notificationSettingsSchema = z.object({
  notificationsEnabled: z.boolean().optional(),

  // Telegram
  telegramEnabled: z.boolean().optional(),
  telegramBotToken: z.string().nullable().optional(),
  telegramChatId: z.string().nullable().optional(),
  telegramEvents: z.array(z.string()).optional(),

  // Slack (future)
  slackEnabled: z.boolean().optional(),
  slackWebhookUrl: z.string().nullable().optional(),
  slackEvents: z.array(z.string()).optional(),
});

// GET /api/notifications/settings — return masked notification config
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const snap = await teamSettingsDoc(teamId).get();
    const data = snap.data() ?? {};

    // Decrypt then mask secrets for safe display
    const telegramBotToken = decryptIfPresent(data.telegramBotToken ?? null);
    const telegramChatId = decryptIfPresent(data.telegramChatId ?? null);
    const slackWebhookUrl = decryptIfPresent(data.slackWebhookUrl ?? null);

    return NextResponse.json({
      notificationsEnabled: data.notificationsEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.notificationsEnabled,

      telegramEnabled: data.telegramEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.telegramEnabled,
      telegramBotTokenMasked: maskSecret(telegramBotToken),
      telegramChatIdMasked: maskSecret(telegramChatId),
      telegramHasToken: !!telegramBotToken,
      telegramHasChatId: !!telegramChatId,
      telegramEvents: data.telegramEvents ?? DEFAULT_NOTIFICATION_SETTINGS.telegramEvents,

      slackEnabled: data.slackEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.slackEnabled,
      slackWebhookUrlMasked: maskSecret(slackWebhookUrl),
      slackHasWebhook: !!slackWebhookUrl,
      slackEvents: data.slackEvents ?? DEFAULT_NOTIFICATION_SETTINGS.slackEvents,
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return NextResponse.json({ error: 'Failed to fetch notification settings' }, { status: 500 });
  }
}

// PATCH /api/notifications/settings — update notification config
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can update notification settings' },
        { status: 403 },
      );
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const data = notificationSettingsSchema.parse(body);

    const updateData: Record<string, unknown> = {};

    // Master toggle
    if (data.notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = data.notificationsEnabled;
    }

    // Telegram
    if (data.telegramEnabled !== undefined) updateData.telegramEnabled = data.telegramEnabled;
    if (data.telegramBotToken !== undefined) {
      updateData.telegramBotToken = data.telegramBotToken ? encrypt(data.telegramBotToken) : null;
    }
    if (data.telegramChatId !== undefined) {
      updateData.telegramChatId = data.telegramChatId ? encrypt(data.telegramChatId) : null;
    }
    if (data.telegramEvents !== undefined) updateData.telegramEvents = data.telegramEvents;

    // Slack (future)
    if (data.slackEnabled !== undefined) updateData.slackEnabled = data.slackEnabled;
    if (data.slackWebhookUrl !== undefined) {
      updateData.slackWebhookUrl = data.slackWebhookUrl ? encrypt(data.slackWebhookUrl) : null;
    }
    if (data.slackEvents !== undefined) updateData.slackEvents = data.slackEvents;

    updateData.updatedAt = new Date();

    // Upsert
    const settingsRef = teamSettingsDoc(teamId);
    const existingDoc = await settingsRef.get();

    if (existingDoc.exists) {
      await settingsRef.update(updateData);
    } else {
      await settingsRef.set(updateData);
    }

    // Invalidate the in-memory cache so the next notification picks up changes
    invalidateNotificationCache(teamId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating notification settings:', error);
    return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 });
  }
}
