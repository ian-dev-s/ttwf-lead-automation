/**
 * Configuration for the lead seeding scraper
 * 
 * To change the target country, set SCRAPER_COUNTRY environment variable
 * Example: SCRAPER_COUNTRY="United Kingdom"
 */

// Scraping configuration
export const PARALLEL_WORKERS = 1; // Single worker to avoid rate limits
export const MAX_RESULTS_PER_SEARCH = 1; // Limit per search
export const DELAY_BETWEEN_LISTINGS = 1000; // ms between clicking listings
export const DELAY_BETWEEN_SEARCHES = 2000; // ms between searches
export const TARGET_LEADS = 50; // Stop after this many leads are added

// PageSpeed API configuration
export const PAGESPEED_API_KEY = 'AIzaSyDdQdInPDoaUWtS0BmVIs-JY4zCmiEazOk';
export const PAGESPEED_MAX_RETRIES = 3;
export const PAGESPEED_INITIAL_BACKOFF_MS = 60000; // 1 minute initial backoff
export const DELAY_BETWEEN_API_CALLS = 2000; // 2 seconds between API calls

// Quality threshold - websites scoring below this are good prospects
export const WEBSITE_QUALITY_THRESHOLD = 60;

// South African cities to search
export const SA_CITIES = [
  'Johannesburg',
  'Cape Town',
  'Durban',
  'Pretoria',
  'Port Elizabeth',
  'Bloemfontein',
  'East London',
  'Pietermaritzburg',
  'Kimberley',
  'Polokwane',
  'Nelspruit',
  'Rustenburg',
  'George',
  'Stellenbosch',
  'Sandton',
];

// Industries that commonly need websites
export const INDUSTRIES = [
  'plumber',
  'electrician',
  'mechanic',
  'hair salon',
  'restaurant',
  'dentist',
  'lawyer',
  'accountant',
  'physiotherapist',
  'gym',
  'bakery',
  'butcher',
  'florist',
  'photographer',
  'wedding venue',
  'guest house',
  'bed and breakfast',
  'car wash',
  'dry cleaner',
  'locksmith',
  'pest control',
  'landscaper',
  'painter',
  'tiler',
  'carpenter',
];
