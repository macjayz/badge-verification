import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Issuer } from './Issuer';
import { BadgeMint } from './BadgeMint';

export interface BadgeRules {
  primary: string[];  // ['polygonid', 'idos'] - required DID providers
  secondary: Array<{
    method: string;    // 'twitter_follow', 'discord_member', 'onchain_activity'
    required: boolean;
    params?: any;      // { account: 'twitter_handle', minAge: 30 }
  }>;
  logic?: 'AND' | 'OR';  // How to combine secondary rules
}

@Entity('badge_types')
export class BadgeType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  key!: string;  // Unique identifier: 'defi-camp-student', 'gitcoin-passport'

  @Column({ type: 'varchar', length: 255 })
  name!: string;  // Display name: 'DeFi Camp Student'

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ type: 'jsonb' })
  rules!: BadgeRules;

  @Column({ type: 'varchar', nullable: true, length: 500 })
  metadataIpfs?: string;  // IPFS hash for badge metadata

  @Column({ type: 'boolean', default: false })
  isGlobal!: boolean;  // If true, available to all issuers

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Issuer, issuer => issuer.badgeTypes)
  @JoinColumn({ name: 'issuerId' })
  issuer!: Issuer;

  @Column()
  issuerId!: string;

  @OneToMany(() => BadgeMint, badgeMint => badgeMint.badgeType)
  mints?: BadgeMint[];
}