import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBranchToEntities1743589757961 implements MigrationInterface {
    name = 'AddBranchToEntities1743589757961'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add 'branch' column to 'sonar_issues' table
        await queryRunner.query(`ALTER TABLE "sonar_issues" ADD "branch" character varying NOT NULL DEFAULT 'main'`);
        
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove 'branch' column from 'sonar_issues' table
        await queryRunner.query(`ALTER TABLE "sonar_issues" DROP COLUMN "branch"`);
        
        // Remove 'branch' column from 'code_metrics' table
        await queryRunner.query(`ALTER TABLE "code_metrics" DROP COLUMN "branch"`);
    }

}
