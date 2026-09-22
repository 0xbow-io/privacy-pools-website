import { act, createElement, useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRoot, Root } from 'react-dom/client';
import { ROUTER } from '~/utils/router';

// Inputs the providers read; each test sets them the way the real flows do
// (setSeed before login, wagmi address when a wallet connects).
let address: `0x${string}` | undefined;
let seed: string | undefined;
let authStub: { isLogged: boolean; hasWallet: boolean; hasSession: boolean };

const disconnect = jest.fn();
const resetGlobalState = jest.fn();
const setUserLoggedCookie = jest.fn(async () => {});
const deleteUserLoggedCookie = jest.fn(async () => {});
const deleteUserConnectedCookie = jest.fn(async () => {});
const replace = jest.fn();

jest.unstable_mockModule('wagmi', () => ({
  useAccount: () => ({ address }),
  useDisconnect: () => ({ disconnect }),
}));
jest.unstable_mockModule('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
jest.unstable_mockModule(`${process.cwd()}/src/actions.ts`, () => ({
  setUserLoggedCookie,
  deleteUserLoggedCookie,
  deleteUserConnectedCookie,
}));
jest.unstable_mockModule(`${process.cwd()}/src/hooks/index.ts`, () => ({
  useAccountContext: () => ({ resetGlobalState, seed }),
  useAuthContext: () => authStub,
}));
jest.unstable_mockModule(`${process.cwd()}/src/utils/index.ts`, () => ({ ROUTER }));

const { AuthContext, AuthProvider } = await import('~/providers/AuthProvider');
const { default: AccountLayout } = await import('~/app/account/layout');

type Auth = React.ContextType<typeof AuthContext>;
let auth: Auth;
const Consumer = () => {
  auth = useContext(AuthContext);
  return null;
};

let root: Root;
let container: HTMLDivElement;
const WALLET = '0x1111111111111111111111111111111111111111' as const;

const renderAuth = async () => {
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(Consumer)));
  });
};
const renderLayout = async () => {
  await act(async () => {
    root.render(createElement(AccountLayout, null, createElement('span', { id: 'child' }, 'create or load')));
  });
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  address = undefined;
  seed = undefined;
  authStub = { isLogged: false, hasWallet: false, hasSession: false };
  jest.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe('AuthProvider login', () => {
  it('logs in with a seed and no wallet address', async () => {
    await renderAuth();
    expect(auth.isLogged).toBe(false);

    seed = 'test seed';
    await act(async () => auth.login('test seed'));

    expect(auth.isLogged).toBe(true);
    expect(auth.hasSession).toBe(true);
    expect(auth.isAuthorized).toBe(true);
    expect(auth.hasWallet).toBe(false);
    expect(auth.isConnected).toBe(false);
    expect(setUserLoggedCookie).toHaveBeenCalledTimes(1);
  });

  it('logs in from the seed already in the account context', async () => {
    seed = 'context seed';
    await renderAuth();

    await act(async () => auth.login());

    expect(auth.isLogged).toBe(true);
    expect(auth.hasSession).toBe(true);
  });

  it('refuses to log in without a seed, wallet or not', async () => {
    address = WALLET;
    await renderAuth();

    expect(() => auth.login()).toThrow('Seed is missing');
    expect(auth.isLogged).toBe(false);
    expect(auth.hasSession).toBe(false);
    expect(auth.isAuthorized).toBe(false);
    expect(setUserLoggedCookie).not.toHaveBeenCalled();
  });
});

describe('hasWallet vs hasSession', () => {
  it('a connected wallet alone is not a session', async () => {
    address = WALLET;
    await renderAuth();

    expect(auth.hasWallet).toBe(true);
    expect(auth.isConnected).toBe(true);
    expect(auth.hasSession).toBe(false);
    expect(auth.isAuthorized).toBe(false);
  });

  it('a wallet user has both flags after login', async () => {
    address = WALLET;
    await renderAuth();
    seed = 'wallet seed';
    await act(async () => auth.login('wallet seed'));

    expect(auth.hasWallet).toBe(true);
    expect(auth.hasSession).toBe(true);
    expect(auth.isAuthorized).toBe(true);
  });

  it('a seed-only session keeps its session when a wallet connects later', async () => {
    await renderAuth();
    seed = 'test seed';
    await act(async () => auth.login('test seed'));
    expect(auth.hasWallet).toBe(false);

    address = WALLET;
    await renderAuth();

    expect(auth.hasWallet).toBe(true);
    expect(auth.hasSession).toBe(true);
  });

  it('logout clears the session and both cookies', async () => {
    seed = 'test seed';
    await renderAuth();
    await act(async () => auth.login());
    expect(auth.hasSession).toBe(true);
    deleteUserLoggedCookie.mockClear();
    deleteUserConnectedCookie.mockClear();

    await act(async () => auth.logout());

    expect(auth.isLogged).toBe(false);
    expect(auth.hasSession).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(resetGlobalState).toHaveBeenCalledTimes(1);
    expect(deleteUserLoggedCookie).toHaveBeenCalledTimes(1);
    expect(deleteUserConnectedCookie).toHaveBeenCalledTimes(1);
  });
});

describe('account layout gate', () => {
  it('shows create/load with no wallet and no session', async () => {
    await renderLayout();

    expect(container.querySelector('#child')?.textContent).toBe('create or load');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows create/load to a connected wallet that has no session yet', async () => {
    authStub = { isLogged: false, hasWallet: true, hasSession: false };
    await renderLayout();

    expect(container.querySelector('#child')).not.toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a logged-in user home, wallet or not', async () => {
    authStub = { isLogged: true, hasWallet: false, hasSession: true };
    await renderLayout();

    expect(container.querySelector('#child')).toBeNull();
    expect(replace).toHaveBeenCalledWith(ROUTER.home.base);
  });
});
