import { badgeRulesProblem } from './rule-support';

describe('badgeRulesProblem', () => {
  it('accepts rules the engine can check', () => {
    expect(badgeRulesProblem({
      primary: ['privadoid'],
      secondary: [{ method: 'discord_member', params: { serverId: '1' }, required: true }],
    })).toBeNull();
  });

  it('accepts badges with no requirements and the old Polygon ID name', () => {
    expect(badgeRulesProblem({ primary: [], secondary: [] })).toBeNull();
    expect(badgeRulesProblem({ primary: ['polygonid'] })).toBeNull();
  });

  it.each([
    [{ primary: ['idos'], secondary: [] }, /identity provider "idos"/],
    [{ primary: [], secondary: [{ method: 'github_contributor', required: true }] }, /github_contributor/],
    [{ primary: [], secondary: [{ method: 'onchain_governance', required: false }] }, /onchain_governance/],
    [{ secondary: [] }, /primary/],
  ])('rejects rules nobody could ever meet: %j', (rules, message) => {
    expect(badgeRulesProblem(rules)).toMatch(message);
  });
});
