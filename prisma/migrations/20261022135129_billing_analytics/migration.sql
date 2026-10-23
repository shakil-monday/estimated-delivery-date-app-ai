-- CreateTable
CREATE TABLE "ShopInstall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "firstInstalledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInstalledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME,
    "installCount" INTEGER NOT NULL DEFAULT 1,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "appHandle" TEXT,
    "billingCheckedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AppSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    "frozenAt" DATETIME,
    "frozenDays" INTEGER NOT NULL DEFAULT 0,
    "endedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopInstall_shop_key" ON "ShopInstall"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_subscriptionId_key" ON "AppSubscription"("subscriptionId");

-- CreateIndex
CREATE INDEX "AppSubscription_shop_idx" ON "AppSubscription"("shop");

-- CreateIndex
CREATE INDEX "AppEvent_type_createdAt_idx" ON "AppEvent"("type", "createdAt");
