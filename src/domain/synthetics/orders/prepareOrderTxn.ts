import { t } from "@lingui/macro";
import { getIsFlagEnabled } from "config/ab";
import { ethers, Wallet } from "ethers";
import { getGasLimit, getGasPrice } from "lib/contracts";
import { getErrorMessage } from "lib/contracts/transactionErrors";
import { helperToast } from "lib/helperToast";
import { OrderErrorContext, OrderMetricId, sendTxnErrorMetric } from "lib/metrics";

export type PrepareOrderTxnParams = {
  simulationPromise?: Promise<void>;
};

export async function prepareOrderTxn(
  chainId: number,
  contract: ethers.Contract,
  method: string,
  params: any[],
  value: bigint,
  customSigners?: Wallet[],
  simulationPromise?: Promise<any>,
  metricId?: OrderMetricId
) {
  if (!contract.runner?.provider) {
    helperToast.error(t`Error preparing transaction. Provider is not defined`);
    throw new Error("Provider is not defined");
  }

  const customSignerContracts = customSigners?.map((signer) => contract.connect(signer)) || [];

  const [gasLimit, gasPriceData, customSignersGasLimits, customSignersGasPrices] = await Promise.all([
    getIsFlagEnabled("testRemoveGasRequests")
      ? Promise.resolve(undefined)
      : getGasLimit(contract, method, params, value).catch(makeCatchTransactionError(chainId, metricId, "gasLimit")),
    getIsFlagEnabled("testRemoveGasRequests")
      ? Promise.resolve(undefined)
      : getGasPrice(contract.runner.provider, chainId).catch(makeCatchTransactionError(chainId, metricId, "gasPrice")),
    // subaccount
    !customSignerContracts.length
      ? Promise.resolve(undefined)
      : Promise.all(
          customSignerContracts.map((cntrct) =>
            getGasLimit(cntrct, method, params, value).catch(makeCatchTransactionError(chainId, metricId, "gasLimit"))
          )
        ),
    !customSignerContracts.length
      ? Promise.resolve(undefined)
      : Promise.all(
          customSignerContracts.map((cntrct) =>
            getGasPrice(cntrct.runner!.provider!, chainId).catch(
              makeCatchTransactionError(chainId, metricId, "gasPrice")
            )
          )
        ),
    // simulation
    simulationPromise,
  ]);

  return { gasLimit, gasPriceData, customSignersGasLimits, customSignersGasPrices };
}

export const makeCatchTransactionError =
  (chainId: number, metricId: OrderMetricId | undefined, errorContext: OrderErrorContext) => (e: Error) => {
    if (metricId) {
      sendTxnErrorMetric(metricId, e, errorContext);
    }

    const { failMsg, autoCloseToast } = getErrorMessage(chainId, e);
    helperToast.error(failMsg, { autoClose: autoCloseToast });

    throw e;
  };
