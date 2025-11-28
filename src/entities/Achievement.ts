// src/entities/Achievement.ts - FIXED VERSION
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum AchievementType {
  BADGE_COLLECTOR = 'badge_collector',
  VERIFICATION_MASTER = 'verification_master',
  EARLY_ADOPTER = 'early_adopter',
  COMMUNITY_BUILDER = 'community_builder',
  MINTING_EXPERT = 'minting_expert'
}

export enum AchievementTier {
  BRONZE = 'bronze',
  SILVER = 'silver', 
  GOLD = 'gold',
  PLATINUM = 'platinum'
}

@Entity('achievements')
export class Achievement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: AchievementType;

  @Column({ type: 'varchar' })
  tier!: AchievementTier;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'int' })
  targetValue!: number; // Number needed to achieve this tier

  @Column({ type: 'int', default: 0 })
  currentValue!: number; // User's current progress

  @Column({ type: 'boolean', default: false })
  isCompleted!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // SIMPLIFIED: Just store userId without bidirectional relationship
  @Column()
  userId!: string;

  // Helper methods
  getProgressPercentage(): number {
    return this.targetValue > 0 ? Math.min(100, (this.currentValue / this.targetValue) * 100) : 0;
  }

  updateProgress(newValue: number): boolean {
    this.currentValue = newValue;
    
    if (!this.isCompleted && this.currentValue >= this.targetValue) {
      this.isCompleted = true;
      this.completedAt = new Date();
      return true; // Achievement unlocked!
    }
    
    return false;
  }
}