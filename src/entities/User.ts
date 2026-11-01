import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';

@Entity('users')
@Unique(['wallet'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 42 })
  @Index()
  wallet!: string;

  @Column({ type: 'varchar', nullable: true })
  did?: string;

  @Column({ type: 'varchar', nullable: true })
  provider?: string;

  // Suspended accounts cannot sign in or mint. Set from the admin user-management page.
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
