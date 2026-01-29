# TTWF Lead Generator

An AI-powered lead generation and tracking tool for The Tiny Web Factory. Find South African businesses without websites and reach out with personalized messages.

## Features

- **AI-Powered Lead Generation**: Automatically find businesses on Google Maps that don't have websites or have low-quality ones
- **Kanban Board**: Visual drag-and-drop interface to track leads through your sales pipeline
- **Personalized Messages**: AI generates customized WhatsApp and email messages for each lead
- **Approval Gate**: Review and approve messages before sending
- **Multi-AI Support**: Switch between OpenAI, Anthropic, and Google AI providers
- **Role-Based Access**: Admin, User, and Viewer roles with appropriate permissions
- **Configurable Settings**: Adjust AI guardrails, scraping parameters, and target criteria

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js v5
- **AI**: Vercel AI SDK (OpenAI, Anthropic, Google)
- **Browser Automation**: Playwright
- **Job Queue**: BullMQ + Redis

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL and Redis)
- At least one AI API key (OpenAI, Anthropic, or Google)

### Installation

1. **Clone the repository**

   ```bash
   cd ttwf-lead-generator
   npm install
   ```

2. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your API keys:

   ```env
   DATABASE_URL="postgresql://ttwf:ttwf_secure_password@localhost:5432/ttwf_leads?schema=public"
   NEXTAUTH_SECRET="your-secret-key"
   NEXTAUTH_URL="http://localhost:3000"

   # Add at least one AI provider key
   OPENAI_API_KEY="sk-..."
   ANTHROPIC_API_KEY="sk-ant-..."
   GOOGLE_AI_API_KEY="..."
   ```

3. **Start the database**

   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**

   ```bash
   npm run db:migrate
   ```

5. **Seed the database** (creates 100+ sample leads)

   ```bash
   npm run db:seed
   ```

6. **Start the development server**

   ```bash
   npm run dev
   ```

7. **Open your browser**
   - Navigate to http://localhost:3000
   - Login with: `admin@thetinywebfactory.com` / `admin123`

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login/Register pages
│   ├── (dashboard)/     # Main application pages
│   └── api/             # API routes
├── components/
│   ├── ui/              # Base UI components (shadcn)
│   ├── kanban/          # Kanban board components
│   ├── leads/           # Lead management components
│   └── messages/        # Message preview/approval
├── lib/
│   ├── ai/              # AI provider configuration
│   ├── scraper/         # Google Maps scraper
│   ├── auth.ts          # NextAuth configuration
│   ├── db.ts            # Prisma client
│   └── utils.ts         # Utility functions
└── types/               # TypeScript types
```

## Lead Statuses

1. **New** - Freshly added, not yet reviewed
2. **Qualified** - Reviewed and marked as good prospect
3. **Message Ready** - Personalized message generated
4. **Pending Approval** - Awaiting user approval to send
5. **Contacted** - Message sent
6. **Responded** - Lead replied
7. **Converted** - Became a customer
8. **Not Interested** - Declined
9. **Invalid** - Bad data or unreachable

## API Routes

| Endpoint                     | Method             | Description                   |
| ---------------------------- | ------------------ | ----------------------------- |
| `/api/leads`                 | GET, POST          | List/create leads             |
| `/api/leads/[id]`            | GET, PATCH, DELETE | Single lead operations        |
| `/api/leads/[id]/status`     | PATCH              | Update lead status            |
| `/api/messages`              | GET, POST          | List/create messages          |
| `/api/messages/[id]/approve` | POST               | Approve a message             |
| `/api/ai/generate`           | POST               | Generate personalized message |
| `/api/ai/config`             | GET, POST, PATCH   | Manage AI configurations      |
| `/api/scraper`               | GET, POST          | List/create scraping jobs     |
| `/api/settings`              | GET, PATCH         | System settings               |
| `/api/stats`                 | GET                | Dashboard statistics          |

## Configuration

### AI Settings

In the Settings panel, you can:

- Choose between OpenAI, Anthropic, or Google AI
- Select specific models (GPT-4, Claude, Gemini)
- Adjust temperature for message creativity
- Set token limits

### Scraping Settings

- **Daily Lead Target**: Number of new leads to find each day
- **Min Google Rating**: Only include businesses with this rating or higher
- **Search Radius**: How far from city centers to search
- **Delay Between Requests**: Rate limiting to avoid detection

## Security

- All routes are protected by authentication
- Role-based access control (ADMIN, USER, VIEWER)
- Passwords are hashed with bcrypt
- JWT session tokens
- Input validation with Zod

## Development

```bash
# Run development server
npm run dev

# Open Prisma Studio (database GUI)
npm run db:studio

# Generate Prisma client after schema changes
npm run db:generate

# Run linting
npm run lint
```

## Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

## License

Private - The Tiny Web Factory
