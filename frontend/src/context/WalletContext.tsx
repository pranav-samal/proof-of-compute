/**
 * WalletContext — lightweight ethers v6 wallet integration.
 * Uses window.ethereum (MetaMask / EIP-1193).
 * No wagmi dependency required.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { WalletState } from '../types';

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  connecting: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextValue>({
  connected: false, address: null, network: null, chainId: null,
  connect: async () => { /* noop */ },
  disconnect: () => { /* noop */ },
  connecting: false, error: null,
});

export function useWallet() {
  return useContext(WalletContext);
}

const CHAIN_NAMES: Record<number, string> = {
  1:     'Ethereum Mainnet',
  5:     'Goerli',
  11155111: 'Sepolia',
  31337: 'Hardhat Local',
  1337:  'Localhost',
};

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    connected: false, address: null, network: null, chainId: null,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError('No wallet detected. Install MetaMask or a compatible browser wallet.');
      return;
    }
    try {
      setConnecting(true);
      setError(null);
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      const chainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      setState({
        connected: true,
        address: accounts[0],
        network: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
        chainId,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ connected: false, address: null, network: null, chainId: null });
    setError(null);
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccounts = (accounts: string[]) => {
      if (accounts.length === 0) disconnect();
      else setState((s) => ({ ...s, address: accounts[0] }));
    };
    const handleChain = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setState((s) => ({ ...s, chainId, network: CHAIN_NAMES[chainId] ?? `Chain ${chainId}` }));
    };

    ethereum.on('accountsChanged', handleAccounts);
    ethereum.on('chainChanged', handleChain);
    return () => {
      ethereum.removeListener('accountsChanged', handleAccounts);
      ethereum.removeListener('chainChanged', handleChain);
    };
  }, [disconnect]);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    connecting,
    error,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export { shortenAddress };
