import React from 'react';
import { SignalData } from '../hooks/useCryptoSignals'; 
import { getRecentRSIDiff, getSignal } from '../utils/calculations'; 

const FilterControls: React.FC<FilterControlsProps> = ({
  signals,
  search,
  setSearch,
  showOnlyFavorites,
  setShowOnlyFavorites,
  favorites,
  setFavorites,
  trendFilter,
  setTrendFilter,
  signalFilter,
  setSignalFilter,
}) => {
  const searchTerm = search.trim().toLowerCase();

  const filteredSignalsForCounts = signals.filter((s) => {
    const symbol = s.symbol?.toLowerCase() || '';
    const matchesSearch = !searchTerm || symbol.includes(searchTerm);
    const isFavorite = favorites.has(s.symbol);
    return matchesSearch && (!showOnlyFavorites || isFavorite);
  });

  const getCountForBooleanSignal = (field: keyof SignalData) =>
    filteredSignalsForCounts.filter((s) => s[field]).length;

  const bullishMainTrendCount = filteredSignalsForCounts.filter((s) => s.mainTrend?.trend === 'bullish').length;
  const bearishMainTrendCount = filteredSignalsForCounts.filter((s) => s.mainTrend?.trend === 'bearish').length;
  const bullishBreakoutCount = getCountForBooleanSignal('bullishBreakout');
  const bearishBreakoutCount = getCountForBooleanSignal('bearishBreakout');
  const breakoutFailureCount = getCountForBooleanSignal('breakoutFailure');
  const testedPrevHighCount = getCountForBooleanSignal('testedPrevHigh');
  const testedPrevLowCount = getCountForBooleanSignal('testedPrevLow');
  const bullishReversalCount = filteredSignalsForCounts.filter((s) => s.bullishReversal?.signal === true).length;
  const bearishReversalCount = filteredSignalsForCounts.filter((s) => s.bearishReversal?.signal === true).length;
  const bullishSpikeCount = filteredSignalsForCounts.filter((s) => s.bullishSpike?.signal === true).length;
  const bearishCollapseCount = filteredSignalsForCounts.filter((s) => s.bearishCollapse?.signal === true).length;
  const ema14InsideResultsCount = filteredSignalsForCounts.filter((s) => s.ema14InsideResults?.some(r => r.inside)).length;
  const greenPriceChangeCount = filteredSignalsForCounts.filter((t) => parseFloat(t.priceChangePercent as any) > 0).length;
  const redPriceChangeCount = filteredSignalsForCounts.filter((t) => parseFloat(t.priceChangePercent as any) < 0).length;
  const greenVolumeCount = filteredSignalsForCounts.filter((s) => s.highestVolumeColorPrev === 'green').length;
  const redVolumeCount = filteredSignalsForCounts.filter((s) => s.highestVolumeColorPrev === 'red').length;

  const signalCounts = React.useMemo(() => {
    const counts = {
      maxZonePump: 0,
      maxZoneDump: 0,
      balanceZonePump: 0,
      balanceZoneDump: 0,
      lowestZonePump: 0,
      lowestZoneDump: 0,
    };

    filteredSignalsForCounts.forEach((s) => {
      const signal = getSignal(s)?.trim().toUpperCase();
      switch (signal) {
        case 'MAX ZONE PUMP': counts.maxZonePump++; break;
        case 'MAX ZONE DUMP': counts.maxZoneDump++; break;
        case 'BALANCE ZONE PUMP': counts.balanceZonePump++; break;
        case 'BALANCE ZONE DUMP': counts.balanceZoneDump++; break;
        case 'LOWEST ZONE PUMP': counts.lowestZonePump++; break;
        case 'LOWEST ZONE DUMP': counts.lowestZoneDump++; break;
      }
    });
    return counts;
  }, [filteredSignalsForCounts]);

  const buttonBase =
    'px-3 py-1 rounded-full flex items-center gap-1 transition-all duration-200 border';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
      {/* Left Panel - Filters */}
      <div className="flex flex-col gap-6 text-sm">
        {/* Trend Filters */}
        <section>
          <h2 className="mb-3 font-semibold text-gradient-to-br from-yellow-400 via-orange-300 to-pink-300 bg-clip-text text-transparent text-base">
            📊 Trend Filters
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Bullish Trend', key: 'bullishMainTrend', count: bullishMainTrendCount, color: 'text-green-300' },
              { label: 'Bearish Trend', key: 'bearishMainTrend', count: bearishMainTrendCount, color: 'text-red-300' },
              { label: 'Bullish Reversal', key: 'bullishReversal', count: bullishReversalCount, color: 'text-green-400' },
              { label: 'Bearish Reversal', key: 'bearishReversal', count: bearishReversalCount, color: 'text-red-400' },
              { label: 'Bullish Spike', key: 'bullishSpike', count: bullishSpikeCount, color: 'text-green-200' },
              { label: 'Bearish Collapse', key: 'bearishCollapse', count: bearishCollapseCount, color: 'text-red-200' },
              { label: 'Breakout Failure', key: 'breakoutFailure', count: breakoutFailureCount, color: 'text-yellow-300' },
              { label: 'Bullish Breakout', key: 'bullishBreakout', count: bullishBreakoutCount, color: 'text-yellow-400' },
              { label: 'Bearish Breakout', key: 'bearishBreakout', count: bearishBreakoutCount, color: 'text-yellow-500' },
              { label: 'Tested Prev High', key: 'testedPrevHigh', count: testedPrevHighCount, color: 'text-blue-300' },
              { label: 'Tested Prev Low', key: 'testedPrevLow', count: testedPrevLowCount, color: 'text-blue-400' },
            ].map(({ label, key, count, color }) => (
              <button
                key={key}
                onClick={() => setTrendFilter(trendFilter === key ? null : key)}
                className={`${buttonBase} ${
                  trendFilter === key
                    ? 'bg-yellow-500 text-black border-yellow-600 shadow-md'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
              >
                <span>{label}</span>
                <span className={`text-xs font-bold ${color}`}>{count}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Signal Filters */}
        <section>
          <h2 className="mb-3 font-semibold text-gradient-to-br from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent text-base">
            📈 Zone Signal Filters
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'MAX ZONE PUMP', key: 'MAX ZONE PUMP', count: signalCounts.maxZonePump, color: 'text-yellow-300' },
              { label: 'MAX ZONE DUMP', key: 'MAX ZONE DUMP', count: signalCounts.maxZoneDump, color: 'text-yellow-400' },
              { label: 'BALANCE ZONE PUMP', key: 'BALANCE ZONE PUMP', count: signalCounts.balanceZonePump, color: 'text-purple-300' },
              { label: 'BALANCE ZONE DUMP', key: 'BALANCE ZONE DUMP', count: signalCounts.balanceZoneDump, color: 'text-purple-400' },
              { label: 'LOWEST ZONE PUMP', key: 'LOWEST ZONE PUMP', count: signalCounts.lowestZonePump, color: 'text-yellow-500' },
              { label: 'LOWEST ZONE DUMP', key: 'LOWEST ZONE DUMP', count: signalCounts.lowestZoneDump, color: 'text-yellow-600' },
            ].map(({ label, key, count, color }) => (
              <button
                key={key}
                onClick={() => setSignalFilter(signalFilter === key ? null : key)}
                className={`${buttonBase} ${
                  signalFilter === key
                    ? 'bg-green-500 text-black border-green-600 shadow-md'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
              >
                <span>{label}</span>
                <span className={`text-xs font-bold ${color}`}>{count}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Clear All */}
        <div>
          <button
            onClick={() => {
              setSearch('');
              setTrendFilter(null);
              setSignalFilter(null);
              setShowOnlyFavorites(false);
            }}
            className="px-5 py-2 rounded-full bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold shadow hover:brightness-110 transition"
          >
            🔄 Clear All Filters
          </button>
        </div>
      </div>

      {/* Right Panel - Summary */}
      <div className="sticky top-0 z-20 bg-gray-900 border border-gray-700 rounded-xl p-5 text-white shadow-lg space-y-5">
        <div className="space-y-3">
          {/* Trend Summary */}
          <div className="bg-gray-800 p-3 rounded-lg shadow-inner border border-gray-600">
            <div className="flex justify-between">
              <span>📈 Bull Trend:</span>
              <span className="text-green-400 font-bold">{bullishMainTrendCount}</span>
            </div>
            <div className="flex justify-between">
              <span>📉 Bear Trend:</span>
              <span className="text-red-400 font-bold">{bearishMainTrendCount}</span>
            </div>
          </div>

          {/* EMA Inside */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 shadow-inner">
            <div className="flex justify-between items-center">
              <span>📍 EMA14 Inside EMA70–200:</span>
              <span className="text-yellow-300 font-bold text-lg">{ema14InsideResultsCount}</span>
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 shadow-inner">
            <div className="font-semibold mb-2">🔹 24h Price Change</div>
            <div className="flex justify-between">
              <span className="text-green-400">🟢 Green:</span>
              <span>{greenPriceChangeCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-400">🔴 Red:</span>
              <span>{redPriceChangeCount}</span>
            </div>
          </div>

          {/* Volume Summary */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 shadow-inner">
            <div className="font-semibold mb-2">🔸 Volume Summary</div>
            <div className="flex justify-between">
              <span className="text-green-400">🟢 Green Volume:</span>
              <span>{greenVolumeCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-400">🔴 Red Volume:</span>
              <span>{redVolumeCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterControls;
