// ─── Enums ─────────────────────────────────────────────────

export const UserRole = {
  ADMIN: 'ADMIN',
  USER: 'USER',
  VIEWER: 'VIEWER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const LeadStatus = {
  NEW: 'NEW',
  QUALIFIED: 'QUALIFIED',
  MESSAGE_READY: 'MESSAGE_READY',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONTACTED: 'CONTACTED',
  RESPONDED: 'RESPONDED',
  CONVERTED: 'CONVERTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  REJECTED: 'REJECTED',
  INVALID: 'INVALID',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const MessageType = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const MessageStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const AIProvider = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GOOGLE: 'GOOGLE',
  GITHUB: 'GITHUB',
  CURSOR: 'CURSOR',
} as const;
export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider];

export const JobStatus = {
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const OutreachType = {
  EMAIL: 'EMAIL',
  COLD_CALL: 'COLD_CALL',
  WHATSAPP: 'WHATSAPP',
} as const;
export type OutreachType = (typeof OutreachType)[keyof typeof OutreachType];

// ─── Document types (used across the app) ──────────────────

/** A Lead document with its Firestore id */
export interface Lead {
  id: string;
  businessName: string;
  businessNameLower: string;
  industry: string | null;
  location: string;
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
  outreachType: OutreachType;
  source: string | null;
  score: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  contactedAt: Date | null;
}

/** A Message document with its Firestore id */
export interface Message {
  id: string;
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

/** A User document with its Firestore id */
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Extended types with relations ─────────────────────────

export interface LeadWithRelations extends Lead {
  messages?: Message[];
  createdBy?: User | null;
}

// Lead creation input
export interface CreateLeadInput {
  businessName: string;
  industry?: string;
  location: string;
  country?: string;
  address?: string;
  phone?: string;
  email?: string;
  facebookUrl?: string;
  googleMapsUrl?: string;
  website?: string;
  websiteQuality?: number;
  googleRating?: number;
  reviewCount?: number;
  source?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// Lead update input
export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  status?: LeadStatus;
}

// Lead score calculation
export interface LeadScoreFactors {
  hasNoWebsite: boolean;
  hasLowQualityWebsite: boolean;
  googleRating: number | null;
  reviewCount: number | null;
  hasFacebook: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
}

// Message generation request
export interface GenerateMessageInput {
  leadId: string;
  type: MessageType;
  customPrompt?: string;
}

// Message with lead details
export interface MessageWithLead extends Message {
  lead: Lead;
}

/** A Contact document with its Firestore id */
export interface Contact {
  id: string;
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

/** A StatusHistory document with its Firestore id */
export interface StatusHistory {
  id: string;
  leadId: string;
  fromStatus: LeadStatus;
  toStatus: LeadStatus;
  changedById: string | null;
  changedAt: Date;
  notes: string | null;
}

// Kanban board column
export interface KanbanColumn {
  id: LeadStatus;
  title: string;
  leads: Lead[];
}

// AI Provider configuration
export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

// Scraping search parameters
export interface ScrapingParams {
  query: string;
  location: string;
  country?: string;
  category?: string;
  minRating?: number;
  maxResults?: number;
  searchRadius?: number;
}

// Scraped business data
export interface ScrapedBusiness {
  name: string;
  address: string;
  country?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl?: string;
  category?: string;
  placeId?: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Dashboard stats
export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  leadsThisWeek: number;
  conversionRate: number;
  leadsByStatus: Record<LeadStatus, number>;
}

// Team settings input type
export interface TeamSettingsInput {
  dailyLeadTarget?: number;
  leadGenerationEnabled?: boolean;
  scrapeDelayMs?: number;
  maxLeadsPerRun?: number;
  minEmailLeadsPerRun?: number;
  searchRadiusKm?: number;
  minGoogleRating?: number;
  targetIndustries?: string[];
  blacklistedIndustries?: string[];
  targetCities?: string[];
  autoGenerateMessages?: boolean;
}

// Session user type
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  teamId: string;
  image?: string | null;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginCredentials {
  name: string;
}
