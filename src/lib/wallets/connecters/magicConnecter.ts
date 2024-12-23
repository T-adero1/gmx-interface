import { Wallet } from "@rainbow-me/rainbowkit";
import { createConnector } from "wagmi";
import MagicPassport from "magic-passport";
import { sepolia, networks } from "magic-passport/dist/types/networks";
import { arbitrum, avalanche, avalancheFuji } from "viem/chains";

const MAGIC_API_KEY = "pk_live_38E89656C50D326A";

const MAGIC_NETWORKS: Record<number, typeof sepolia> = {
  [arbitrum.id]: networks[42161],
  [avalanche.id]: networks[43114],
  [avalancheFuji.id]: networks[43113],
};



export default function magicWallet(): Wallet {
  return {
    id: "magicPassport",
    name: "Magic Wallet",
    iconUrl: async () => "/src/lib/wallets/connecters/magic_logo.png",
    iconAccent: "#6851FF",
    iconBackground: "#FFFFFF",
    installed: true,
    createConnector: () =>
      createConnector(({ chains, emitter }) => {
        const selectedChain = chains[0];
        const magicNetwork = MAGIC_NETWORKS[selectedChain?.id] || sepolia;

        const magicPassport = new MagicPassport(MAGIC_API_KEY, {
          network: magicNetwork,
          debug: true,
        });

        return {
          id: "magicPassport",
          name: "Magic Wallet",
          type: "smartWallet",
          connect: async () => {
            const profile = await magicPassport.user.connect();
            const chainId = selectedChain?.id || 1;
            emitter.emit("connect", { accounts: [profile.publicAddress], chainId });
            return { accounts: [profile.publicAddress], chainId };
          },
          disconnect: async () => {
            await magicPassport.user.disconnect();
            emitter.emit("disconnect");
          },
          onDisconnect: async () => {
            try {
              await magicPassport.user.disconnect();
            } catch (err) {
              throw new Error(`Error handling onDisconnect for Magic Wallet: ${err.message}`);
            }
          },
          getAccounts: async () => {
            const profile = await magicPassport.user.getConnectedProfile();
            return profile.publicAddress ? [profile.publicAddress] : [];
          },
          getChainId: async () => selectedChain?.id || 1,
          getProvider: async () => magicPassport.rpcProvider,
          isAuthorized: async () => {
            const profile = await magicPassport.user.getConnectedProfile();
            return !!profile?.publicAddress;
          },
          onAccountsChanged(accounts: string[]): void {
            setInterval(async () => {
              try {
                const profile = await magicPassport.user.getConnectedProfile();
                const currentAccount = accounts[0];
                if (profile.publicAddress !== currentAccount) {
                 
                  emitter.emit("change", { accounts: [profile.publicAddress] });
                }
              } catch (err) {
                throw new Error(`Error handling onAccountsChanged for Magic Wallet: ${err.message}`);
              }
            }, 1000);
          },
          onChainChanged: (chainId: string) => {
            const newChainId = parseInt(chainId);
            const newNetwork = MAGIC_NETWORKS[newChainId];

            if (!newNetwork) {
              throw new Error(`Unsupported chain ID: ${newChainId}`);
            }

            magicPassport.updateNetwork(newNetwork);
            emitter.emit("change", { chainId: newChainId });
          },
        };
      }),
  };
}
