<p align="center">
  <a href="https://privacypools.com" display='flex' place-items='center'>
  <img src="./public/BANNER.png">
  </a>
</p>

<div align="center">

**[Website](https://privacypools.com) •
[X](https://x.com/0xbowio) •
[Docs](https://docs.privacypools.com)**

</div>

## Overview

Privacy Pools UI is a decentralized application that enables private cryptocurrency transactions through advanced zero-knowledge proofs and commitment schemes. Users can deposit assets into Privacy Pools and withdraw them later (partially or fully) without creating an on-chain link between their deposit and withdrawal addresses. The system maintains regulatory compliance via an Association Set Provider (ASP) that validates deposits, preventing potentially illicit funds from entering the protocol.

## Features

- **Private Withdrawals**: Break the on-chain link between deposit and withdrawal addresses
- **Regulatory Compliance**: Integration with Association Set Provider (ASP)
- **User-Friendly Interface**: Seamless deposit and withdrawal experience
- **Multi-Chain Support**: Configurable for multiple EVM networks

## 📋 Prerequisites

- Node.js (v16 or higher)
- PNPM v9.0.0+

## 🚀 Getting Started

### Installation

```bash
pnpm install
```

### Environment Configuration

Create a `.env` file in the root directory and add the required configuration:

```bash
cp .env.example .env
```

#### Required Environment Variables

**Core Configuration**

| Variable                           | Description                                    | Example                   |
| ---------------------------------- | ---------------------------------------------- | ------------------------- |
| `NEXT_PUBLIC_PROJECT_ID`           | ProjectID from [WalletConnect](https://cloud.walletconnect.com) | `abc123def456` |
| `NEXT_PUBLIC_ALCHEMY_KEY`          | API key from [Alchemy](https://www.alchemy.com) | `AbC123dEf456gHi789` |
| `NEXT_PUBLIC_ASP_ENDPOINT`         | ASP service endpoint URL                       | `https://aspendpoint.com` |
| `HYPERSYNC_KEY`                    | API key from Hypersync                         | `your-hypersync-key`      |

**Application Settings**

| Variable                           | Description                                    | Example                   |
| ---------------------------------- | ---------------------------------------------- | ------------------------- |
| `NEXT_PUBLIC_SHOW_DISCLAIMER`      | Display legal disclaimer                       | `true`                    |
| `NEXT_PUBLIC_TEST_MODE`            | Enable/disable test mode                       | `false`                   |
| `NEXT_PUBLIC_IS_TESTNET`           | Enable/disable testnet mode                    | `false`                   |
| `NEXT_PUBLIC_GITHUB_HASH`          | Git commit hash for version tracking           | `4fdc156`                 |

**Error Tracking (Sentry)**

| Variable                           | Description                                    | Example                   |
| ---------------------------------- | ---------------------------------------------- | ------------------------- |
| `SENTRY_AUTH_TOKEN`                | Sentry authentication token                    | `your-sentry-auth-token`  |
| `NEXT_PUBLIC_SENTRY_DSN`           | Sentry DSN for error tracking                  | `https://xxx@sentry.io`   |

**Newsletter & Security**

| Variable                           | Description                                    | Example                   |
| ---------------------------------- | ---------------------------------------------- | ------------------------- |
| `MAILERLITE_API_KEY`               | [MailerLite](https://developers.mailerlite.com/docs/authentication) API key for newsletter | `your-mailerlite-key` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`   | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/) site key (public) | `0x4AAA...` |
| `TURNSTILE_SECRET_KEY`             | Cloudflare Turnstile secret key (private)      | `0x4BBB...`               |

### Running Locally

Start the development server:

```bash
pnpm run start
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## 🚀 Deployment

### Vercel Deployment

#### Prerequisites

1. [Vercel account](https://vercel.com)
2. Vercel CLI installed:
   ```bash
   npm install -g vercel
   ```

#### Deployment Steps

1. **Authenticate with Vercel**:

   ```bash
   vercel login
   ```

2. **Deploy Your Project**:

   ```bash
   vercel
   ```

   Follow the prompts to configure your project.

3. **Set Environment Variables**:

   ```bash
   vercel env add <name> <value>
   ```

   You can also set environment variables through the Vercel dashboard:

   - Go to your project
   - Navigate to Settings > Environment Variables
   - Add all required variables from the table above

#### Additional Resources

- [Vercel CLI Documentation](https://vercel.com/docs/cli)
- [Vercel Documentation](https://vercel.com/docs)

## 💻 Development

### Conventional Commits

We follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/#specification) for all commits to maintain a clean and standardized commit history.

Format: `<type>(<scope>): <description>`

Examples:

- `feat: add new withdrawal feature`
- `fix: resolve connection issue with ASP`
- `docs: update README with new environment variables`

## 🔗 Chain Configuration

The application supports multiple EVM networks through the `src/config/chainData.ts` configuration file. The application uses a whitelist of supported chains to ensure only approved networks are accessible.

### Whitelisted Chains

When adding a new chain, make sure to:

1. Add it to the `whitelistedChains` array
2. Configure it in the `chainData` object
3. Test the chain integration thoroughly

### Adding a New Chain

1. Import the chain from `viem/chains`:

```typescript
import { yourChain } from 'viem/chains';
```

2. Add the chain to the whitelist:

```typescript
// For mainnet chains
const mainnetChains: readonly [Chain, ...Chain[]] = [mainnet, yourChain];
// OR for testnet chains
const testnetChains: readonly [Chain, ...Chain[]] = [sepolia, yourChain];
```

3. Add the chain configuration to the `chainData` object:

```typescript
[yourChain.id]: {
  name: yourChain.name,
  symbol: yourChain.nativeCurrency.symbol,
  decimals: yourChain.nativeCurrency.decimals,
  image: yourChainIcon.src, // Add your chain icon to assets/icons/
  explorerUrl: yourChain.blockExplorers.default.url,
  rpcUrl: 'https://chain.rpc-url.com', // The RPC URL of the chain for the SDK
  aspUrl: 'https://aspUrl-example.com',
  relayers: [
    {
      name: 'Relayer Name',
      url: 'https://your-relayer-url.com'
    }
  ],
  poolInfo: {
    chainId: yourChain.id,
    assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Asset contract address
    address: '0x...', // Deployed PrivacyPool contract address
    scope: 1234n, // PrivacyPool scope
    deploymentBlock: 1234n, // PrivacyPool deployment block
    entryPointAddress: '0x...', // Deployed EntryPoint contract address
    maxDeposit: 1000000000000000000n, // Maximum deposit amount in wei (e.g., 1 ETH)
  },
}
```

### Adding New Relayers

To add new relayer endpoints for an existing chain:

1. Add the relayer object to the `relayers` array:

```typescript
relayers: [
  {
    name: 'Existing Relayer',
    url: 'https://existing-relayer.com',
  },
  {
    name: 'New Relayer',
    url: 'https://new-relayer.com',
  },
];
```

### Chain Icons

1. Add your chain icon to `src/assets/icons/`
2. Import it at the top of `chainData.ts`:

```typescript
import yourChainIcon from '~/assets/icons/your-chain.svg';
```

### Best Practices

- Keep mainnet addresses hardcoded for security
- Ensure all required fields are populated
- Test the configuration with the new chain/relayer before deploying
- Maintain consistent naming conventions for relayer services
- Only add chains to the whitelist after thorough testing
- Document any chain-specific requirements or limitations

## 🤝 Contributing

Privacy Pools UI was built with ❤️ by [Wonderland](https://defi.sucks).

Wonderland is a team of top Web3 researchers, developers, and operators who believe that the future needs to be open-source, permissionless, and decentralized.

[DeFi sucks](https://defi.sucks), but Wonderland is here to make it better.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes using conventional commits
4. Push to the branch (`git push origin feature/new-feature`)
5. Open a Pull Request
