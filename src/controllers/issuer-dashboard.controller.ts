import { Response } from 'express';
import { issuerDashboardService } from '../services/issuer-dashboard.service';
import { logger } from '../utils/logger';
import { AuthenticatedIssuerRequest } from '../middleware/apiKey.middleware';

export class IssuerDashboardController {
  async createProfile(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const {
        projectName,
        description,
        website,
        contactEmail,
        twitterHandle,
        discordServerId,
        discordServerName,
        snapshotSpace,
        githubOrganization
      } = req.body;

      if (!projectName) {
        return res.status(400).json({
          success: false,
          error: 'Project name is required'
        });
      }

      const profile = await issuerDashboardService.createIssuerProfile(
        req.issuer.id,
        projectName,
        description,
        website,
        contactEmail,
        {
          twitterHandle,
          discordServerId,
          discordServerName,
          snapshotSpace,
          githubOrganization
        }
      );

      res.status(201).json({
        success: true,
        message: 'Issuer profile created successfully',
        profile: {
          id: profile.id,
          projectName: profile.projectName,
          description: profile.description,
          website: profile.website,
          contactEmail: profile.contactEmail,
          twitterHandle: profile.twitterHandle,
          discordServerId: profile.discordServerId,
          discordServerName: profile.discordServerName,
          snapshotSpace: profile.snapshotSpace,
          githubOrganization: profile.githubOrganization,
          onboardingStatus: profile.onboardingStatus,
          createdAt: profile.createdAt
        }
      });

      logger.info(`Created issuer profile for: ${projectName}`);

    } catch (error) {
      logger.error('Create issuer profile error:', error);

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create issuer profile'
      });
    }
  }

  async getProfile(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const profile = await issuerDashboardService.getIssuerProfile(req.issuer.id);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Issuer profile not found'
        });
      }

      res.json({
        success: true,
        profile: {
          id: profile.id,
          projectName: profile.projectName,
          description: profile.description,
          website: profile.website,
          contactEmail: profile.contactEmail,
          twitterHandle: profile.twitterHandle,
          discordServerId: profile.discordServerId,
          discordServerName: profile.discordServerName,
          snapshotSpace: profile.snapshotSpace,
          githubOrganization: profile.githubOrganization,
          onboardingStatus: profile.onboardingStatus,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt
        }
      });

    } catch (error) {
      logger.error('Get issuer profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get issuer profile'
      });
    }
  }

  async updateProfile(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const updates = req.body;

      const profile = await issuerDashboardService.updateIssuerProfile(req.issuer.id, updates);

      res.json({
        success: true,
        message: 'Issuer profile updated successfully',
        profile: {
          id: profile.id,
          projectName: profile.projectName,
          description: profile.description,
          website: profile.website,
          contactEmail: profile.contactEmail,
          twitterHandle: profile.twitterHandle,
          discordServerId: profile.discordServerId,
          discordServerName: profile.discordServerName,
          snapshotSpace: profile.snapshotSpace,
          githubOrganization: profile.githubOrganization,
          updatedAt: profile.updatedAt
        }
      });

      logger.info(`Updated issuer profile for: ${profile.projectName}`);

    } catch (error) {
      logger.error('Update issuer profile error:', error);

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update issuer profile'
      });
    }
  }

  async createSocialRule(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const {
        ruleType,
        name,
        parameters,
        description,
        isRequired = false,
        priority = 0
      } = req.body;

      if (!ruleType || !name || !parameters) {
        return res.status(400).json({
          success: false,
          error: 'Rule type, name, and parameters are required'
        });
      }

      const rule = await issuerDashboardService.createSocialRule(
        req.issuer.id,
        ruleType,
        name,
        parameters,
        description,
        isRequired,
        priority
      );

      res.status(201).json({
        success: true,
        message: 'Social rule created successfully',
        rule: {
          id: rule.id,
          ruleType: rule.ruleType,
          name: rule.name,
          description: rule.description,
          parameters: rule.parameters,
          isActive: rule.isActive,
          isRequired: rule.isRequired,
          priority: rule.priority,
          createdAt: rule.createdAt
        }
      });

      logger.info(`Created social rule: ${name} for issuer: ${req.issuer.name}`);

    } catch (error) {
      logger.error('Create social rule error:', error);

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create social rule'
      });
    }
  }

  async getSocialRules(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const rules = await issuerDashboardService.getIssuerSocialRules(req.issuer.id);

      res.json({
        success: true,
        rules: rules.map(rule => ({
          id: rule.id,
          ruleType: rule.ruleType,
          name: rule.name,
          description: rule.description,
          parameters: rule.parameters,
          isActive: rule.isActive,
          isRequired: rule.isRequired,
          priority: rule.priority,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt
        }))
      });

    } catch (error) {
      logger.error('Get social rules error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get social rules'
      });
    }
  }

  async updateSocialRule(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const { ruleId } = req.params;
      const updates = req.body;

      const rule = await issuerDashboardService.updateSocialRule(ruleId, req.issuer.id, updates);

      res.json({
        success: true,
        message: 'Social rule updated successfully',
        rule: {
          id: rule.id,
          ruleType: rule.ruleType,
          name: rule.name,
          description: rule.description,
          parameters: rule.parameters,
          isActive: rule.isActive,
          isRequired: rule.isRequired,
          priority: rule.priority,
          updatedAt: rule.updatedAt
        }
      });

      logger.info(`Updated social rule: ${rule.name}`);

    } catch (error) {
      logger.error('Update social rule error:', error);

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update social rule'
      });
    }
  }

  async deleteSocialRule(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const { ruleId } = req.params;

      await issuerDashboardService.deleteSocialRule(ruleId, req.issuer.id);

      res.json({
        success: true,
        message: 'Social rule deleted successfully'
      });

      logger.info(`Deleted social rule for issuer: ${req.issuer.name}`);

    } catch (error) {
      logger.error('Delete social rule error:', error);

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete social rule'
      });
    }
  }

  async getDashboardStats(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
      const stats = await issuerDashboardService.getIssuerDashboardStats(req.issuer.id, days);

      res.json({
        success: true,
        issuerId: req.issuer.id,
        stats
      });

    } catch (error) {
      logger.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard statistics'
      });
    }
  }

  async getMints(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }
      const mints = await issuerDashboardService.getIssuerMints(req.issuer.id, parseInt(req.query.limit as string) || 1000);
      res.json({ success: true, mints });
    } catch (error) {
      logger.error('Get issuer mints error:', error);
      res.status(500).json({ success: false, error: 'Failed to get mints' });
    }
  }

  async getRuleTemplates(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const templates = await issuerDashboardService.getSocialRuleTemplates();

      res.json({
        success: true,
        templates
      });

    } catch (error) {
      logger.error('Get rule templates error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get rule templates'
      });
    }
  }

  async generateBadgeRules(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const badgeRules = await issuerDashboardService.generateBadgeRulesFromSocialRules(req.issuer.id);

      res.json({
        success: true,
        badgeRules
      });

    } catch (error) {
      logger.error('Generate badge rules error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate badge rules'
      });
    }
  }
}

export const issuerDashboardController = new IssuerDashboardController();