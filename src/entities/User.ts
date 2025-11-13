import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { Verification } from './Verification';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true, length: 255 })
  @Index()
  wallet!: string;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  did!: string | null;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  provider!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Add relationship to verifications
  @OneToMany(() => Verification, verification => verification.user)
  verifications?: Verification[];
}