-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "processingMin" INTEGER NOT NULL DEFAULT 1,
    "processingMax" INTEGER NOT NULL DEFAULT 2,
    "shippingMin" INTEGER NOT NULL DEFAULT 3,
    "shippingMax" INTEGER NOT NULL DEFAULT 5,
    "weekendDays" TEXT NOT NULL DEFAULT '[0,6]',
    "unmatchedCountry" TEXT NOT NULL DEFAULT 'useDefault',
    "displayMode" TEXT NOT NULL DEFAULT 'range',
    "messageRange" TEXT NOT NULL DEFAULT 'Arrives {start} – {end}',
    "messageSingle" TEXT NOT NULL DEFAULT 'Arrives by {end}',
    "dateFormat" TEXT NOT NULL DEFAULT 'short',
    "lastSyncedAt" DATETIME,
    "syncError" TEXT,
    "settingsSavedAt" DATETIME,
    "designSavedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WidgetDesign" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "preset" TEXT NOT NULL DEFAULT 'boxed',
    "style" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repeatsYearly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Region" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT NOT NULL,
    "shippingMin" INTEGER NOT NULL,
    "shippingMax" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetDesign_shop_key" ON "WidgetDesign"("shop");

-- CreateIndex
CREATE INDEX "Holiday_shop_date_idx" ON "Holiday"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_shop_date_name_key" ON "Holiday"("shop", "date", "name");

-- CreateIndex
CREATE INDEX "Region_shop_idx" ON "Region"("shop");
