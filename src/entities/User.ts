// src/entities/User.ts - FIXED VERSION
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany, Unique } from 'typeorm';
import { Verification } from './Verification';

@Entity('users')
@Unique(['wallet'])  // ✅ ADD THIS LINE - makes wallet unique
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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // FIXED: Remove the problematic relationship reference
  // Remove this line entirely:
  // @OneToMany(() => Verification, verification => verification.user)
  // verifications?: Verification[];

  // Or if you want to keep the relationship, fix the reference:
  // @OneToMany(() => Verification, verification => verification.wallet)
  // verifications?: Verification[];
}