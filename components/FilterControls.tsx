import React from 'react';
import { SignalData } from '../hooks/useCryptoSignals';
import { getSignal } from '../utils/calculations';

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

const trendKeys = [
  { label: 'Bullish Trend', key: 'bullishMainTrend', color: 'text-green-300' },
  { label: 'Bearish Trend', key: 'bearishMainTrend', color: 'text-red-300' },
  { label: 'Bullish Reversal', key: 'bullishReversal', color: 'text-green-300' },
  { label: 'Bearish Reversal', key: 'bearishReversal', color: 'text-red-300' },
  { label: 'Bullish Spike', key: 'bullishSpike', color: 'text-green-300' },
  { label: 'Bearish Collapse', key: 'bearishCollapse', color: 'text-red-300' },
  { label: 'Breakout Failure', key: 'breakoutFailure', color: 'text-yellow-300' },
  { label: 'Bullish Breakout', key: 'bullishBreakout', color: 'text-yellow-400' },
  { label: 'Bearish Breakout', key: 'bearishBreakout', color: 'text-yellow-400' },
  { label: 'Tested Prev High', key: 'testedPrevHigh', color: 'text-blue-300' },
  { label: 'Tested Prev Low', key: 'testedPrevLow', color: 'text-blue-300' },
];

const signalKeys = [
  { label: 'MAX ZONE PUMP', color: 'text-yellow-300' },
  { label: 'MAX ZONE DUMP', color: 'text-yellow-400' },
  { label: 'BALANCE ZONE PUMP', color: 'text-purple-300' },
  { label: 'BALANCE ZONE DUMP', color: 'text-purple-400' },
  { label: 'LOWEST ZONE PUMP', color: 'text-yellow-500' },
  { label: 'LOWEST ZONE DUMP', color: 'text-yellow-600' },
];

const FilterControls: React.FC<FilterControlsProps> = ({
  signals,
  search,
  setSearch,
  showOnlyFavorites,
  setShowOnlyFavorites,
  favorites,
  trendFilter,
  setTrendFilter,
  signalFilter,
  setSignalFilter,
}) => {
  const searchTerm = search.trim().toLowerCase();
  const filtered = React.useMemo(() =>
    signals.filter((s) => {
      const match = s.symbol?.toLowerCase().includes(searchTerm);
      return match && (!showOnlyFavorites || favorites.has(s.symbol));
    }), [signals, searchTerm, showOnlyFavorites, favorites]);

  const countBool = (key: keyof SignalData) => filtered.filter((s) => s[key]).length;
  const counts = React.useMemo(() => ({
    bullishMainTrend: filtered.filter(s => s.mainTrend?.trend === 'bullish').length,
    bearishMainTrend: filtered.filter(s => s.mainTrend?.trend === 'bearish').length,
    bullishReversal: filtered.filter(s => s.bullishReversal?.signal).length,
    bearishReversal: filtered.filter(s => s.bearishReversal?.signal).length,
    bullishSpike: filtered.filter(s => s.bullishSpike?.signal).length,
    bearishCollapse: filtered.filter(s => s.bearishCollapse?.signal).length,
    ema14: filtered.filter(s => s.ema14InsideResults?.some(r => r.inside)).length,
    greenVol: filtered.filter(s => s.highestVolumeColorPrev === 'green').length,
    redVol: filtered.filter(s => s.highestVolumeColorPrev === 'red').length,
    green24h: filtered.filter(s => +s.priceChangePercent > 0).length,
    red24h: filtered.filter(s => +s.priceChangePercent < 0).length,
    ...Object.fromEntries(['breakoutFailure', 'bullishBreakout', 'bearishBreakout', 'testedPrevHigh', 'testedPrevLow']
      .map(k => [k, countBool(k as keyof SignalData)]))
  }), [filtered]);

  const signalCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    signalKeys.forEach(({ label }) => map[label] = 0);
    filtered.forEach(s => {
      const key = getSignal(s)?.toUpperCase();
      if (key && map.hasOwnProperty(key)) map[key]++;
    });
    return map;
  }, [filtered]);

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 mb-4">
      {/* Buttons */}
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-400 font-medium mb-1">📊 Trend Filters</p>
          <div className="flex flex-wrap gap-2">
            {trendKeys.map(({ label, key, color }) => (
              <button key={key} onClick={() => setTrendFilter(trendFilter === key ? null : key)}
                className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition
                ${trendFilter === key ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'}`}>
                {label} <span className={`${color} text-xs font-bold`}>{counts[key as keyof typeof counts]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 font-medium mb-1">📈 Signal Filters</p>
          <div className="flex flex-wrap gap-2">
            {signalKeys.map(({ label, color }) => (
              <button key={label} onClick={() => setSignalFilter(signalFilter === label ? null : label)}
                className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition
                ${signalFilter === label ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'}`}>
                {label} <span className={`${color} text-xs font-bold`}>{signalCounts[label]}</span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => {
          setSearch('');
          setTrendFilter(null);
          setSignalFilter(null);
          setShowOnlyFavorites(false);
        }} className="px-4 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600">
          Clear All Filters
        </button>
      </div>

      {/* Summary Panel */}
      <div className="sticky top-0 p-4 rounded-xl bg-gray-900 border border-gray-700 shadow space-y-4 text-sm">
        <div className="space-y-1">
          <p>📈 <span className="text-green-400 font-bold">Bull:</span> {counts.bullishMainTrend}</p>
          <p>📉 <span className="text-red-400 font-bold">Bear:</span> {counts.bearishMainTrend}</p>
        </div>
        <p>📍 EMA14 Inside EMA70–200: <span className="text-yellow-400 font-bold">{counts.ema14}</span></p>
        <div className="space-y-1">
          <p>🔹 24h Price Change</p>
          <p className="text-green-400">📈 Green: {counts.green24h}</p>
          <p className="text-red-400">📉 Red: {counts.red24h}</p>
        </div>
        <div className="space-y-1">
          <p>🔸 Volume Color</p>
          <p className="text-green-400">🟢 Green: {counts.greenVol}</p>
          <p className="text-red-400">🔴 Red: {counts.redVol}</p>
        </div>
      </div>
    </div>
  );
};

export default FilterControls;
