import React from 'react';
import { SignalData } from '../hooks/useCryptoSignals'; // Adjust import path
import { getRecentRSIDiff, getSignal } from '../utils/calculations'; // Adjust import path

interface FilterControlsProps {
  signals: SignalData[];
  search: string;
  setSearch: (search: string) => void;
  showOnlyFavorites: boolean;
  setShowOnlyFavorites: (show: boolean) => void;
  favorites: Set<string>;
  setFavorites: React.Dispatch<React.SetStateAction<Set<string>>>;
  trendFilter: string | null;
  setTrendFilter: (filter: string | null) => void;
  signalFilter: string | null;
  setSignalFilter: (filter: string | null) => void;
}

const trendKeyToMainTrendValue: Record<string, 'bullish' | 'bearish'> = {
  bullishMainTrend: 'bullish',
  bearishMainTrend: 'bearish',
};

const trendKeyToBooleanField: Record<string, keyof SignalData> = {
  bullishBreakout: 'bullishBreakout',
  bearishBreakout: 'bearishBreakout',
  breakoutFailure: 'breakoutFailure',
  testedPrevHigh: 'testedPrevHigh',
  testedPrevLow: 'testedPrevLow',
  bullishReversal: 'bullishReversal',
  bearishReversal: 'bearishReversal',
  bullishSpike: 'bullishSpike',
  bearishCollapse: 'bearishCollapse',
  ema14InsideResults: 'ema14InsideResults',
  highestVolumeColorPrev: 'highestVolumeColorPrev'
};

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


  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 overflow-auto">
      <div className="flex flex-col gap-4 text-sm">
        {/* Trend Filters Section */}
        <div>
          <p className="text-gray-400 mb-2 font-semibold">
            📊 Trend Filters — Tap to filter data based on trend-related patterns (e.g. breakouts, reversals):
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Bullish Trend', key: 'bullishMainTrend', count: bullishMainTrendCount, color: 'text-green-300' },
              { label: 'Bearish Trend', key: 'bearishMainTrend', count: bearishMainTrendCount, color: 'text-red-300' },
              { label: 'Bullish Reversal', key: 'bullishReversal', count: bullishReversalCount, color: 'text-green-300' },
              { label: 'Bearish Reversal', key: 'bearishReversal', count: bearishReversalCount, color: 'text-red-300' },
              { label: 'Bullish Spike', key: 'bullishSpike', count: bullishSpikeCount, color: 'text-green-300' },
              { label: 'Bearish Collapse', key: 'bearishCollapse', count: bearishCollapseCount, color: 'text-red-300' },
              { label: 'Breakout Failure', key: 'breakoutFailure', count: breakoutFailureCount, color: 'text-yellow-300' },
              { label: 'Bullish Breakout', key: 'bullishBreakout', count: bullishBreakoutCount, color: 'text-yellow-400' },
              { label: 'Bearish Breakout', key: 'bearishBreakout', count: bearishBreakoutCount, color: 'text-yellow-400' },
              { label: 'Tested Prev High', key: 'testedPrevHigh', count: testedPrevHighCount, color: 'text-blue-300' },
              { label: 'Tested Prev Low', key: 'testedPrevLow', count: testedPrevLowCount, color: 'text-blue-300' },
            ].map(({ label, key, count, color }) => (
              <button
                key={key}
                onClick={() => setTrendFilter(trendFilter === key ? null : key)}
                className={`px-3 py-1 rounded-full flex items-center gap-1 ${
                  trendFilter === key ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'
                }`}
              >
                <span>{label}</span>
                <span className={`text-xs font-bold ${color}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Signal Filters Section */}
        <div>
          <p className="text-gray-400 mb-2 font-semibold">📈 Signal Filters — Tap to show signals based on technical zones or momentum shifts:</p>
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
                className={`px-3 py-1 rounded-full flex items-center gap-1 ${
                  signalFilter === key ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'
                }`}
              >
                <span>{label}</span>
                <span className={`text-xs font-bold ${color}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Clear Button */}
        <div>
          <button
            onClick={() => {
              setSearch('');
              setTrendFilter(null);
              setSignalFilter(null);
              setShowOnlyFavorites(false);
            }}
            className="px-4 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Summary Panel (placeholder, will be a separate component) */}
      <div className="sticky top-0 z-30 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-sm shadow-md">
        <div className="flex flex-col gap-3">
          {/* Trend Counts */}
          <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
            <div className="flex items-center gap-2">
              <span>📈 Bull Trend:</span>
              <span className="text-green-400 font-bold">{bullishMainTrendCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>📉 Bear Trend:</span>
              <span className="text-red-400 font-bold">{bearishMainTrendCount}</span>
            </div>
          </div>

          {/* EMA14 Inside Range */}
          <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
            <div className="flex items-center gap-1">
              <span className="flex flex-col leading-tight">
                <span className="text-sm">📍 EMA14 Inside</span>
                <span className="text-sm">EMA70–200:</span>
              </span>
              <span className="text-yellow-400 font-bold text-lg">{ema14InsideResultsCount}</span>
            </div>
          </div>

          {/* 24h Price Change Summary */}
          <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
            <div className="text-white text-sm mb-2 font-semibold">🔹 24h Price Change Summary</div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-500 font-semibold">📈 Green: {greenPriceChangeCount}</span>
              <span className="text-red-500 font-semibold">📉 Red: {redPriceChangeCount}</span>
            </div>
          </div>

          {/* Volume Color Summary */}
          <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
            <div className="text-white text-sm mb-2 font-semibold">🔸 Volume Color Summary</div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-400 font-semibold">🟢 Green Volume: {greenVolumeCount}</span>
              <span className="text-red-400 font-semibold">🔴 Red Volume: {redVolumeCount}</span>
            </div>
          </div>

          {/* Strategy Note */}
          <div className="border border-gray-700 rounded-lg p-4 bg-gray-900 shadow-sm">
            <div className="text-yellow-300 font-bold mb-2">⚠️ Strategy Note:</div>
            <ul className="list-disc list-inside text-yellow-200 space-y-2">
              <li>
                <span className="text-white">If the current day has a Max Zone Pump,</span> it often leads to a
                <span className="text-red-400 font-semibold"> Bearish candle</span> the next day.
              </li>
              <li>
                <span className="text-white font-semibold">Max Zone Pump Decision Flow:</span>
                <ul className="list-disc list-inside ml-5 mt-1 space-y-1">
                  <li>
                    <span className="text-green-400 font-semibold">Bullish Sentiment:</span> If the 24H change is green (higher %),
                    expect a <span className="font-semibold">bullish breakout with divergence</span>.
                    <br />
                    → Start selling at the <span className="font-semibold text-red-400">first red candle</span> with
                    RSI &lt; 50 on the <span className="text-white">1-minute</span> timeframe.
                  </li>
                  <li>
                    <span className="text-red-400 font-semibold">Bearish Sentiment:</span> If the 24H change is red (higher %),
                    it likely signals a <span className="font-semibold">failed breakout</span>.
                    <br />
                    → Also sell at the <span className="font-semibold text-red-400">first red candle</span> with
                    RSI &lt; 50 on the <span className="text-white">1-minute</span> timeframe.
                  </li>
                </ul>
              </li>
              <li>
                <span className="text-white font-semibold">Friday Behavior:</span>
                Fridays usually show a <span className="text-red-400 font-semibold">bearish trend</span>,
                but occasionally have a <span className="text-green-400 font-semibold">small bullish move</span> before closing.
              </li>
              <li>
                After Max Zone Pump:
                <br />
                → Watch for the <span className="font-semibold text-red-400">first red candle</span> where RSI drops below 50.
                That candle acts as a decision point.
              </li>
              <li>
                If price stays <span className="font-semibold text-green-400">above the opening</span> of that red candle,
                it becomes a <span className="text-green-400 font-bold">Buy Signal</span>.
              </li>
              <li>
                If price breaks <span className="font-semibold text-red-400">below the opening</span> of that red candle,
                it's a clear <span className="text-red-400 font-bold">Sell Signal</span>.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterControls;
