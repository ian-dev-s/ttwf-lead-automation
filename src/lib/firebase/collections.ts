/**
 * Typed Firestore collection references and helper utilities.
 *
 * Collection layout (mirrors the plan):
 *   users/{userId}
 *   teams/{teamId}
 *   teams/{teamId}/settings/default        (single doc per team)
 *   teams/{teamId}/apiKeys/{keyId}
 *   teams/{teamId}/leads/{leadId}
 *   teams/{teamId}/messages/{msgId}
 *   teams/{teamId}/statusHistory/{histId}
 *   teams/{teamId}/contacts/{contactId}
 *   teams/{teamId}/scrapingJobs/{jobId}
 *   teams/{teamId}/aiConfigs/{configId}
 *   teams/{teamId}/emailTemplates/{tplId}
 *   teams/{teamId}/aiKnowledgeItems/{itemId}
 *   teams/{teamId}/aiSampleResponses/{sampleId}
 *   teams/{teamId}/analyzedBusinesses/{bizId}
 *   teams/{teamId}/inboundEmails/{emailId}
 */

import { adminDb } from './admin';

// ─── Helpers ───────────────────────────────────────────────

/**
 * Convert a Firestore Timestamp or any date-ish value to a JS Date.
 */
export function toDate(val: unknown): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  // firebase-admin Timestamp
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate();
  }
  return new Date(val as string | number);
}

/**
 * Strip undefined values from an object (Firestore rejects undefined).
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }
  return result;
}

/**
 * Serialize Firestore document data to plain JSON-safe objects.
 * Converts Timestamps to ISO strings so data can be passed to Client Components
 * or returned from API routes without serialization errors.
 */
export function serializeDoc<T = Record<string, unknown>>(data: Record<string, unknown>): T {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      serialized[key] = value;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
      // Firestore Timestamp -> ISO string
      serialized[key] = toDate(value).toISOString();
    } else if (value instanceof Date) {
      serialized[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      serialized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? serializeDoc(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === 'object') {
      serialized[key] = serializeDoc(value as Record<string, unknown>);
    } else {
      serialized[key] = value;
    }
  }
  return serialized as T;
}

/**
 * Generate a server timestamp for Firestore.
 */
export function serverTimestamp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FieldValue } = require('firebase-admin/firestore');
  return FieldValue.serverTimestamp();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCol = FirebaseFirestore.CollectionReference<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = FirebaseFirestore.DocumentReference<any>;

// ─── Top-level collections ─────────────────────────────────

export function usersCollection(): AnyCol {
  return adminDb.collection('users');
}

export function userDoc(userId: string): AnyDoc {
  return usersCollection().doc(userId);
}

export function teamsCollection(): AnyCol {
  return adminDb.collection('teams');
}

export function teamDoc(teamId: string): AnyDoc {
  return teamsCollection().doc(teamId);
}

// ─── Team-scoped subcollections ────────────────────────────

/** Single settings document per team at teams/{teamId}/settings/default */
export function teamSettingsDoc(teamId: string): AnyDoc {
  return teamDoc(teamId).collection('settings').doc('default');
}

export function teamApiKeysCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('apiKeys');
}

export function teamApiKeyDoc(teamId: string, keyId: string): AnyDoc {
  return teamApiKeysCollection(teamId).doc(keyId);
}

export function leadsCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('leads');
}

export function leadDoc(teamId: string, leadId: string): AnyDoc {
  return leadsCollection(teamId).doc(leadId);
}

export function messagesCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('messages');
}

export function messageDoc(teamId: string, msgId: string): AnyDoc {
  return messagesCollection(teamId).doc(msgId);
}

export function statusHistoryCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('statusHistory');
}

export function contactsCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('contacts');
}

export function contactDoc(teamId: string, contactId: string): AnyDoc {
  return contactsCollection(teamId).doc(contactId);
}

export function scrapingJobsCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('scrapingJobs');
}

export function scrapingJobDoc(teamId: string, jobId: string): AnyDoc {
  return scrapingJobsCollection(teamId).doc(jobId);
}

export function aiConfigsCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('aiConfigs');
}

export function aiConfigDoc(teamId: string, configId: string): AnyDoc {
  return aiConfigsCollection(teamId).doc(configId);
}

export function emailTemplatesCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('emailTemplates');
}

export function emailTemplateDoc(teamId: string, tplId: string): AnyDoc {
  return emailTemplatesCollection(teamId).doc(tplId);
}

export function aiKnowledgeItemsCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('aiKnowledgeItems');
}

export function aiKnowledgeItemDoc(teamId: string, itemId: string): AnyDoc {
  return aiKnowledgeItemsCollection(teamId).doc(itemId);
}

export function aiSampleResponsesCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('aiSampleResponses');
}

export function aiSampleResponseDoc(teamId: string, sampleId: string): AnyDoc {
  return aiSampleResponsesCollection(teamId).doc(sampleId);
}

export function analyzedBusinessesCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('analyzedBusinesses');
}

export function analyzedBusinessDoc(teamId: string, bizId: string): AnyDoc {
  return analyzedBusinessesCollection(teamId).doc(bizId);
}

export function inboundEmailsCollection(teamId: string): AnyCol {
  return teamDoc(teamId).collection('inboundEmails');
}

export function inboundEmailDoc(teamId: string, emailId: string): AnyDoc {
  return inboundEmailsCollection(teamId).doc(emailId);
}
