import { DataSource } from 'typeorm';
import { config } from '../config';
import { User } from '../entities/User';
import { Verification } from '../entities/Verification';
import { Issuer } from '../entities/Issuer';
import { BadgeType } from '../entities/BadgeType';
import { BadgeMint } from '../entities/BadgeMint';
import { Achievement } from '../entities/Achievement'; // ADD THIS
import { UserSocialConnection } from '../entities/UserSocialConnection'; // ADD THIS

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
    Achievement, // ADD THIS
    UserSocialConnection // ADD THIS
  ],
  migrations: ['src/migrations/**/*.ts'],
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