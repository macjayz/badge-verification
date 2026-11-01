/**
 * Rule-combination logic for badge eligibility.
 *
 * evaluatePrimaryLogic / evaluateSecondaryLogic are private, so these tests
 * reach them through the instance. They are pure functions with no database
 * access, which is why they can be tested directly.
 */
import { EligibilityService } from './eligibility.service';
import { discordService } from './discord.service';
import { web3Service } from './web3.service';

jest.mock('../db/datasource', () => ({
  AppDataSource: { getRepository: jest.fn(() => ({})) },
}));
jest.mock('./discord.service', () => ({ discordService: { verifyServerMembership: jest.fn() } }));
jest.mock('./web3.service', () => ({ web3Service: { getTransactionCount: jest.fn() } }));
jest.mock('./twitter.service', () => ({ twitterService: { verifyFollow: jest.fn() } }));
jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

type PrimaryResult = { provider: string; verified: boolean };
type SecondaryResult = { method: string; verified: boolean; required?: boolean };

const service = new EligibilityService();
const primary = (results: PrimaryResult[], logic?: 'AND' | 'OR'): boolean =>
  (service as any).evaluatePrimaryLogic(results, logic);
const secondary = (results: SecondaryResult[], logic?: 'AND' | 'OR'): boolean =>
  (service as any).evaluateSecondaryLogic(results, logic);

describe('primary (DID) requirements', () => {
  const verified = { provider: 'privado', verified: true };
  const failed = { provider: 'idos', verified: false };

  it('passes a badge with no DID requirement at all', () => {
    expect(primary([])).toBe(true);
  });

  it('OR: one verified provider is enough', () => {
    expect(primary([verified, failed], 'OR')).toBe(true);
  });

  it('OR: fails only when every provider fails', () => {
    expect(primary([failed, { provider: 'privado', verified: false }], 'OR')).toBe(false);
  });

  it('AND: every provider must verify', () => {
    expect(primary([verified, failed], 'AND')).toBe(false);
    expect(primary([verified, { provider: 'idos', verified: true }], 'AND')).toBe(true);
  });

  it('defaults to OR when no logic is given', () => {
    expect(primary([verified, failed])).toBe(true);
  });
});

describe('secondary (social) requirements', () => {
  const passed = { method: 'twitter_follow', verified: true, required: true };
  const failed = { method: 'discord_member', verified: false, required: true };
  const optionalFail = { method: 'snapshot_vote', verified: false, required: false };

  it('passes a badge with no social requirement', () => {
    expect(secondary([])).toBe(true);
  });

  it('defaults to AND, unlike primary requirements', () => {
    expect(secondary([passed, failed])).toBe(false);
  });

  it('AND: every required check must pass', () => {
    expect(secondary([passed, failed], 'AND')).toBe(false);
    expect(secondary([passed, { ...failed, verified: true }], 'AND')).toBe(true);
  });

  it('OR: one required check passing is enough', () => {
    expect(secondary([passed, failed], 'OR')).toBe(true);
  });

  it('ignores optional checks that fail', () => {
    expect(secondary([passed, optionalFail], 'AND')).toBe(true);
  });

  it('passes when every check is optional, even if all fail', () => {
    expect(secondary([optionalFail, { ...optionalFail, method: 'other' }], 'AND')).toBe(true);
  });

  it('treats a missing "required" flag as required', () => {
    expect(secondary([{ method: 'twitter_follow', verified: false }], 'AND')).toBe(false);
  });
});

describe('individual social checks', () => {
  const wallet = '0x' + 'a'.repeat(40);
  const check = (method: string, params?: any) =>
    (service as any).verifySecondaryRule(wallet, { method, params });

  it('never passes a method this server cannot check', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await check('onchain_governance')).verified).toBe(false);
    }
  });

  it('fails a Discord rule that names no server instead of guessing', async () => {
    expect((await check('discord_member', {})).verified).toBe(false);
    expect(discordService.verifyServerMembership).not.toHaveBeenCalled();
  });

  it('asks Discord for membership of the configured server', async () => {
    (discordService.verifyServerMembership as jest.Mock).mockResolvedValue({ verified: true, details: {} });
    expect((await check('discord_member', { serverId: '42' })).verified).toBe(true);
    expect(discordService.verifyServerMembership).toHaveBeenCalledWith(wallet, '42');
  });

  it('counts real transactions for on-chain activity', async () => {
    (web3Service.getTransactionCount as jest.Mock).mockResolvedValue(3);
    expect((await check('onchain_activity', { minTransactions: 3 })).verified).toBe(true);
    expect((await check('onchain_activity', { minTransactions: 4 })).verified).toBe(false);
  });

  it('fails closed when the chain cannot be reached', async () => {
    (web3Service.getTransactionCount as jest.Mock).mockRejectedValue(new Error('RPC down'));
    const result = await check('onchain_activity', { minTransactions: 1 });
    expect(result.verified).toBe(false);
    expect(result.details.apiError).toBe(true);
  });
});
