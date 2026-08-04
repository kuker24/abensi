-- AlterTable
ALTER TABLE "PicketNote" ADD COLUMN "studentId" TEXT;

-- CreateIndex
CREATE INDEX "PicketNote_studentId_date_idx" ON "PicketNote"("studentId", "date");

-- AddForeignKey
ALTER TABLE "PicketNote" ADD CONSTRAINT "PicketNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
