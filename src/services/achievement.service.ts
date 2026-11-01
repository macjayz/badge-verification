import { AppDataSource } from '../db/datasource';
import { Achievement, AchievementType, AchievementTier } from '../entities/Achievement';
import { User } from '../entities/User';
import { logger } from '../utils/logger';

const achievementRepository = AppDataSource.getRepository(Achievement);
const userRepository = AppDataSource.getRepository(User);

export interface AchievementProgress {
  type: AchievementType;
  tier: AchievementTier;
  name: string;
  description: string;
  currentValue: number;
  targetValue: number;
  progress: number;
  isCompleted: boolean;
  completedAt?: Date;
}

export class AchievementService {

  // Initialize achievements for a user
async initializeUserAchievements(userId: string): Promise<Achievement[]> {
    const achievementDefinitions = this.getAchievementDefinitions();
    const achievements: Achievement[] = [];

    for (const definition of achievementDefinitions) {
        const existing = await achievementRepository.findOne({
            where: {
                userId: userId,
                type: definition.type,
                tier: definition.tier
            }
        });

        if (!existing) {
            const achievement = achievementRepository.create({
                ...definition,
                userId: userId,
                currentValue: 0,
                isCompleted: false
            });
            achievements.push(achievement);
        }
    }

    return await achievementRepository.save(achievements);
}

  // Get achievement definitions
  private getAchievementDefinitions(): Partial<Achievement>[] {
    return [
      // Badge Collector achievements
      {
        type: AchievementType.BADGE_COLLECTOR,
        tier: AchievementTier.BRONZE,
        name: 'Badge Beginner',
        description: 'Earn your first 3 badges',
        targetValue: 3
      },
      {
        type: AchievementType.BADGE_COLLECTOR,
        tier: AchievementTier.SILVER,
        name: 'Badge Enthusiast',
        description: 'Earn 10 different badges',
        targetValue: 10
      },
      {
        type: AchievementType.BADGE_COLLECTOR,
        tier: AchievementTier.GOLD,
        name: 'Badge Master',
        description: 'Earn 25 different badges',
        targetValue: 25
      },
      {
        type: AchievementType.BADGE_COLLECTOR,
        tier: AchievementTier.PLATINUM,
        name: 'Badge Legend',
        description: 'Earn 50 different badges',
        targetValue: 50
      },

      // Verification Master achievements
      {
        type: AchievementType.VERIFICATION_MASTER,
        tier: AchievementTier.BRONZE,
        name: 'Identity Verified',
        description: 'Complete 2 different verifications',
        targetValue: 2
      },
      {
        type: AchievementType.VERIFICATION_MASTER,
        tier: AchievementTier.SILVER,
        name: 'Trust Builder',
        description: 'Complete 5 different verifications',
        targetValue: 5
      },
      {
        type: AchievementType.VERIFICATION_MASTER,
        tier: AchievementTier.GOLD,
        name: 'Verification Expert',
        description: 'Complete all verification types',
        targetValue: 7
      },

      // Early Adopter achievements
      {
        type: AchievementType.EARLY_ADOPTER,
        tier: AchievementTier.BRONZE,
        name: 'Early User',
        description: 'Be an active user for 7 days',
        targetValue: 7
      },
      {
        type: AchievementType.EARLY_ADOPTER,
        tier: AchievementTier.SILVER,
        name: 'Dedicated Member',
        description: 'Be an active user for 30 days',
        targetValue: 30
      },
      {
        type: AchievementType.EARLY_ADOPTER,
        tier: AchievementTier.GOLD,
        name: 'Seasoned Veteran',
        description: 'Be an active user for 90 days',
        targetValue: 90
      },

      // Minting Expert achievements
      {
        type: AchievementType.MINTING_EXPERT,
        tier: AchievementTier.BRONZE,
        name: 'First Mint',
        description: 'Successfully mint your first badge',
        targetValue: 1
      },
      {
        type: AchievementType.MINTING_EXPERT,
        tier: AchievementTier.SILVER,
        name: 'Minting Pro',
        description: 'Mint 10 badges successfully',
        targetValue: 10
      },
      {
        type: AchievementType.MINTING_EXPERT,
        tier: AchievementTier.GOLD,
        name: 'Minting Master',
        description: 'Mint 25 badges successfully',
        targetValue: 25
      }
    ];
  }

