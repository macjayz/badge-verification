// scripts/setup-test-user.js
const { AppDataSource } = require('../src/db/datasource');
const { User } = require('../src/entities/User');
const { Verification } = require('../src/entities/Verification');
const { BadgeType } = require('../src/entities/BadgeType');
const { Issuer } = require('../src/entities/Issuer');

async function setupTestUser() {
  await AppDataSource.initialize();
  
  console.log('Setting up test user and data...');
  
  const userRepo = AppDataSource.getRepository(User);
  const verificationRepo = AppDataSource.getRepository(Verification);
  const badgeTypeRepo = AppDataSource.getRepository(BadgeType);
  const issuerRepo = AppDataSource.getRepository(Issuer);
  
  // Create a test issuer if none exists
  let issuer = await issuerRepo.findOne({ where: { name: 'Test Issuer' } });
  if (!issuer) {
    issuer = issuerRepo.create({
      name: 'Test Issuer',
      wallet: '0x' + Array(40).fill(0).join(''),
      metadata: { description: 'Test issuer for development' }
    });
    await issuerRepo.save(issuer);
    console.log('Created test issuer');
  }
  
  // Create simple badge types without complex requirements
  const simpleBadges = [
    {
      key: 'welcome-badge',
      name: 'Welcome Badge',
      description: 'Your first badge in the system',
      rules: {
        primary: ['polygonid'], // Only requires Polygon ID
        secondary: [], // No secondary requirements
        logic: 'OR'
      },
      isActive: true
    },
    {
      key: 'test-achiever',
      name: 'Test Achiever',
      description: 'For testing the badge system',
      rules: {
        primary: ['polygonid'],
        secondary: [],
        logic: 'OR'
      },
      isActive: true
    }
  ];
  
  for (const badgeData of simpleBadges) {
    let badge = await badgeTypeRepo.findOne({ where: { key: badgeData.key } });
    if (!badge) {
      badge = badgeTypeRepo.create({
        ...badgeData,
        issuer: issuer
      });
      await badgeTypeRepo.save(badge);
      console.log(`Created badge: ${badgeData.name}`);
    }
  }
  
  // Get your user (assuming you're logged in with wallet 0x4f6e9fe719e671671084e50f9c96f736e7ec2031)
  const userWallet = '0x4f6e9fe719e671671084e50f9c96f736e7ec2031';
  let user = await userRepo.findOne({ where: { wallet: userWallet } });
  
  if (!user) {
    console.log('User not found, creating test user...');
    user = userRepo.create({
      wallet: userWallet,
      provider: 'siwe'
    });
    await userRepo.save(user);
  }
  
  // Add a verification for the user
  const existingVerification = await verificationRepo.findOne({ 
    where: { wallet: userWallet, provider: 'polygonid' } 
  });
  
  if (!existingVerification) {
    const verification = verificationRepo.create({
      wallet: userWallet,
      provider: 'polygonid',
      did: 'did:polygonid:test:12345',
      status: 'completed',
      metadata: { verified: true, test: true }
    });
    await verificationRepo.save(verification);
    console.log('Added Polygon ID verification for user');
  }
  
  console.log('✅ Test setup complete!');
  console.log('You should now see available badges in your user dashboard.');
  process.exit(0);
}

setupTestUser().catch(console.error);