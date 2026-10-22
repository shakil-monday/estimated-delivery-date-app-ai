-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" SERIAL NOT NULL,
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
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "settingsSavedAt" TIMESTAMP(3),
    "designSavedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetDesign" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "preset" TEXT NOT NULL DEFAULT 'boxed',
    "style" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repeatsYearly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT NOT NULL,
    "shippingMin" INTEGER NOT NULL,
    "shippingMax" INTEGER NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
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

