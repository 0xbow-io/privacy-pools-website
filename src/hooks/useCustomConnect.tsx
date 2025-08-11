import { Connector, CreateConnectorFn, useConnect } from 'wagmi';
import { setUserConnectedCookie } from '~/actions';
import { getEnv } from '~/config/env';
import { useNotifications } from './context/useNotificationsContext';
import { useSafeApp } from './useSafeApp';
const { TEST_MODE } = getEnv();

export const useCustomConnect = () => {
  const { addNotification } = useNotifications();
  const { connectors, connectAsync } = useConnect();
  const { isSafeApp } = useSafeApp();

  // Filter connectors based on context
  const availableConnectors = TEST_MODE
    ? connectors.filter((connector) => connector.id === 'mock')
    : isSafeApp
      ? [
          ...connectors.filter((connector) => connector.id === 'safe'), // Prefer Safe connector when in Safe
          ...connectors.filter((connector) => connector.id === 'injected'), // Fallback to injected
        ]
      : connectors.filter((connector) => connector.id !== 'safe'); // Exclude Safe connector when not in Safe App

  const customConnect = async (connector: Connector<CreateConnectorFn>) => {
    try {
      await connectAsync({ connector });
      setUserConnectedCookie();
    } catch (error) {
      const err = error as Error;
      console.error(err);
      addNotification('error', `Failed to connect: ${err.message}`);
    }
  };

  // Automatically connect to Safe when running in Safe app
  const autoConnectSafe = async () => {
    if (isSafeApp) {
      const safeConnector = connectors.find((connector) => connector.id === 'safe');
      if (safeConnector) {
        await customConnect(safeConnector);
      }
    }
  };

  return {
    availableConnectors,
    customConnect,
    autoConnectSafe,
    isSafeApp,
  };
};
