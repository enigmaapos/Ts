// File: components/FilterControls.tsx

import React from 'react';
import { SignalData } from '../hooks/useCryptoSignals'; // Import SignalData from the hook
// REMOVE THIS IMPORT: getSignal is now calculated server-side
// import { getSignal } from '../utils/calculations';

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
  { label: 'Bullish Trend', key: 'mainTrend.trend_bullish', color: 'text-green-300' }, // Adjusted key for object property
  { label: 'Bearish Trend', key: 'mainTrend.trend_bearish', color: 'text-red-300' },   // Adjusted key for object property
  { label: 'Bullish Reversal', key: 'bullishReversal.signal', color: 'text-green-300' }, // Adjusted key for object property
  { label: 'Bearish Reversal', key: 'bearishReversal.signal', color: 'text-red-300' },   // Adjusted key for object property
  { label: 'Bullish Spike', key: 'bullishSpike.signal', color: 'text-green-300' },       // Adjusted key for object property
  { label: 'Bearish Collapse', key: 'bearishCollapse.signal', color: 'text-red-300' },   // Adjusted key for object property
  { label: 'Breakout Failure', key: 'breakoutFailure', color: 'text-yellow-300' },
  { label: 'Bullish Breakout', key: 'bullishBreakout', color: 'text-yellow-400' },
  { label: 'Bearish Breakout', key: 'bearishBreakout', color: 'text-yellow-400' },
  { label: 'Tested Prev High', key: 'testedPrevHigh', color: 'text-blue-300' },
  { label: 'Tested Prev Low', key: 'testedPrevLow', color: 'text-blue-300' },
  // Add other trend-related boolean/signal properties here if you want filters for them
  // { label: 'EMA14 Inside', key: 'ema14Inside', color: 'text-orange-300' }, // If you add a simplified boolean to SignalData
  // { label: 'Bullish Divergence', key: 'bullishDivergence.signal', color: 'text-purple-300' },
  // { label: 'Bearish Divergence', key: 'bearishDivergence.signal', color: 'text-purple-300' },
  // { label: 'Double Top', key: 'isDoubleTop', color: 'text-gray-300' },
];

const signalKeys = [
  { label: 'MAX ZONE PUMP', color: 'text-yellow-300' },
  { label: 'MAX ZONE DUMP', color: 'text-yellow-400' },
  { label: 'BALANCE ZONE PUMP', color: 'text-purple-300' },
  { label: 'BALANCE ZONE DUMP', color: 'text-purple-400' },
  { label: 'LOWEST ZONE PUMP', color: 'text-yellow-500' },
  { label: 'LOWEST ZONE DUMP', color: 'text-yellow-600' },
  // Ensure this list matches the possible values of signal.primarySignalText
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
      // Ensure the signal.primarySignalText is available for filtering
      return match && (!showOnlyFavorites || favorites.has(s.symbol));
    }), [signals, searchTerm, showOnlyFavorites, favorites]);

  // Helper to safely access nested boolean properties
  const getNestedBoolean = (obj: any, path: string) => {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length; i++) {
      if (current === undefined || current === null) return false; // If any part of path is null/undefined
      if (i === parts.length - 1) { // Last part of path
        if (parts[i].startsWith('trend_')) { // Special handling for 'trend_bullish'/'trend_bearish'
          const trendType = parts[i].split('_')[1]; // 'bullish' or 'bearish'
          return current.trend === trendType; // Check if mainTrend.trend matches
        }
        return !!current[parts[i]]; // Return boolean value
      }
      current = current[parts[i]];
    }
    return false;
  };


  const counts = React.useMemo(() => {
    const calculatedCounts: { [key: string]: number } = {};

    // Initialize all trend keys
    trendKeys.forEach(({ key }) => {
        calculatedCounts[key] = 0;
    });

    calculatedCounts.ema14 = 0;
    calculatedCounts.greenVol = 0;
    calculatedCounts.redVol = 0;
    calculatedCounts.green24h = 0;
    calculatedCounts.red24h = 0;

    filtered.forEach(s => {
      // Trend Filters
      trendKeys.forEach(({ key }) => {
        if (getNestedBoolean(s, key)) { // Use helper for nested properties
          calculatedCounts[key]++;
        }
      });

      // Other Summary Counts
      if (s.ema14InsideResults && s.ema14InsideResults.some(r => r.inside)) { // Check if EMA14 inside results exist and at least one is 'inside'
        calculatedCounts.ema14++;
      }
      if (s.highestVolumeColorPrev === 'green') {
        calculatedCounts.greenVol++;
      } else if (s.highestVolumeColorPrev === 'red') {
        calculatedCounts.redVol++;
      }
      if (s.priceChangePercent > 0) {
        calculatedCounts.green24h++;
      } else if (s.priceChangePercent < 0) {
        calculatedCounts.red24h++;
      }
    });
    return calculatedCounts;
  }, [filtered]);


  const signalCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    signalKeys.forEach(({ label }) => map[label] = 0);
    filtered.forEach(s => {
      // Access the pre-calculated primarySignalText
      const key = s.primarySignalText?.toUpperCase(); // Assuming you've added primarySignalText to SignalData
      if (key && map.hasOwnProperty(key)) map[key]++;
    });
    return map;
  }, [filtered]);

  // Helper to map dynamic key names for display
  const getDisplayCount = (key: string) => {
      // Special mapping for mainTrend counts
      if (key === 'bullishMainTrend') return counts['mainTrend.trend_bullish'];
      if (key === 'bearishMainTrend') return counts['mainTrend.trend_bearish'];
      // For other keys, just return directly from counts
      return counts[key];
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-4">
      {/* Filter Buttons */}
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-400 font-medium mb-1">📊 Trend Filters</p>
          <div className="flex flex-wrap gap-2">
            {trendKeys.map(({ label, key, color }) => (
              <button
                key={key}
                onClick={() => setTrendFilter(trendFilter === key ? null : key)}
                className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition
                  ${trendFilter === key ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'}`}
              >
                {label}
                <span className={`${color} text-xs font-bold`}>
                  {/* Using a helper to get count based on the new key format */}
                  {getDisplayCount(key)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 font-medium mb-1">📈 Signal Filters</p>
          <div className="flex flex-wrap gap-2">
            {signalKeys.map(({ label, color }) => (
              <button
                key={label}
                onClick={() => setSignalFilter(signalFilter === label ? null : label)}
                className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition
                  ${signalFilter === label ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'}`}
              >
                {label}
                <span className={`${color} text-xs font-bold`}>
                  {signalCounts[label]}
                </span>
              </button>
            ))}
          </div>
        </div>

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

      {/* Summary Panel */}
      <div className="p-4 rounded-xl bg-gray-900 border border-gray-700 shadow space-y-4 text-sm">
        <div className="space-y-1">
          <p>📈 <span className="text-green-400 font-bold">Bull:</span> {getDisplayCount('mainTrend.trend_bullish')}</p>
          <p>📉 <span className="text-red-400 font-bold">Bear:</span> {getDisplayCount('mainTrend.trend_bearish')}</p>
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
