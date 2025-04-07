import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalysisTimingFields1743451770258 implements MigrationInterface {
    name = 'AddAnalysisTimingFields1743451770258'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add all columns as nullable first
        await queryRunner.query(`ALTER TABLE "code_metrics" ADD "technicalDebt" integer DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "analysisStartTime" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "analysisEndTime" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "analysisDuration" integer DEFAULT 0`);
        
        // Backfill data for existing projects
        await queryRunner.query(`
            UPDATE "projects" 
            SET 
                "analysisStartTime" = "createdAt",
                "analysisEndTime" = "updatedAt",
                "analysisDuration" = 0
            WHERE "analysisStartTime" IS NULL
        `);
        
        // Make analysisStartTime NOT NULL after backfilling
        await queryRunner.query(`
            ALTER TABLE "projects" 
            ALTER COLUMN "analysisStartTime" SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "analysisDuration"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "analysisEndTime"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "analysisStartTime"`);
        await queryRunner.query(`ALTER TABLE "code_metrics" DROP COLUMN "technicalDebt"`);
    }
}