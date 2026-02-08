/**
 * Firestore document type definitions.
 *
 * These replace the Prisma-generated types. Every document type mirrors the
 * fields from the old Prisma schema but uses plain TS types instead.
 * Timestamps are stored as Firestore Timestamps but typed as `Date` here
 * for convenience (the collections helper converts them).
 */

import type {
  UserRole,
  LeadStatus,
  MessageType,
  MessageStatus,
  AIProvider,
  JobStatus,
} from '@/types';

// ─── Auth / Users ──────────────────────────────────────────

export interface UserDoc {
  email: string;
  name: string | null;
  role: UserRole;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Teams ─────────────────────────────────────────────────

export interface TeamDoc {
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamSettingsDoc {
  // Lead generation
  dailyLeadTarget: number;
  leadGenerationEnabled: boolean;

  // Scraping
  scrapeDelayMs: number;
  maxLeadsPerRun: number;
  searchRadiusKm: number;
  minGoogleRating: number;

  // Industries
  targetIndustries: string[];
  blacklistedIndustries: string[];

  // Locations
  targetCities: string[];

  // Messages
  autoGenerateMessages: boolean;

  // Branding
  companyName: string;
  companyWebsite: string;
  companyTagline: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  whatsappPhone: string | null;
  socialFacebookUrl: string | null;
  socialInstagramUrl: string | null;
  socialLinkedinUrl: string | null;
  socialTwitterUrl: string | null;
  socialTiktokUrl: string | null;

  // AI Training
  aiTone: string | null;
  aiWritingStyle: string | null;
  aiCustomInstructions: string | null;

  // SMTP (encrypted)
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  emailFrom: string | null;
  emailDebugMode: boolean;
  emailDebugAddress: string | null;

  // IMAP (encrypted)
  imapHost: string | null;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string | null;
  imapPass: string | null;

  updatedAt: Date;
}

export interface TeamApiKeyDoc {
  provider: string;
  encryptedKey: string;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Leads ─────────────────────────────────────────────────

export interface LeadDoc {
  businessName: string;
  /** Lowercase copy for search */
  businessNameLower: string;
  industry: string | null;
  location: string;
  /** Lowercase copy for search */
  locationLower: string;
  country: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  googleMapsUrl: string | null;
  website: string | null;
  websiteQuality: number | null;
  googleRating: number | null;
  reviewCount: number | null;
  description: string | null;
  status: LeadStatus;
  source: string | null;
  score: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  contactedAt: Date | null;
}

// ─── Messages ──────────────────────────────────────────────

export interface MessageDoc {
  leadId: string;
  type: MessageType;
  subject: string | null;
  content: string;
  status: MessageStatus;
  sentAt: Date | null;
  error: string | null;
  generatedBy: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Status History ────────────────────────────────────────

export interface StatusHistoryDoc {
  leadId: string;
  fromStatus: LeadStatus;
  toStatus: LeadStatus;
  changedById: string | null;
  changedAt: Date;
  notes: string | null;
}

// ─── AI Config ─────────────────────────────────────────────

export interface AIConfigDoc {
  name: string;
  provider: AIProvider;
  model: string;
  isActive: boolean;
  temperature: number;
  maxTokens: number;
  systemPrompt: string | null;
  requestsPerDay: number;
  requestsUsed: number;
  lastResetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Scraping Jobs ─────────────────────────────────────────

export interface ScrapingJobDoc {
  status: JobStatus;
  leadsRequested: number;
  leadsFound: number;
  searchQuery: string | null;
  categories: string[];
  locations: string[];
  country: string;
  minRating: number | null;
  maxRadius: number | null;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  processPids: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Contacts ──────────────────────────────────────────────

export interface ContactDoc {
  name: string;
  email: string | null;
  phone: string | null;
  telegramId: string | null;
  notes: string | null;
  isFavorite: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Analyzed Businesses ───────────────────────────────────

export interface AnalyzedBusinessDoc {
  businessName: string;
  location: string;
  country: string;
  googleMapsUrl: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  category: string | null;
  websiteQuality: number | null;
  isGoodProspect: boolean;
  skipReason: string | null;
  wasConverted: boolean;
  leadId: string | null;
  analyzedAt: Date;
  updatedAt: Date;
}

// ─── Email Templates ───────────────────────────────────────

export interface EmailTemplateDoc {
  name: string;
  description: string | null;
  purpose: string;
  systemPrompt: string;
  bodyTemplate: string | null;
  subjectLine: string | null;
  isActive: boolean;
  isDefault: boolean;
  tone: string | null;
  maxLength: number | null;
  mustInclude: string[];
  avoidTopics: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI Knowledge Items ────────────────────────────────────

export interface AIKnowledgeItemDoc {
  title: string;
  content: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI Sample Responses ───────────────────────────────────

export interface AISampleResponseDoc {
  customerQuestion: string;
  preferredResponse: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Inbound Emails ────────────────────────────────────────

export interface InboundEmailDoc {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date;
  isRead: boolean;
  isProcessed: boolean;
  leadId: string | null;
  aiReplyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
