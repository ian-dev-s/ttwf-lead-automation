import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Declare global type for PrismaClient to prevent multiple instances in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create a single PrismaClient instance
const prismaClientSingleton = () => {
  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  // Create Prisma adapter
  const adapter = new PrismaPg(pool);
  
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });
};

// Export the prisma client, using global in development to prevent hot-reload issues
// Note: In Prisma 7, we always create a new instance to ensure adapter is properly configured
export const prisma = prismaClientSingleton();

// Store in global for development hot-reload (commented out to avoid adapter issues)
// if (process.env.NODE_ENV !== 'production') {
//   globalThis.prisma = prisma;
// }

export default prisma;
