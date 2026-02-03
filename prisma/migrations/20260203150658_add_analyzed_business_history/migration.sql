-- CreateTable
CREATE TABLE "analyzed_businesses" (
    "id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "google_maps_url" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "google_rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "category" TEXT,
    "website_quality" INTEGER,
    "is_good_prospect" BOOLEAN NOT NULL,
    "skip_reason" TEXT,
    "was_converted" BOOLEAN NOT NULL DEFAULT false,
    "lead_id" TEXT,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyzed_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analyzed_businesses_google_maps_url_key" ON "analyzed_businesses"("google_maps_url");

-- CreateIndex
CREATE INDEX "analyzed_businesses_business_name_location_idx" ON "analyzed_businesses"("business_name", "location");

-- CreateIndex
CREATE INDEX "analyzed_businesses_is_good_prospect_idx" ON "analyzed_businesses"("is_good_prospect");

-- CreateIndex
CREATE INDEX "analyzed_businesses_analyzed_at_idx" ON "analyzed_businesses"("analyzed_at");
