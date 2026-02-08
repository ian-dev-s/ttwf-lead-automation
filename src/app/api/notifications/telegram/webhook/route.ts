import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/notifications/telegram/webhook
 *
 * Receives Telegram Bot inline-keyboard callback queries.
 * This is a placeholder for future interactive features such as
 * approving/rejecting messages directly from Telegram.
 *
 * To activate, register this URL via the Telegram Bot setWebhook API:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/notifications/telegram/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Telegram sends "callback_query" when an inline button is pressed
    const callbackQuery = body.callback_query;
    if (!callbackQuery) {
      // Could be a regular message — ignore for now
      return NextResponse.json({ ok: true });
    }

    const callbackData = callbackQuery.data as string | undefined;
    if (!callbackData) {
      return NextResponse.json({ ok: true });
    }

    console.log('[Telegram Webhook] Received callback:', callbackData);

    // Future: parse callback_data like "approve:teamId:messageId"
    // and call the approval logic. For now just acknowledge.

    // Answer the callback to remove the loading state on the button
    const botToken = process.env.TELEGRAM_WEBHOOK_BOT_TOKEN;
    if (botToken) {
      await fetch(
        `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: 'Received! (Interactive approvals coming soon)',
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ ok: true });
  }
}
