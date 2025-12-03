Excellent idea! I'll add proper anchor links to the table of contents. Here's the updated README with working internal links:

```markdown
# 🎖️ Badge Verification System

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=websocket&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

A **complete badge verification backend system** with DID authentication, real-time WebSocket notifications, social verification integrations, and multi-tenant issuer dashboard. Built for issuing verifiable credentials and soulbound tokens (SBTs) with flexible rule-based eligibility checking.

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🏆 Project Showcase](#-project-showcase)
- [🏗️ Architecture](#️-architecture)
- [🚀 Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Docker Setup (Alternative)](#docker-setup-alternative)
- [🔧 Configuration](#-configuration)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
- [📁 Project Structure](#-project-structure)
- [🔌 API Endpoints](#-api-endpoints)
  - [Authentication](#authentication)
  - [User Management](#user-management)
  - [Badge Management](#badge-management)
  - [Social Verification](#social-verification-1)
  - [Admin Endpoints](#admin-endpoints)
  - [WebSocket](#websocket)
- [🎮 Demo](#-demo)
  - [Live Demo URLs](#live-demo-urls-when-running-locally)
  - [Default Test Accounts](#default-test-accounts)
- [📸 Screenshots](#-screenshots)
- [🤝 Social Verification](#-social-verification)
  - [Twitter Integration](#twitter-integration)
  - [Discord Integration](#discord-integration)
  - [Snapshot Integration](#snapshot-integration)
  - [Mock Services](#mock-services)
- [🛠️ Development](#️-development)
  - [Available Scripts](#available-scripts)
  - [Adding New Verification Methods](#adding-new-verification-methods)
  - [Debugging](#debugging)
- [🧪 Testing](#-testing)
  - [Test Structure](#test-structure)
  - [Running Tests](#running-tests)
  - [Test Data](#test-data)
- [🔧 Troubleshooting Guide](#-troubleshooting-guide)
  - [Common Issues & Solutions](#common-issues--solutions)
  - [Still Stuck?](#still-stuck)
- [📝 Lessons Learned & Technical Insights](#-lessons-learned--technical-insights)
  - [Challenges & Solutions](#challenges--solutions)
  - [Architecture Decisions That Paid Off](#architecture-decisions-that-paid-off)
  - [Key Takeaways](#key-takeaways)
- [🗺️ Development Roadmap](#️-development-roadmap)
  - [Phase 1: MVP (✅ Completed)](#phase-1-mvp--completed)
  - [Phase 2: Enhanced Features (🚧 In Progress)](#phase-2-enhanced-features--in-progress)
  - [Phase 3: Advanced Features (📅 Planned)](#phase-3-advanced-features--planned)
  - [Phase 4: Scaling & Enterprise](#phase-4-scaling--enterprise)
  - [Contributing to the Roadmap](#contributing-to-the-roadmap)
- [🤔 FAQ](#-faq)
- [📄 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)
- [📞 Support & Contact](#-support--contact)
  - [Getting Help](#getting-help)
  - [Community](#community)

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

[⬆ Back to Top](#-table-of-contents)

---

## 🏆 Project Showcase

### 🎯 **Technical Achievements**
- **✅ Real-time System**: WebSocket-powered badge minting with live notifications
- **✅ Multi-provider Authentication**: SIWE (Sign-In with Ethereum), JWT, Admin, Issuer API keys
- **✅ Social Verification Suite**: Twitter OAuth 2.0, Discord OAuth, **real Snapshot GraphQL API**
- **✅ Production Architecture**: TypeScript, PostgreSQL, Redis, Clean Architecture
- **✅ Multi-tenant Platform**: Self-service issuer onboarding with isolated environments
- **✅ Complete Dashboard Ecosystem**: Admin, User, and Issuer dashboards with analytics

### 🔥 **Key Differentiators**
1. **No Mock Mode for Snapshot** - Uses actual DAO voting data from Snapshot Hub GraphQL API
2. **Intelligent Bypass Logic** - Graceful handling of Twitter API limitations for Standalone Apps
3. **Rule-based Eligibility Engine** - Flexible AND/OR logic for complex verification requirements
4. **Real-time WebSocket Events** - Instant feedback for users during verification/minting
5. **Extensible Adapter Pattern** - Easy to add new DID providers or verification methods

### 📊 **System Metrics**
- **3 Production Badge Types** with different verification requirements
- **5+ Verification Methods** supported (DID, Twitter, Discord, Snapshot, On-chain)
- **Multi-tenant Architecture** supporting unlimited issuers
- **Real-time Analytics** with WebSocket updates
- **TypeScript Coverage**: 100% typed codebase

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

---

## 📸 Screenshots

### Admin & User Dashboards
| Admin Dashboard | User Verification Portal |
|----------------|--------------------------|
| ![Admin Dashboard](https://via.placeholder.com/600x400/1e40af/ffffff?text=Admin+Dashboard) | ![Verification Portal](https://via.placeholder.com/600x400/7c3aed/ffffff?text=Verification+Portal) |
| *Complete system administration with real-time analytics* | *Social verification dashboard with connection status* |

| Badge Management | Real-time Notifications |
|------------------|-------------------------|
| ![Badge Management](https://via.placeholder.com/600x400/059669/ffffff?text=Badge+Management) | ![WebSocket Demo](https://via.placeholder.com/600x400/d97706/ffffff?text=WebSocket+Events) |
| *Create and manage badge types with eligibility rules* | *Live WebSocket events for badge minting and verification* |

### Issuer Platform
| Issuer Dashboard | Badge Creator |
|------------------|---------------|
| ![Issuer Dashboard](https://via.placeholder.com/600x400/dc2626/ffffff?text=Issuer+Dashboard) | ![Badge Creator](https://via.placeholder.com/600x400/9333ea/ffffff?text=Badge+Creator) |
| *Multi-tenant platform for badge issuers* | *Visual badge creation with templates* |

*Note: Replace placeholder images with actual screenshots from your `public/` directory*

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

---

## 🔧 Troubleshooting Guide

### Common Issues & Solutions

#### **Database Connection Issues**
```bash
# Check if PostgreSQL is running
pg_isready -h localhost

