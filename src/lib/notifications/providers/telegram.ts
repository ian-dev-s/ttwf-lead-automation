/**
 * Telegram Bot API notification provider.
 *
 * Uses the HTTP Bot API directly via fetch — no extra dependencies required.
 * @see https://core.telegram.org/bots/api
 */

import type {
  NotificationAction,
  NotificationMessage,
  NotificationProvider,
  NotificationResult,
} from '../types';

const API_BASE = 'https://api.telegram.org/bot';

// ── Static helpers (no instance needed) ─────────────────────

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
}

export interface TelegramVerifyResult {
  success: boolean;
  bot?: TelegramBotInfo;
  error?: string;
}

export interface TelegramChatDetectResult {
  success: boolean;
  chatId?: string;
  chatTitle?: string;
  error?: string;
}

/**
 * Verify a bot token is valid and return bot info.
 */
export async function verifyBotToken(botToken: string): Promise<TelegramVerifyResult> {
  const token = botToken.trim();
  if (!token) {
    return { success: false, error: 'Bot token is empty' };
  }

  try {
    const res = await fetch(`${API_BASE}${token}/getMe`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    if (!data.ok) {
      return {
        success: false,
        error: data.description || 'Invalid bot token',
      };
    }

    return {
      success: true,
      bot: {
        id: data.result.id,
        username: data.result.username,
        firstName: data.result.first_name,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify bot token',
    };
  }
}

/**
 * Auto-detect the chat ID by looking at recent messages sent to the bot.
 * The user must send /start (or any message) to the bot first.
 */
export async function detectChatId(botToken: string): Promise<TelegramChatDetectResult> {
  const token = botToken.trim();
  if (!token) {
    return { success: false, error: 'Bot token is empty' };
  }

  try {
    const res = await fetch(`${API_BASE}${token}/getUpdates?limit=10`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    if (!data.ok) {
      return {
        success: false,
        error: data.description || 'Failed to get updates',
      };
    }

    const updates = data.result as Array<{ message?: { chat?: { id: number; title?: string; first_name?: string } } }>;
    
    if (!updates || updates.length === 0) {
      return {
        success: false,
        error: 'No messages found. Please send /start to your bot first, then try again.',
      };
    }

    // Find the most recent chat (prefer groups, then private chats)
    let bestChat: { id: number; title?: string; first_name?: string } | null = null;
    for (const update of updates.reverse()) {
      const chat = update.message?.chat;
      if (chat) {
        bestChat = chat;
        break;
      }
    }

    if (!bestChat) {
      return {
        success: false,
        error: 'No valid chat found in recent messages. Send /start to your bot first.',
      };
    }

    return {
      success: true,
      chatId: String(bestChat.id),
      chatTitle: bestChat.title || bestChat.first_name || 'Private Chat',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to detect chat ID',
    };
  }
}

// ── Provider Class ──────────────────────────────────────────

export class TelegramProvider implements NotificationProvider {
  readonly channel = 'telegram' as const;
  readonly displayName = 'Telegram';

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {
    // Trim whitespace from credentials
    this.botToken = botToken.trim();
    this.chatId = chatId.trim();
  }

  // ── Public API ──────────────────────────────────────────────

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const text = this.formatMessage(message);
    return this.sendMessage(text);
  }

  async sendWithActions(
    message: NotificationMessage,
    actions: NotificationAction[],
  ): Promise<NotificationResult> {
    const text = this.formatMessage(message);
    const inlineKeyboard = actions.map((action) => {
      if (action.url) {
        return [{ text: action.label, url: action.url }];
      }
      return [{ text: action.label, callback_data: action.id }];
    });
    return this.sendMessage(text, { inline_keyboard: inlineKeyboard });
  }

  async testConnection(): Promise<NotificationResult> {
    try {
      // Verify the bot token by calling getMe
      const res = await fetch(`${API_BASE}${this.botToken}/getMe`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (!data.ok) {
        return { success: false, error: `Telegram API error: ${data.description || 'Unknown error'}` };
      }

      // Try sending a test message
      const testResult = await this.sendMessage(
        '✅ <b>Connection successful!</b>\n\nThis bot is now linked to your TTWF Lead Automation notifications.',
      );
      if (!testResult.success) {
        return { success: false, error: `Bot verified, but failed to send to chat: ${testResult.error}` };
      }

      return {
        success: true,
        error: undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error testing Telegram connection',
      };
    }
  }

  // ── Internals ───────────────────────────────────────────────

  private formatMessage(msg: NotificationMessage): string {
    const priorityIcon =
      msg.priority === 'high' ? '🔴' : msg.priority === 'normal' ? '🔵' : '⚪';

    let text = `${priorityIcon} <b>${escapeHtml(msg.title)}</b>\n\n${escapeHtml(msg.body)}`;

    if (msg.url) {
      text += `\n\n<a href="${escapeHtml(msg.url)}">Open in dashboard →</a>`;
    }

    return text;
  }

  private async sendMessage(
    text: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<NotificationResult> {
    try {
      const body: Record<string, unknown> = {
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      if (replyMarkup) {
        body.reply_markup = JSON.stringify(replyMarkup);
      }

      const res = await fetch(`${API_BASE}${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();

      if (!data.ok) {
        return {
          success: false,
          error: `Telegram sendMessage error: ${data.description || 'Unknown error'}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error sending Telegram message',
      };
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
