import React, { useMemo } from 'react';
import PriceChangePercent from './PriceChangePercent';
import { SignalData } from '../hooks/useCryptoSignals';
import { getRecentRSIDiff, getSignal, didDropFromPeak, didRecoverFromLow } from '../utils/calculations';

interface SignalsTableProps {
  signals: SignalData[];
  lastUpdatedMap: { [symbol: string]: number };
  favorites: Set<string>;
  toggleFavorite: (symbol: string) => void;
  sortField: string | null;
  setSortField: (field: string | null) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
  searchTerm: string;
  showOnlyFavorites: boolean;
  trendFilter: string | null;
  signalFilter: string | null;
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

const SignalsTable: React.FC<SignalsTableProps> = ({
  signals,
  lastUpdatedMap,
  favorites,
  toggleFavorite,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  searchTerm,
  showOnlyFavorites,
  trendFilter,
  signalFilter,
}) => {

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc'); // Default to ascending for new sorts
    }
  };

  const filteredAndSortedSignals = useMemo(() => {
    let filtered = signals.filter((s) => {
      const symbol = s.symbol?.toLowerCase() || '';
      const matchesSearch = !searchTerm || symbol.includes(searchTerm);
      const isFavorite = favorites.has(s.symbol);

      if (!matchesSearch || (showOnlyFavorites && !isFavorite)) return false;

      if (trendFilter) {
        if (trendKeyToMainTrendValue[trendFilter]) {
          if (s.mainTrend?.trend !== trendKeyToMainTrendValue[trendFilter]) return false;
        } else if (trendKeyToBooleanField[trendFilter]) {
          const field = trendKeyToBooleanField[trendFilter];
          if (!(s as any)[field]) return false;
        }
      }

      if (signalFilter && getSignal(s) !== signalFilter) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      // Defensive check for sortField being null
      if (sortField === null) return 0;

      let valA: any = (a as any)[sortField as string];
      let valB: any = (b as any)[sortField as string];

      // Centralized handling for boolean-like sorts
      const handleBooleanSort = (fieldKey: keyof SignalData) => {
        valA = (a as any)[fieldKey] ? 1 : 0;
        valB = (b as any)[fieldKey] ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      };

      switch (sortField) {
        case 'touchedEMA200Today':
        case 'ema70Bounce':
        case 'ema200Bounce':
        case 'isVolumeSpike':
        case 'ema14Bounce': // Added for completeness if it's sortable
          return handleBooleanSort(sortField);

        case 'ema14InsideResults':
          valA = a.ema14InsideResults?.some(r => r.inside) ? 1 : 0;
          valB = b.ema14InsideResults?.some(r => r.inside) ? 1 : 0;
          return sortOrder === 'asc' ? valA - valB : valB - valA;

        case 'pumpStrength':
        case 'dumpStrength':
          const pumpDumpA = a.rsi14 ? getRecentRSIDiff(a.rsi14, 14) : null;
          const pumpDumpB = b.rsi14 ? getRecentRSIDiff(b.rsi14, 14) : null;
          valA = sortField === 'pumpStrength' ? pumpDumpA?.pumpStrength : pumpDumpA?.dumpStrength;
          valB = sortField === 'pumpStrength' ? pumpDumpB?.pumpStrength : pumpDumpB?.dumpStrength;
          break; // Continue to general number/string comparison

        case 'bearishDivergence':
        case 'bullishDivergence':
          // Sort by presence of divergence, then by divergence value if present
          const hasDivergenceA = (a.bearishDivergence?.divergence || a.bullishDivergence?.divergence);
          const hasDivergenceB = (b.bearishDivergence?.divergence || b.bullishDivergence?.divergence);
          if (hasDivergenceA !== hasDivergenceB) {
            return sortOrder === 'asc' ? (hasDivergenceA ? 1 : -1) : (hasDivergenceB ? 1 : -1);
          }
          // Fallback to value comparison if both have or don't have divergence (if that makes sense for your data)
          valA = (a.bearishDivergence?.divergence || a.bullishDivergence?.divergence);
          valB = (b.bearishDivergence?.divergence || b.bullishDivergence?.divergence);
          break;

        case 'priceChangePercent':
          valA = Number(a.priceChangePercent);
          valB = Number(b.priceChangePercent);
          if (isNaN(valA) && isNaN(valB)) return 0;
          if (isNaN(valA)) return sortOrder === 'asc' ? 1 : -1; // NaN to end
          if (isNaN(valB)) return sortOrder === 'asc' ? -1 : 1; // NaN to end
          break;

        case 'latestRSI':
          valA = typeof a.latestRSI === 'number' ? a.latestRSI : (sortOrder === 'asc' ? Infinity : -Infinity);
          valB = typeof b.latestRSI === 'number' ? b.latestRSI : (sortOrder === 'asc' ? Infinity : -Infinity);
          break;

        case 'prevClose':
          const getCloseValue = (item: SignalData) =>
            item.prevClosedGreen ? 1 : item.prevClosedRed ? -1 : 0;
          valA = getCloseValue(a);
          valB = getCloseValue(b);
          break;

        default:
          // For other fields, use the direct values
          break;
      }

      // General comparison for string and number types
      if (valA == null && valB == null) return 0;
      if (valA == null) return sortOrder === 'asc' ? 1 : -1; // Null/undefined to end
      if (valB == null) return sortOrder === 'asc' ? -1 : 1; // Null/undefined to end

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      return 0; // Fallback
    });
  }, [signals, searchTerm, favorites, showOnlyFavorites, sortField, sortOrder, trendFilter, signalFilter]);


  return (
    <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded-lg shadow-lg bg-gray-900">
      <table className="w-full text-xs border-collapse">
        {/* Table Header */}
        <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20 shadow-md">
          <tr>
            {/* Sticky Symbol Column */}
            <th
              onClick={() => handleSort('symbol')}
              className="px-2 py-2 bg-gray-800 sticky left-0 z-30 text-left align-middle cursor-pointer whitespace-nowrap border-r border-gray-700 hover:bg-gray-700"
            >
              Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-right whitespace-nowrap">Price</th>
            <th
              onClick={() => handleSort('priceChangePercent')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              24h Chg (%) {sortField === 'priceChangePercent' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Drop 🚨</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Recovery 🟢</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Bull BO</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Bear BO</th>
            <th
              onClick={() => handleSort('prevClose')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              Prev Close {sortField === 'prevClose' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Trend (200)</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Collapse</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Spike</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Bear Rev</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Bull Rev</th>
            <th className="px-2 py-2 min-w-[60px] text-center whitespace-nowrap">Signal</th>
            <th
              onClick={() => handleSort('pumpStrength')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              RSI Pump/Dump {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('latestRSI')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              RSI14 {sortField === 'latestRSI' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('bearishDivergence')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              Bear Div {sortField === 'bearishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('bullishDivergence')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              Bull Div {sortField === 'bullishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Vol Color</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Vol Div</th>
            <th
              onClick={() => handleSort('isVolumeSpike')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              Vol Spike {sortField === 'isVolumeSpike' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('ema14InsideResults')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              EMA14 Inside {sortField === 'ema14InsideResults' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap">EMA14&70 Gap</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">EMA70&200 Gap</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Low→EMA200</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">High→EMA200</th>
            <th
              onClick={() => handleSort('ema200Bounce')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              EMA200 Bounce {sortField === 'ema200Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('touchedEMA200Today')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              Touched EMA200 {sortField === 'touchedEMA200Today' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap">EMA14 Bounce</th>
            <th
              onClick={() => handleSort('ema70Bounce')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap"
            >
              EMA70 Bounce {sortField === 'ema70Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap text-green-400">Bullish Eng.</th>
            <th className="px-2 py-2 text-center whitespace-nowrap text-red-400">Bearish Eng.</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Tested High</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Tested Low</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Breakout Fail</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Top Pattern</th>
            <th className="px-2 py-2 text-center whitespace-nowrap">Bottom Pattern</th>
          </tr>
        </thead>
        {/* Table Body */}
        <tbody className="divide-y divide-gray-700">
          {filteredAndSortedSignals.length === 0 ? (
            <tr>
              <td colSpan={35} className="py-4 text-center text-gray-500">
                No signals found matching your criteria.
              </td>
            </tr>
          ) : (
            filteredAndSortedSignals.map((s) => {
              const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
              const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
              const pump = pumpDump?.pumpStrength;
              const dump = pumpDump?.dumpStrength;
              const direction = pumpDump?.direction;

              const inRange = (val: number | undefined, min: number, max: number) =>
                val !== undefined && val >= min && val <= max;

              let signalText = getSignal(s);

              return (
                <tr
                  key={s.symbol}
                  className={`border-b border-gray-700 transition-colors duration-150 hover:bg-gray-800 ${
                    updatedRecently ? 'bg-yellow-900/30' : ''
                  }`}
                >
                  {/* Sticky Symbol Cell */}
                  <td className="px-2 py-1 bg-gray-900 sticky left-0 z-10 text-left align-middle truncate border-r border-gray-700">
                    <div className="flex items-center justify-between text-white">
                      <span className="truncate max-w-[calc(100%-20px)]">{s.symbol}</span>
                      <button
                        className="ml-1 text-yellow-400 hover:text-yellow-300"
                        onClick={() => toggleFavorite(s.symbol)}
                        aria-label={favorites.has(s.symbol) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favorites.has(s.symbol) ? '★' : '☆'}
                      </button>
                    </div>
                  </td>

                  <td className="px-2 py-1 text-right text-gray-200">
                    ${Number(s.currentPrice).toFixed(7)}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <PriceChangePercent percent={s.priceChangePercent} />
                  </td>

                  {/* Drop / Recovery Signals */}
                  <td className="px-2 py-1 text-center">
                    {s.mainTrend?.trend === 'bullish' && didDropFromPeak(10, s.priceChangePercent, 5) ? (
                      <span className="text-yellow-400 font-semibold animate-pulse">🚨 Yes</span>
                    ) : (
                      <span className="text-gray-500">–</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {s.mainTrend?.trend === 'bearish' && didRecoverFromLow(-40, s.priceChangePercent, 10) ? (
                      <span className="text-green-400 font-semibold animate-pulse">🟢 Yes</span>
                    ) : (
                      <span className="text-gray-500">–</span>
                    )}
                  </td>

                  {/* Breakouts */}
                  <td className={`px-2 py-1 text-center ${s.bullishBreakout ? 'text-green-400' : 'text-gray-500'}`}>
                    {s.bullishBreakout ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.bearishBreakout ? 'text-red-400' : 'text-gray-500'}`}>
                    {s.bearishBreakout ? 'Yes' : 'No'}
                  </td>

                  {/* Prev Close */}
                  <td
                    className={`px-2 py-1 text-center font-semibold ${
                      s.prevClosedGreen ? 'text-green-400' : s.prevClosedRed ? 'text-red-400' : 'text-gray-500'
                    }`}
                  >
                    {s.prevClosedGreen ? 'Green' : s.prevClosedRed ? 'Red' : 'N/A'}
                  </td>

                  {/* Main Trend (200 EMA) */}
                  <td
                    className={`px-2 py-1 ${
                      s.mainTrend?.trend === 'bullish'
                        ? 'text-green-500'
                        : s.mainTrend?.trend === 'bearish'
                        ? 'text-red-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {s.mainTrend ? (
                      <div className="flex flex-col items-center">
                        <span className="font-semibold">{s.mainTrend.trend.toUpperCase()}</span>
                        <span className="text-[10px] text-gray-400">{s.mainTrend.type}</span>
                        {s.mainTrend.isNear && (
                          <span className="text-yellow-400 font-semibold text-[10px]">⏳ Near</span>
                        )}
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </td>

                  {/* Collapse / Spike */}
                  <td className={`px-2 py-1 text-center ${s.bearishCollapse?.signal ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bearishCollapse?.signal ? '🚨' : '–'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.bullishSpike?.signal ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bullishSpike?.signal ? '✅' : '–'}
                  </td>

                  {/* Reversals */}
                  <td className={`px-2 py-1 text-center ${s.bearishReversal?.signal ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bearishReversal?.signal ? '✅' : '–'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.bullishReversal?.signal ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bullishReversal?.signal ? '❌' : '–'}
                  </td>

                  {/* Signal Zone */}
                  <td
                    className={`px-2 py-1 text-center font-semibold whitespace-nowrap ${
                      signalText.includes('MAX ZONE')
                        ? 'text-yellow-400'
                        : signalText.includes('BALANCE ZONE')
                        ? 'text-purple-400'
                        : signalText.includes('LOWEST ZONE')
                        ? 'text-green-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {signalText.replace(' ZONE', '\n').replace('PUMP', '⬆️').replace('DUMP', '⬇️')}
                  </td>

                  {/* RSI Pump | Dump */}
                  <td
                    className={`px-2 py-1 text-center font-bold whitespace-nowrap ${
                      direction === 'pump' && pump !== undefined && pump > 30
                        ? 'text-green-400'
                        : direction === 'dump' && dump !== undefined && dump > 30
                        ? 'text-red-400'
                        : (direction === 'pump' && inRange(pump, 21, 26)) || (direction === 'dump' && inRange(dump, 21, 26))
                        ? 'text-blue-400'
                        : (direction === 'pump' && inRange(pump, 1, 10)) || (direction === 'dump' && inRange(dump, 1, 10))
                        ? 'text-yellow-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {direction === 'pump' && pump !== undefined ? `P: ${pump.toFixed(1)}` : ''}
                    {direction === 'dump' && dump !== undefined ? `D: ${dump.toFixed(1)}` : ''}
                    {(!direction || (direction === 'pump' && !pump) || (direction === 'dump' && !dump)) && 'N/A'}
                  </td>

                  {/* RSI14 */}
                  <td
                    className={`px-2 py-1 text-center font-semibold ${
                      typeof s.latestRSI !== 'number'
                        ? 'text-gray-400'
                        : s.latestRSI > 50
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}
                  >
                    {typeof s.latestRSI !== 'number' ? 'N/A' : s.latestRSI.toFixed(1)}
                    <div className="text-[10px] text-gray-500">
                      {typeof s.latestRSI === 'number' && (s.latestRSI > 50 ? 'Above 50' : 'Below 50')}
                    </div>
                  </td>

                  {/* Divergences */}
                  <td className={`px-2 py-1 text-center font-semibold ${s.bearishDivergence?.divergence ? 'text-red-500' : 'text-gray-500'}`}>
                    {s.bearishDivergence?.divergence ? 'Yes' : '–'}
                  </td>
                  <td className={`px-2 py-1 text-center font-semibold ${s.bullishDivergence?.divergence ? 'text-green-500' : 'text-gray-500'}`}>
                    {s.bullishDivergence?.divergence ? 'Yes' : '–'}
                  </td>

                  {/* Volume */}
                  <td
                    className={`px-2 py-1 text-center font-semibold ${
                      s.highestVolumeColorPrev === 'green'
                        ? 'text-green-400'
                        : s.highestVolumeColorPrev === 'red'
                        ? 'text-red-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {typeof s.highestVolumeColorPrev === 'string'
                      ? s.highestVolumeColorPrev.charAt(0).toUpperCase()
                      : '—'}
                  </td>

                  <td
                    className={`px-2 py-1 text-center font-semibold ${
                      s.bullishVolumeDivergence?.divergence
                        ? s.bullishVolumeDivergence.type === 'bullish-volume'
                          ? 'text-green-400'
                          : 'text-red-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {s.bullishVolumeDivergence?.divergence
                      ? s.bullishVolumeDivergence.type === 'bullish-volume'
                        ? 'Bull'
                        : 'Bear'
                      : '—'}
                  </td>
                  <td
                    className={`px-2 py-1 text-center font-semibold ${
                      s.isVolumeSpike ? 'text-yellow-400' : 'text-gray-500'
                    }`}
                  >
                    {s.isVolumeSpike ? 'Spike' : '—'}
                  </td>

                  {/* EMA14 Inside */}
                  <td className="px-2 py-1 text-center">
                    {s.ema14InsideResults.some(r => r.inside)
                      ? <span className="text-green-400 font-semibold">Yes</span>
                      : <span className="text-red-400">No</span>}
                  </td>

                  {/* Gaps */}
                  <td className={`px-2 py-1 text-center ${s.gap !== null && s.gap > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {typeof s.gap === 'number' && !isNaN(s.gap) ? `${s.gap.toFixed(1)}%` : 'N/A'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.gap1 !== null && s.gap1 > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {typeof s.gap1 === 'number' && !isNaN(s.gap1) ? `${s.gap1.toFixed(1)}%` : 'N/A'}
                  </td>

                  {/* EMA200 Proximity */}
                  <td className="px-2 py-1 text-center">
                    {s.mainTrend?.trend === 'bearish' && s.gapFromLowToEMA200 !== null ? (
                      <span className={s.gapFromLowToEMA200 < 1 ? 'text-red-400' : 'text-yellow-400'}>
                        {s.gapFromLowToEMA200.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {s.mainTrend?.trend === 'bullish' && s.gapFromHighToEMA200 !== null ? (
                      <span className={s.gapFromHighToEMA200 > 5 ? 'text-green-400' : 'text-gray-300'}>
                        {s.gapFromHighToEMA200.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>

                  {/* Bounces & Touches */}
                  <td className={`px-2 py-1 text-center ${s.ema200Bounce ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                    {s.ema200Bounce ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                    {s.touchedEMA200Today ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.ema14Bounce ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                    {s.ema14Bounce ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center ${s.ema70Bounce ? 'text-pink-400 font-semibold' : 'text-gray-500'}`}>
                    {s.ema70Bounce ? 'Yes' : 'No'}
                  </td>

                  {/* Engulfing & Patterns */}
                  <td className="px-2 py-1 text-center text-green-400 font-semibold">
                    {s.mainTrend?.trend === 'bearish' && s.hasBullishEngulfing ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-red-400 font-semibold">
                    {s.mainTrend?.trend === 'bullish' && s.hasBearishEngulfing ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-blue-300 font-semibold">
                    {s.testedPrevHigh ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-blue-300 font-semibold">
                    {s.testedPrevLow ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-red-400 font-semibold">
                    {s.breakoutFailure ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-yellow-400 font-semibold">
                    {s.mainTrend?.trend === 'bullish' &&
                    (s.isDoubleTopFailure || s.isDoubleTop || s.isDescendingTop)
                      ? s.isDoubleTopFailure ? 'Fail' : s.isDoubleTop ? 'Double' : 'Desc'
                      : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-green-400 font-semibold">
                    {s.mainTrend?.trend === 'bearish' &&
                    (s.isDoubleBottomFailure || s.isDoubleBottom || s.isAscendingBottom)
                      ? s.isDoubleBottomFailure ? 'Fail' : s.isDoubleBottom ? 'Double' : 'Asc'
                      : '-'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default SignalsTable;
