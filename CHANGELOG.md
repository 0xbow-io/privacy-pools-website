# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.14.3] - 2026-07-03

### Fixed

- Global activity pages no longer get stuck on "No activity found" with the pager reading "4 OF 0" after a transient API failure — the table's loading/error state now tracks the paginated query itself (it previously tracked only the first-page preview), failures show a "Couldn't load activity." message with a Retry button, and navigating back to a failed page refetches instead of staying broken until a hard refresh
- Pagination is hidden when there are no items, so the "N OF 0" state can no longer appear while loading or after an error

## [2.14.2] - 2026-05-20

### Fixed

- Removed the FXN incentives badge (340% APR / Rollover / Incentives) from the fxUSD pool card; incentives are no longer running
- Simplified the withdraw modal title to "Withdraw"

## [2.14.1] - 2026-05-15

### Fixed

- Restored the relayer dropdown so users can pick between Fast Relay and Cloaked Relay (Fast Relay stays first)
- Display the selected relayer name as the fee collector in the withdrawal review modal instead of always showing `0xBow`
- Fixed a race in the relayer auto-select effect that caused Cloaked Relay to win the default slot when its `/details` endpoint responded faster than Fast Relay's
- Fall back to an ASP-derived per-token price when Alchemy doesn't return one, so withdrawal review modal and other surfaces stop showing `$0.00 USD` (and yield-bearing tokens like sUSDS show their actual price instead of a flat $1)
- Coerce Alchemy price values to a number (the API returns quoted strings) so the review modal no longer silently throws and shows `$0.00`
- Reset the quote, fee commitment and countdown when the user switches relayer in the withdraw form, so reopening the Review modal doesn't show stale data from the previous relayer

## [2.14.0] - 2026-05-11

### Added

- Added Cloaked Relay as a secondary mainnet relayer

### Changed

- Mainnet relayer list now preserves the order configured in `chainData` so Fast Relay stays first regardless of momentary price differences

### Fixed

- Fixed missing USD price for BOLD, sUSDS, USDe, frxUSD, fxUSD and yUSND pool stats. Live prices fall back to the ASP's reported pool USD value when Alchemy doesn't list the token, which also shows accurate prices for yield-bearing assets like sUSDS instead of pinning them at $1.

### Security

- Bumped Next.js to 15.5.18, picking up the 12 security advisories from the v16.2.6 release (Server Components DoS, middleware/proxy bypasses, WebSocket SSRF, CSP nonce XSS, Image Optimization DoS and RSC cache poisoning).

## [2.13.0] - 2026-04-14

### Added

- Added Terms of Use and Privacy Policy links to footer
- Migration banner and maintenance banner are now dismissible (with localStorage persistence)

### Fixed

- Fixed migration banner covering content on mobile (content now offsets for banner height)
- Collapsed Github/Terms/Privacy into a More dropdown on mobile footer to keep it on a single row
- Fixed content bleeding through the fixed header on iOS Safari by adding an opaque background

## [2.12.0] - 2026-03-19

### Added
- Introduced an entropy upgrade flow that allows existing users to easily upgrade their account security

### Fixed

- Fixed BNB withdrawal ASP root error (check externalAsp config instead of chainId)
- Fixed incorrect amounts in global activity details modal
- Fixed BSCUSD USD price display (added stablecoin fallback)
- Fixed wallet client race condition on exit (refetch after chain switch)
- Fixed review withdrawal button blocked after switching tokens
- Fixed hide empty pools toggle disappearing when only pool is empty
- Fixed pending vs approved status refresh delay after transactions
- Fixed sUSDS withdrawal total received display
- Fixed trailing dot in activity total display
- Fixed target address not preserved when switching tokens in withdrawal form
- Show 'price unavailable' instead of blank when price fetch fails
- Added graceful fallback for unsupported extra gas on non-mainnet chains
- Replaced `bytesToNumber` with `bytesToBigInt` in the Privacy Pools SDK, restoring full 256-bit entropy for all newly generated keys and ensuring new accounts carry the full cryptographic security guarantees intended by the original specification

## [2.11.0] - 2026-03-11

### Added

- Environment-configurable maintenance banner (`NEXT_PUBLIC_MAINTENANCE_MODE`, `NEXT_PUBLIC_MAINTENANCE_MESSAGE`)

### Fixed

- Fixed incorrect pool scope passed to pool-incentives-stats endpoint

## [2.10.2] - 2026-03-08

### Fixed

- Bumped SDK version to 1.1.1

## [2.10.1] - 2026-02-19

### Fixed

- Fixed timeouts in RPC data fetching
- Fixed pending values in pools dashboard

## [2.10.0] - 2026-02-17

### Added

- Added BOLD pool support

### Changed

- Replaced staging relayer links with production ones

## [2.9.2] - 2026-02-16

### Fixed

- Fixed approved deposits in withdrawal modal

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