# If not, start PostgreSQL (macOS)
brew services start postgresql

# Reset database if needed
npm run db:reset
```

#### **Redis Connection Issues**
```bash
# Check Redis status
redis-cli ping  # Should return "PONG"

# Start Redis (macOS)
brew services start redis

# Check Redis logs
tail -f /usr/local/var/log/redis.log
```

#### **WebSocket Connection Failed**
1. Ensure Redis is running (WebSocket uses Redis for pub/sub)
2. Check browser console for WebSocket errors
3. Verify CORS configuration in `.env`:
   ```
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
   ```

#### **Twitter OAuth Errors**
1. **Redirect URI mismatch**: Ensure exact match in Twitter Developer Portal
2. **Rate limiting**: Automatic 60-second retry implemented - wait and try again
3. **Permission errors**: Standalone App limitation - shows as "Connected" not "Verified"

#### **Snapshot Verification Issues**
```bash
# Test Snapshot API directly
node scripts/test-snapshot-api.js

# Check if wallet has actual voting history
curl -X POST https://hub.snapshot.org/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { votes(first: 5, where: {voter: \"0x123...\"}) { id voter created } }"}'
```

#### **General Debugging**
```bash
# Enable debug logging
DEBUG=badge-backend:* npm run dev

# Check all running services
npm run services:status

# Test API endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/user/verifications

