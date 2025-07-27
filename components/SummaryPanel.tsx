import React, { useMemo } from 'react';
import PriceChangePercent from './PriceChangePercent'; // Adjust import path
import { SignalData } from '../hooks/useCryptoSignals'; // Adjust import path
import { getRecentRSIDiff, getSignal, didDropFromPeak, didRecoverFromLow } from '../utils/calculations'; // Adjust import path

interface SignalsTableProps {
  signals: SignalData[];
  lastUpdatedMap: { [symbol: string]: number };
  favorites: Set<string>;
  toggleFavorite: (symbol: string) => void;
  sortField: string;
  setSortField: (field: string) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
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
      setSortOrder('asc');
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
      let valA: any = (a as any)[sortField];
      let valB: any = (b as any)[sortField];

      if (sortField === 'touchedEMA200Today') {
        valA = a.touchedEMA200Today ? 1 : 0;
        valB = b.touchedEMA200Today ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'ema14InsideResults') {
        valA = a.ema14InsideResults?.some(r => r.inside) ? 1 : 0;
        valB = b.ema14InsideResults?.some(r => r.inside) ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'ema70Bounce') {
        valA = a.ema70Bounce ? 1 : 0;
        valB = b.ema70Bounce ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'ema200Bounce') {
        valA = a.ema200Bounce ? 1 : 0;
        valB = b.ema200Bounce ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'pumpStrength' || sortField === 'dumpStrength') {
        const pumpDumpA = a.rsi14 ? getRecentRSIDiff(a.rsi14, 14) : null;
        const pumpDumpB = b.rsi14 ? getRecentRSIDiff(b.rsi14, 14) : null;
        valA = sortField === 'pumpStrength' ? pumpDumpA?.pumpStrength : pumpDumpA?.dumpStrength;
        valB = sortField === 'pumpStrength' ? pumpDumpB?.pumpStrength : pumpDumpB?.dumpStrength;
      }

