import { teamSettingsDoc } from '@/lib/firebase/collections';
import { BrandingConfig, DEFAULT_BRANDING } from './templates/lead-outreach';

/**
 * Fetches branding configuration from TeamSettings in Firestore.
 * Falls back to DEFAULT_BRANDING for any missing fields.
 */
export async function getBrandingConfig(teamId: string): Promise<BrandingConfig> {
  const settingsSnap = await teamSettingsDoc(teamId).get();

  if (!settingsSnap.exists) {
    return DEFAULT_BRANDING;
  }

  const settings = settingsSnap.data()!;

  return {
    companyName: settings.companyName || DEFAULT_BRANDING.companyName,
    companyWebsite: settings.companyWebsite || DEFAULT_BRANDING.companyWebsite,
    companyTagline: settings.companyTagline || DEFAULT_BRANDING.companyTagline,
    logoUrl: settings.logoUrl ?? null,
    bannerUrl: settings.bannerUrl ?? null,
    whatsappPhone: settings.whatsappPhone || DEFAULT_BRANDING.whatsappPhone,
    socialFacebookUrl: settings.socialFacebookUrl ?? null,
    socialInstagramUrl: settings.socialInstagramUrl ?? null,
    socialLinkedinUrl: settings.socialLinkedinUrl ?? null,
    socialTwitterUrl: settings.socialTwitterUrl ?? null,
    socialTiktokUrl: settings.socialTiktokUrl ?? null,
  };
}
