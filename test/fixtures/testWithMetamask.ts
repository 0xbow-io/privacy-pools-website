import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import basicSetup from '../wallet-setup/basic.setup';

export const testWithMetaMask = testWithSynpress(metaMaskFixtures(basicSetup)).extend<{
    metamask: MetaMask
}>({
    metamask: async ({ context, metamaskPage, extensionId }, use) => {
        const metamask = new MetaMask(
            context,
            metamaskPage,
            basicSetup.walletPassword,
            extensionId
        )
        await use(metamask)
    },
})
