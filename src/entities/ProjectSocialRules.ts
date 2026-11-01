import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Issuer } from './Issuer';

export interface SocialRuleParameters {
  account?: string;
  serverId?: string;
  serverName?: string;
  space?: string;
  organization?: string;
  minFollowers?: number;
  minTransactions?: number;
  minVotes?: number;
  minContributions?: number;
  requiredRole?: string;
  proposalIds?: string[];
  repositoryNames?: string[];
  customConditions?: any;
}

@Entity('project_social_rules')
export class ProjectSocialRules {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  issuerId!: string;

  @Column({ type: 'varchar', length: 50 })
  ruleType!: 'twitter_follow' | 'discord_member' | 'snapshot_votes' | 'onchain_activity' | 'github_contributor' | 'custom';

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  parameters!: SocialRuleParameters;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  isRequired!: boolean;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Issuer, issuer => issuer.id)
  @JoinColumn({ name: 'issuerId' })
  issuer!: Issuer;
}