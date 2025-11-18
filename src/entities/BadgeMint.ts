import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { BadgeType } from './BadgeType';
import { Verification } from './Verification';

@Entity('badge_mints')
export class BadgeMint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  wallet!: string;

  @Column({ type: 'varchar', nullable: true })
  tokenId?: string;  // On-chain token ID

  @Column({ type: 'varchar', nullable: true })
  transactionHash?: string;  // Mint transaction hash

  @Column({ type: 'uuid', nullable: true })  // FIXED: Use 'uuid' type instead of varchar with length
  verificationId?: string;  // Link to verification that triggered mint

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;  // Mint-specific metadata

  @Column({ type: 'boolean', default: false })
  isRevoked!: boolean;

  @Column({ type: 'varchar', nullable: true })
  revokeReason?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, user => user.wallet, { nullable: true })
  @JoinColumn({ name: 'wallet', referencedColumnName: 'wallet' })
  user?: User;

  @ManyToOne(() => BadgeType, badgeType => badgeType.mints)
  @JoinColumn({ name: 'badgeTypeId' })
  badgeType!: BadgeType;

  @Column()
  badgeTypeId!: string;

  @ManyToOne(() => Verification, { nullable: true })
  @JoinColumn({ name: 'verificationId', referencedColumnName: 'id' })
  verification?: Verification;
}