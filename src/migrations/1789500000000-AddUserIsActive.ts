import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIsActive1789500000000 implements MigrationInterface {
  name = 'AddUserIsActive1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
  }
}
