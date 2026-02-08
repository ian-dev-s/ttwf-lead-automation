/**
 * Notification manager.
 *
 * Loads team notification preferences from Firestore, builds the
 * appropriate providers, and dispatches formatted messages.
 */

import type { AppEvent } from '@/lib/events';
import { decryptIfPresent } from '@/lib/crypto';
import { teamSettingsDoc } from '@/lib/firebase/collections';
import { formatEvent } from './formatter';
import { TelegramProvider } from './providers/telegram';
import type {
  NotifiableEventType,
  NotificationProvider,
  NotificationResult,
  NotificationSettings,
} from './types';
import { DEFAULT_NOTIFICATION_SETTINGS } from './types';

// ─── Settings Cache ─────────────────────────────────────────
// Avoid hitting Firestore on every single event

interface CacheEntry {
  settings: NotificationSettings;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const settingsCache = new Map<string, CacheEntry>();

async function getNotificationSettings(
  teamId: string,
): Promise<NotificationSettings> {
  const cached = settingsCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.settings;
  }

  try {
    const snap = await teamSettingsDoc(teamId).get();
    const data = snap.data() ?? {};

    const settings: NotificationSettings = {
      notificationsEnabled: data.notificationsEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.notificationsEnabled,

      telegramEnabled: data.telegramEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.telegramEnabled,
      telegramBotToken: data.telegramBotToken ?? null,
      telegramChatId: data.telegramChatId ?? null,
      telegramEvents: data.telegramEvents ?? DEFAULT_NOTIFICATION_SETTINGS.telegramEvents,

      slackEnabled: data.slackEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.slackEnabled,
      slackWebhookUrl: data.slackWebhookUrl ?? null,
      slackEvents: data.slackEvents ?? DEFAULT_NOTIFICATION_SETTINGS.slackEvents,
    };

    settingsCache.set(teamId, {
      settings,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return settings;
  } catch (err) {
    console.error('[Notifications] Failed to load settings for team', teamId, err);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/** Force-clear the cache for a team (call after settings are saved). */
export function invalidateNotificationCache(teamId: string): void {
  settingsCache.delete(teamId);
}

// ─── Provider Factory ───────────────────────────────────────

function buildProviders(
  settings: NotificationSettings,
): { provider: NotificationProvider; events: NotifiableEventType[] }[] {
  const providers: { provider: NotificationProvider; events: NotifiableEventType[] }[] = [];

  // Telegram
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
    const token = decryptIfPresent(settings.telegramBotToken);
    const chatId = decryptIfPresent(settings.telegramChatId);

    if (token && chatId) {
      providers.push({
        provider: new TelegramProvider(token, chatId),
        events: settings.telegramEvents,
      });
    }
  }

  // Future: Slack
  // if (settings.slackEnabled && settings.slackWebhookUrl) { ... }

  return providers;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Send notifications for a given event to all configured providers for a team.
 * This is fire-and-forget — errors are logged but never thrown.
 */
export async function notify(
  teamId: string,
  event: AppEvent,
  appBaseUrl?: string,
): Promise<void> {
  try {
    const settings = await getNotificationSettings(teamId);

    if (!settings.notificationsEnabled) return;

    const providers = buildProviders(settings);
    if (providers.length === 0) return;

    const message = formatEvent(event, appBaseUrl);
    if (!message) return; // Event type not formattable

    const eventType = event.type as NotifiableEventType;

    const promises: Promise<NotificationResult>[] = [];

    for (const { provider, events } of providers) {
      if (!events.includes(eventType)) continue;
      promises.push(
        provider.send(message).then((result) => {
          if (!result.success) {
            console.error(
              `[Notifications] ${provider.displayName} failed for ${eventType}:`,
              result.error,
            );
          }
          return result;
        }),
      );
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  } catch (err) {
    // Never let notification failures bubble up
    console.error('[Notifications] Unexpected error in notify():', err);
  }
}
