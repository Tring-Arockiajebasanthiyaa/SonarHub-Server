import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKeyColumn1743241779175 implements MigrationInterface {
    name = 'AddKeyColumn1743241779175'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sonar_issues" ADD "key" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sonar_issues" ADD "tags" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sonar_issues" DROP COLUMN "tags"`);
        await queryRunner.query(`ALTER TABLE "sonar_issues" DROP COLUMN "key"`);
    }

}
