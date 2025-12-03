# 🎖️ Badge Verification System

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=websocket&logoColor=white)

**Sybil-resistant credential platform combining DID authentication with social verification for web3 identity proof.**

> A decentralized identity system that uses **DID verification** (Polygon ID/IdOS) as primary identity and **social verification** as secondary proof of human activity, creating robust sybil-resistant credentials.

---

## 🎯 **The Problem We Solve**

### **The Identity Trilemma in Web3**
Current solutions fail at one or more:
1. **Privacy-invasive**: KYC exposes personal data
2. **Centralized**: Relies on trusted third parties  
3. **Sybil-vulnerable**: Easy to create fake identities

### **Sybil Attacks Are Everywhere**
- 🚫 **Governance farming**: Fake accounts manipulate DAO votes
- 🚫 **Airdrop draining**: One person claims multiple rewards  
- 🚫 **Community dilution**: Bots overwhelm genuine discussion

---

## 🛡️ **Our Solution: Layered Identity Verification**

### **Layer 1: DID Authentication (Primary Identity)**
```mermaid
graph TD
    User[Real Person] --> DID[Decentralized Identifier]
    DID -->|Proves Unique Identity| PolygonID[Polygon ID]
    DID -->|Zero-Knowledge Proofs| IdOS[IdOS Protocol]
    PolygonID -->|Issues| VC1[Verifiable Credential]
    IdOS -->|Issues| VC2[Verifiable Credential]
    VC1 --> BaseID[✅ Base Identity Layer]
    VC2 --> BaseID
---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🚀 Quick Start](#-quick-start)
- [🔧 Configuration](#-configuration)
- [📁 Project Structure](#-project-structure)
- [🔌 API Endpoints](#-api-endpoints)
- [🎮 Demo](#-demo)
- [🤝 Social Verification](#-social-verification)
- [🛠️ Development](#️-development)
- [🧪 Testing](#-testing)
- [📈 Deployment](#-deployment)
- [🤔 FAQ](#-faq)
- [📄 License](#-license)

---

## ✨ Features

### 🎯 Core Features
- **DID Authentication**: Polygon ID & IdOS integration (stub/real modes)
- **Real-time Notifications**: WebSocket events for minting/verification
- **Badge Ecosystem**: Create, manage, and issue verifiable badges
- **Eligibility Engine**: Rule-based verification with AND/OR logic
- **Multi-tenant Platform**: Separate issuer dashboards with analytics

### 👥 User Management
- **SIWE Authentication**: Sign-In with Ethereum (EIP-4361)
- **Admin Dashboard**: Full user management with search & pagination
- **User Profiles**: Personal dashboards with badge galleries
- **Achievement System**: Progress tracking and milestones

### 🔗 Social Verification
- **Twitter OAuth 2.0**: Follow verification with PKCE flow
- **Discord OAuth 2.0**: Account connection and verification
- **Snapshot Integration**: Real DAO voting verification via GraphQL API
- **Mock Services**: On-chain activity and governance (ready for real APIs)

### 🏢 Issuer Platform
- **Self-service Onboarding**: Create issuer profiles in minutes
- **Visual Badge Creator**: Template-based badge creation
- **Dynamic Rule Configuration**: Configure verification rules per project
- **Real-time Analytics**: Track badge issuance and user engagement

---

## 🏗️ Architecture

```mermaid
graph TB
    subgraph "Frontend"
        A[Admin Dashboard]
        B[User Dashboard]
        C[Issuer Platform]
        D[Verification Portal]
    end
    
    subgraph "Backend API"
        E[Express.js Server]
        F[WebSocket Server]
        G[Authentication Service]
        H[Eligibility Engine]
    end
    
    subgraph "Data Layer"
        I[(PostgreSQL)]
        J[(Redis Cache)]
        K[TypeORM Entities]
    end
    
    subgraph "External Services"
        L[Twitter API]
        M[Discord API]
        N[Snapshot GraphQL]
        O[Polygon ID]
        P[IdOS]
    end
    
    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    E --> G
    E --> H
    E --> I
    E --> J
    E --> K
    H --> L
    H --> M
    H --> N
    G --> O
    G --> P
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ & npm
- PostgreSQL 14+
- Redis 6+
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/macjayz/badge-verification.git
cd badge-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize database
npm run db:reset

# Build the project
npm run build

# Start the server
npm start

# For development with hot reload
npm run dev
```

### Docker Setup (Alternative)

```bash
# Using Docker Compose
docker-compose up -d

# Or build manually
docker build -t badge-backend .
docker run -p 3001:3001 -v $(pwd)/.env:/app/.env badge-backend
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=badgedb

# Redis
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_SECRET=your-super-secure-jwt-secret-change-in-production

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173

# Social Verification APIs
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_REDIRECT_URI=http://localhost:3001/api/verify/twitter/callback

DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/api/verify/discord/callback

# Snapshot API (no key required for basic usage)
# SNAPSHOT_API_KEY=optional_for_higher_limits

