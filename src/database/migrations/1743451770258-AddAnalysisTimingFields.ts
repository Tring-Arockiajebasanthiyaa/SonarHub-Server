import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalysisTimingFields1743451770258 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name = 'code_metrics' 
                               AND column_name = 'technicalDebt') THEN 
                    ALTER TABLE "code_metrics" ADD COLUMN "technicalDebt" integer DEFAULT 0;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "code_metrics" DROP COLUMN IF EXISTS "technicalDebt"`);
    }
}
