import { i18n } from "@lingui/core";
import { t } from "@lingui/macro";
import { BigNumber } from "ethers";

import { getMarketFullName, getMarketIndexName, getMarketPoolName } from "domain/synthetics/markets";
import { OrderType, isIncreaseOrderType } from "domain/synthetics/orders";
import { convertToUsd } from "domain/synthetics/tokens/utils";
import { getShouldUseMaxPrice } from "domain/synthetics/trade";
import { PositionTradeAction, TradeActionType } from "domain/synthetics/tradeHistory";
import { PRECISION } from "lib/legacy";
import { BN_BILLION, formatDeltaUsd, formatTokenAmount, formatTokenAmountWithUsd, formatUsd } from "lib/numbers";

import { actionTextMap, getActionTitle } from "../../keys";
import {
  MakeOptional,
  RowDetails,
  formatTradeActionTimestamp,
  formatTradeActionTimestampISO,
  getErrorTooltipTitle,
  infoRow,
  lines,
  numberToState,
  tryGetError,
} from "./shared";

const DOUBLE_NON_BREAKING_SPACE = String.fromCharCode(160) + String.fromCharCode(160);
const INEQUALITY_GT = ">" + DOUBLE_NON_BREAKING_SPACE;
const INEQUALITY_LT = "<" + DOUBLE_NON_BREAKING_SPACE;

