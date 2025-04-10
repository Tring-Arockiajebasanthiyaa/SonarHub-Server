import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueConstraintsInPREntity1744096079388 implements MigrationInterface {
    name = 'AddUniqueConstraintsInPREntity1744096079388'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "language_bytes_per_line_entity" ("language" character varying NOT NULL, "avgBytesPerLine" integer NOT NULL, CONSTRAINT "PK_059e4d2fc9025f01e2da1f76ac9" PRIMARY KEY ("language"))`);
        await queryRunner.query(`ALTER TABLE "pull_requests" DROP CONSTRAINT "UQ_9d66d575ee9f7674fcc44d95058"`);
        await queryRunner.query(`ALTER TABLE "pull_requests" ADD CONSTRAINT "UQ_d94f970b03b1cba86d20c2ed781" UNIQUE ("prId", "githubUsername", "repo_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pull_requests" DROP CONSTRAINT "UQ_d94f970b03b1cba86d20c2ed781"`);
        await queryRunner.query(`ALTER TABLE "pull_requests" ADD CONSTRAINT "UQ_9d66d575ee9f7674fcc44d95058" UNIQUE ("prId")`);
        await queryRunner.query(`DROP TABLE "language_bytes_per_line_entity"`);
    }

}
