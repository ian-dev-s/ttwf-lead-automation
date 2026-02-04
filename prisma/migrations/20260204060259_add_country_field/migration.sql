-- AlterTable
ALTER TABLE "analyzed_businesses" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'ZA';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'ZA';

-- AlterTable
ALTER TABLE "scraping_jobs" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'ZA';

-- CreateIndex
CREATE INDEX "analyzed_businesses_country_idx" ON "analyzed_businesses"("country");

-- CreateIndex
CREATE INDEX "leads_country_idx" ON "leads"("country");