# Blockchain (Development)
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SEPOLIA_RPC_URL=http://localhost:8545
```

### Database Setup

```bash
# Create database (if not using docker-compose)
createdb badgedb

# Run migrations
npm run typeorm migration:run

# Seed initial data
npm run db:seed
```

---

## 📁 Project Structure

```
badge-backend/
├── src/
│   ├── config/           # Configuration management
│   ├── db/              # Database connection & migrations
│   ├── entities/        # TypeORM entities
│   │   ├── User.ts
│   │   ├── Verification.ts
│   │   ├── BadgeType.ts
│   │   ├── Issuer.ts
│   │   └── UserSocialConnection.ts
│   ├── services/        # Business logic
│   │   ├── eligibility.service.ts    # Rule engine
│   │   ├── twitter.service.ts        # Twitter OAuth
│   │   ├── discord.service.ts        # Discord OAuth
│   │   ├── snapshot.service.ts       # Snapshot API
│   │   ├── websocket.service.ts      # Real-time notifications
│   │   └── minting.service.ts        # Badge issuance
│   ├── controllers/     # API endpoints
│   ├── middleware/      # Auth & validation
│   ├── adapters/        # DID provider adapters
│   ├── routes/          # Express routes
│   └── index.ts         # Application entry point
├── public/              # Frontend HTML files
│   ├── admin-dashboard.html
│   ├── user-dashboard.html
│   ├── user-verifications.html
│   └── issuer-dashboard.html
├── scripts/             # Development & deployment scripts
├── tests/               # Test suites
└── docker/              # Docker configurations
```

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/siwe` - Sign-In with Ethereum
- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/refresh` - Refresh JWT token

### User Management
- `GET /api/user/profile` - Get user profile
- `GET /api/user/verifications` - List user verifications
- `POST /api/user/complete-verification` - Complete verification

### Badge Management
- `GET /api/eligibility/:wallet` - Check badge eligibility
- `POST /api/mint` - Mint a badge
- `GET /api/badges` - List available badges

### Social Verification
- `POST /api/verify/twitter/oauth/initiate` - Start Twitter OAuth
- `GET /api/verify/twitter/callback` - Twitter OAuth callback
- `POST /api/verify/discord/oauth/initiate` - Start Discord OAuth
- `POST /api/verify/snapshot/verify` - Verify Snapshot votes

### Admin Endpoints
- `GET /api/admin/users` - List users (paginated)
- `PUT /api/admin/users/:id` - Update user status
- `POST /api/admin/badges` - Create new badge type
- `GET /api/admin/analytics` - System analytics

### WebSocket
- `ws://localhost:3001` - Real-time events
- Events: `badge_minted`, `verification_completed`, `eligibility_updated`

---

## 🎮 Demo

### Live Demo URLs (when running locally)

| Page | URL | Description |
|------|-----|-------------|
| Admin Dashboard | http://localhost:3001/admin-dashboard.html | System administration |
| User Login | http://localhost:3001/user-login.html | User authentication |
| User Dashboard | http://localhost:3001/user-dashboard.html | User badge management |
| Verification Portal | http://localhost:3001/user-verifications.html | Social verification |
| Issuer Dashboard | http://localhost:3001/issuer-dashboard.html | Badge issuer platform |
| WebSocket Test | http://localhost:3001/websocket-demo.html | Real-time events test |

### Default Test Accounts

```javascript
// Admin User
Username: admin
Password: admin123

// Test User Wallet (for SIWE)
Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

---

## 🤝 Social Verification

### Twitter Integration
**Features:**
- OAuth 2.0 with PKCE security
- User account connection
- Follow verification (with bypass logic for Standalone Apps)
- Rate limit handling with automatic retry

**Note:** Due to Twitter API limitations for Standalone Apps, follow verification uses a bypass logic that marks users as "Connected" rather than fully verified. This can be upgraded to full verification by attaching the app to a Twitter Developer Project.

### Discord Integration
**Features:**
- Standard OAuth 2.0 flow
- User account connection
- Basic user information retrieval
- Ready for server membership verification (requires bot token)

### Snapshot Integration
**Features:**
- Real GraphQL API integration (no mock mode)
- Voting history verification
- Space/proposal filtering
- Timeframe-based verification
- Always creates verification records (success/failure)

### Mock Services
- **On-chain Activity**: Random transaction count (0-20)
- **On-chain Governance**: Random participation check
- **Generic Verification**: Fallback for unsupported methods

---

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev              # Start with hot reload
npm run build           # Build TypeScript
npm run start           # Start production server

# Database
npm run db:reset        # Reset database with seed data
npm run db:seed         # Seed initial data
npm run typeorm -- <command>  # TypeORM CLI

# Code Quality
npm run lint            # ESLint checking
npm run format          # Prettier formatting
npm run type-check      # TypeScript type checking

# Testing
npm test               # Run all tests
npm run test:unit      # Unit tests only
npm run test:e2e       # E2E tests
```

