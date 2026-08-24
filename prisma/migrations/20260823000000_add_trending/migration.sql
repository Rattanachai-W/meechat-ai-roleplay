-- AddTrending: growth-weighted trending score columns (M8)
ALTER TABLE "characters" ADD COLUMN "trend_score" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "trend_updated_at" TIMESTAMP(3);