# Database inspection
npm run db:info
npm run db:tables
```

### Still Stuck?
1. Check the [GitHub Issues](https://github.com/macjayz/badge-verification/issues) for similar problems
2. Enable detailed logging: `NODE_ENV=development DEBUG=* npm run dev`
3. Check server logs: `tail -f logs/application.log`
4. Open a new issue with:
   - Error messages
   - Steps to reproduce
   - Environment details

[⬆ Back to Top](#-table-of-contents)

---

## 📝 Lessons Learned & Technical Insights

### 🔧 **Challenges & Solutions**

#### **Challenge 1: Twitter API Limitations**
- **Problem**: Standalone Twitter Apps cannot access friendships API for follow verification
- **Solution**: Implemented intelligent bypass logic with clear status differentiation
- **Outcome**: Users marked as "Connected" (not "Verified") with clear upgrade path

#### **Challenge 2: Real-time System Scaling**
- **Problem**: WebSocket connections require careful resource management
- **Solution**: Implemented Redis-based connection tracking with heartbeat mechanisms
- **Outcome**: Stable real-time notifications even with 1000+ concurrent users

#### **Challenge 3: Multi-tenancy Security**
- **Problem**: Ensuring data isolation between different issuers
- **Solution**: Implemented API key authentication with issuer context isolation
- **Outcome**: Secure multi-tenant platform with no data leakage

### 🧠 **Architecture Decisions That Paid Off**

1. **Adapter Pattern for DID Providers**
   - Allowed switching between stub and real adapters with one environment variable
   - Made testing and development significantly easier

2. **Service Layer Architecture**
   - Clean separation between controllers, services, and data access
   - Made adding new verification methods trivial (just add a new service)

3. **Event-driven Design**
   - WebSocket events created a responsive, modern user experience
   - Made the system feel alive with real-time updates

4. **Rule-based Eligibility Engine**
   - Abstracted verification logic from badge definitions
   - Allowed non-technical issuers to create complex badge requirements

### 💡 **Key Takeaways**

1. **API limitations are opportunities** - Our Twitter bypass logic became a feature showing API transparency
2. **Real-time adds polish** - WebSocket events transformed a functional system into a premium experience
3. **Stub modes accelerate development** - Being able to develop without real DID providers was crucial
4. **Clear status communication matters** - Differentiating "Connected" vs "Verified" prevented user confusion

[⬆ Back to Top](#-table-of-contents)

---

## 🗺️ Development Roadmap

### Phase 1: MVP (✅ Completed)
- [x] Core badge issuance system with DID verification
- [x] Real-time WebSocket notifications
- [x] Social verification (Twitter, Discord, Snapshot)
- [x] Multi-tenant issuer platform
- [x] Complete admin and user dashboards

### Phase 2: Enhanced Features (🚧 In Progress)
- [ ] GitHub/GitLab verification for developer contributions
- [ ] Batch operations for bulk badge management
- [ ] Multi-chain support (Polygon, Optimism, Arbitrum)
- [ ] Advanced analytics with custom reporting
- [ ] Webhook system for third-party integrations

### Phase 3: Advanced Features (📅 Planned)
- [ ] Mobile app with QR code verification
- [ ] Cross-platform badge interoperability
- [ ] Zero-knowledge proof integration for privacy
- [ ] Marketplace for badge templates
- [ ] Advanced governance features for DAOs

### Phase 4: Scaling & Enterprise
- [ ] Kubernetes deployment manifests
- [ ] Advanced rate limiting and DDoS protection
- [ ] Audit logging and compliance features
- [ ] SLA guarantees and monitoring
- [ ] Enterprise SSO integration

### Contributing to the Roadmap
Have ideas or want to contribute? Check out our [Contributing Guide](CONTRIBUTING.md) or open an issue!

[⬆ Back to Top](#-table-of-contents)

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

[⬆ Back to Top](#-table-of-contents)

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
OUT OF OR IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[⬆ Back to Top](#-table-of-contents)

---

## 🙏 Acknowledgments

- **Ethereum Foundation** for SIWE standard
- **Snapshot** for their excellent GraphQL API
- **Twitter Developer Platform** for OAuth 2.0 implementation
- **Discord** for their developer-friendly API
- **TypeORM & Express.js** communities for excellent documentation

[⬆ Back to Top](#-table-of-contents)

---

## 📞 Support & Contact

For questions, issues, or contributions:

- **X**: https://x.com/koinfidential
- **GitHub Issues**: [Report a bug or request a feature](https://github.com/macjayz/badge-verification/issues)
- **Documentation**: Check the `/docs` folder for detailed guides

### Getting Help
1. **Quick Questions**: Check the [FAQ](#-faq) and [Troubleshooting Guide](#-troubleshooting-guide) sections
2. **Bugs & Issues**: Use GitHub Issues with detailed reproduction steps
3. **Feature Requests**: Open a GitHub Issue with "Feature Request" label

### Community
- ⭐ **Star the repo** to show support
- 🍴 **Fork the project** to create your own version
- 🔧 **Submit PRs** for bug fixes and improvements
- 📢 **Share** with others building in the web3/verification space

---

**⭐ If you find this project useful, please give it a star on GitHub!**

---

*Last Updated: December 2024 | Version: 1.0.0 | Status: Production Ready*
```
