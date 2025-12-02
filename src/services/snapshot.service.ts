// src/services/snapshot.service.ts - FIXED VERSION
import { AppDataSource } from '../db/datasource';
import { UserSocialConnection } from '../entities/UserSocialConnection';
import { Verification, VerificationStatus, VerificationType } from '../entities/Verification';
import { logger } from '../utils/logger';
import axios from 'axios';

const socialConnectionRepository = AppDataSource.getRepository(UserSocialConnection);

export interface SnapshotSpace {
  id: string;
  name: string;
  network: string;
  symbol: string;
  strategies: any[];
}

export interface SnapshotProposal {
  id: string;
  title: string;
  space: SnapshotSpace;
  created: number;
  start: number;
  end: number;
  state: string;
}

export interface SnapshotVote {
  id: string;
  voter: string;
  created: number;
  proposal: SnapshotProposal;
  choice: number | number[] | string;
  space: SnapshotSpace;
}

export interface SnapshotUser {
  id: string;
  wallet: string;
  votes: SnapshotVote[];
  spaces: Record<string, number>; // spaceId -> vote count
}

export class SnapshotService {
  private readonly baseURL = 'https://hub.snapshot.org/graphql';
  private readonly apiKey = process.env.SNAPSHOT_API_KEY;

  /**
   * Initiate Snapshot verification flow (wallet-based, no OAuth needed)
   */
  async initiateVerification(wallet: string): Promise<{
    verificationId: string;
    message: string;
  }> {
    try {
      logger.info(`Initiating Snapshot verification for wallet: ${wallet}`);
      
      const verificationId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        verificationId,
        message: 'Snapshot verification ready - checking voting activity'
      };
    } catch (error) {
      logger.error('Snapshot verification initiation error:', error);
      throw new Error(`Failed to initiate Snapshot verification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check wallet's voting activity on Snapshot
   */
  async verifyWallet(
    wallet: string,
    params?: {
      minVotes?: number;
      spaceId?: string;
      timeRange?: { from: number; to: number };
      proposalId?: string;
    }
  ): Promise<{
    verified: boolean;
    details: any;
  }> {
    try {
      logger.info(`Verifying Snapshot votes for wallet: ${wallet}`, { params });

      // ✅ SIMPLE, WORKING QUERY
      const query = `
        query Votes($voter: String!, $first: Int!, $skip: Int, $orderBy: String) {
          votes(
            first: $first
            skip: $skip
            where: { voter: $voter }
            orderBy: $orderBy
            orderDirection: desc
          ) {
            id
            voter
            created
            proposal {
              id
              title
              space {
                id
                name
                network
                symbol
              }
            }
            choice
          }
        }
      `;

      const variables = {
        voter: wallet.toLowerCase(),
        first: 1000,
        skip: 0,
        orderBy: 'created',
      };

      console.log('Executing Snapshot GraphQL query...');
      
      const response = await axios.post(
        this.baseURL,
        { query, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'x-api-key': this.apiKey }),
          },
        }
      );

      if (response.data.errors) {
        const errorMsg = response.data.errors[0]?.message || 'Unknown GraphQL error';
        throw new Error(`Snapshot API error: ${errorMsg}`);
      }

      const votes: SnapshotVote[] = response.data.data?.votes || [];
      const totalVotes = votes.length;
      console.log(`Found ${totalVotes} votes for wallet ${wallet}`);

      // Filter by space if needed (client-side filtering)
      let filteredVotes = votes;
      if (params?.spaceId) {
        filteredVotes = votes.filter(vote => vote.proposal.space.id === params.spaceId);
      }

      // Filter by timeframe if needed
      if (params?.timeRange) {
        filteredVotes = filteredVotes.filter(vote => 
          vote.created >= params.timeRange!.from && vote.created <= params.timeRange!.to
        );
      }

      // Filter by proposal if needed
      if (params?.proposalId) {
        filteredVotes = filteredVotes.filter(vote => vote.proposal.id === params.proposalId);
      }

      // ✅ FIXED: Calculate votes per space with proper typing
      const spaceVotes: Record<string, { id: string; name: string; votes: number }> = {};
      filteredVotes.forEach(vote => {
        const space = vote.proposal.space; // This is already typed as SnapshotSpace
        if (!spaceVotes[space.id]) {
          spaceVotes[space.id] = {
            id: space.id,
            name: space.name,
            votes: 0
          };
        }
        spaceVotes[space.id].votes++;
      });

      // Check verification criteria
      const minVotes = params?.minVotes || 1;
      const votesInSpace = params?.spaceId ? filteredVotes.length : undefined;
      
      let verified = true;
      let message = '';

      if (filteredVotes.length < minVotes) {
        verified = false;
        message = `Insufficient votes. Required: ${minVotes}, Found: ${filteredVotes.length}`;
      }

      if (params?.spaceId && votesInSpace === 0) {
        verified = false;
        message = `No votes found in space: ${params.spaceId}`;
      }

      if (params?.proposalId && !filteredVotes.some(v => v.proposal.id === params.proposalId)) {
        verified = false;
        message = `No vote found for proposal: ${params.proposalId}`;
      }

      await this.createSnapshotVerification(wallet, filteredVotes, spaceVotes, verified);

      return {
        verified,
        details: {
          wallet,
          totalVotes: filteredVotes.length,
          votesInSpace,
          spaceVotes: Object.values(spaceVotes).reduce((acc, space) => {
            acc[space.id] = space.votes;
            return acc;
          }, {} as Record<string, number>),
          proposals: filteredVotes.map(v => v.proposal.id),
          message: verified 
            ? `Successfully verified ${filteredVotes.length} votes across ${Object.keys(spaceVotes).length} spaces` 
            : message,
          checkedAt: new Date().toISOString(),
          spaces: spaceVotes,
        },
      };

    } catch (error) {
      logger.error('Snapshot verification error:', error);
      
      let errorMessage = 'Unknown error';
      if (axios.isAxiosError(error)) {
        if (error.response) {
          errorMessage = `Snapshot API error: ${error.response.status}`;
          if (error.response.data?.errors) {
            errorMessage += ` - ${JSON.stringify(error.response.data.errors)}`;
          }
        } else if (error.request) {
          errorMessage = 'No response from Snapshot API';
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      return {
        verified: false,
        details: {
          wallet,
          totalVotes: 0,
          message: errorMessage,
          checkedAt: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Create Snapshot verification record
   */
  /**
 * Create Snapshot verification record
 */
  private async createSnapshotVerification(
    wallet: string,
    votes: SnapshotVote[],
    spaces: Record<string, { id: string; name: string; votes: number }>,
    verified: boolean // Add this parameter
  ): Promise<void> {
    try {
      const verificationRepository = AppDataSource.getRepository(Verification);
      
      const verificationDetails = {
        wallet,
        totalVotes: votes.length,
        spaces: Object.values(spaces),
        lastVote: votes.length > 0 ? new Date(votes[0].created * 1000).toISOString() : null,
        firstVote: votes.length > 0 ? new Date(votes[votes.length - 1].created * 1000).toISOString() : null,
        spacesParticipated: Object.keys(spaces),
        checkedAt: new Date().toISOString(),
        verified: verified // Add verification status
      };
  
      // Check if verification already exists
      let verification = await verificationRepository.findOne({
        where: { 
          wallet: wallet,
          provider: 'snapshot_votes'
        }
      });
  
      if (verification) {
        // Update existing verification
        verification.status = verified ? VerificationStatus.COMPLETED : VerificationStatus.FAILED;
        verification.did = `did:snapshot:${wallet}`;
        verification.metadata = verificationDetails;
        verification.verificationId = `snapshot_${wallet}_${Date.now()}`;
        verification.completedAt = new Date();
        verification.updatedAt = new Date();
        
        if (!verified) {
          verification.errorMessage = 'Insufficient Snapshot votes';
        }
      } else {
        // Create new verification
        verification = verificationRepository.create({
          wallet: wallet,
          provider: 'snapshot_votes',
          type: VerificationType.SECONDARY,
          status: verified ? VerificationStatus.COMPLETED : VerificationStatus.FAILED,
          did: `did:snapshot:${wallet}`,
          metadata: verificationDetails,
          verificationId: `snapshot_${wallet}_${Date.now()}`,
          completedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        if (!verified) {
          verification.errorMessage = 'Insufficient Snapshot votes';
        }
      }
  
      await verificationRepository.save(verification);
      logger.info(`Created Snapshot verification for wallet: ${wallet} (verified: ${verified})`);
      
    } catch (error) {
      logger.error('Failed to create Snapshot verification record:', error);
    }
  }

  /**
   * Check specific vote requirements - FIXED TO ALWAYS RETURN FALSE ON ERROR
   */
  async checkVoteRequirements(
    wallet: string,
    requirements: {
      spaceId?: string;
      minVotes?: number;
      proposalId?: string;
      timeframe?: { days: number }; // e.g., { days: 30 } for last 30 days
    }
  ): Promise<{ meetsRequirements: boolean; details: any }> {
    try {
      const timeRange = requirements.timeframe 
        ? {
            from: Math.floor((Date.now() - requirements.timeframe.days * 24 * 60 * 60 * 1000) / 1000),
            to: Math.floor(Date.now() / 1000)
          }
        : undefined;

      console.log(`[SNAPSHOT] Checking requirements for ${wallet}:`, requirements);
      
      const result = await this.verifyWallet(wallet, {
        minVotes: requirements.minVotes,
        spaceId: requirements.spaceId,
        proposalId: requirements.proposalId,
        timeRange,
      });

      console.log(`[SNAPSHOT] Result for ${wallet}:`, {
        verified: result.verified,
        totalVotes: result.details.totalVotes,
        message: result.details.message
      });

      // ✅ CRITICAL: If API error, return false
      if (!result.verified && result.details.message?.includes('Snapshot API error')) {
        console.log(`[SNAPSHOT] API error detected, returning false`);
        return {
          meetsRequirements: false,
          details: {
            ...result.details,
            apiError: true,
            requirement: 'Snapshot voting verification temporarily unavailable'
          }
        };
      }

      return {
        meetsRequirements: result.verified,
        details: result.details,
      };
    } catch (error) {
      console.error('[SNAPSHOT] Error checking vote requirements:', error);
      return {
        meetsRequirements: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          wallet,
          checkedAt: new Date().toISOString(),
          apiError: true
        },
      };
    }
  }
}

export const snapshotService = new SnapshotService();