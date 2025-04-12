import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGithubUrlToProjects1742232331376 implements MigrationInterface {
  name = "AddGithubUrlToProjects1742232331376";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "githubUrl" character varying`,
    );

    await queryRunner.query(
      `UPDATE "projects" SET "githubUrl" = 'https://github.com/default' WHERE "githubUrl" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "projects" ALTER COLUMN "githubUrl" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "githubUrl"`);
  }
}
