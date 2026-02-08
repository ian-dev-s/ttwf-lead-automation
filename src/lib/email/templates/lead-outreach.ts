import { formatPhoneForWhatsApp } from '@/lib/utils';

export interface BrandingConfig {
  companyName: string;
  companyWebsite: string;
  companyTagline: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  whatsappPhone?: string | null;
  socialFacebookUrl?: string | null;
  socialInstagramUrl?: string | null;
  socialLinkedinUrl?: string | null;
  socialTwitterUrl?: string | null;
  socialTiktokUrl?: string | null;
}

export interface LeadEmailData {
  businessName: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  branding: BrandingConfig;
  whatsappMessage?: string;
}

// Default branding config
export const DEFAULT_BRANDING: BrandingConfig = {
  companyName: 'The Tiny Web Factory',
  companyWebsite: 'https://thetinywebfactory.com',
  companyTagline: 'Professional Web Design for Your Business',
  whatsappPhone: '27662565938',
};

/**
 * Renders a full responsive HTML email with:
 * - Configurable logo/banner header
 * - AI-generated body content
 * - WhatsApp CTA button with real WhatsApp logo
 * - Social media links footer (only shows configured links)
 */
export function renderLeadOutreachEmail(data: LeadEmailData): string {
  const { businessName, bodyHtml, branding, whatsappMessage } = data;

  // Build logo/banner header
  let logoSection = '';
  if (branding.bannerUrl) {
    logoSection = `
      <tr>
        <td style="padding: 0;">
          <img src="${branding.bannerUrl}" alt="${branding.companyName}" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border: 0;" />
        </td>
      </tr>`;
  } else if (branding.logoUrl) {
    logoSection = `
      <tr>
        <td style="padding: 24px 40px 16px 40px; text-align: center;" class="email-content">
          <img src="${branding.logoUrl}" alt="${branding.companyName}" height="60" style="height: 60px; width: auto; display: inline-block; border: 0;" />
        </td>
      </tr>`;
  }

  // Build WhatsApp CTA with real WhatsApp SVG logo
  let whatsappCta = '';
  if (branding.whatsappPhone) {
    const formattedPhone = formatPhoneForWhatsApp(branding.whatsappPhone);
    const encodedMsg = whatsappMessage ? encodeURIComponent(whatsappMessage) : '';
    const waUrl = `https://wa.me/${formattedPhone}${encodedMsg ? `?text=${encodedMsg}` : ''}`;

    // WhatsApp logo as inline SVG data URI (official WhatsApp icon, white on transparent)
    const whatsappLogoDataUri = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z'/%3E%3C/svg%3E`;

    whatsappCta = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px auto 0 auto;">
        <tr>
          <td align="center" style="border-radius: 8px; background-color: #25D366;">
            <a href="${waUrl}" target="_blank" rel="noopener noreferrer"
              style="display: inline-block; padding: 14px 32px; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 8px;">
              <img src="${whatsappLogoDataUri}" alt="WhatsApp" width="20" height="20" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px; display: inline-block; border: 0;" />
              Chat with us on WhatsApp
            </a>
          </td>
        </tr>
      </table>
      <p style="text-align: center; font-size: 13px; color: #888888; margin-top: 10px; font-family: Arial, sans-serif;">
        Tap the button above to start a conversation instantly
      </p>`;
  }

  // Build social links footer - only show links that are configured
  const socialLinks: { url: string; name: string; icon: string }[] = [];
  
  if (branding.socialFacebookUrl) {
    socialLinks.push({ url: branding.socialFacebookUrl, name: 'Facebook', icon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888888'%3E%3Cpath d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'/%3E%3C/svg%3E` });
  }
  if (branding.socialInstagramUrl) {
    socialLinks.push({ url: branding.socialInstagramUrl, name: 'Instagram', icon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888888'%3E%3Cpath d='M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z'/%3E%3C/svg%3E` });
  }
  if (branding.socialLinkedinUrl) {
    socialLinks.push({ url: branding.socialLinkedinUrl, name: 'LinkedIn', icon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888888'%3E%3Cpath d='M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'/%3E%3C/svg%3E` });
  }
  if (branding.socialTwitterUrl) {
    socialLinks.push({ url: branding.socialTwitterUrl, name: 'X', icon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888888'%3E%3Cpath d='M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'/%3E%3C/svg%3E` });
  }
  if (branding.socialTiktokUrl) {
    socialLinks.push({ url: branding.socialTiktokUrl, name: 'TikTok', icon: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888888'%3E%3Cpath d='M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'/%3E%3C/svg%3E` });
  }

  let socialLinksHtml = '';
  if (socialLinks.length > 0) {
    const linkItems = socialLinks.map(link => `
      <td style="padding: 0 8px;">
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" title="${link.name}">
          <img src="${link.icon}" alt="${link.name}" width="20" height="20" style="width: 20px; height: 20px; display: block; border: 0;" />
        </a>
      </td>`).join('');

    socialLinksHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 16px auto 0 auto;">
        <tr>
          ${linkItems}
        </tr>
      </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${data.subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 16px !important; }
      .email-content { padding: 24px 16px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #1a1a1a !important; }
      .email-card { background-color: #2d2d2d !important; }
      .email-text { color: #e0e0e0 !important; }
      .email-muted { color: #999999 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;" class="email-bg">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f7;" class="email-bg">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600">
        <tr>
        <td>
        <![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);" class="email-container email-card">
          ${logoSection}
          <!-- Header -->
          <tr>
            <td style="padding: ${branding.logoUrl || branding.bannerUrl ? '20px 40px 16px 40px' : '32px 40px 20px 40px'}; border-bottom: 1px solid #eee;" class="email-content">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <h2 style="margin: 0; font-family: Arial, sans-serif; font-size: 20px; font-weight: 700; color: #333333;" class="email-text">
                      ${branding.companyName}
                    </h2>
                    <p style="margin: 4px 0 0 0; font-family: Arial, sans-serif; font-size: 13px; color: #888888;" class="email-muted">
                      ${branding.companyTagline}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;" class="email-content">
              <div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #333333;" class="email-text">
                ${bodyHtml}
              </div>

              ${whatsappCta}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #eee;" class="email-content">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: Arial, sans-serif; font-size: 12px; color: #999999; line-height: 1.5; text-align: center;" class="email-muted">
                    ${socialLinksHtml}
                    <p style="margin: ${socialLinks.length > 0 ? '12px' : '0'} 0 0 0;">
                      <a href="${branding.companyWebsite}" style="color: #4F46E5; text-decoration: none;">${branding.companyWebsite.replace(/^https?:\/\//, '')}</a>
                    </p>
                    <p style="margin: 8px 0 0 0;">
                      This email was sent to ${businessName}. If you believe this was sent in error, please disregard this message.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