  // Update achievements when user performs actions
  async updateAchievements(userId: string, action: string, _data?: any): Promise<Achievement[]> {
    const userAchievements = await achievementRepository.find({
      where: { userId },
      order: { type: 'ASC', tier: 'ASC' }
    });

    const updatedAchievements: Achievement[] = [];
    const unlockedAchievements: Achievement[] = [];

    for (const achievement of userAchievements) {
      let newValue = achievement.currentValue;
      let shouldUpdate = false;

      switch (action) {
        case 'badge_minted':
          if (achievement.type === AchievementType.BADGE_COLLECTOR ||
              achievement.type === AchievementType.MINTING_EXPERT) {
            newValue = achievement.currentValue + 1;
            shouldUpdate = true;
          }
          break;

        case 'verification_completed':
          if (achievement.type === AchievementType.VERIFICATION_MASTER) {
            newValue = achievement.currentValue + 1;
            shouldUpdate = true;
          }
          break;

        case 'daily_login':
          if (achievement.type === AchievementType.EARLY_ADOPTER) {
            newValue = achievement.currentValue + 1;
            shouldUpdate = true;
          }
          break;
      }

      if (shouldUpdate && newValue !== achievement.currentValue) {
        const unlocked = achievement.updateProgress(newValue);
        const updated = await achievementRepository.save(achievement);
        updatedAchievements.push(updated);

        if (unlocked) {
          unlockedAchievements.push(updated);
          logger.info(`Achievement unlocked: ${achievement.name} for user ${userId}`);
        }
      }
    }

    // Emit events for unlocked achievements
    if (unlockedAchievements.length > 0) {
      this.emitAchievementUnlocked(userId, unlockedAchievements);
    }

    return updatedAchievements;
  }

  // Get user's achievement progress
  async getUserAchievements(userId: string): Promise<AchievementProgress[]> {
    const achievements = await achievementRepository.find({
      where: { userId },
      order: { type: 'ASC', tier: 'ASC' }
    });

    return achievements.map(achievement => ({
      type: achievement.type,
      tier: achievement.tier,
      name: achievement.name,
      description: achievement.description,
      currentValue: achievement.currentValue,
      targetValue: achievement.targetValue,
      progress: achievement.getProgressPercentage(),
      isCompleted: achievement.isCompleted,
      completedAt: achievement.completedAt
    }));
  }

  // Get achievement statistics
  async getAchievementStats(userId: string): Promise<{
    totalAchievements: number;
    completedAchievements: number;
    completionRate: number;
    nextAchievements: AchievementProgress[];
  }> {
    const achievements = await this.getUserAchievements(userId);
    const completed = achievements.filter(a => a.isCompleted);
    const nextAchievements = achievements.filter(a => !a.isCompleted).slice(0, 3);

    return {
      totalAchievements: achievements.length,
      completedAchievements: completed.length,
      completionRate: achievements.length > 0 ? (completed.length / achievements.length) * 100 : 0,
      nextAchievements
    };
  }

  // Emit achievement unlocked event (for WebSocket)
  private emitAchievementUnlocked(userId: string, achievements: Achievement[]): void {
    // This would integrate with your WebSocket service
    achievements.forEach(achievement => {
      logger.info(`Achievement Unlocked: User ${userId} earned "${achievement.name}"`);
      // webSocketEventsService.sendAchievementUnlocked(userId, achievement);
    });
  }

  // Check and initialize achievements for all users (admin function)
  async initializeAllUsersAchievements(): Promise<void> {
    const users = await userRepository.find();

    for (const user of users) {
      await this.initializeUserAchievements(user.id);
    }

    logger.info(`Initialized achievements for ${users.length} users`);
  }
}

export const achievementService = new AchievementService();