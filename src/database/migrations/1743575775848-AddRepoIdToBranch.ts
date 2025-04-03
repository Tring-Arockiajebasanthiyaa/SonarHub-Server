import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRepoIdToBranch1743575775848 implements MigrationInterface {
    name = 'AddRepoIdToBranch1743575775848'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_0d7b878a3be879433a27098f408"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_repo_owner"`);
        await queryRunner.query(`ALTER TABLE "branches" DROP CONSTRAINT "FK_e8b6b5ff34639af7b76d5a54e8f"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "unique_name_owner"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "username"`);
        await queryRunner.query(`ALTER TABLE "branches" ADD "repoId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "projects" ALTER COLUMN "githubUrl" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "repositories" ALTER COLUMN "owner" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "UQ_7587f67963409ce7cda271b3f40" UNIQUE ("name", "owner")`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "FK_0e8c34ad26d8b7676a4c2c82ce4" FOREIGN KEY ("owner") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "branches" ADD CONSTRAINT "FK_1b78a5ec78a301b17e1ca5af56c" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "branches" ADD CONSTRAINT "FK_6a541e20198f668fee384db3520" FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "branches" DROP CONSTRAINT "FK_6a541e20198f668fee384db3520"`);
        await queryRunner.query(`ALTER TABLE "branches" DROP CONSTRAINT "FK_1b78a5ec78a301b17e1ca5af56c"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_0e8c34ad26d8b7676a4c2c82ce4"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "UQ_7587f67963409ce7cda271b3f40"`);
        await queryRunner.query(`ALTER TABLE "repositories" ALTER COLUMN "owner" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "projects" ALTER COLUMN "githubUrl" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "branches" DROP COLUMN "repoId"`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD "username" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "unique_name_owner" UNIQUE ("name", "owner")`);
        await queryRunner.query(`ALTER TABLE "branches" ADD CONSTRAINT "FK_e8b6b5ff34639af7b76d5a54e8f" FOREIGN KEY ("repoName", "username") REFERENCES "repositories"("name","owner") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "FK_repo_owner" FOREIGN KEY ("owner") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "FK_0d7b878a3be879433a27098f408" FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
