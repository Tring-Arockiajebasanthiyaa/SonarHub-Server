import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKeyColumn1743241779175 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name = 'sonar_issues' 
                               AND column_name = 'key') THEN 
                    ALTER TABLE "sonar_issues" ADD COLUMN "key" character varying NOT NULL;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sonar_issues" DROP COLUMN IF EXISTS "key"`,
    );
  }
}
