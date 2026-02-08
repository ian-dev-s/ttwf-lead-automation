import { prisma } from '@/lib/db';
import { BrandingConfig, DEFAULT_BRANDING } from './templates/lead-outreach';

/**
 * Fetches branding configuration from TeamSettings.
 * Falls back to DEFAULT_BRANDING for any missing fields.
 */
export async function getBrandingConfig(teamId: string): Promise<BrandingConfig> {
  const settings = await prisma.teamSettings.findUnique({
    where: { teamId },
    select: {
      companyName: true,
      companyWebsite: true,
      companyTagline: true,
      logoUrl: true,
      bannerUrl: true,
      whatsappPhone: true,
      socialFacebookUrl: true,
      socialInstagramUrl: true,
      socialLinkedinUrl: true,
      socialTwitterUrl: true,
      socialTiktokUrl: true,
    },
  });

  if (!settings) {
    return DEFAULT_BRANDING;
  }

  return {
    companyName: settings.companyName || DEFAULT_BRANDING.companyName,
    companyWebsite: settings.companyWebsite || DEFAULT_BRANDING.companyWebsite,
    companyTagline: settings.companyTagline || DEFAULT_BRANDING.companyTagline,
    logoUrl: settings.logoUrl,
    bannerUrl: settings.bannerUrl,
    whatsappPhone: settings.whatsappPhone || DEFAULT_BRANDING.whatsappPhone,
    socialFacebookUrl: settings.socialFacebookUrl,
    socialInstagramUrl: settings.socialInstagramUrl,
    socialLinkedinUrl: settings.socialLinkedinUrl,
    socialTwitterUrl: settings.socialTwitterUrl,
    socialTiktokUrl: settings.socialTiktokUrl,
  };
}
