/**
 * Rule-combination logic for badge eligibility.
 *
 * evaluatePrimaryLogic / evaluateSecondaryLogic are private, so these tests
 * reach them through the instance. They are pure functions with no database
 * access, which is why they can be tested directly.
 */
import { EligibilityService } from './eligibility.service';

jest.mock('../db/datasource', () => ({
  AppDataSource: { getRepository: jest.fn(() => ({})) },
}));
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
