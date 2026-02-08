/**
 * Notification message formatter.
 *
 * Converts raw AppEvent data into human-readable NotificationMessages.
 */

import type { AppEvent, LeadEvent, ScraperEvent } from '@/lib/events';
import type { NotifiableEventType, NotificationMessage } from './types';

interface MessageEventData {
  messageId: string;
  leadId?: string;
  businessName?: string;
  email?: string;
  subject?: string;
  error?: string;
  status?: string;
}

/**
 * Format an AppEvent into a notification message.
 * Returns null for event types we don't notify on.
 */
export function formatEvent(
  event: AppEvent,
  appBaseUrl?: string,
): NotificationMessage | null {
  const type = event.type as NotifiableEventType;

  switch (type) {
    case 'lead:created':
      return formatLeadCreated(event.data as LeadEvent, appBaseUrl);
    case 'lead:status_changed':
      return formatLeadStatusChanged(event.data as LeadEvent, appBaseUrl);
    case 'message:created':
      return formatMessageCreated(event.data as MessageEventData, appBaseUrl);
    case 'message:approved':
      return formatMessageApproved(event.data as MessageEventData, appBaseUrl);
    case 'scraper:completed':
      return formatScraperCompleted(event.data as ScraperEvent);
    case 'scraper:error':
      return formatScraperError(event.data as ScraperEvent);
    default:
      return null;
  }
}

// ─── Individual Formatters ──────────────────────────────────

function formatLeadCreated(
  data: LeadEvent,
  baseUrl?: string,
): NotificationMessage {
  const name = data.businessName || 'Unknown';
  return {
    title: 'New Lead Created',
    body: `${name} has been added to your pipeline.`,
    url: baseUrl ? `${baseUrl}/leads` : undefined,
    priority: 'normal',
  };
}

function formatLeadStatusChanged(
  data: LeadEvent,
  baseUrl?: string,
): NotificationMessage {
  const name = data.businessName || 'Unknown';
  const from = data.previousStatus || '—';
  const to = data.status || '—';
  return {
    title: 'Lead Status Changed',
    body: `${name}: ${from} → ${to}`,
    url: baseUrl ? `${baseUrl}/leads` : undefined,
    priority: 'normal',
  };
}

function formatMessageCreated(
  data: MessageEventData,
  baseUrl?: string,
): NotificationMessage {
  const name = data.businessName || data.leadId || 'a lead';
  return {
    title: 'Message Generated',
    body: `A new message has been generated for ${name} and is awaiting review.`,
    url: baseUrl ? `${baseUrl}/messages` : undefined,
    priority: 'normal',
  };
}

function formatMessageApproved(
  data: MessageEventData,
  baseUrl?: string,
): NotificationMessage {
  const name = data.businessName || data.leadId || 'a lead';
  const status = data.status?.toUpperCase();

  if (status === 'SENT') {
    return {
      title: 'Email Sent Successfully',
      body: `Message to ${name}${data.email ? ` (${data.email})` : ''} was sent.`,
      url: baseUrl ? `${baseUrl}/messages` : undefined,
      priority: 'normal',
    };
  }

  if (status === 'FAILED') {
    return {
      title: 'Email Send Failed',
      body: `Failed to send message to ${name}: ${data.error || 'Unknown error'}`,
      url: baseUrl ? `${baseUrl}/messages` : undefined,
      priority: 'high',
    };
  }

  return {
    title: 'Message Approved',
    body: `Message for ${name} has been approved.`,
    url: baseUrl ? `${baseUrl}/messages` : undefined,
    priority: 'normal',
  };
}

function formatScraperCompleted(data: ScraperEvent): NotificationMessage {
  const count = data.leadsFound ?? 0;
  return {
    title: 'Scraper Completed',
    body: `Scraping job finished — ${count} lead${count === 1 ? '' : 's'} found.`,
    priority: 'low',
  };
}

function formatScraperError(data: ScraperEvent): NotificationMessage {
  return {
    title: 'Scraper Error',
    body: `Scraping job failed: ${data.error || data.message || 'Unknown error'}`,
    priority: 'high',
  };
}
