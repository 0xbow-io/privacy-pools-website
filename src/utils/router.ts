export const ROUTER = {
  home: {
    base: '/',
  },
  account: {
    base: '/account',
    children: {
      load: '/account/load',
      create: '/account/create',
      login: '/account/login',
    },
  },
  poolAccounts: {
    base: '/pool-accounts',
  },
  activity: {
    base: '/activity',
    children: {
      global: '/activity/global',
      personal: '/activity/personal',
    },
  },
};

const ROUTER_PATHS = Object.values(ROUTER).flatMap((_route) => {
  const baseRoute = _route.base;
  const childrenRoutes = 'children' in _route ? Object.values(_route.children) : [];
  return [baseRoute, ...childrenRoutes];
});

export const isValidRoute = (route: string) => {
  return ROUTER_PATHS.includes(route);
};
