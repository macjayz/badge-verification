// src/entities/UserSocialConnection.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('user_social_connections')
export class UserSocialConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  wallet!: string;

  @Column({ type: 'varchar' })
  platform!: 'twitter' | 'discord' | 'github' | 'telegram';

  @Column({ type: 'varchar' })
  @Index()
  platformUserId!: string;

  @Column({ type: 'varchar', nullable: true })
  platformHandle?: string;

  @Column({ type: 'text', nullable: true })
  accessToken?: string;

  @Column({ type: 'text', nullable: true })
  refreshToken?: string;

  @Column({ type: 'jsonb', nullable: true })
  profileData?: any;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  connectedAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;
}