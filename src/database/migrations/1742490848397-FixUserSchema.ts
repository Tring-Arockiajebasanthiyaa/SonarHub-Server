import { MigrationInterface, QueryRunner } from "typeorm";

export class FixUserSchema1742490848397 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN 
                    CREATE TABLE "users" (
                        "u_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                        "name" character varying NOT NULL,
                        "email" character varying NOT NULL,
                        "avatar" character varying,
                        "password" character varying,
                        "username" character varying NOT NULL,
                        "githubId" character varying,
                        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                        CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"),
                        CONSTRAINT "UQ_42148de213279d66bf94b363bf2" UNIQUE ("githubId"),
                        CONSTRAINT "PK_ed9eff0c241ae28139f2e55d3e5" PRIMARY KEY ("u_id")
                    );
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
