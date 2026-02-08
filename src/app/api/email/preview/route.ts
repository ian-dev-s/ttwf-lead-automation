import { auth } from '@/lib/auth';
import { getBrandingConfig } from '@/lib/email/branding';
import { renderLeadOutreachEmail } from '@/lib/email/templates/lead-outreach';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/email/preview - Render a preview of the branded email template
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const teamId = session.user.teamId;

    // Get branding configuration from database
    const branding = await getBrandingConfig(teamId);

    // Render the email with sample data
    const html = renderLeadOutreachEmail({
      businessName: 'Sample Business (Pty) Ltd',
      recipientEmail: 'sample@business.co.za',
      subject: 'Professional Website for Sample Business',
      bodyHtml: `
        <p>Good day,</p>
        <p>We came across <strong>Sample Business (Pty) Ltd</strong> and were impressed by your excellent 4.8-star rating with 156 reviews on Google – that's fantastic!</p>
        <p>We noticed you don't currently have a website, and we'd love to help you grow your online presence.</p>
        <p>We wanted to reach out to see whether you might be interested in having a professional website to further showcase your business and attract more customers online.</p>
        <p>To make this easy, we'll create a draft landing page at <strong>no cost</strong>. You'll be able to review it, suggest changes, and ensure it suits your business needs perfectly. Once you're happy, we'll send you an invoice to take the website live.</p>
        <p>We also offer professional business email addresses to help strengthen your brand's credibility.</p>
        <p>If you would like us to contact you, please reply and let us know a convenient time.</p>
        <p>Kind regards,<br><em>The ${branding.companyName} Team</em></p>
      `,
      branding,
      whatsappMessage: "Hi, I received your email about a website for my business and I'm interested!",
    });

    // Return as HTML for browser preview
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error rendering email preview:', error);
    return new NextResponse('Failed to render preview', { status: 500 });
  }
}
