import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedCodeMetricsAndSonarIssuesEntity1743880204414
  implements MigrationInterface
{
  name = "AddedCodeMetricsAndSonarIssuesEntity1743880204414";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repositories" DROP CONSTRAINT "FK_repositories_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sonar_issues" ADD "repoName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sonar_issues" ADD "username" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ADD "repoName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ADD "username" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "linesOfCode" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "filesCount" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "coverage" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "duplicatedLines" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "violations" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ALTER COLUMN "owner" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD CONSTRAINT "UQ_7587f67963409ce7cda271b3f40" UNIQUE ("name", "owner")`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD CONSTRAINT "FK_0e8c34ad26d8b7676a4c2c82ce4" FOREIGN KEY ("owner") REFERENCES "users"("u_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repositories" DROP CONSTRAINT "FK_0e8c34ad26d8b7676a4c2c82ce4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" DROP CONSTRAINT "UQ_7587f67963409ce7cda271b3f40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ALTER COLUMN "owner" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "violations" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "duplicatedLines" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "coverage" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "filesCount" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" ALTER COLUMN "linesOfCode" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" DROP COLUMN "username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "code_metrics" DROP COLUMN "repoName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sonar_issues" DROP COLUMN "username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sonar_issues" DROP COLUMN "repoName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD CONSTRAINT "FK_repositories_owner" FOREIGN KEY ("owner") REFERENCES "users"("u_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
