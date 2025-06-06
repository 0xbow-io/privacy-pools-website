import { testWithMetaMask as test } from './fixtures/testWithMetamask';

const { expect } = test

test.beforeEach('open start URL and connect wallet', async ({ page, metamask }) => {
    await page.goto('/');
    await page.getByTestId('connect-wallet-button').click();
    await page.getByTestId('wallet-option-metaMask').click();
    await metamask.connectToDapp();
});

test('show welcome message and user menu', async ({ page }) => {
    await expect(page.getByTestId('account-menu-button')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to Privacy Pools' })).toBeVisible();
    await expect(page).toHaveScreenshot();
})
