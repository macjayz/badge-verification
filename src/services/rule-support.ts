/**
 * What the eligibility engine can actually check. Badge rules are validated against these lists
 * when they are saved, so an issuer cannot create a badge nobody can ever earn.
 */
export const SUPPORTED_DID_PROVIDERS = ['privadoid', 'polygonid'];
export const SUPPORTED_RULE_METHODS = ['twitter_follow', 'discord_member', 'snapshot_votes', 'onchain_activity'];

/** Returns why the rules cannot be used, or null when they can. */
export function badgeRulesProblem(rules: any): string | null {
  if (!rules || !Array.isArray(rules.primary)) {
    return 'rules.primary must be an array of DID providers';
  }
  const secondary = rules.secondary ?? [];
  if (!Array.isArray(secondary)) {
    return 'rules.secondary must be an array';
  }
  const badProvider = rules.primary.find((p: unknown) => !SUPPORTED_DID_PROVIDERS.includes(String(p).toLowerCase()));
  if (badProvider !== undefined) {
    return `Unsupported identity provider "${badProvider}". Supported: privadoid`;
  }
  for (const rule of secondary) {
    if (!rule || !SUPPORTED_RULE_METHODS.includes(rule.method)) {
      return `Unsupported rule "${rule?.method}". Supported: ${SUPPORTED_RULE_METHODS.join(', ')}`;
    }
    if (rule.required !== undefined && typeof rule.required !== 'boolean') {
      return `rule "${rule.method}": required must be true or false`;
    }
  }
  return null;
}
