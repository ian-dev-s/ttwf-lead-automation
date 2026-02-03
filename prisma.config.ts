import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

// Load .env file
config()

const databaseUrl = process.env.DATABASE_URL!

// @ts-ignore - Prisma config types may not be up to date
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  datasource: {
    url: databaseUrl,
  },

  migrate: {
    url: databaseUrl,
  },

  studio: {
    url: databaseUrl,
  },
})
