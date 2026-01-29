import {
    AIProvider,
    JobStatus,
    Lead,
    LeadStatus,
    Message,
    MessageStatus,
    MessageType,
    User,
    UserRole
} from '@prisma/client';

// Re-export Prisma enums
export { AIProvider, JobStatus, LeadStatus, MessageStatus, MessageType, UserRole };

// Extended Lead type with relations
export interface LeadWithRelations extends Lead {
  messages?: Message[];
  createdBy?: User | null;
}

// Lead creation input
export interface CreateLeadInput {
  businessName: string;
  industry?: string;
  location: string;
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
  category?: string;
  minRating?: number;
  maxResults?: number;
  searchRadius?: number;
}

// Scraped business data
export interface ScrapedBusiness {
  name: string;
  address: string;
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

// System settings type
export interface SystemSettingsInput {
  dailyLeadTarget?: number;
  leadGenerationEnabled?: boolean;
  scrapeDelayMs?: number;
  maxLeadsPerRun?: number;
  searchRadiusKm?: number;
  minGoogleRating?: number;
  targetIndustries?: string[];
  blacklistedIndustries?: string[];
  targetCities?: string[];
  autoGenerateMessages?: boolean;
}

// Session user type for NextAuth
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginCredentials {
  name: string;
}
