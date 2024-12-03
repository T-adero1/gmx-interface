import { Trans, t } from "@lingui/macro";
import cx from "classnames";
import React, { useCallback, useMemo, useState } from "react";
import { useMedia } from "react-use";

import { USD_DECIMALS } from "config/factors";
import { useMarketsInfoData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import {
  selectTradeboxChooseSuitableMarket,
  selectTradeboxGetMaxLongShortLiquidityPool,
  selectTradeboxMarketInfo,
  selectTradeboxTradeFlags,
  selectTradeboxTradeType,
} from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { PreferredTradeTypePickStrategy } from "domain/synthetics/markets/chooseSuitableMarket";
import { getMarketIndexName, getMarketPoolName } from "domain/synthetics/markets/utils";
import { useTokensFavorites } from "domain/synthetics/tokens/useTokensFavorites";
import { TradeType } from "domain/synthetics/trade";
import type { Token } from "domain/tokens";
import { stripBlacklistedWords } from "domain/tokens/utils";
import { helperToast } from "lib/helperToast";
import { formatAmountHuman, formatUsd } from "lib/numbers";
import { EMPTY_ARRAY, getByKey } from "lib/objects";
import { useFuse } from "lib/useFuse";

import FavoriteStar from "components/FavoriteStar/FavoriteStar";
import { FavoriteTabs } from "components/FavoriteTabs/FavoriteTabs";
import SearchInput from "components/SearchInput/SearchInput";
import { SortDirection, Sorter, useSorterHandlers } from "components/Sorter/Sorter";
import { TableTd, TableTr } from "components/Table/Table";
import TokenIcon from "components/TokenIcon/TokenIcon";
import { getTokenVisualMultiplier } from "config/tokens";
import { MissedCoinsPlace } from "domain/synthetics/userFeedback";
import { useMissedCoinsSearch } from "domain/synthetics/userFeedback/useMissedCoinsSearch";
import { MissedCoinsHint } from "../MissedCoinsHint/MissedCoinsHint";
import {
  SELECTOR_BASE_MOBILE_THRESHOLD,
  SelectorBase,
  SelectorBaseMobileHeaderContent,
  useSelectorClose,
} from "../SelectorBase/SelectorBase";

type Props = {
  selectedToken: Token | undefined;
  options: Token[] | undefined;
  oneRowLabels?: boolean;
};

export default function ChartTokenSelector(props: Props) {
  const { options, selectedToken, oneRowLabels } = props;

  const marketInfo = useSelector(selectTradeboxMarketInfo);
  const { isSwap } = useSelector(selectTradeboxTradeFlags);
  const poolName = marketInfo && !isSwap ? getMarketPoolName(marketInfo) : null;

  const chevronClassName = oneRowLabels === undefined ? undefined : oneRowLabels ? "mt-4" : "mt-2 self-start";

  return (
    <SelectorBase
      popoverPlacement="bottom-start"
      popoverYOffset={16}
      popoverXOffset={-8}
      handleClassName={oneRowLabels === false ? "mr-24" : undefined}
      chevronClassName={chevronClassName}
      label={
        selectedToken ? (
          <span
            className={cx("inline-flex whitespace-nowrap pl-0 text-[20px] font-bold", {
              "items-start": !oneRowLabels,
              "items-center": oneRowLabels,
            })}
          >
            <TokenIcon className="mr-8 mt-4" symbol={selectedToken.symbol} displaySize={20} importSize={24} />
            <span
              className={cx("flex justify-start", {
                "flex-col": !oneRowLabels,
                "flex-row items-center": oneRowLabels,
              })}
            >
              <span className="text-body-large">
                {!isSwap && <>{getTokenVisualMultiplier(selectedToken)}</>}
                {selectedToken.symbol} / USD
              </span>
              {poolName && (
                <span
                  className={cx("text-body-small font-normal text-gray-300", {
                    "ml-8": oneRowLabels,
                  })}
                >
                  [{poolName}]
                </span>
              )}
            </span>
          </span>
        ) : (
          "..."
        )
      }
      modalLabel={t`Market`}
      mobileModalContentPadding={false}
      footerContent={<MissedCoinsHint place={MissedCoinsPlace.marketDropdown} className="!my-12 mx-15" withIcon />}
    >
      <MarketsList options={options} />
    </SelectorBase>
  );
}

type SortField = "longLiquidity" | "shortLiquidity" | "unspecified";

function MarketsList(props: { options: Token[] | undefined }) {
  const { options } = props;
  const { tab, favoriteTokens, toggleFavoriteToken } = useTokensFavorites("chart-token-selector");

  const isMobile = useMedia(`(max-width: ${SELECTOR_BASE_MOBILE_THRESHOLD}px)`);
  const isSmallMobile = useMedia("(max-width: 450px)");

  const close = useSelectorClose();

  const tradeType = useSelector(selectTradeboxTradeType);
  const { orderBy, direction, getSorterProps } = useSorterHandlers<SortField>();
  const [searchKeyword, setSearchKeyword] = useState("");
  const isSwap = tradeType === TradeType.Swap;

  const sortedTokens = useFilterSortTokens({ options, searchKeyword, tab, isSwap, favoriteTokens, direction, orderBy });

  useMissedCoinsSearch({
    searchText: searchKeyword,
    isEmpty: !sortedTokens?.length && tab === "all",
    isLoaded: Boolean(options?.length),
    place: MissedCoinsPlace.marketDropdown,
  });

  const chooseSuitableMarket = useSelector(selectTradeboxChooseSuitableMarket);
  const marketsInfoData = useMarketsInfoData();

  const handleMarketSelect = useCallback(
    (tokenAddress: string, preferredTradeType?: PreferredTradeTypePickStrategy | undefined) => {
      setSearchKeyword("");
      close();

      const chosenMarket = chooseSuitableMarket(tokenAddress, preferredTradeType, tradeType);

      if (chosenMarket?.marketTokenAddress && chosenMarket.tradeType !== TradeType.Swap) {
        const marketInfo = getByKey(marketsInfoData, chosenMarket.marketTokenAddress);
        const nextTradeType = chosenMarket.tradeType;
        if (marketInfo) {
          const indexName = getMarketIndexName(marketInfo);
          const poolName = getMarketPoolName(marketInfo);

          helperToast.success(
            <Trans>
              <span>{nextTradeType === TradeType.Long ? t`Long` : t`Short`}</span>{" "}
              <div className="inline-flex">
                <span>{indexName}</span>
                <span className="subtext gm-toast leading-1">[{poolName}]</span>
              </div>{" "}
              <span>market selected</span>
            </Trans>
          );
        }
      }
    },
    [chooseSuitableMarket, close, marketsInfoData, tradeType]
  );

  const rowVerticalPadding = isMobile ? "py-8" : cx("py-4 group-last-of-type/row:pb-8");
  const rowHorizontalPadding = isSmallMobile
    ? cx("px-6 first-of-type:pl-15 last-of-type:pr-15")
    : "px-8 first-of-type:pl-16 last-of-type:pr-16";
  const thClassName = cx(
    "text-body-medium sticky top-0 border-b border-slate-700 bg-slate-800 text-left font-normal uppercase text-gray-400 first-of-type:text-left last-of-type:[&:not(:first-of-type)]:text-right",
    rowVerticalPadding,
    rowHorizontalPadding
  );
  const tdClassName = cx(
    "text-body-medium cursor-pointer rounded-4 last-of-type:text-right hover:bg-cold-blue-900",
    rowVerticalPadding,
    rowHorizontalPadding
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && sortedTokens && sortedTokens.length > 0) {
        const token = sortedTokens[0];
        handleMarketSelect(token.address);
      }
    },
    [sortedTokens, handleMarketSelect]
  );

  return (
    <>
      <SelectorBaseMobileHeaderContent>
        <div className="mt-16 flex flex-row items-center gap-16">
          <SearchInput
            className="w-full *:!text-body-medium"
            value={searchKeyword}
            setValue={setSearchKeyword}
            onKeyDown={handleKeyDown}
          />
          {!isSwap && <FavoriteTabs favoritesKey="chart-token-selector" />}
        </div>
      </SelectorBaseMobileHeaderContent>
      <div
        className={cx("Synths-ChartTokenSelector", {
          "w-[448px]": !isMobile,
        })}
      >
        {!isMobile && (
          <>
            <div className="m-16 flex justify-between gap-16">
              <SearchInput
                className="w-full *:!text-body-medium"
                value={searchKeyword}
                setValue={setSearchKeyword}
                onKeyDown={handleKeyDown}
              />
              <FavoriteTabs favoritesKey="chart-token-selector" />
            </div>
          </>
        )}

        <div
          className={cx({
            "max-h-[444px] overflow-x-auto": !isMobile,
          })}
        >
          <table className="text-sm w-full border-separate border-spacing-0">
            <thead className="bg-slate-800">
              <tr>
                <th className={thClassName} colSpan={2}>
                  <Trans>Market</Trans>
                </th>
                {!isSwap && (
                  <>
                    <th className={thClassName}>
                      <Sorter {...getSorterProps("longLiquidity")}>
                        <Trans>LONG LIQ.</Trans>
                      </Sorter>
                    </th>
                    <th className={thClassName}>
                      <Sorter {...getSorterProps("shortLiquidity")}>
                        <Trans>SHORT LIQ.</Trans>
                      </Sorter>
                    </th>
                  </>
                )}
              </tr>
            </thead>

            <tbody>
              {sortedTokens?.map((token) => (
                <MarketListItem
                  key={token.address}
                  token={token}
                  isSwap={isSwap}
                  isSmallMobile={isSmallMobile}
                  isFavorite={favoriteTokens?.includes(token.address)}
                  onFavorite={toggleFavoriteToken}
                  rowVerticalPadding={rowVerticalPadding}
                  rowHorizontalPadding={rowHorizontalPadding}
                  tdClassName={tdClassName}
                  onMarketSelect={handleMarketSelect}
                />
              ))}
              {options && options.length > 0 && !sortedTokens?.length && (
                <TableTr hoverable={false} bordered={false}>
                  <TableTd colSpan={isSwap ? 2 : 3} className="text-body-medium text-gray-400">
                    <Trans>No markets matched.</Trans>
                  </TableTd>
                </TableTr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function useFilterSortTokens({
  options,
  searchKeyword,
  tab,
  isSwap,
  favoriteTokens,
  direction,
  orderBy,
}: {
  options: Token[] | undefined;
  searchKeyword: string;
  tab: string;
  isSwap: boolean;
  favoriteTokens: string[];
  direction: SortDirection;
  orderBy: SortField;
}) {
  const fuse = useFuse(
    () =>
      options?.map((item, index) => ({ id: index, name: stripBlacklistedWords(item.name), symbol: item.symbol })) ||
      EMPTY_ARRAY,
    options?.map((item) => item.address)
  );

  const filteredTokens: Token[] | undefined = useMemo(() => {
    const textMatched =
      searchKeyword.trim() && options ? fuse.search(searchKeyword).map((result) => options[result.item.id]) : options;

    const tabMatched = textMatched?.filter((item) => {
      if (tab === "favorites") {
        return favoriteTokens?.includes(item.address);
      }

      return true;
    });

    return tabMatched;
  }, [favoriteTokens, fuse, options, searchKeyword, tab]);

  const getMaxLongShortLiquidityPool = useSelector(selectTradeboxGetMaxLongShortLiquidityPool);

  const sortedTokens = useMemo(() => {
    if (isSwap || orderBy === "unspecified" || direction === "unspecified") {
      return filteredTokens;
    }

    const directionMultiplier = direction === "asc" ? 1 : -1;

    return filteredTokens?.slice().sort((a, b) => {
      const { maxLongLiquidityPool: aLongLiq, maxShortLiquidityPool: aShortLiq } = getMaxLongShortLiquidityPool(a);
      const { maxLongLiquidityPool: bLongLiq, maxShortLiquidityPool: bShortLiq } = getMaxLongShortLiquidityPool(b);

      if (orderBy === "longLiquidity") {
        const aLongLiquidity = aLongLiq?.maxLongLiquidity || 0n;
        const bLongLiquidity = bLongLiq?.maxLongLiquidity || 0n;

        return aLongLiquidity > bLongLiquidity ? directionMultiplier : -directionMultiplier;
      }

      if (orderBy === "shortLiquidity") {
        const aShortLiquidity = aShortLiq?.maxShortLiquidity || 0n;
        const bShortLiquidity = bShortLiq?.maxShortLiquidity || 0n;

        return aShortLiquidity > bShortLiquidity ? directionMultiplier : -directionMultiplier;
      }

      return 0;
    });
  }, [isSwap, direction, filteredTokens, getMaxLongShortLiquidityPool, orderBy]);

  return sortedTokens;
}

function MarketListItem({
  token,
  isSwap,
  isSmallMobile,
  isFavorite,
  onFavorite,
  rowVerticalPadding,
  rowHorizontalPadding,
  tdClassName,
  onMarketSelect,
}: {
  token: Token;
  isSwap: boolean;
  isSmallMobile: boolean;
  isFavorite?: boolean;
  onFavorite: (address: string) => void;
  rowVerticalPadding: string;
  rowHorizontalPadding: string;
  tdClassName: string;
  onMarketSelect: (address: string, preferredTradeType?: PreferredTradeTypePickStrategy | undefined) => void;
}) {
  const getMaxLongShortLiquidityPool = useSelector(selectTradeboxGetMaxLongShortLiquidityPool);

  const { maxLongLiquidityPool, maxShortLiquidityPool } = getMaxLongShortLiquidityPool(token);

  let formattedMaxLongLiquidity = formatUsdWithMobile(!isSwap && maxLongLiquidityPool?.maxLongLiquidity, isSmallMobile);

  let maxShortLiquidityPoolFormatted = formatUsdWithMobile(
    !isSwap && maxShortLiquidityPool?.maxShortLiquidity,
    isSmallMobile
  );

  const handleFavoriteClick = useCallback(() => {
    onFavorite(token.address);
  }, [onFavorite, token.address]);

  const handleSelectLargePosition = useCallback(() => {
    onMarketSelect(token.address, "largestPosition");
  }, [onMarketSelect, token.address]);

  const handleSelectLong = useCallback(() => {
    onMarketSelect(token.address, TradeType.Long);
  }, [onMarketSelect, token.address]);

  const handleSelectShort = useCallback(() => {
    onMarketSelect(token.address, TradeType.Short);
  }, [onMarketSelect, token.address]);

  if (isSwap) {
    return (
      <tr key={token.symbol} className="group/row">
        <td
          className={cx("cursor-pointer rounded-4 pl-16 pr-4 text-center hover:bg-cold-blue-900", rowVerticalPadding)}
          onClick={handleFavoriteClick}
        >
          <FavoriteStar isFavorite={isFavorite} />
        </td>
        <td
          className={cx(
            "text-body-medium w-full cursor-pointer rounded-4 hover:bg-cold-blue-900",
            rowVerticalPadding,
            rowHorizontalPadding
          )}
          onClick={handleSelectLargePosition}
        >
          <span className="inline-flex items-center text-slate-100">
            <TokenIcon
              className="ChartToken-list-icon -my-5 mr-8"
              symbol={token.symbol}
              displaySize={16}
              importSize={24}
            />
            {token.symbol}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr key={token.symbol} className="group/row">
      <td
        className={cx("cursor-pointer rounded-4 pl-16 pr-4 text-center hover:bg-cold-blue-900", rowVerticalPadding)}
        onClick={handleFavoriteClick}
      >
        <FavoriteStar isFavorite={isFavorite} />
      </td>
      <td
        className={cx(
          "text-body-medium cursor-pointer rounded-4 pl-4 hover:bg-cold-blue-900",
          rowVerticalPadding,
          isSmallMobile ? "pr-6" : "pr-8"
        )}
        onClick={handleSelectLargePosition}
      >
        <span className="inline-flex items-center text-slate-100">
          <TokenIcon
            className="ChartToken-list-icon -my-5 mr-8"
            symbol={token.symbol}
            displaySize={16}
            importSize={24}
          />
          {getTokenVisualMultiplier(token)}
          {token.symbol} / USD
        </span>
      </td>

      <td className={tdClassName} onClick={handleSelectLong}>
        {formattedMaxLongLiquidity}
      </td>
      <td className={tdClassName} onClick={handleSelectShort}>
        {maxShortLiquidityPoolFormatted}
      </td>
    </tr>
  );
}

function formatUsdWithMobile(amount: bigint | undefined | false, isSmallMobile: boolean) {
  if (amount === undefined || amount === false) {
    return "";
  }

  if (isSmallMobile) {
    return formatAmountHuman(amount, USD_DECIMALS, true);
  }

  return formatUsd(amount)!;
}
