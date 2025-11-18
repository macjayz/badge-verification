import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { BadgeType } from './BadgeType';

@Entity('issuers')
export class Issuer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  wallet!: string;  // Issuer's admin wallet

  @Column({ type: 'varchar', unique: true, length: 255 })
  @Index()
  apiKey!: string;  // Generated API key for issuer

  @Column({ type: 'varchar', nullable: true, length: 500 })
  description?: string;

  @Column({ type: 'varchar', nullable: true, length: 500 })
  website?: string;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  contactEmail?: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // Relationships
  @OneToMany(() => BadgeType, badgeType => badgeType.issuer)
  badgeTypes?: BadgeType[];
}