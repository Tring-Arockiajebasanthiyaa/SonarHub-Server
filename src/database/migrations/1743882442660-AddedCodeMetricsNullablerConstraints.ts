import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedCodeMetricsNullablerConstraints1743882442660
  implements MigrationInterface
{
  name = "AddedCodeMetricsNullablerConstraints1743882442660";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "branch" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "language" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "linesOfCode" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "linesOfCode" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "filesCount" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "filesCount" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "coverage" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "coverage" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "duplicatedLines" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "duplicatedLines" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "violations" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "violations" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "reliabilityRating" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "reliabilityRating" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "securityRating" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "securityRating" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "bugs" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "bugs" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "vulnerabilities" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "vulnerabilities" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "codeSmells" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "codeSmells" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "qualityGateStatus" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "qualityGateStatus" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "qualityGateStatus" SET DEFAULT 'UNKNOWN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "qualityGateStatus" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "codeSmells" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "codeSmells" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "vulnerabilities" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "vulnerabilities" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "bugs" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "bugs" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "securityRating" SET DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "securityRating" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "reliabilityRating" SET DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "reliabilityRating" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "violations" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "violations" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "duplicatedLines" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "duplicatedLines" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "coverage" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "coverage" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "filesCount" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "filesCount" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "linesOfCode" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "linesOfCode" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "language" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "branch" SET NOT NULL`,
    );
  }
}
