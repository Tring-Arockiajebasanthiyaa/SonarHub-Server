import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBranchesTable1743570129690 implements MigrationInterface {
    name = 'CreateBranchesTable1743570129690'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "branches" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "repoName" character varying NOT NULL, "username" character varying NOT NULL, "dashboardUrl" character varying, CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "branches" ADD CONSTRAINT "FK_e8b6b5ff34639af7b76d5a54e8f" FOREIGN KEY ("repoName", "username") REFERENCES "repositories"("name","owner") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "branches" DROP CONSTRAINT "FK_e8b6b5ff34639af7b76d5a54e8f"`);
        await queryRunner.query(`DROP TABLE "branches"`);
    }

}
