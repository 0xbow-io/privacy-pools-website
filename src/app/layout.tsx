import { Metadata } from 'next';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { MainContent, NoScriptMessage, PageWrapper } from '~/components';
import { ibm_plex_mono } from '~/config/fonts';
import { Footer, Header, Modals } from '~/containers';
import { NotificationContainer } from '~/containers/NotificationContainer';
import { Providers } from '~/providers';

const title = 'Privacy Pools - Anonymous & Compliant Payments';
const description =
  'Privacy Pools by 0xbow is a compliant way to anonymously transact on Ethereum. 0xbow blocks illicit actors to ensure pool integrity.';

export const metadata: Metadata = {
  title,
  description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={ibm_plex_mono.className}>
        <AppRouterCacheProvider>
          <InitColorSchemeScript attribute='class' />

          <Providers>
            <PageWrapper>
              <NoScriptMessage>
                <p>This website requires JavaScript to function properly.</p>
              </NoScriptMessage>

              <Header />
              <MainContent data-testid='main-content'>{children}</MainContent>
              <Footer />
            </PageWrapper>
            <NotificationContainer />
            <Modals />
          </Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
