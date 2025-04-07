import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeOwnerToUserRelation1743579777435 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: Rename existing column to keep backup (if needed)
        await queryRunner.query(`
            ALTER TABLE "repositories" RENAME COLUMN "owner" TO "old_owner";
        `);

        // Step 2: Add new owner column as a foreign key
        await queryRunner.query(`
            ALTER TABLE "repositories" ADD COLUMN "owner" UUID;
        `);

        // Step 3: Update new column with mapped user IDs (Ensure that "old_owner" values match "username" in "users")
        await queryRunner.query(`
            UPDATE "repositories"
            SET "owner" = (SELECT u_id FROM "users" WHERE "users"."username" = "repositories"."old_owner")
            WHERE "old_owner" IS NOT NULL;
        `);

        // Step 4: Set NOT NULL constraint
        await queryRunner.query(`
            ALTER TABLE "repositories" ALTER COLUMN "owner" SET NOT NULL;
        `);

        // Step 5: Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "repositories" 
            ADD CONSTRAINT "FK_repositories_owner" 
            FOREIGN KEY ("owner") REFERENCES "users"("u_id") 
            ON DELETE CASCADE;
        `);

        // Step 6: Drop the old owner column
        await queryRunner.query(`
            ALTER TABLE "repositories" DROP COLUMN "old_owner";
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Step 1: Recreate old column
        await queryRunner.query(`
            ALTER TABLE "repositories" ADD COLUMN "old_owner" VARCHAR;
        `);

        // Step 2: Restore old data
        await queryRunner.query(`
            UPDATE "repositories"
            SET "old_owner" = (SELECT username FROM "users" WHERE "users"."u_id" = "repositories"."owner")
            WHERE "owner" IS NOT NULL;
        `);

        // Step 3: Drop foreign key
        await queryRunner.query(`
            ALTER TABLE "repositories" DROP CONSTRAINT "FK_repositories_owner";
        `);

        // Step 4: Drop new owner column
        await queryRunner.query(`
            ALTER TABLE "repositories" DROP COLUMN "owner";
        `);

        // Step 5: Rename old_owner back to owner
        await queryRunner.query(`
            ALTER TABLE "repositories" RENAME COLUMN "old_owner" TO "owner";
        `);
    }
}