export const formatPositionMessage = (
  tradeAction: PositionTradeAction,
  minCollateralUsd: BigNumber,
  relativeTimestamp = true
): RowDetails => {
  const collateralToken = tradeAction.initialCollateralToken;
  const sizeDeltaUsd = tradeAction.sizeDeltaUsd;
  const collateralDeltaAmount = tradeAction.initialCollateralDeltaAmount;

  const isIncrease = isIncreaseOrderType(tradeAction.orderType);
  const isLong = tradeAction.isLong;
  const longShortText = isLong ? t`Long` : t`Short`;
  const sign = isIncrease ? "+" : "-";
  let inequality: string;
  if (isIncrease && isLong) {
    inequality = INEQUALITY_LT;
  } else if (isIncrease && !isLong) {
    inequality = INEQUALITY_GT;
  } else if (!isIncrease && isLong) {
    inequality = INEQUALITY_GT;
  } else {
    inequality = INEQUALITY_LT;
  }

  const sizeDeltaText = `${sign}${formatUsd(sizeDeltaUsd)}`;

  const indexName = getMarketIndexName({
    indexToken: tradeAction.indexToken,
    isSpotOnly: tradeAction.marketInfo.isSpotOnly,
  });
  const poolName = getMarketPoolName({
    longToken: tradeAction.marketInfo.longToken,
    shortToken: tradeAction.marketInfo.shortToken,
  });

  const fullMarket = getMarketFullName({
    indexToken: tradeAction.indexToken,
    longToken: tradeAction.marketInfo.longToken,
    shortToken: tradeAction.marketInfo.shortToken,
    isSpotOnly: tradeAction.marketInfo.isSpotOnly,
  });

  const marketPrice = getTokenPriceByTradeAction(tradeAction);
  const formattedMarketPrice = formatUsd(marketPrice);

  const formattedAcceptablePrice = formatUsd(tradeAction.acceptablePrice);

  const action = getActionTitle(tradeAction.orderType, tradeAction.eventName);
  const timestamp = formatTradeActionTimestamp(tradeAction.transaction.timestamp, relativeTimestamp);
  const timestampISO = formatTradeActionTimestampISO(tradeAction.transaction.timestamp);

  const market = `${longShortText} ${indexName}`;

  const formattedCollateralDelta = formatTokenAmount(
    collateralDeltaAmount,
    collateralToken.decimals,
    collateralToken.symbol,
    {
      useCommas: true,
    }
  );

  const formattedExecutionPrice = formatUsd(tradeAction.executionPrice);
  const formattedPriceImpact = formatDeltaUsd(tradeAction.priceImpactUsd);

  let result: MakeOptional<RowDetails, "action" | "market" | "timestamp" | "timestampISO" | "price" | "size">;

  const ot = tradeAction.orderType;
  const ev = tradeAction.eventName;

  //#region MarketIncrease
  if (ot === OrderType.MarketIncrease && ev === TradeActionType.OrderCreated) {
    const customAction = sizeDeltaUsd.gt(0) ? action : i18n._(actionTextMap["Deposit-OrderCreated"]!);
    const customSize = sizeDeltaUsd.gt(0) ? sizeDeltaText : formattedCollateralDelta;
    const customPrice = inequality + formattedAcceptablePrice!;
    const priceComment = lines(t`Acceptable price for the order.`);

    result = {
      action: customAction,
      size: customSize,
      price: customPrice,
      priceComment,
      acceptablePrice: customPrice,
    };
  } else if (ot === OrderType.MarketIncrease && ev === TradeActionType.OrderExecuted) {
    const customAction = sizeDeltaUsd.gt(0) ? action : i18n._(actionTextMap["Deposit-OrderExecuted"]!);
    const customSize = sizeDeltaUsd.gt(0) ? sizeDeltaText : formattedCollateralDelta;
    const priceComment = sizeDeltaUsd.gt(0)
      ? lines(
          t`Mark price for the order.`,
          "",
          infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
          infoRow(t`Order Execution Price`, formattedExecutionPrice!),
          infoRow(t`Price Impact`, {
            text: formattedPriceImpact!,
            state: numberToState(tradeAction.priceImpactUsd!),
          }),
          "",
          t`Order execution price takes into account price impact.`
        )
      : lines(t`Mark price for the order.`);

    result = {
      action: customAction,
      size: customSize,
      priceComment: priceComment,
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
  } else if (ot === OrderType.MarketIncrease && ev === TradeActionType.OrderCancelled) {
    const customAction = sizeDeltaUsd.gt(0) ? action : i18n._(actionTextMap["Deposit-OrderCancelled"]!);
    const customSize = sizeDeltaUsd.gt(0) ? sizeDeltaText : formattedCollateralDelta;
    const error = tradeAction.reasonBytes && tryGetError(tradeAction.reasonBytes);

    const priceComment = sizeDeltaUsd.gt(0)
      ? lines(
          t`Mark price for the order.`,
          "",
          infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!)
        )
      : lines(t`Mark price for the order.`);

    result = {
      action: customAction,
      actionComment:
        error &&
        lines({
          text: getErrorTooltipTitle(error.name),
          state: "error",
        }),
      size: customSize,
      priceComment,
      acceptablePrice: inequality + formattedAcceptablePrice!,
      isActionError: true,
    };
    //#endregion MarketIncrease
    //#region LimitIncrease
  } else if (
    (ot === OrderType.LimitIncrease && ev === TradeActionType.OrderCreated) ||
    (ot === OrderType.LimitIncrease && ev === TradeActionType.OrderUpdated) ||
    (ot === OrderType.LimitIncrease && ev === TradeActionType.OrderCancelled)
  ) {
    const customPrice = inequality + formatUsd(tradeAction.triggerPrice)!;

    result = {
      price: customPrice,
      priceComment: lines(
        t`Trigger price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!)
      ),
      triggerPrice: customPrice,
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
  } else if (ot === OrderType.LimitIncrease && ev === TradeActionType.OrderExecuted) {
    result = {
      priceComment: lines(
        t`Mark price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
        infoRow(t`Order Execution Price`, formattedExecutionPrice!),
        infoRow(t`Price Impact`, {
          text: formattedPriceImpact!,
          state: numberToState(tradeAction.priceImpactUsd!),
        }),
        "",
        t`Order execution price takes into account price impact.`
      ),
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
  } else if (ot === OrderType.LimitIncrease && ev === TradeActionType.OrderFrozen) {
    let error = tradeAction.reasonBytes && tryGetError(tradeAction.reasonBytes);

    result = {
      actionComment:
        error &&
        lines({
          text: getErrorTooltipTitle(error.name),
          state: "error",
        }),
      priceComment: lines(
        t`Mark price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
        error?.args?.price && infoRow(t`Order Execution Price`, formatUsd(error.args.price))
      ),
      acceptablePrice: inequality + formattedAcceptablePrice!,
      isActionError: true,
    };
    //#endregion LimitIncrease
    //#region MarketDecrease
  } else if (ot === OrderType.MarketDecrease && ev === TradeActionType.OrderCreated) {
    const customAction = sizeDeltaUsd.gt(0) ? action : i18n._(actionTextMap["Withdraw-OrderCreated"]!);
    const customSize = sizeDeltaUsd.gt(0) ? sizeDeltaText : formattedCollateralDelta;
    const customPrice = inequality + formattedAcceptablePrice!;
    const priceComment = lines(t`Acceptable price for the order.`);

    result = {
      action: customAction,
      size: customSize,
      price: customPrice,
      priceComment,
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
  } else if (ot === OrderType.MarketDecrease && ev === TradeActionType.OrderCancelled) {
    const customAction = sizeDeltaUsd.gt(0) ? action : i18n._(actionTextMap["Withdraw-OrderCreated"]!);
    const customSize = sizeDeltaUsd.gt(0) ? sizeDeltaText : formattedCollateralDelta;
    const customPrice = inequality + formattedAcceptablePrice!;
    const priceComment = lines(t`Acceptable price for the order.`);
    const error = tradeAction.reasonBytes && tryGetError(tradeAction.reasonBytes);

    result = {
      action: customAction,
      actionComment:
        error &&
        lines({
          text: getErrorTooltipTitle(error.name),
          state: "error",
        }),
      size: customSize,
      price: customPrice,
      priceComment,
      acceptablePrice: inequality + formattedAcceptablePrice!,
      isActionError: true,
    };
  } else if (ot === OrderType.MarketDecrease && ev === TradeActionType.OrderExecuted) {
    const customAction = sizeDeltaUsd.gt(0) ? action : i18n._(actionTextMap["Withdraw-OrderExecuted"]!);
    const customSize = sizeDeltaUsd.gt(0) ? sizeDeltaText : formattedCollateralDelta;

    result = {
      action: customAction,
      size: customSize,
      priceComment: lines(
        t`Mark price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
        infoRow(t`Order Execution Price`, formattedExecutionPrice!),
        infoRow(t`Price Impact`, {
          text: formattedPriceImpact!,
          state: numberToState(tradeAction.priceImpactUsd!),
        }),
        "",
        t`Order execution price takes into account price impact.`
      ),
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
    //#endregion MarketDecrease
    //#region LimitDecrease
  } else if (
    (ot === OrderType.LimitDecrease && ev === TradeActionType.OrderCreated) ||
    (ot === OrderType.LimitDecrease && ev === TradeActionType.OrderUpdated) ||
    (ot === OrderType.LimitDecrease && ev === TradeActionType.OrderCancelled)
  ) {
    const customPrice = inequality + formatUsd(tradeAction.triggerPrice)!;

    result = {
      price: customPrice,
      priceComment: lines(
        t`Trigger price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!)
      ),
      triggerPrice: customPrice,
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
  } else if (ot === OrderType.LimitDecrease && ev === TradeActionType.OrderExecuted) {
    result = {
      priceComment: lines(
        t`Mark price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
        infoRow(t`Order Execution Price`, formattedExecutionPrice!),
        infoRow(t`Price Impact`, {
          text: formattedPriceImpact!,
          state: numberToState(tradeAction.priceImpactUsd!),
        }),
        "",
        t`Order execution price takes into account price impact.`
      ),
      acceptablePrice: inequality + formattedAcceptablePrice!,
    };
  } else if (ot === OrderType.LimitDecrease && ev === TradeActionType.OrderFrozen) {
    let error = tradeAction.reasonBytes && tryGetError(tradeAction.reasonBytes);

    result = {
      actionComment:
        error &&
        lines({
          text: getErrorTooltipTitle(error.name),
          state: "error",
        }),
      priceComment: lines(
        t`Mark price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
        error?.args?.price && [t`Order Execution Price`, ": ", formatUsd(error.args.price)]
      ),
      acceptablePrice: inequality + formattedAcceptablePrice!,
      isActionError: true,
    };
    //#endregion LimitDecrease
    //#region StopLossDecrease
  } else if (
    (ot === OrderType.StopLossDecrease && ev === TradeActionType.OrderCreated) ||
    (ot === OrderType.StopLossDecrease && ev === TradeActionType.OrderUpdated) ||
    (ot === OrderType.StopLossDecrease && ev === TradeActionType.OrderCancelled)
  ) {
    const customPrice = inequality + formatUsd(tradeAction.triggerPrice)!;

    const isAcceptablePriceUseful =
      !tradeAction.acceptablePrice.isZero() && !tradeAction.acceptablePrice.gte(BN_BILLION);
    const priceComment = isAcceptablePriceUseful
      ? lines(
          t`Trigger price for the order.`,
          "",
          infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!)
        )
      : lines(t`Trigger price for the order.`);

    result = {
      price: customPrice,
      priceComment: priceComment,
      triggerPrice: customPrice,
    };
  } else if (ot === OrderType.StopLossDecrease && ev === TradeActionType.OrderExecuted) {
    result = {
      priceComment: lines(
        t`Mark price for the order.`,
        "",
        infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!),
        infoRow(t`Order Execution Price`, formattedExecutionPrice!),
        infoRow(t`Price Impact`, {
          text: formattedPriceImpact!,
          state: numberToState(tradeAction.priceImpactUsd!),
        }),
        "",
        t`Order execution price takes into account price impact.`
      ),
    };
  } else if (ot === OrderType.StopLossDecrease && ev === TradeActionType.OrderFrozen) {
    let error = tradeAction.reasonBytes && tryGetError(tradeAction.reasonBytes);
    const isAcceptablePriceUseful =
      !tradeAction.acceptablePrice.isZero() && !tradeAction.acceptablePrice.gte(BN_BILLION);

    result = {
      actionComment:
        error &&
        lines({
          text: getErrorTooltipTitle(error.name),
          state: "error",
        }),
      priceComment: lines(
        t`Mark price for the order.`,
        isAcceptablePriceUseful || error?.args?.price ? "" : undefined,
        isAcceptablePriceUseful
          ? infoRow(t`Order Acceptable Price`, inequality + formattedAcceptablePrice!)
          : undefined,
        error?.args?.price && infoRow(t`Order Execution Price`, formatUsd(error.args.price))
      ),
      isActionError: true,
    };

    //#endregion StopLossDecrease
    //#region Liquidation
  } else if (ot === OrderType.Liquidation && ev === TradeActionType.OrderExecuted) {
    const maxLeverage = PRECISION.div(tradeAction.marketInfo.minCollateralFactor);
    const formattedMaxLeverage = Number(maxLeverage).toFixed(1) + "x";

    const initialCollateralUsd = convertToUsd(
      tradeAction.initialCollateralDeltaAmount,
      tradeAction.initialCollateralToken?.decimals,
      tradeAction.collateralTokenPriceMin
    );

    const formattedInitialCollateral = formatTokenAmountWithUsd(
      tradeAction.initialCollateralDeltaAmount,
      initialCollateralUsd,
      tradeAction.initialCollateralToken?.symbol,
      tradeAction.initialCollateralToken?.decimals
    );

    const formattedPnl = formatUsd(tradeAction.pnlUsd)!;
    const formattedBasePnl = formatUsd(tradeAction.basePnlUsd)!;

    const borrowingFeeUsd = convertToUsd(
      tradeAction.borrowingFeeAmount,
      tradeAction.initialCollateralToken?.decimals,
      tradeAction.collateralTokenPriceMin
    );
    const formattedBorrowFee = formatUsd(borrowingFeeUsd?.mul(-1))!;

    const fundingFeeUsd = convertToUsd(
      tradeAction.fundingFeeAmount,
      tradeAction.initialCollateralToken?.decimals,
      tradeAction.collateralTokenPriceMin
    );
    const formattedFundingFee = formatUsd(fundingFeeUsd?.mul(-1))!;

    const positionFeeUsd = convertToUsd(
      tradeAction.positionFeeAmount,
      tradeAction.initialCollateralToken?.decimals,
      tradeAction.collateralTokenPriceMin
    );
    const formattedPositionFee = formatUsd(positionFeeUsd?.mul(-1))!;

    const formattedMinCollateral = formatUsd(minCollateralUsd)!;

    result = {
      priceComment: lines(
        t`Mark price for the liquidation.`,
        "",
        t`This position was liquidated as the max. leverage of ${formattedMaxLeverage} was exceeded when taking into account fees.`,
        "",
        infoRow(t`Order Execution Price`, formattedExecutionPrice!),
        "",
        t`Order execution price takes into account price impact.`,
        "",
        infoRow(t`Initial Collateral`, formattedInitialCollateral!),
        infoRow(t`PnL`, {
          text: formattedBasePnl,
          state: numberToState(tradeAction.pnlUsd!),
        }),
        infoRow(t`Borrow Fee`, {
          text: formattedBorrowFee,
          state: "error",
        }),
        infoRow(t`Funding Fee`, {
          text: formattedFundingFee,
          state: "error",
        }),
        infoRow(t`Position Fee`, {
          text: formattedPositionFee,
          state: "error",
        }),
        infoRow(t`Price Impact`, {
          text: formattedPriceImpact!,
          state: numberToState(tradeAction.priceImpactUsd!),
        }),
        "",
        infoRow(t`PnL after Fees and Price Impact`, {
          text: formattedPnl,
          state: numberToState(tradeAction.pnlUsd!),
        }),
        "",
        infoRow(t`Leftover Collateral`, formattedMinCollateral),
        infoRow(t`Min. required Collateral`, formattedMinCollateral)
      ),
      isActionError: true,
    };
    //#endregion Liquidation
  }

  return {
    action,
    market,
    fullMarket,
    timestamp,
    timestampISO,
    price: formattedMarketPrice || "",
    size: sizeDeltaText,
    marketPrice: formattedMarketPrice,
    executionPrice: formattedExecutionPrice,
    priceImpact: formattedPriceImpact,
    indexName,
    poolName,
    ...result!,
  };
};

function getTokenPriceByTradeAction(tradeAction: PositionTradeAction) {
  return getShouldUseMaxPrice(isIncreaseOrderType(tradeAction.orderType), tradeAction.isLong)
    ? tradeAction.indexTokenPriceMax
    : tradeAction.indexTokenPriceMin;
}
