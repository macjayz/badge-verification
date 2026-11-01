import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Issuer } from './Issuer';

@Entity('issuer_profiles')
export class IssuerProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  issuerId!: string;

  @Column({ type: 'varchar', length: 255 })
  projectName!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  twitterHandle?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  discordServerId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  discordServerName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  snapshotSpace?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  githubOrganization?: string;

  @Column({ type: 'jsonb', nullable: true })
  socialConfig?: {
    twitterFollowers?: number;
    discordMembers?: number;
    snapshotProposals?: string[];
    githubRepos?: string[];
  };

  @Column({ type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  onboardingStatus!: 'pending' | 'completed' | 'verified';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Relationships
  @OneToOne(() => Issuer, issuer => issuer.id)
  @JoinColumn({ name: 'issuerId' })
  issuer!: Issuer;
}