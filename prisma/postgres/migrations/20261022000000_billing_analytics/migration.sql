-- CreateTable
CREATE TABLE "ShopInstall" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "firstInstalledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInstalledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "installCount" INTEGER NOT NULL DEFAULT 1,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "appHandle" TEXT,
    "billingCheckedAt" TIMESTAMP(3),

    CONSTRAINT "ShopInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscription" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "frozenDays" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AppSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopInstall_shop_key" ON "ShopInstall"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_subscriptionId_key" ON "AppSubscription"("subscriptionId");

-- CreateIndex
CREATE INDEX "AppSubscription_shop_idx" ON "AppSubscription"("shop");

-- CreateIndex
CREATE INDEX "AppEvent_type_createdAt_idx" ON "AppEvent"("type", "createdAt");

