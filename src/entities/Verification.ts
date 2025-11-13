import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

export enum VerificationStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

export enum VerificationType {
  PRIMARY_DID = 'primary_did',    // Global DID verification (Polygon ID, IdOS)
  SECONDARY = 'secondary'          // Project-specific verification (Twitter, Discord, etc.)
}

@Entity('verifications')
export class Verification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  wallet!: string;

  // Link to user (optional - for relationships)
  @ManyToOne(() => User, user => user.wallet, { nullable: true })
  @JoinColumn({ name: 'wallet', referencedColumnName: 'wallet' })
  user?: User;

  @Column({ type: 'varchar' })
  provider!: string;  // 'polygonid', 'idos', 'twitter', 'discord', etc.

  @Column({ type: 'varchar' })
  type!: VerificationType;

  @Column({ type: 'varchar', default: VerificationStatus.PENDING })
  status!: VerificationStatus;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  sessionId?: string;  // For tracking verification sessions

  @Column({ type: 'varchar', nullable: true })
  verificationId?: string;  // External verification ID from provider

  @Column({ type: 'varchar', nullable: true })
  did?: string;  // The actual DID if verification successful

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;  // Provider-specific metadata

  @Column({ type: 'varchar', nullable: true })
  errorMessage?: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Helper methods
  isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  canBeUsed(): boolean {
    return this.status === VerificationStatus.COMPLETED && !this.isExpired();
  }

  markCompleted(did?: string, metadata?: any, verificationId?: string): void {
    this.status = VerificationStatus.COMPLETED;
    this.completedAt = new Date();
    this.did = did;
    this.metadata = metadata;
    this.verificationId = verificationId;
  }

  markFailed(error: string): void {
    this.status = VerificationStatus.FAILED;
    this.errorMessage = error;
    this.completedAt = new Date();
  }
}