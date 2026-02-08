/**
 * Notification system types.
 *
 * Provides a provider-agnostic abstraction for sending notifications
 * to messaging platforms (Telegram, Slack, WhatsApp, etc.).
 */

import type { EventType } from '@/lib/events';

// ─── Channels ───────────────────────────────────────────────

export type NotificationChannel = 'telegram' | 'slack' | 'whatsapp';

// ─── Provider Interface ─────────────────────────────────────

export interface NotificationProvider {
  /** Unique channel identifier */
  readonly channel: NotificationChannel;

  /** Human-readable provider name */
  readonly displayName: string;

  /** Send a plain text/HTML notification */
  send(message: NotificationMessage): Promise<NotificationResult>;

  /** Send a notification with inline action buttons (if supported) */
  sendWithActions?(
    message: NotificationMessage,
    actions: NotificationAction[],
  ): Promise<NotificationResult>;

  /** Verify the provider credentials are valid */
  testConnection(): Promise<NotificationResult>;
}

// ─── Message Types ──────────────────────────────────────────

export interface NotificationMessage {
  /** Short headline, e.g. "New Lead Created" */
  title: string;
  /** Main body text (may include markdown/HTML depending on provider) */
  body: string;
  /** Optional deep-link URL back to the dashboard */
  url?: string;
  /** Urgency level */
  priority: 'low' | 'normal' | 'high';
}

export interface NotificationAction {
  /** Unique action id, e.g. "approve_msg_abc123" */
  id: string;
  /** Button label shown to the user */
  label: string;
  /** Optional URL to open instead of a callback */
  url?: string;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
}

// ─── Notifiable Event Types ─────────────────────────────────

/** Events that can trigger a notification (subset of all EventTypes) */
export type NotifiableEventType = Extract<
  EventType,
  | 'lead:created'
  | 'lead:status_changed'
  | 'message:created'
  | 'message:approved'
  | 'scraper:completed'
  | 'scraper:error'
>;

/** The complete list, useful for iteration / UI */
export const NOTIFIABLE_EVENTS: { type: NotifiableEventType; label: string }[] = [
  { type: 'lead:created', label: 'New lead created' },
  { type: 'lead:status_changed', label: 'Lead status changed' },
  { type: 'message:created', label: 'Message generated' },
  { type: 'message:approved', label: 'Message approved / sent' },
  { type: 'scraper:completed', label: 'Scraper completed' },
  { type: 'scraper:error', label: 'Scraper error' },
];

// ─── Team Notification Settings ─────────────────────────────

/** Per-provider settings stored inside TeamSettingsDoc */
export interface TelegramNotificationSettings {
  telegramEnabled: boolean;
  telegramBotToken: string | null; // encrypted in Firestore
  telegramChatId: string | null; // encrypted in Firestore
  telegramEvents: NotifiableEventType[];
}

export interface SlackNotificationSettings {
  slackEnabled: boolean;
  slackWebhookUrl: string | null; // encrypted in Firestore
  slackEvents: NotifiableEventType[];
}

/** Aggregate notification settings (what gets stored / loaded) */
export interface NotificationSettings
  extends TelegramNotificationSettings,
    SlackNotificationSettings {
  notificationsEnabled: boolean;
}

/** Default values for fresh teams */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notificationsEnabled: false,

  telegramEnabled: false,
  telegramBotToken: null,
  telegramChatId: null,
  telegramEvents: ['message:approved', 'scraper:completed', 'scraper:error'],

  slackEnabled: false,
  slackWebhookUrl: null,
  slackEvents: ['message:approved', 'scraper:completed', 'scraper:error'],
};
