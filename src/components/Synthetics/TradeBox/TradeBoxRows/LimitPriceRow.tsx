import { t } from "@lingui/macro";

import ExchangeInfoRow from "components/Exchange/ExchangeInfoRow";
import Tooltip from "components/Tooltip/Tooltip";
import {
  useTradeboxFromToken,
  useTradeboxToToken,
  useTradeboxTradeFlags,
  useTradeboxTriggerPrice,
} from "context/SyntheticsStateContext/hooks/tradeboxHooks";
import { selectTradeboxTradeRatios } from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { formatTokensRatio } from "domain/synthetics/tokens";
import { formatUsd } from "lib/numbers";
import { useMemo } from "react";

export function LimitPriceRow() {
  const { isLimit, isSwap, isIncrease } = useTradeboxTradeFlags();
  const triggerPrice = useTradeboxTriggerPrice();
  const toToken = useTradeboxToToken();
  const fromToken = useTradeboxFromToken();
  const { triggerRatio } = useSelector(selectTradeboxTradeRatios);

  const value = useMemo(() => {
    if (isSwap) {
      return (
        <Tooltip
          position="bottom-end"
          handle={formatTokensRatio(fromToken, toToken, triggerRatio) || "-"}
          renderContent={() =>
            t`Limit Order Price to guarantee Min. Receive amount is updated in real time in the Orders tab after the order has been created.`
          }
        />
      );
    }

    if (isIncrease) {
      return (
        formatUsd(triggerPrice, {
          displayDecimals: toToken?.priceDecimals,
        }) || "-"
      );
    }

    return null;
  }, [isSwap, toToken, triggerPrice, fromToken, triggerRatio, isIncrease]);

  if (!isLimit || !value) {
    return null;
  }

  return <ExchangeInfoRow className="SwapBox-info-row" label={t`Limit Price`} value={value} />;
}
