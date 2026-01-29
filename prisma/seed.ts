import { AIProvider, LeadStatus, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// South African business leads data - Real business types in major cities
const businessCategories = [
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
  'Handyman',
  'Florist',
  'Pet Groomer',
  'Interior Designer',
  'Event Planner',
  'Tutoring Service',
];

const cities = [
  { name: 'Johannesburg', areas: ['Sandton', 'Rosebank', 'Braamfontein', 'Fourways', 'Midrand', 'Randburg'] },
  { name: 'Cape Town', areas: ['Sea Point', 'Gardens', 'Claremont', 'Stellenbosch', 'Somerset West', 'Bellville'] },
  { name: 'Durban', areas: ['Umhlanga', 'Berea', 'Morningside', 'Westville', 'Pinetown', 'Ballito'] },
  { name: 'Pretoria', areas: ['Centurion', 'Hatfield', 'Menlyn', 'Brooklyn', 'Waterkloof', 'Silverton'] },
  { name: 'Port Elizabeth', areas: ['Summerstrand', 'Walmer', 'Newton Park', 'Mill Park', 'Humewood', 'Lorraine'] },
  { name: 'Bloemfontein', areas: ['Westdene', 'Universitas', 'Langenhovenpark', 'Willows', 'Bayswater', 'Fichardtpark'] },
];

// Business name generators
const businessPrefixes = [
  'Pro', 'Expert', 'Quality', 'Premier', 'Elite', 'Master', 'Best', 'Top', 
  'Reliable', 'Trusted', 'Swift', 'Rapid', 'Quick', 'Affordable', 'Budget',
  'Ace', 'Prime', 'Alpha', 'Mega', 'Super', 'Ultra', 'Max', 'Golden', 'Silver'
];

const businessSuffixes = [
  'Services', 'Solutions', 'Experts', 'Pros', 'Team', 'Co', 'Group',
  'Works', 'Care', 'Fix', 'Hub', 'Zone', 'Plus', 'SA', 'RSA'
];

function generateBusinessName(category: string): string {
  const usePrefix = Math.random() > 0.3;
  const useSuffix = Math.random() > 0.2;
  
  let name = category;
  
  if (usePrefix) {
    const prefix = businessPrefixes[Math.floor(Math.random() * businessPrefixes.length)];
    name = `${prefix} ${name}`;
  }
  
  if (useSuffix) {
    const suffix = businessSuffixes[Math.floor(Math.random() * businessSuffixes.length)];
    name = `${name} ${suffix}`;
  }
  
  return name;
}

function generatePhoneNumber(): string {
  const prefixes = ['082', '083', '084', '072', '073', '074', '076', '078', '079', '081', '060', '061', '062', '063', '064', '065', '066', '067', '068', '069'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  return `${prefix}${number}`;
}

function generateRating(): number {
  // Weight towards higher ratings (4.0-5.0)
  const ratings = [3.5, 3.8, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0];
  const weights = [1, 2, 5, 8, 10, 12, 15, 18, 15, 8, 4, 2, 1];
  
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < ratings.length; i++) {
    random -= weights[i];
    if (random <= 0) return ratings[i];
  }
  
  return 4.5;
}

function generateReviewCount(): number {
  // Varied review counts, some businesses have few, some have many
  const ranges = [
    { min: 5, max: 20, weight: 30 },
    { min: 20, max: 50, weight: 25 },
    { min: 50, max: 100, weight: 20 },
    { min: 100, max: 200, weight: 15 },
    { min: 200, max: 500, weight: 8 },
    { min: 500, max: 1000, weight: 2 },
  ];
  
  const totalWeight = ranges.reduce((a, b) => a + b.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const range of ranges) {
    random -= range.weight;
    if (random <= 0) {
      return Math.floor(Math.random() * (range.max - range.min)) + range.min;
    }
  }
  
  return 50;
}

function calculateScore(hasWebsite: boolean, websiteQuality: number | null, rating: number, reviews: number, hasPhone: boolean): number {
  let score = 0;
  
  if (!hasWebsite) score += 50;
  else if (websiteQuality && websiteQuality < 50) score += 30;
  
  score += rating * 10;
  score += Math.min(Math.log10(reviews) * 10, 30);
  
  if (hasPhone) score += 20;
  
  return Math.round(score);
}

async function main() {
  console.log('Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@thetinywebfactory.com' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@thetinywebfactory.com',
      name: 'Admin User',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Created admin user: ${admin.email}`);

  // Create system settings
  await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      dailyLeadTarget: 10,
      leadGenerationEnabled: true,
      scrapeDelayMs: 2000,
      maxLeadsPerRun: 20,
      searchRadiusKm: 50,
      minGoogleRating: 4.0,
      targetIndustries: businessCategories,
      blacklistedIndustries: [],
      targetCities: cities.map(c => c.name),
      autoGenerateMessages: true,
    },
  });

  console.log('Created system settings');

  // Generate 100+ leads
  const leads: any[] = [];
  let leadCount = 0;
  const targetLeads = 120; // Generate slightly more than 100

  for (const city of cities) {
    for (const area of city.areas) {
      for (const category of businessCategories) {
        if (leadCount >= targetLeads) break;
        
        // Not all combinations will generate leads
        if (Math.random() > 0.25) continue;

        const businessName = generateBusinessName(category);
        const phone = generatePhoneNumber();
        const rating = generateRating();
        const reviews = generateReviewCount();
        
        // Most leads should NOT have websites (that's our target market)
        const hasWebsite = Math.random() < 0.15;
        const websiteQuality = hasWebsite ? Math.floor(Math.random() * 40) + 10 : null;
        
        const hasFacebook = Math.random() < 0.4;
        
        const score = calculateScore(!hasWebsite, websiteQuality, rating, reviews, true);

        leads.push({
          businessName,
          industry: category,
          location: `${area}, ${city.name}`,
          address: `${Math.floor(Math.random() * 200) + 1} ${area} Road, ${city.name}`,
          phone,
          email: null, // Most won't have email
          facebookUrl: hasFacebook ? `https://facebook.com/${businessName.toLowerCase().replace(/\s+/g, '')}` : null,
          googleMapsUrl: `https://maps.google.com/?q=${encodeURIComponent(businessName + ' ' + city.name)}`,
          website: hasWebsite ? `http://${businessName.toLowerCase().replace(/\s+/g, '')}.co.za` : null,
          websiteQuality,
          googleRating: rating,
          reviewCount: reviews,
          status: LeadStatus.NEW,
          source: 'seed',
          score,
          createdById: admin.id,
          metadata: {
            seeded: true,
            seedDate: new Date().toISOString(),
          },
        });

        leadCount++;
      }
    }
  }

  // Shuffle leads to mix up the order
  leads.sort(() => Math.random() - 0.5);

  // Insert leads in batches
  const batchSize = 50;
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    await prisma.lead.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Created leads ${i + 1} to ${Math.min(i + batchSize, leads.length)}`);
  }

  console.log(`\nTotal leads created: ${leads.length}`);

  // Create a default AI config if API keys are available
  if (process.env.OPENAI_API_KEY) {
    await prisma.aIConfig.upsert({
      where: { id: 'default-openai' },
      update: {},
      create: {
        id: 'default-openai',
        name: 'OpenAI GPT-4o Mini',
        provider: AIProvider.OPENAI,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 1000,
        isActive: true,
      },
    });
    console.log('Created default OpenAI configuration');
  }

  console.log('\nSeed completed successfully!');
  console.log(`\nTo get started:`);
  console.log(`1. Run: docker-compose up -d (to start PostgreSQL and Redis)`);
  console.log(`2. Run: npx prisma migrate dev (to apply migrations)`);
  console.log(`3. Run: npm run dev (to start the development server)`);
  console.log(`4. Login with: ${admin.email} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
