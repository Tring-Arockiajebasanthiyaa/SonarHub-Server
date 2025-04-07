import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePullRequestsEntity1743967382544 implements MigrationInterface {
    name = 'CreatePullRequestsEntity1743967382544'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pull_requests" ("u_id" SERIAL NOT NULL, "prId" integer NOT NULL, "title" character varying NOT NULL, "state" character varying NOT NULL, "branch" character varying NOT NULL, "author" character varying NOT NULL, "githubUsername" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "closedAt" TIMESTAMP, "mergedAt" TIMESTAMP, "additions" integer NOT NULL DEFAULT '0', "deletions" integer NOT NULL DEFAULT '0', "changedFiles" integer NOT NULL DEFAULT '0', "comment" text, "repo_id" integer, "user_id" uuid, CONSTRAINT "UQ_9d66d575ee9f7674fcc44d95058" UNIQUE ("prId"), CONSTRAINT "PK_76a9bbd37033005ab6995824c51" PRIMARY KEY ("u_id"))`);
        await queryRunner.query(`ALTER TABLE "pull_requests" ADD CONSTRAINT "FK_292d27c87db892edc6e3a59bcdb" FOREIGN KEY ("repo_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pull_requests" ADD CONSTRAINT "FK_247bf8a48cd21f3cf938a749d4f" FOREIGN KEY ("user_id") REFERENCES "users"("u_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pull_requests" DROP CONSTRAINT "FK_247bf8a48cd21f3cf938a749d4f"`);
        await queryRunner.query(`ALTER TABLE "pull_requests" DROP CONSTRAINT "FK_292d27c87db892edc6e3a59bcdb"`);
        await queryRunner.query(`DROP TABLE "pull_requests"`);
    }

}
