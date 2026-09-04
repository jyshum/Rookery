-- CreateEnum
CREATE TYPE "ImageSource" AS ENUM ('BUNDLED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('BOX', 'POLYGON', 'MASK');

-- CreateEnum
CREATE TYPE "AttrType" AS ENUM ('NUMBER', 'PERCENT', 'ENUM', 'BOOLEAN', 'TEXT');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "source" "ImageSource" NOT NULL DEFAULT 'UPLOADED',
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelClass" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabelClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeDef" (
    "id" TEXT NOT NULL,
    "labelClassId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AttrType" NOT NULL,
    "options" JSONB,
    "defaultValue" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "labelClassId" TEXT NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "geometry" JSONB NOT NULL,
    "bbox" JSONB NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageAsset_projectId_idx" ON "ImageAsset"("projectId");

-- CreateIndex
CREATE INDEX "LabelClass_projectId_idx" ON "LabelClass"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "LabelClass_projectId_key_key" ON "LabelClass"("projectId", "key");

-- CreateIndex
CREATE INDEX "AttributeDef_labelClassId_idx" ON "AttributeDef"("labelClassId");

-- CreateIndex
CREATE INDEX "Annotation_imageId_idx" ON "Annotation"("imageId");

-- CreateIndex
CREATE INDEX "Annotation_labelClassId_idx" ON "Annotation"("labelClassId");

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelClass" ADD CONSTRAINT "LabelClass_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeDef" ADD CONSTRAINT "AttributeDef_labelClassId_fkey" FOREIGN KEY ("labelClassId") REFERENCES "LabelClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ImageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_labelClassId_fkey" FOREIGN KEY ("labelClassId") REFERENCES "LabelClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
