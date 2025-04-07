import { MigrationInterface, QueryRunner } from "typeorm";

export class FixRepoOwnerRelation1743580551562 implements MigrationInterface {
    name = 'FixRepoOwnerRelation1743580551562'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. First check if we need to migrate
        const hasOldOwnerColumn = await queryRunner.hasColumn("repositories", "owner");
        const isUuidType = await queryRunner.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'repositories' AND column_name = 'owner';
        `);
        
        if (hasOldOwnerColumn && isUuidType[0]?.data_type === 'uuid') {
            // Already migrated, skip
            return;
        }

        // 2. Add temporary owner_id column (nullable)
        await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN "owner_id" uuid`);

        // 3. Update with explicit type casting for username comparison
        await queryRunner.query(`
            UPDATE "repositories" r
            SET "owner_id" = u."u_id"
            FROM "users" u
            WHERE r."owner"::text = u."username"::text
        `);

        // 4. Check for orphaned repositories
        const orphanedCount = await queryRunner.query(`
            SELECT COUNT(*) FROM "repositories" WHERE "owner_id" IS NULL
        `);

        if (orphanedCount[0].count > 0) {
            // Option 1: Delete orphaned repositories (recommended)
            await queryRunner.query(`
                DELETE FROM "repositories" WHERE "owner_id" IS NULL
            `);
            
            // OR Option 2: Assign to default user (uncomment if needed)
            // await queryRunner.query(`
            //     UPDATE "repositories"
            //     SET "owner_id" = (SELECT u_id FROM users WHERE username = 'default' LIMIT 1)
            //     WHERE "owner_id" IS NULL
            // `);
        }

        // 5. Now we can safely set NOT NULL
        await queryRunner.query(`ALTER TABLE "repositories" ALTER COLUMN "owner_id" SET NOT NULL`);

        // 6. Drop old constraints and column
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT IF EXISTS "FK_repositories_owner"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "owner"`);

        // 7. Rename to final column name
        await queryRunner.query(`ALTER TABLE "repositories" RENAME COLUMN "owner_id" TO "owner"`);

        // 8. Add new foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "repositories" 
            ADD CONSTRAINT "FK_repo_owner" 
            FOREIGN KEY ("owner") REFERENCES "users"("u_id") 
            ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 1. Add back the username column
        await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN "owner_username" character varying`);

        // 2. Map user IDs back to usernames
        await queryRunner.query(`
            UPDATE "repositories" r
            SET "owner_username" = u."username"
            FROM "users" u
            WHERE r."owner" = u."u_id"
        `);

        // 3. Drop the foreign key constraint
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_repo_owner"`);

        // 4. Remove the UUID owner column
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "owner"`);

        // 5. Rename back to original column name
        await queryRunner.query(`ALTER TABLE "repositories" RENAME COLUMN "owner_username" TO "owner"`);

        // 6. Re-add old foreign key
        await queryRunner.query(`
            ALTER TABLE "repositories" 
            ADD CONSTRAINT "FK_repo_owner_username" 
            FOREIGN KEY ("owner") REFERENCES "users"("username") 
            ON DELETE CASCADE
        `);
    }
}