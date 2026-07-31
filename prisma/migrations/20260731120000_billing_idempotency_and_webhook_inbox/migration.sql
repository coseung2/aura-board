ALTER TABLE "PaymentEvent"
  ADD COLUMN "billingPeriodKey" TEXT,
  ADD COLUMN "billingPeriodStart" TIMESTAMP(3),
  ADD COLUMN "billingPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "renewalLeaseToken" TEXT,
  ADD COLUMN "renewalLeaseUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX "PaymentEvent_billingPeriodKey_key"
  ON "PaymentEvent"("billingPeriodKey");

CREATE TABLE "TossWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "transmissionId" TEXT,
  "eventType" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentKey" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL,
  "rawPayload" JSONB NOT NULL,
  "verifiedPayload" JSONB NOT NULL,
  "matchedPaymentEventId" TEXT,
  "processedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT,
  CONSTRAINT "TossWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TossWebhookEvent_eventKey_key"
  ON "TossWebhookEvent"("eventKey");
CREATE INDEX "TossWebhookEvent_orderId_receivedAt_idx"
  ON "TossWebhookEvent"("orderId", "receivedAt");
CREATE INDEX "TossWebhookEvent_processedAt_receivedAt_idx"
  ON "TossWebhookEvent"("processedAt", "receivedAt");

ALTER TABLE "TossWebhookEvent"
  ADD CONSTRAINT "TossWebhookEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Server-only inbox. Keep it inaccessible through Supabase's public Data API.
ALTER TABLE public."TossWebhookEvent" ENABLE ROW LEVEL SECURITY;
