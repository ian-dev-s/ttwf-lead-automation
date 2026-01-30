import { config } from 'dotenv'
import { execSync } from 'child_process'

// Load .env file
config()

const url = process.env.DATABASE_URL

if (!url) {
  console.error('DATABASE_URL not found in .env file')
  process.exit(1)
}

console.log('Starting Prisma Studio...')
execSync(`npx prisma studio --url "${url}"`, { stdio: 'inherit' })
