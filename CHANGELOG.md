# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.9.1] - 2026-02-13

### Fixed

- Fixed SDK bug with concurrent fetching

## [2.9.0] - 2026-02-12

### Added

- Added BNB and BSCUSD for BSC chain

## [2.8.0] - 2026-01-27

### Added 

- f(x)usd rewards claim button

### Fixed

- Updated Next.js version

## [2.7.0] - 2026-01-22

### Added

- Starknet chain support
- User balance auto refresh
- F(x)USD APR display
- Compromised address self-report

## [2.6.2] - 2025-12-29

### Fixed

- Fixed incorrect withdrawal quote request timing

## [2.6.1] - 2025-12-28

### Fixed

- Fixed incorrect withdrawal fee calculation

## [2.6.0] - 2025-12-22

### Added

- Added fxUSD pool support

## [2.5.0] - 2025-12-18

### Added

- Added Optimism pools support

## [2.4.0] - 2025-12-17

### Added

- Added multichain support

### Changed

- Refactored UI and homepage view
- Updated withdraw process

### Fixed

- Various bug fixes and performance improvements

## [2.3.0] - 2025-11-13

### Changed

- Bumped position of active pools

## [2.2.0] - 2025-10-10

### Added

- Upgraded to 24-word mnemonics with 256-bit entropy for enhanced security
- Legacy wallet sign-in option for 12-word backward compatibility
- Toggle for switching between 12-word and 24-word seedphrase input modes
- Version tracking in localStorage for consistent seedphrase regeneration

### Changed

- Default wallet-based generation now uses v2 (24-word) for new accounts
- Seedphrase validation now accepts both 12 and 24-word recovery phrases

### Fixed

- Critical bug where menu download would regenerate different seedphrase than sign-in
- Seedphrase download now respects the version used during account creation

## [2.1.0] - 2025-10-10

### Added

- Option to bypass seed download
- Security measures for wallet-based key generation

### Fixed

- Prevented key derivation with Coinbase wallet

## [2.0.0] - 2025-10-04

### Added

- New seed derival method
- New deposit status support

### Changed

- Optimized build process

### Fixed

- Footer styling for mobile devices
- Switching to default network before ragequit
- Fixed failing tx when user pays gas from non-native tokens

## [1.9.1] - 2025-09-04

### Fixed

- Fixed feature flag setting

## [1.9.0] - 2025-09-03

### Added

- Newsletter subscription modal
- WOETH pool support
- Custom token pricing support

### Changed

- Removed fees when using native token

### Fixed

- Fixed SDK issues with deposits

## [1.8.0] - 2025-08-21

### Changed

- Modified ASP requests to work with updated spec
- Changed the account history retrieval from outdated function

## [1.7.0] - 2025-08-11

### Added

- USDe, USD1 and FRXUSD pools support
- Smoother search and navigation in pools dropdown

## [1.6.0] - 2025-08-01

### Added

- wstETH and wBTC pools support
- EIP-7702 tx support

## [1.5.0] - 2025-07-24

### Added

- USDT and USDC pools support

## [1.4.1] - 2025-07-23

### Fixed

- Withdrawal modal fonts
- Gas token displayed value

## [1.4.0] - 2025-07-23

### Added

- ENS support for user profile and withdrawals

### Changed

- UX of withdrawal modal

### Fixed

- Bug with duplicated quote expiry notification

## [1.3.0] - 2025-07-19

### Added

- DAI pool support
- Withdrawal fees breakdown

## [1.2.0] - 2025-07-18

### Added

- sUSDS pool support
- handling relayer fees processing

### Changed

- changed withdrawal modal steps

## [1.1.0] - 2025-07-16

### Added

- USDS pool support

### Changed

- Relayer quotation logic

## [1.2.0] - 2025-07-18

### Added

- sUSDS pool support
- handling relayer fees processing

### Changed

- changed withdrawal modal steps

## [1.1.0] - 2025-07-16

### Added

- USDS pool support

### Changed

- Relayer quotation logic

## [1.0.0] - 2025-07-03

### Added

- Initial state of the code for upcoming releases
