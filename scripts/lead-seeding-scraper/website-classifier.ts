/**
 * Website classification utilities
 * Identifies social media, directories, and DIY website platforms
 */

// Social media and directory patterns
const SOCIAL_PATTERNS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'linkedin.com',
  'yellowpages',
  'gumtree',
  'locanto',
  'hotfrog',
  'cylex',
  'brabys',
  'findit',
  'snupit',
  'yell.com',
  'yelp.com',
];

// DIY website builder patterns
const DIY_PATTERNS = [
  'wix.com',
  'wixsite.com',
  'weebly.com',
  'wordpress.com',
  'squarespace.com',
  'webnode.com',
  'jimdo.com',
  'site123.com',
  'webs.com',
  'yola.com',
  'strikingly.com',
  'carrd.co',
  'webflow.io',
  'netlify.app',
  'vercel.app',
  'herokuapp.com',
  'blogspot.com',
  'blogger.com',
  'tumblr.com',
  'sites.google.com',
  'google.com/site',
  'co.za.com',
  'mweb.co.za/sites',
];

/**
 * Check if website is a social media or directory listing
 */
export function isSocialOrDirectory(website: string): boolean {
  return SOCIAL_PATTERNS.some(pattern => 
    website.toLowerCase().includes(pattern)
  );
}

/**
 * Check if website URL indicates a DIY/template site
 */
export function isDIYWebsiteUrl(website: string): boolean {
  return DIY_PATTERNS.some(pattern => 
    website.toLowerCase().includes(pattern)
  );
}

/**
 * Calculate a basic website score based on URL patterns
 */
export function calculateWebsiteScore(
  website: string | null | undefined, 
  qualityScore?: number
): number {
  if (!website) return 0; // No website = best prospect
  if (isSocialOrDirectory(website)) return 15; // Social only = great prospect
  if (isDIYWebsiteUrl(website)) return 25; // DIY platform = great prospect
  if (qualityScore !== undefined) {
    // Invert the quality score - lower quality = better prospect score
    return Math.round(qualityScore * 0.7); // Max 70 for analyzed sites
  }
  return 70; // Default for unanalyzed proper websites
}
