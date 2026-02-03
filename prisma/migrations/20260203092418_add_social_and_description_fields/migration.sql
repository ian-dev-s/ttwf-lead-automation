-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "description" TEXT,
ADD COLUMN     "instagram_url" TEXT,
ADD COLUMN     "linkedin_url" TEXT,
ADD COLUMN     "twitter_url" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "ai_model" TEXT,
ADD COLUMN     "ai_provider" TEXT,
ADD COLUMN     "generated_by" TEXT;
