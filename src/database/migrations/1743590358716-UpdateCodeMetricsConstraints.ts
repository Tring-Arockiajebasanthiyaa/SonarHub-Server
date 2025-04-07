import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateCodeMetricsConstraints1743590358716 implements MigrationInterface {
    name = 'UpdateCodeMetricsConstraints1743590358716'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Set default values for required fields
        await queryRunner.query(`
            ALTER TABLE "code_metrics" 
            ALTER COLUMN "linesOfCode" SET NOT NULL,
            ALTER COLUMN "linesOfCode" SET DEFAULT 0,
            ALTER COLUMN "filesCount" SET NOT NULL,
            ALTER COLUMN "filesCount" SET DEFAULT 0,
            ALTER COLUMN "coverage" SET NOT NULL,
            ALTER COLUMN "coverage" SET DEFAULT 0,
            ALTER COLUMN "duplicatedLines" SET NOT NULL,
            ALTER COLUMN "duplicatedLines" SET DEFAULT 0,
            ALTER COLUMN "violations" SET NOT NULL,
            ALTER COLUMN "violations" SET DEFAULT 0,
            ALTER COLUMN "reliabilityRating" SET NOT NULL,
            ALTER COLUMN "reliabilityRating" SET DEFAULT 1,
            ALTER COLUMN "securityRating" SET NOT NULL,
            ALTER COLUMN "securityRating" SET DEFAULT 1,
            ALTER COLUMN "bugs" SET NOT NULL,
            ALTER COLUMN "bugs" SET DEFAULT 0,
            ALTER COLUMN "vulnerabilities" SET NOT NULL,
            ALTER COLUMN "vulnerabilities" SET DEFAULT 0,
            ALTER COLUMN "codeSmells" SET NOT NULL,
            ALTER COLUMN "codeSmells" SET DEFAULT 0,
            ALTER COLUMN "qualityGateStatus" SET NOT NULL,
            ALTER COLUMN "qualityGateStatus" SET DEFAULT 'UNKNOWN'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert to nullable columns
        await queryRunner.query(`
            ALTER TABLE "code_metrics" 
            ALTER COLUMN "linesOfCode" DROP NOT NULL,
            ALTER COLUMN "linesOfCode" DROP DEFAULT,
            ALTER COLUMN "filesCount" DROP NOT NULL,
            ALTER COLUMN "filesCount" DROP DEFAULT,
            ALTER COLUMN "coverage" DROP NOT NULL,
            ALTER COLUMN "coverage" DROP DEFAULT,
            ALTER COLUMN "duplicatedLines" DROP NOT NULL,
            ALTER COLUMN "duplicatedLines" DROP DEFAULT,
            ALTER COLUMN "violations" DROP NOT NULL,
            ALTER COLUMN "violations" DROP DEFAULT,
            ALTER COLUMN "reliabilityRating" DROP NOT NULL,
            ALTER COLUMN "reliabilityRating" DROP DEFAULT,
            ALTER COLUMN "securityRating" DROP NOT NULL,
            ALTER COLUMN "securityRating" DROP DEFAULT,
            ALTER COLUMN "bugs" DROP NOT NULL,
            ALTER COLUMN "bugs" DROP DEFAULT,
            ALTER COLUMN "vulnerabilities" DROP NOT NULL,
            ALTER COLUMN "vulnerabilities" DROP DEFAULT,
            ALTER COLUMN "codeSmells" DROP NOT NULL,
            ALTER COLUMN "codeSmells" DROP DEFAULT,
            ALTER COLUMN "qualityGateStatus" DROP NOT NULL,
            ALTER COLUMN "qualityGateStatus" DROP DEFAULT
        `);
    }
}
