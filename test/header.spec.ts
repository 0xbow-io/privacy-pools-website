import { testWithMetaMask as test } from './fixtures/testWithMetamask';

const { expect } = test

test.beforeEach('open start URL and connect wallet', async ({ page, metamask }) => {
  await page.goto('/');
  await page.getByTestId('connect-wallet-button').click();
  await page.getByTestId('wallet-option-metaMask').click();
  await metamask.connectToDapp();
});

test('hamburger menu', async ({ page }) => {
  await page.getByTestId('account-menu-button').click();

  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('heading', { level: 6 })).toContainText('ETH');
  await expect(page.getByRole('menuitem', { name: /^0x/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
  await expect(page).toHaveScreenshot();
})

test('copy wallet address', async ({ page, metamask }) => {
  const connectedAddress = await metamask.getAccountAddress();
  const truncatedAddress = `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}`;

  await page.getByTestId('account-menu-button').click();
  await page.getByRole('menuitem', { name: truncatedAddress }).click();
  const clipboardText = await page.evaluate('navigator.clipboard.readText()');

  await expect(clipboardText).toContain(connectedAddress);
})

test('logout', async ({ page }) => {
  await page.getByTestId('account-menu-button').click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();

  await expect(page.getByTestId('connect-wallet-button')).toBeVisible();
  await expect(page).toHaveScreenshot();
})

test.only('disclaimer banner', async ({ page }) => {
  const bannerText = 'This app is in beta. Use at your own risk. Lost funds cannot be recovered.';

  await expect(page.getByText(bannerText)).toBeVisible();
  await page.locator(`button:right-of(:text("${bannerText}"))`).first().click();
  await expect(page.getByText(bannerText)).not.toBeVisible();
})
