import { MigrationInterface, QueryRunner } from "typeorm";

export class FixRepoOwnerRelation1743580551562 implements MigrationInterface {
    name = 'FixRepoOwnerRelation1743580551562'

    public async up(queryRunner: QueryRunner): Promise<void> {
       
        const hasOldOwnerColumn = await queryRunner.hasColumn("repositories", "owner");
        const isUuidType = await queryRunner.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'repositories' AND column_name = 'owner';
        `);
        
        if (hasOldOwnerColumn && isUuidType[0]?.data_type === 'uuid') {
           
            return;
        }

        
        await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN "owner_id" uuid`);

       
        await queryRunner.query(`
            UPDATE "repositories" r
            SET "owner_id" = u."u_id"
            FROM "users" u
            WHERE r."owner"::text = u."username"::text
        `);

        
        const orphanedCount = await queryRunner.query(`
            SELECT COUNT(*) FROM "repositories" WHERE "owner_id" IS NULL
        `);

        if (orphanedCount[0].count > 0) {
           
            await queryRunner.query(`
                DELETE FROM "repositories" WHERE "owner_id" IS NULL
            `);
            
        }

       
        await queryRunner.query(`ALTER TABLE "repositories" ALTER COLUMN "owner_id" SET NOT NULL`);

        
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT IF EXISTS "FK_repositories_owner"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "owner"`);

       
        await queryRunner.query(`ALTER TABLE "repositories" RENAME COLUMN "owner_id" TO "owner"`);

        
        await queryRunner.query(`
            ALTER TABLE "repositories" 
            ADD CONSTRAINT "FK_repo_owner" 
            FOREIGN KEY ("owner") REFERENCES "users"("u_id") 
            ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        
        await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN "owner_username" character varying`);

       
        await queryRunner.query(`
            UPDATE "repositories" r
            SET "owner_username" = u."username"
            FROM "users" u
            WHERE r."owner" = u."u_id"
        `);

       
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_repo_owner"`);

       
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "owner"`);

        
        await queryRunner.query(`ALTER TABLE "repositories" RENAME COLUMN "owner_username" TO "owner"`);

      
        await queryRunner.query(`
            ALTER TABLE "repositories" 
            ADD CONSTRAINT "FK_repo_owner_username" 
            FOREIGN KEY ("owner") REFERENCES "users"("username") 
            ON DELETE CASCADE
        `);
    }
}