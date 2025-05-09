import { Constants } from '~/types';

const constants: Constants = {
  FOOTER_LINKS: [
    { label: 'White Paper', href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364' },
    { label: 'Docs', href: 'https://docs.privacypools.com' },
    { label: 'X', href: 'https://x.com/0xbowio' },
    {
      label: 'Support',
      href: 'https://docs.google.com/forms/d/e/1FAIpQLSe0UKiTrZ4kD0apx75bEW0PWqJxpd6bCYh_IUKBrCkJOBzkpQ/viewform',
    },
    {
      label: 'Github',
      href: `https://github.com/0xbow-io/privacy-pools-website`,
    },
  ],
  ASP_OPTIONS: ['0xBow ASP'],
  COOKIES: {
    USER_LOGGED: { name: 'userLogged', value: 'true' },
    USER_CONNECTED: { name: 'userConnected', value: 'true' },
  },
  ITEMS_PER_PAGE: 12,
  TOC_URL: 'https://docs.privacypools.com/toc',
  PENDING_STATUS_MESSAGE:
    'The ASP is validating that the funds are coming from a good actor. Estimated period: Up to 7 days.',
};

export const getConstants = (): Constants => {
  return constants;
};
