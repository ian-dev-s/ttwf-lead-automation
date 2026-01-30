import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

// Load .env file
config()

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  migrate: {
    async url() {
      return process.env.DATABASE_URL!
    },
  },

  studio: {
    async url() {
      return process.env.DATABASE_URL!
    },
  },

  db: {
    async url() {
      return process.env.DATABASE_URL!
    },
  },
})
