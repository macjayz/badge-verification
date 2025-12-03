import { AppDataSource } from '../src/db/datasource';
import { Issuer } from '../src/entities/Issuer';
import { BadgeType } from '../src/entities/BadgeType';
import { ProjectSocialRules } from '../src/entities/ProjectSocialRules';
import { Verification } from '../src/entities/Verification';

async function checkIssuerData() {
  console.log('🔍 Checking issuer database data...\n');
  
  await AppDataSource.initialize();
  
  const issuerRepository = AppDataSource.getRepository(Issuer);
  const badgeTypeRepository = AppDataSource.getRepository(BadgeType);
  const socialRulesRepository = AppDataSource.getRepository(ProjectSocialRules);
  const verificationRepository = AppDataSource.getRepository(Verification);
  
  // 1. Check all issuers
  console.log('📋 ====== ALL ISSUERS ======');
  const issuers = await issuerRepository.find();
  console.log(`Total issuers: ${issuers.length}`);
  issuers.forEach(issuer => {
    console.log(`- ID: ${issuer.id}`);
    console.log(`  Name: ${issuer.name}`);
    console.log(`  Description: ${issuer.description || 'N/A'}`);
    console.log(`  Created: ${issuer.createdAt}`);
    console.log(`  API Key: ${issuer.apiKey ? 'Yes' : 'No'}`);
    console.log('');
  });
  
  // 2. Check badge types (especially issuer-specific ones)
  console.log('🎖️ ====== ALL BADGE TYPES ======');
  const badges = await badgeTypeRepository.find();
  console.log(`Total badges: ${badges.length}`);
  badges.forEach(badge => {
    console.log(`- ID: ${badge.id}`);
    console.log(`  Key: ${badge.key}`);
    console.log(`  Name: ${badge.name}`);
    console.log(`  Description: ${badge.description}`);
    console.log(`  Issuer ID: ${badge.issuerId || 'Global (no issuer)'}`);
    console.log(`  Eligibility Rule: ${badge.eligibilityRule || 'N/A'}`);
    console.log('');
  });
  
  // 3. Check social verification rules
  console.log('🔐 ====== SOCIAL VERIFICATION RULES ======');
  const socialRules = await socialRulesRepository.find();
  console.log(`Total social rules: ${socialRules.length}`);
  socialRules.forEach(rule => {
    console.log(`- ID: ${rule.id}`);
    console.log(`  Issuer ID: ${rule.issuerId}`);
    console.log(`  Rule Type: ${rule.ruleType}`);
    console.log(`  Name: ${rule.name}`);
    console.log(`  Parameters: ${JSON.stringify(rule.parameters)}`);
    console.log(`  Is Required: ${rule.isRequired}`);
    console.log('');
  });
  
  // 4. Check verification records
  console.log('✅ ====== VERIFICATION RECORDS ======');
  const verifications = await verificationRepository.find({
    take: 20 // Limit to first 20
  });
  console.log(`Total verifications: ${await verificationRepository.count()}`);
  console.log(`Sample of 20 records:`);
  verifications.forEach(verification => {
    console.log(`- ID: ${verification.id}`);
    console.log(`  Wallet: ${verification.wallet}`);
    console.log(`  Provider: ${verification.provider}`);
    console.log(`  Type: ${verification.type}`);
    console.log(`  Status: ${verification.status}`);
    console.log(`  Issuer in Metadata: ${verification.metadata ? (JSON.parse(verification.metadata as string)?.issuerId || 'None') : 'None'}`);
    console.log('');
  });
  
  // 5. Summary
  console.log('📊 ====== SUMMARY ======');
  console.log(`Issuers with badges: ${badges.filter(b => b.issuerId).length}`);
  console.log(`Issuers with social rules: ${socialRules.filter(r => r.issuerId).length}`);
  
  const issuersWithData = new Set([
    ...badges.filter(b => b.issuerId).map(b => b.issuerId),
    ...socialRules.filter(r => r.issuerId).map(r => r.issuerId)
  ]);
  
  console.log(`\nIssuers with any data:`);
  Array.from(issuersWithData).forEach(issuerId => {
    const issuer = issuers.find(i => i.id === issuerId);
    console.log(`- ${issuerId} ${issuer ? `(${issuer.name})` : ''}`);
  });
  
  await AppDataSource.destroy();
  console.log('\n✅ Database check complete!');
}

checkIssuerData().catch(console.error);