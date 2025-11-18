import { Request, Response } from 'express';
import { issuerService } from '../services/issuer.service';
import { logger } from '../utils/logger';
import { AuthenticatedIssuerRequest } from '../middleware/apiKey.middleware';
import { BadgeRules } from '../entities/BadgeType';

export class IssuerController {
  async registerIssuer(req: Request, res: Response) {
    try {
      const { name, wallet, description, website, contactEmail } = req.body;

      if (!name || !wallet) {
        return res.status(400).json({
          success: false,
          error: 'Name and wallet are required'
        });
      }

      const result = await issuerService.createIssuer(
        name,
        wallet,
        description,
        website,
        contactEmail
      );

      // IMPORTANT: Return API key only once during registration
      res.status(201).json({
        success: true,
        message: 'Issuer registered successfully',
        issuer: {
          id: result.issuer.id,
          name: result.issuer.name,
          wallet: result.issuer.wallet,
          description: result.issuer.description,
          website: result.issuer.website,
          contactEmail: result.issuer.contactEmail,
          createdAt: result.issuer.createdAt
        },
        apiKey: result.apiKey // Only returned once!
      });

      logger.info(`New issuer registered: ${name} (${wallet})`);

    } catch (error) {
      logger.error('Register issuer error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to register issuer'
      });
    }
  }

  async createBadgeType(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const {
        key,
        name,
        rules,
        description,
        imageUrl,
        metadataIpfs,
        isGlobal = false
      } = req.body;

      if (!key || !name || !rules) {
        return res.status(400).json({
          success: false,
          error: 'Key, name, and rules are required'
        });
      }

      // Validate rules structure - FIXED: Use static method
      if (!IssuerController.validateBadgeRules(rules)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid rules format'
        });
      }

      const badgeType = await issuerService.createBadgeType(
        req.issuer.id,
        key,
        name,
        rules,
        description,
        imageUrl,
        metadataIpfs,
        isGlobal
      );

      res.status(201).json({
        success: true,
        message: 'Badge type created successfully',
        badgeType: {
          id: badgeType.id,
          key: badgeType.key,
          name: badgeType.name,
          description: badgeType.description,
          imageUrl: badgeType.imageUrl,
          rules: badgeType.rules,
          metadataIpfs: badgeType.metadataIpfs,
          isGlobal: badgeType.isGlobal,
          isActive: badgeType.isActive,
          createdAt: badgeType.createdAt
        }
      });

      logger.info(`New badge type created: ${name} (${key}) by issuer: ${req.issuer.name}`);

    } catch (error) {
      logger.error('Create badge type error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create badge type'
      });
    }
  }

  async getIssuerBadges(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const badgeTypes = await issuerService.getIssuerBadgeTypes(req.issuer.id);

      res.json({
        success: true,
        badgeTypes: badgeTypes.map(badge => ({
          id: badge.id,
          key: badge.key,
          name: badge.name,
          description: badge.description,
          imageUrl: badge.imageUrl,
          rules: badge.rules,
          metadataIpfs: badge.metadataIpfs,
          isGlobal: badge.isGlobal,
          isActive: badge.isActive,
          createdAt: badge.createdAt,
          updatedAt: badge.updatedAt
        }))
      });

    } catch (error) {
      logger.error('Get issuer badges error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get badge types'
      });
    }
  }

  async updateBadgeType(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const { badgeTypeId } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated
      const { id, key, issuerId, ...allowedUpdates } = updates;

      const badgeType = await issuerService.updateBadgeType(badgeTypeId, allowedUpdates);

      res.json({
        success: true,
        message: 'Badge type updated successfully',
        badgeType: {
          id: badgeType.id,
          key: badgeType.key,
          name: badgeType.name,
          description: badgeType.description,
          imageUrl: badgeType.imageUrl,
          rules: badgeType.rules,
          metadataIpfs: badgeType.metadataIpfs,
          isGlobal: badgeType.isGlobal,
          isActive: badgeType.isActive,
          updatedAt: badgeType.updatedAt
        }
      });

      logger.info(`Badge type updated: ${badgeType.name} by issuer: ${req.issuer.name}`);

    } catch (error) {
      logger.error('Update badge type error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update badge type'
      });
    }
  }

  async rotateApiKey(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const result = await issuerService.rotateApiKey(req.issuer.id);

      res.json({
        success: true,
        message: 'API key rotated successfully',
        newApiKey: result.newApiKey // Only returned once after rotation
      });

      logger.info(`API key rotated for issuer: ${req.issuer.name}`);

    } catch (error) {
      logger.error('Rotate API key error:', error);
      
      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to rotate API key'
      });
    }
  }

  async getIssuerProfile(req: AuthenticatedIssuerRequest, res: Response) {
    try {
      if (!req.issuer) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const issuer = await issuerService.getIssuerByWallet(req.issuer.wallet);

      if (!issuer) {
        return res.status(404).json({
          success: false,
          error: 'Issuer not found'
        });
      }

      res.json({
        success: true,
        issuer: {
          id: issuer.id,
          name: issuer.name,
          wallet: issuer.wallet,
          description: issuer.description,
          website: issuer.website,
          contactEmail: issuer.contactEmail,
          isActive: issuer.isActive,
          createdAt: issuer.createdAt,
          updatedAt: issuer.updatedAt
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

  // FIXED: Make this a static method to avoid 'this' binding issues
  private static validateBadgeRules(rules: any): rules is BadgeRules {
    if (!rules.primary || !Array.isArray(rules.primary)) {
      return false;
    }

    if (!rules.secondary || !Array.isArray(rules.secondary)) {
      return false;
    }

    // Validate each secondary rule
    for (const rule of rules.secondary) {
      if (!rule.method || typeof rule.required !== 'boolean') {
        return false;
      }
    }

    return true;
  }
}

export const issuerController = new IssuerController();