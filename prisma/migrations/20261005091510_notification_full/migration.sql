/*
  Warnings:

  - Added the required column `type` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "linkId" INTEGER,
ADD COLUMN     "linkType" TEXT,
ADD COLUMN     "type" TEXT NOT NULL;
