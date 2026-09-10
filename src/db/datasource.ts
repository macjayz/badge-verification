// src/db/datasource.ts - UPDATED
import path from 'path';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { User } from '../entities/User';
import { Verification } from '../entities/Verification';
import { Issuer } from '../entities/Issuer';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Achievement } from '../entities/Achievement';
import { UserSocialConnection } from '../entities/UserSocialConnection';
import { IssuerProfile } from '../entities/IssuerProfile'; // ADD THIS
import { ProjectSocialRules } from '../entities/ProjectSocialRules'; // ADD THIS

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  synchronize: config.server.nodeEnv === 'development',
  logging: config.server.nodeEnv === 'development',
  entities: [
    User, 
    Verification, 
    Issuer, 
    BadgeType, 
    BadgeMint,
    Achievement,
    UserSocialConnection,
    IssuerProfile, // ADD THIS
    ProjectSocialRules // ADD THIS
  ],
  // Resolved relative to this file so it works both under ts-node (src/) and
  // from the compiled build (dist/).
  migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],
  subscribers: [],
  extra: {
    max: 20,
  },
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};