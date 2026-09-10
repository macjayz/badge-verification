import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1789041137533 implements MigrationInterface {
    name = 'InitialSchema1789041137533'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wallet" character varying(42) NOT NULL, "did" character varying, "provider" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c5a97c2e62b0c759e2c16d411cd" UNIQUE ("wallet"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c5a97c2e62b0c759e2c16d411c" ON "users" ("wallet") `);
        await queryRunner.query(`CREATE TABLE "verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wallet" character varying NOT NULL, "provider" character varying NOT NULL, "type" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "sessionId" character varying, "verificationId" character varying, "did" character varying, "metadata" jsonb, "errorMessage" character varying, "completedAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2127ad1b143cf012280390b01d1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_caa29c15f17b3f228ee58ced57" ON "verifications" ("wallet") `);
        await queryRunner.query(`CREATE INDEX "IDX_104e99526b28db93427867a4a2" ON "verifications" ("sessionId") `);
        await queryRunner.query(`CREATE TABLE "badge_mints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wallet" character varying NOT NULL, "tokenId" character varying, "transactionHash" character varying, "verificationId" uuid, "metadata" jsonb, "isRevoked" boolean NOT NULL DEFAULT false, "revokeReason" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "badgeTypeId" uuid NOT NULL, CONSTRAINT "PK_a4f1116a2a6ab3d344d2eb152d2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ca4fd445899e0514bbe8152547" ON "badge_mints" ("wallet") `);
        await queryRunner.query(`CREATE TABLE "badge_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(100) NOT NULL, "name" character varying(255) NOT NULL, "description" character varying(500), "imageUrl" character varying(500), "rules" jsonb NOT NULL, "metadataIpfs" character varying(500), "isGlobal" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "issuerId" uuid NOT NULL, "contractBadgeTypeId" integer, CONSTRAINT "PK_46c34d479ac99094334a7b52421" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2bc3c279e1eb0437360cbce5a1" ON "badge_types" ("key") `);
        await queryRunner.query(`CREATE TABLE "issuers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "wallet" character varying(255) NOT NULL, "apiKey" character varying(255) NOT NULL, "description" character varying(500), "website" character varying(500), "contactEmail" character varying(255), "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_cc348f257e6d3d3657d9a2d8fb7" UNIQUE ("apiKey"), CONSTRAINT "PK_36d87e2e6d1edfcbdc561deeaf9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8983a8f879441782307a57a9c4" ON "issuers" ("wallet") `);
        await queryRunner.query(`CREATE INDEX "IDX_cc348f257e6d3d3657d9a2d8fb" ON "issuers" ("apiKey") `);
        await queryRunner.query(`CREATE TABLE "achievements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying NOT NULL, "tier" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying(500) NOT NULL, "targetValue" integer NOT NULL, "currentValue" integer NOT NULL DEFAULT '0', "isCompleted" boolean NOT NULL DEFAULT false, "completedAt" TIMESTAMP WITH TIME ZONE, "metadata" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" character varying NOT NULL, CONSTRAINT "PK_1bc19c37c6249f70186f318d71d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_social_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wallet" character varying NOT NULL, "platform" character varying NOT NULL, "platformUserId" character varying NOT NULL, "platformHandle" character varying, "accessToken" text, "refreshToken" text, "profileData" jsonb, "isActive" boolean NOT NULL DEFAULT true, "connectedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d7021f41e26777eeb91370d592a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c2379114415e07b990f1178375" ON "user_social_connections" ("wallet") `);
        await queryRunner.query(`CREATE INDEX "IDX_af4c65bc12e8308399fd83c11e" ON "user_social_connections" ("platformUserId") `);
        await queryRunner.query(`CREATE TABLE "issuer_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "issuerId" uuid NOT NULL, "projectName" character varying(255) NOT NULL, "description" character varying(500), "website" character varying(500), "contactEmail" character varying(255), "twitterHandle" character varying(100), "discordServerId" character varying(100), "discordServerName" character varying(100), "snapshotSpace" character varying(100), "githubOrganization" character varying(100), "socialConfig" jsonb, "isVerified" boolean NOT NULL DEFAULT false, "onboardingStatus" character varying(50) NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_eec279191d7586ceb0f61a1021" UNIQUE ("issuerId"), CONSTRAINT "PK_52d9064a252fa33138207ebb759" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "project_social_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "issuerId" uuid NOT NULL, "ruleType" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "description" character varying(500), "parameters" jsonb NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "isRequired" boolean NOT NULL DEFAULT false, "priority" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4c1727c028557ada37f868f0d64" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "verifications" ADD CONSTRAINT "FK_caa29c15f17b3f228ee58ced577" FOREIGN KEY ("wallet") REFERENCES "users"("wallet") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "badge_mints" ADD CONSTRAINT "FK_ca4fd445899e0514bbe8152547c" FOREIGN KEY ("wallet") REFERENCES "users"("wallet") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "badge_mints" ADD CONSTRAINT "FK_dda2534c716dd3df923e7c3b6e7" FOREIGN KEY ("badgeTypeId") REFERENCES "badge_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "badge_mints" ADD CONSTRAINT "FK_4bc30b127cb059cd59bab2a7982" FOREIGN KEY ("verificationId") REFERENCES "verifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "badge_types" ADD CONSTRAINT "FK_a0943e9eb272d7fc6b555e227ae" FOREIGN KEY ("issuerId") REFERENCES "issuers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "issuer_profiles" ADD CONSTRAINT "FK_eec279191d7586ceb0f61a10218" FOREIGN KEY ("issuerId") REFERENCES "issuers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_social_rules" ADD CONSTRAINT "FK_aacc66c50d81acecbdcf96a706f" FOREIGN KEY ("issuerId") REFERENCES "issuers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_social_rules" DROP CONSTRAINT "FK_aacc66c50d81acecbdcf96a706f"`);
        await queryRunner.query(`ALTER TABLE "issuer_profiles" DROP CONSTRAINT "FK_eec279191d7586ceb0f61a10218"`);
        await queryRunner.query(`ALTER TABLE "badge_types" DROP CONSTRAINT "FK_a0943e9eb272d7fc6b555e227ae"`);
        await queryRunner.query(`ALTER TABLE "badge_mints" DROP CONSTRAINT "FK_4bc30b127cb059cd59bab2a7982"`);
        await queryRunner.query(`ALTER TABLE "badge_mints" DROP CONSTRAINT "FK_dda2534c716dd3df923e7c3b6e7"`);
        await queryRunner.query(`ALTER TABLE "badge_mints" DROP CONSTRAINT "FK_ca4fd445899e0514bbe8152547c"`);
        await queryRunner.query(`ALTER TABLE "verifications" DROP CONSTRAINT "FK_caa29c15f17b3f228ee58ced577"`);
        await queryRunner.query(`DROP TABLE "project_social_rules"`);
        await queryRunner.query(`DROP TABLE "issuer_profiles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_af4c65bc12e8308399fd83c11e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c2379114415e07b990f1178375"`);
        await queryRunner.query(`DROP TABLE "user_social_connections"`);
        await queryRunner.query(`DROP TABLE "achievements"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cc348f257e6d3d3657d9a2d8fb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8983a8f879441782307a57a9c4"`);
        await queryRunner.query(`DROP TABLE "issuers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2bc3c279e1eb0437360cbce5a1"`);
        await queryRunner.query(`DROP TABLE "badge_types"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ca4fd445899e0514bbe8152547"`);
        await queryRunner.query(`DROP TABLE "badge_mints"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_104e99526b28db93427867a4a2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_caa29c15f17b3f228ee58ced57"`);
        await queryRunner.query(`DROP TABLE "verifications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c5a97c2e62b0c759e2c16d411c"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