      if (sortField === 'bearishDivergence' || sortField === 'bullishDivergence') {
        valA = (a.bearishDivergence?.divergence || a.bullishDivergence?.divergence) ? 1 : 0;
        valB = (b.bearishDivergence?.divergence || b.bullishDivergence?.divergence) ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'isVolumeSpike') {
        valA = a.isVolumeSpike ? 1 : 0;
        valB = b.isVolumeSpike ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'priceChangePercent') {
        valA = Number(a.priceChangePercent);
        valB = Number(b.priceChangePercent);
        if (isNaN(valA)) return 1;
        if (isNaN(valB)) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'latestRSI') {
        valA = typeof a.latestRSI === 'number' ? a.latestRSI : -Infinity;
        valB = typeof b.latestRSI === 'number' ? b.latestRSI : -Infinity;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (sortField === 'prevClose') {
        const getCloseValue = (item: SignalData) =>
          item.prevClosedGreen ? 1 : item.prevClosedRed ? -1 : 0;
        valA = getCloseValue(a);
        valB = getCloseValue(b);
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      return 0;
    });
  }, [signals, searchTerm, favorites, showOnlyFavorites, sortField, sortOrder, trendFilter, signalFilter]);


  return (
    <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
      <table className="w-full text-[11px] border-collapse">
        <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
          <tr>
            <th onClick={() => handleSort('symbol')} className="px-1 py-0.5 bg-gray-800 sticky left-0 z-30 text-left align-middle cursor-pointer">
              Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-1 border border-gray-700 text-right">Current Price</th>
            <th onClick={() => handleSort('priceChangePercent')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              24h Change (%) {sortField === 'priceChangePercent' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-1 py-0.5 bg-gray-800 text-center">Drop 🚨</th>
            <th className="px-1 py-0.5 bg-gray-800 text-center">Recovery 🟢</th>
            <th className="px-1 py-0.5 text-center">Bull BO</th>
            <th className="px-1 py-0.5 text-center">Bear BO</th>
            <th onClick={() => handleSort('prevClose')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              Prev Close {sortField === 'prevClose' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-1 py-0.5 text-center">Trend (200)</th>
            <th className="px-1 py-0.5 text-center">Collapse</th>
            <th className="px-1 py-0.5 text-center">Spike</th>
            <th className="px-1 py-0.5 text-center">Bear Rev</th>
            <th className="px-1 py-0.5 text-center">Bull Rev</th>
            <th className="px-1 py-0.5 min-w-[60px] text-center">Signal</th>
            <th onClick={() => handleSort('pumpStrength')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              RSI Pump | Dump {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => handleSort('latestRSI')} className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer">
              RSI14 {sortField === 'latestRSI' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => handleSort('bearishDivergence')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              Bearish Divergence {sortField === 'bearishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => handleSort('bullishDivergence')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              Bullish Divergence {sortField === 'bullishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="p-2 text-center">Volume</th>
            <th className="px-1 py-0.5 bg-gray-800 text-center">Volume Divergence</th>
            <th onClick={() => handleSort('isVolumeSpike')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              Volume Spike {sortField === 'isVolumeSpike' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => handleSort('ema14InsideResults')} className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer">
              EMA14 Inside<br />EMA70–200 {sortField === 'ema14InsideResults' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-4 py-2 border border-gray-700">Ema14&70 Gap %</th>
            <th className="px-4 py-2 border border-gray-700">Ema70&200 Gap %</th>
            <th className="px-1 py-0.5 text-center">Low→EMA200 (%)</th>
            <th className="px-1 py-0.5 text-center">High→EMA200 (%)</th>
            <th onClick={() => handleSort('ema200Bounce')} className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer">
              EMA200 Bounce {sortField === 'ema200Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => handleSort('touchedEMA200Today')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              Touched EMA200 Today {sortField === 'touchedEMA200Today' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="p-2 text-center">EMA14 Bounce</th>
            <th onClick={() => handleSort('ema70Bounce')} className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer">
              EMA70 Bounce {sortField === 'ema70Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="p-2 text-green-400">Bullish Engulfing</th>
            <th className="p-2 text-red-400">Bearish Engulfing</th>
            <th className="px-1 py-0.5 text-center">Tested High</th>
            <th className="px-1 py-0.5 text-center">Tested Low</th>
            <th className="px-1 py-0.5 text-center">Breakout Fail</th>
            <th className="px-1 py-0.5 text-center">Top Pattern</th>
            <th className="px-1 py-0.5 text-center">Bottom Pattern</th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedSignals.map((s) => {
            const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
            const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
            const pump = pumpDump?.pumpStrength;
            const dump = pumpDump?.dumpStrength;
            const direction = pumpDump?.direction;

            const inRange = (val: number | undefined, min: number, max: number) =>
              val !== undefined && val >= min && val <= max;

            const isAbove30 = (val: number | undefined) => val !== undefined && val >= 30;

            let signalText = getSignal(s); // Use the utility function

            return (
              <tr
                key={s.symbol}
                className={`border-b border-gray-700 transition-all duration-300 hover:bg-blue-800/20 ${
                  updatedRecently ? 'bg-yellow-900/30' : ''
                }`}
              >
                {/* Symbol + Favorite */}
                <td className="px-1 py-0.5 bg-gray-900 sticky left-0 z-10 text-left truncate max-w-[90px]">
                  <div className="flex items-center justify-between">
                    <span className="truncate">{s.symbol}</span>
                    <button
                      className="ml-1 text-yellow-400 hover:text-yellow-300"
                      onClick={() => toggleFavorite(s.symbol)}
                    >
                      {favorites.has(s.symbol) ? '★' : '☆'}
                    </button>
                  </div>
                </td>

                <td className="px-2 py-1 border-b border-gray-700 text-right">
                  ${Number(s.currentPrice).toFixed(7)}
                </td>
                <td className="px-2 py-1 border-b border-gray-700 text-center">
                  <PriceChangePercent percent={s.priceChangePercent} />
                </td>

                <td className="px-2 py-1 border-b border-gray-700 text-center text-sm">
                  {s.mainTrend?.trend === 'bullish' && didDropFromPeak(10, s.priceChangePercent, 5) ? (
                    <span className="text-yellow-400 font-semibold animate-pulse">🚨 Dropped</span>
                  ) : (
                    <span className="text-gray-500">–</span>
                  )}
                </td>

                <td className="px-2 py-1 border-b border-gray-700 text-center text-sm">
                  {s.mainTrend?.trend === 'bearish' && didRecoverFromLow(-40, s.priceChangePercent, 10) ? (
                    <span className="text-green-400 font-semibold animate-pulse">🟢 Recovery</span>
                  ) : (
                    <span className="text-gray-500">–</span>
                  )}
                </td>

                <td className={`px-1 py-0.5 text-center ${s.bullishBreakout ? 'text-green-400' : 'text-gray-500'}`}>
                  {s.bullishBreakout ? 'Yes' : 'No'}
                </td>

                <td className={`px-1 py-0.5 text-center ${s.bearishBreakout ? 'text-red-400' : 'text-gray-500'}`}>
                  {s.bearishBreakout ? 'Yes' : 'No'}
                </td>

                <td
                  className={`px-1 py-0.5 text-center font-semibold ${
                    s.prevClosedGreen ? 'text-green-400' : s.prevClosedRed ? 'text-red-400' : 'text-gray-500'
                  }`}
                >
                  {s.prevClosedGreen ? 'Green' : s.prevClosedRed ? 'Red' : 'N/A'}
                </td>

                <td
                  className={`px-1 py-0.5 text-center ${
                    s.mainTrend?.trend === 'bullish'
                      ? 'text-green-500'
                      : s.mainTrend?.trend === 'bearish'
                      ? 'text-red-500'
                      : 'text-gray-400'
                  }`}
                >
                  {s.mainTrend ? (
                    <>
                      {`${s.mainTrend.trend.toUpperCase()} (${s.mainTrend.type}) @ ${s.mainTrend.crossoverPrice.toFixed(7)} `}
                      {s.mainTrend.breakout === true ? (
                        s.mainTrend.trend === 'bullish' ? '🚀 Breakup price' : '🔻 Breakdown price'
                      ) : s.mainTrend.breakout === false ? (
                        s.mainTrend.trend === 'bullish' ? '🔻 Breakdown price' : '🚀 Breakup price'
                      ) : (
                        ''
                      )}
                      {s.mainTrend.isNear && (
                        <span className="ml-1 text-yellow-400 font-semibold">
                          ⏳ Near {s.mainTrend.type}
                        </span>
                      )}
                      {s.mainTrend.isDojiAfterBreakout && (
                        <span className="ml-1 text-purple-400 font-bold">
                          🕯️ Doji After Breakout
                        </span>
                      )}
                    </>
                  ) : (
                    'N/A'
                  )}
                </td>

                <td className="px-2 py-1 text-sm text-left leading-snug text-white">
                  <div className={`font-semibold mb-1 ${
                    s.bearishCollapse?.signal ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {s.bearishCollapse?.signal ? 'Yes 🚨' : 'No Signal'}
                  </div>
                  {s.bearishCollapse?.signal && (
                    <>
                      <div>
                        <span className="text-red-400 font-semibold">Entry:</span>{' '}
                        ${s.bearishCollapse.entry.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-yellow-400 font-semibold">SL:</span>{' '}
                        ${s.bearishCollapse.stopLoss.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-300 font-semibold">TP1:</span>{' '}
                        ${s.bearishCollapse.tp1.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-500 font-semibold">TP2:</span>{' '}
                        ${s.bearishCollapse.tp2.toFixed(7)}
                      </div>
                    </>
                  )}
                </td>

                <td className="px-2 py-1 text-sm text-left leading-snug text-white">
                  <div className={`font-semibold mb-1 ${
                    s.bullishSpike?.signal ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {s.bullishSpike?.signal ? 'Yes ✅' : 'No Signal'}
                  </div>
                  {s.bullishSpike?.signal && (
                    <>
                      <div>
                        <span className="text-green-400 font-semibold">Entry:</span>{' '}
                        ${s.bullishSpike.entry.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-yellow-400 font-semibold">SL:</span>{' '}
                        ${s.bullishSpike.stopLoss.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-300 font-semibold">TP1:</span>{' '}
                        ${s.bullishSpike.tp1.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-500 font-semibold">TP2:</span>{' '}
                        ${s.bullishSpike.tp2.toFixed(7)}
                      </div>
                    </>
                  )}
                </td>

                <td className="px-2 py-1 text-sm text-left leading-snug text-white">
                  <div className={`font-semibold mb-1 ${
                    s.bearishReversal?.signal ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {s.bearishReversal?.signal ? 'Yes ✅' : 'No Signal'}
                  </div>
                  {s.bearishReversal?.signal && (
                    <>
                      <div>
                        <span className="text-green-400 font-semibold">Entry:</span>{' '}
                        ${s.bearishReversal.entry?.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-red-400 font-semibold">SL:</span>{' '}
                        ${s.bearishReversal.stopLoss?.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-300 font-semibold">TP1:</span>{' '}
                        ${s.bearishReversal.tp1?.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-500 font-semibold">TP2:</span>{' '}
                        ${s.bearishReversal.tp2?.toFixed(7)}
                      </div>
                    </>
                  )}
                </td>

                <td className="px-2 py-1 text-sm text-left leading-snug text-white">
                  <div
                    className={`font-semibold mb-1 ${
                      s.bullishReversal?.signal ? 'text-red-400' : 'text-gray-500'
                    }`}
                  >
                    {s.bullishReversal?.signal ? 'Yes ❌' : 'No Signal'}
                  </div>
                  {s.bullishReversal?.signal && (
                    <>
                      <div>
                        <span className="text-red-400 font-semibold">Entry:</span>{' '}
                        ${s.bullishReversal.entry?.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-yellow-400 font-semibold">SL:</span>{' '}
                        ${s.bullishReversal.stopLoss?.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-300 font-semibold">TP1:</span>{' '}
                        ${s.bullishReversal.tp1?.toFixed(7)}
                      </div>
                      <div>
                        <span className="text-green-500 font-semibold">TP2:</span>{' '}
                        ${s.bullishReversal.tp2?.toFixed(7)}
                      </div>
                    </>
                  )}
                </td>

                <td
                  className={`px-1 py-0.5 min-w-[40px] text-center font-semibold ${
                    signalText.trim() === 'MAX ZONE PUMP'
                      ? 'text-yellow-300'
                      : signalText.trim() === 'MAX ZONE DUMP'
                      ? 'text-yellow-400'
                      : signalText.trim() === 'BALANCE ZONE PUMP'
                      ? 'text-purple-300 font-bold'
                      : signalText.trim() === 'BALANCE ZONE DUMP'
                      ? 'text-purple-400 font-bold'
                      : signalText.trim() === 'LOWEST ZONE PUMP'
                      ? 'text-green-400 font-bold'
                      : signalText.trim() === 'LOWEST ZONE DUMP'
                      ? 'text-green-500 font-bold'
                      : 'text-gray-500'
                  }`}
                >
                  {signalText.trim()}
                </td>

                <td
                  className={`text-center font-bold ${
                    direction === 'pump' && pump !== undefined && pump > 30
                      ? 'text-green-400'
                      : direction === 'dump' && dump !== undefined && dump > 30
                      ? 'text-red-400'
                      : direction === 'pump' && inRange(pump, 21, 26)
                      ? 'text-blue-400'
                      : direction === 'dump' && inRange(dump, 21, 26)
                      ? 'text-blue-400'
                      : direction === 'pump' && inRange(pump, 1, 10)
                      ? 'text-yellow-400'
                      : direction === 'dump' && inRange(dump, 1, 10)
                      ? 'text-yellow-400'
                      : 'text-gray-500'
                  }`}
                >
                  {direction === 'pump' && pump !== undefined ? `Pump: ${pump.toFixed(2)}` : ''}
                  {direction === 'dump' && dump !== undefined ? `Dump: ${dump.toFixed(2)}` : ''}
                  {(!direction || (direction === 'pump' && !pump) || (direction === 'dump' && !dump)) && 'N/A'}
                </td>

                <td
                  className={`px-2 py-1 text-center font-semibold ${
                    typeof s.latestRSI !== 'number'
                      ? 'text-gray-400'
                      : s.latestRSI > 50
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {typeof s.latestRSI !== 'number'
                    ? 'N/A'
                    : s.latestRSI > 50
                    ? 'Above 50 (Bullish)'
                    : 'Below 50 (Bearish)'}
                </td>

                <td className={`p-2 font-semibold ${s.bearishDivergence?.divergence ? 'text-red-500' : 'text-gray-400'}`}>
                  {s.bearishDivergence?.divergence ? 'Yes' : '-'}
                </td>

                <td className={`p-2 font-semibold ${s.bullishDivergence?.divergence ? 'text-green-500' : 'text-gray-400'}`}>
                  {s.bullishDivergence?.divergence ? 'Yes' : '-'}
                </td>

                <td
                  className={`p-2 font-semibold ${
                    s.highestVolumeColorPrev === 'green'
                      ? 'text-green-400'
                      : s.highestVolumeColorPrev === 'red'
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {typeof s.highestVolumeColorPrev === 'string'
                    ? s.highestVolumeColorPrev.charAt(0).toUpperCase() + s.highestVolumeColorPrev.slice(1)
                    : '—'}
                </td>

                <td
                  className={`px-1 py-0.5 text-center font-semibold ${
                    s.bullishVolumeDivergence?.divergence
                      ? s.bullishVolumeDivergence.type === 'bullish-volume'
                        ? 'text-green-400'
                        : 'text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {s.bullishVolumeDivergence?.divergence
                    ? s.bullishVolumeDivergence.type === 'bullish-volume'
                      ? 'Bullish'
                      : 'Bearish'
                    : '—'}
                </td>
                <td
                  className={`p-2 font-semibold ${
                    s.isVolumeSpike ? 'text-yellow-400' : 'text-gray-400'
                  }`}
                >
                  {s.isVolumeSpike ? 'Spike' : '—'}
                </td>

                <td className="px-1 py-0.5 text-center text-[10px]">
                  {s.ema14InsideResults.some(r => r.inside)
                    ? <span className="text-green-400 font-semibold">YES</span>
                    : <span className="text-red-400">NO</span>}
                </td>

                <td className={`px-4 py-2 border border-gray-700 ${s.gap !== null && s.gap > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {typeof s.gap === 'number' && !isNaN(s.gap) ? `${s.gap.toFixed(2)}%` : 'N/A'}
                </td>

                <td className={`px-4 py-2 border border-gray-700 ${s.gap1 !== null && s.gap1 > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {typeof s.gap1 === 'number' && !isNaN(s.gap1) ? `${s.gap1.toFixed(2)}%` : 'N/A'}
                </td>

                <td className="px-1 py-0.5 text-center">
                  {s.mainTrend?.trend === 'bearish' && s.gapFromLowToEMA200 !== null ? (
                    <span className={s.gapFromLowToEMA200 < 1 ? 'text-red-400' : 'text-yellow-400'}>
                      {s.gapFromLowToEMA200.toFixed(2)}%
                    </span>
                  ) : '—'}
                </td>

                <td className="px-1 py-0.5 text-center">
                  {s.mainTrend?.trend === 'bullish' && s.gapFromHighToEMA200 !== null ? (
                    <span className={s.gapFromHighToEMA200 > 5 ? 'text-green-400' : 'text-gray-300'}>
                      {s.gapFromHighToEMA200.toFixed(2)}%
                    </span>
                  ) : '—'}
                </td>

                <td className={`p-2 ${s.ema200Bounce ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                  {s.ema200Bounce ? 'Yes' : 'No'}
                </td>

                <td className={`p-2 ${s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                  {s.touchedEMA200Today ? 'Yes' : 'No'}
                </td>

                <td className={`p-2 ${s.ema14Bounce ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                  {s.ema14Bounce ? 'Yes' : 'No'}
                </td>

                <td className={`p-2 ${s.ema70Bounce ? 'text-pink-400 font-semibold' : 'text-gray-500'}`}>
                  {s.ema70Bounce ? 'Yes' : 'No'}
                </td>

                <td className="p-2 text-center text-green-400 font-semibold">
                  {s.mainTrend?.trend === 'bearish' && s.hasBullishEngulfing ? 'Yes' : '-'}
                </td>
                <td className="p-2 text-center text-red-400 font-semibold">
                  {s.mainTrend?.trend === 'bullish' && s.hasBearishEngulfing ? 'Yes' : '-'}
                </td>

                <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
                  {s.testedPrevHigh ? 'Yes' : '-'}
                </td>

                <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
                  {s.testedPrevLow ? 'Yes' : '-'}
                </td>

                <td className="px-1 py-0.5 text-center text-red-400 font-semibold">
                  {s.breakoutFailure ? 'Yes' : '-'}
                </td>

                <td className="px-1 py-0.5 text-center text-yellow-400 font-semibold">
                  {s.mainTrend?.trend === 'bullish'
                    ? s.isDoubleTopFailure
                      ? 'Top Fail'
                      : s.isDoubleTop
                      ? 'Double Top'
                      : s.isDescendingTop
                      ? 'Descending Top'
                      : '-'
                    : '-'}
                </td>

                <td className="px-1 py-0.5 text-center text-green-400 font-semibold">
                  {s.mainTrend?.trend === 'bearish'
                    ? s.isDoubleBottomFailure
                      ? 'Bottom Fail'
                      : s.isDoubleBottom
                      ? 'Double Bottom'
                      : s.isAscendingBottom
                      ? 'Ascending Bottom'
                      : '-'
                    : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SignalsTable;
