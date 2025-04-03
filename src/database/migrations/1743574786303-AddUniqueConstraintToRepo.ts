import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOwnerConstraintToRepo1743570925943 implements MigrationInterface {
    name = 'AddOwnerConstraintToRepo1743570925943'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "FK_repo_owner" FOREIGN KEY ("owner") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_repo_owner"`);
    }
}
