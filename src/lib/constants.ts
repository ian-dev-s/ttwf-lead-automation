// Supported countries for lead generation
export interface CountryConfig {
  code: string;
  name: string;
  cities: string[];
  phonePrefix: string;
  locale: string;
  // Google Maps geolocation center (for browser context)
  geoLocation: { latitude: number; longitude: number };
  // Address patterns that indicate a valid address in this country
  addressPatterns: RegExp[];
}

export const SUPPORTED_COUNTRIES: Record<string, CountryConfig> = {
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    cities: [
      'Johannesburg',
      'Cape Town',
      'Durban',
      'Pretoria',
      'Port Elizabeth',
      'Bloemfontein',
      'East London',
      'Nelspruit',
      'Polokwane',
      'Kimberley',
      'Pietermaritzburg',
      'Centurion',
      'Sandton',
      'Soweto',
      'Benoni',
      'Rustenburg',
      'George',
      'Stellenbosch',
    ],
    phonePrefix: '+27',
    locale: 'en-ZA',
    geoLocation: { latitude: -26.2041, longitude: 28.0473 }, // Johannesburg
    addressPatterns: [
      /south africa/i,
      /\b(gauteng|western cape|kwazulu[- ]?natal|eastern cape|free state|mpumalanga|limpopo|north west|northern cape)\b/i,
      /\b\d{4}\b/, // South African postal codes are 4 digits
    ],
  },
  // Add more countries here as needed
  // UK: {
  //   code: 'UK',
  //   name: 'United Kingdom',
  //   cities: ['London', 'Manchester', 'Birmingham', ...],
  //   phonePrefix: '+44',
  //   locale: 'en-GB',
  //   geoLocation: { latitude: 51.5074, longitude: -0.1278 },
  //   addressPatterns: [/united kingdom/i, /\buk\b/i, /england/i, /scotland/i, /wales/i],
  // },
};

// Default country for scraping
export const DEFAULT_COUNTRY_CODE = 'ZA';

// Helper to get country config
export function getCountryConfig(countryCode: string): CountryConfig | undefined {
  return SUPPORTED_COUNTRIES[countryCode.toUpperCase()];
}

// Helper to get cities for a country
export function getCitiesForCountry(countryCode: string): string[] {
  const config = getCountryConfig(countryCode);
  return config?.cities || [];
}

// Helper to validate an address belongs to a country
export function isAddressInCountry(address: string, countryCode: string): boolean {
  const config = getCountryConfig(countryCode);
  if (!config) return false;
  
  // Check if address matches any of the country's patterns
  return config.addressPatterns.some(pattern => pattern.test(address));
}

// South African cities for targeting (backwards compatibility)
export const SA_CITIES = SUPPORTED_COUNTRIES.ZA.cities;

// Target business categories
export const TARGET_CATEGORIES = [
  'Plumber',
  'Electrician',
  'Painter',
  'Landscaper',
  'Cleaner',
  'Caterer',
  'Photographer',
  'Personal Trainer',
  'Beauty Salon',
  'Auto Mechanic',
  'Carpenter',
  'Locksmith',
  'Pest Control',
  'Moving Company',
  'Tutoring Service',
  'Event Planner',
  'Interior Designer',
  'Florist',
  'Pet Groomer',
  'Handyman',
];
