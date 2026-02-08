import { LeadScoreFactors, LeadStatus, OutreachType } from '@/types';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Tailwind CSS class merger utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Calculate lead priority score
export function calculateLeadScore(factors: LeadScoreFactors): number {
  let score = 0;

  // No website = highest priority
  if (factors.hasNoWebsite) {
    score += 50;
  }

  // Low quality website = high priority
  if (factors.hasLowQualityWebsite) {
    score += 30;
  }

  // Google rating contribution
  if (factors.googleRating) {
    score += factors.googleRating * 10; // Up to 50 points for 5-star
  }

  // Review count contribution (logarithmic to prevent outliers)
  if (factors.reviewCount && factors.reviewCount > 0) {
    score += Math.min(Math.log10(factors.reviewCount) * 10, 30);
  }

  // Facebook presence
  if (factors.hasFacebook) {
    score += 10;
  }

  // Contact information availability
  if (factors.hasPhone) {
    score += 20; // Phone is essential for WhatsApp
  }

  if (factors.hasEmail) {
    score += 10;
  }

  return Math.round(score);
}

// Lead status display names
export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  MESSAGE_READY: 'Message Ready',
  PENDING_APPROVAL: 'Pending Approval',
  CONTACTED: 'Contacted',
  RESPONDED: 'Responded',
  CONVERTED: 'Converted',
  NOT_INTERESTED: 'Not Interested',
  REJECTED: 'Rejected',
  INVALID: 'Invalid',
};

// Lead status colors for UI
export const leadStatusColors: Record<LeadStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-purple-100 text-purple-800',
  MESSAGE_READY: 'bg-indigo-100 text-indigo-800',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  CONTACTED: 'bg-orange-100 text-orange-800',
  RESPONDED: 'bg-green-100 text-green-800',
  CONVERTED: 'bg-emerald-100 text-emerald-800',
  NOT_INTERESTED: 'bg-gray-100 text-gray-800',
  REJECTED: 'bg-red-100 text-red-800',
  INVALID: 'bg-red-100 text-red-800',
};

// Kanban column order
export const kanbanColumnOrder: LeadStatus[] = [
  'NEW',
  'QUALIFIED',
  'MESSAGE_READY',
  'PENDING_APPROVAL',
  'CONTACTED',
  'RESPONDED',
  'CONVERTED',
  'NOT_INTERESTED',
  'REJECTED',
  'INVALID',
];

// Outreach type display names
export const outreachTypeLabels: Record<OutreachType, string> = {
  EMAIL: 'Email Ready',
  COLD_CALL: 'Cold Call',
  WHATSAPP: 'WhatsApp',
};

// Outreach type colors for UI badges
export const outreachTypeColors: Record<OutreachType, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  COLD_CALL: 'bg-orange-100 text-orange-800',
  WHATSAPP: 'bg-green-100 text-green-800',
};

// Outreach type icon names (lucide-react icon names)
export const outreachTypeIcons: Record<OutreachType, string> = {
  EMAIL: 'Mail',
  COLD_CALL: 'Phone',
  WHATSAPP: 'MessageCircle',
};

/**
 * Determine the outreach type for a lead based on available contact info.
 * Priority: EMAIL > WHATSAPP > COLD_CALL
 */
export function determineOutreachType(lead: {
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
}): OutreachType {
  if (lead.email) return 'EMAIL';
  const whatsapp = lead.metadata?.whatsappNumber as string | undefined;
  if (whatsapp) return 'WHATSAPP';
  return 'COLD_CALL';
}

// Format phone number for display
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // South African format
  if (cleaned.startsWith('27')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  
  // If starts with 0, assume local SA number
  if (cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  
  return phone;
}

// Format phone for WhatsApp link
export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  // Convert local SA number to international
  if (cleaned.startsWith('0')) {
    cleaned = '27' + cleaned.slice(1);
  }
  
  return cleaned;
}

// Generate WhatsApp URL
export function getWhatsAppUrl(phone: string, message?: string): string {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const encodedMessage = message ? encodeURIComponent(message) : '';
  return `https://wa.me/${formattedPhone}${encodedMessage ? `?text=${encodedMessage}` : ''}`;
}

/**
 * Convert any date-like value to a JavaScript Date.
 * Handles: Date objects, ISO strings, timestamps, and Firestore Timestamp objects
 * (both server-side with toDate() method and serialized { seconds, nanoseconds }).
 */
export function toJSDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  
  // Firestore Timestamp with toDate() method (server-side)
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  
  // Serialized Firestore Timestamp { seconds: number, nanoseconds: number }
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number') {
    const ts = value as { seconds: number; nanoseconds?: number };
    return new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000);
  }
  
  // String or number
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
}

// Format date for display
export function formatDate(date: unknown): string {
  const d = toJSDate(date);
  if (!d) return '';
  return d.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format date with time
export function formatDateTime(date: unknown): string {
  const d = toJSDate(date);
  if (!d) return '';
  return d.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Truncate text with ellipsis
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate SA phone number
export function isValidSAPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // SA numbers: 10 digits starting with 0, or 11 digits starting with 27
  return (cleaned.length === 10 && cleaned.startsWith('0')) ||
         (cleaned.length === 11 && cleaned.startsWith('27'));
}

// Sleep utility for rate limiting
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate a random delay for human-like behavior
export function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}