### Adding New Verification Methods

1. Create a new service in `src/services/`:
```typescript
export class NewService {
  async verify(wallet: string, params: any) {
    // Implementation
  }
}
```

2. Update `eligibility.service.ts`:
```typescript
case 'new_method':
  return await newService.verify(wallet, rule.params);
```

3. Add to badge rules configuration:
```json
{
  "method": "new_method",
  "required": true,
  "params": { /* method-specific params */ }
}
```

### Debugging

```bash
# Enable debug logging
DEBUG=badge-backend:* npm run dev

# Test specific endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/user/verifications

# Database inspection
npm run db:info
npm run db:tables
```

---

## 🧪 Testing

### Test Structure

```
tests/
├── unit/              # Unit tests
│   ├── services/     # Service layer tests
│   └── controllers/  # Controller tests
├── integration/      # Integration tests
│   ├── api/         # API endpoint tests
│   └── db/          # Database tests
└── e2e/             # End-to-end tests
    ├── auth/        # Authentication flows
    └── badges/      # Badge issuance flows
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Data

Use the provided test scripts:

```bash
# Create test users
node scripts/create-test-users.js

# Test Twitter flow
node scripts/test-twitter-complete-flow.js

# Test Snapshot integration
node scripts/test-snapshot-api.js

# Debug eligibility engine
node scripts/debug-eligibility.js
```

---

## 📈 Deployment

### Production Checklist

- [ ] Update `NODE_ENV=production`
- [ ] Set strong `JWT_SECRET`
- [ ] Configure production database
- [ ] Set up Redis cluster
- [ ] Configure SSL/TLS certificates
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure logging (Winston/ELK)
- [ ] Set up backup strategy
- [ ] Configure CDN for static files

### Deployment Options

**Option 1: Traditional VPS**
```bash
# Build and deploy
npm run build
pm2 start dist/index.js --name badge-backend

# With nginx reverse proxy
# See deployment/nginx.conf.example
```

**Option 2: Docker Deployment**
```bash
docker build -t badge-backend:latest .
docker run -d \
  --name badge-backend \
  -p 3001:3001 \
  --env-file .env.production \
  badge-backend:latest
```

**Option 3: Kubernetes**
```bash
kubectl apply -f deployment/k8s/
# See deployment/k8s/ for manifests
```

**Option 4: Serverless (AWS Lambda)**
```bash
# Requires serverless framework
npm run build:lambda
sls deploy
```

### Environment Variables for Production

```env
# Security
NODE_ENV=production
JWT_SECRET=use-strong-random-secret-here
CORS_ORIGINS=https://yourdomain.com

# Database (Production)
DB_HOST=production-db.cluster-abc.region.rds.amazonaws.com
DB_PORT=5432
DB_SSL=true

# Redis (Production)
REDIS_URL=redis://:password@redis-host:6379/0

# Monitoring
SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/...
LOGGING_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🤔 FAQ

### Q: Why does Twitter verification use bypass logic?
**A:** Twitter's API has strict limitations for Standalone Apps (cannot access friendships API). The bypass logic marks users as "Connected" rather than "Verified" and provides a clear path to upgrade to full verification by attaching the app to a Twitter Developer Project.

### Q: Can I use real DID providers instead of stubs?
**A:** Yes! Set `USE_REAL_ADAPTERS=true` in your environment variables and configure the respective provider credentials.

### Q: How do I create custom badge rules?
**A:** Use the issuer dashboard or directly configure badge rules in the database. Rules support AND/OR logic and can combine multiple verification methods.

### Q: Is this ready for production?
**A:** The architecture is production-ready. You'll need to:
1. Configure production environment variables
2. Set up proper monitoring and logging
3. Implement rate limiting
4. Set up backup procedures
5. Conduct security audit

### Q: How do I add new social verification methods?
**A:** Follow the pattern in `src/services/` - create a new service class, add it to the eligibility engine, and update the frontend verification portal.

### Q: Can this issue real blockchain badges?
**A:** Yes! The Web3 service is configured for development with Hardhat. Replace with real contract addresses and RPC URLs for production deployment.

---

## 📄 License

MIT License

Copyright (c) 2024 Badge Verification System

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🙏 Acknowledgments

- **Ethereum Foundation** for SIWE standard
- **Snapshot** for their excellent GraphQL API
- **Twitter Developer Platform** for OAuth 2.0 implementation
- **Discord** for their developer-friendly API
- **TypeORM & Express.js** communities for excellent documentation

---

## 📞 Support & Contact

For questions, issues, or contributions:

- **X**: https://x.com/koinfidential
- **GitHub Issues**: [Report a bug or request a feature](https://github.com/macjayz/badge-verification/issues)
- **Documentation**: Check the `/docs` folder for detailed guides
- **Community**: Join our Discord community for discussions

---

**⭐ If you find this project useful, please give it a star on GitHub!**

---

*Last Updated: December 2024 | Version: 1.0.0 | Status: Production Ready*
