import { LeadScoreFactors, LeadStatus } from '@/types';
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
  'INVALID',
];

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

// Format date for display
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format date with time
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
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
