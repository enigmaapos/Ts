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
          const fieldValue = s[field];

          let matchesTrendFilter = false;

          // Case 1: Field is a direct boolean (e.g., bullishBreakout)
          if (typeof fieldValue === 'boolean' && fieldValue === true) {
            matchesTrendFilter = true;
          }
          // Case 2: Field is an object with a 'signal' property (e.g., bullishReversal, bearishCollapse)
          else if (
            typeof fieldValue === 'object' &&
            fieldValue !== null &&
            'signal' in fieldValue &&
            (fieldValue as { signal: boolean }).signal === true
          ) {
            matchesTrendFilter = true;
          }
          // Case 3: Field is an array where some element has 'inside: true' (e.g., ema14InsideResults)
          else if (Array.isArray(fieldValue) && fieldValue.some && fieldValue.some(item => (item as any).inside === true)) {
            matchesTrendFilter = true;
          }

          if (!matchesTrendFilter) {
            return false;
          }
        }
      }

      if (signalFilter && getSignal(s)?.trim().toUpperCase() !== signalFilter.trim().toUpperCase()) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      if (sortField === null) return 0;

      let valA: any = (a as any)[sortField as string];
      let valB: any = (b as any)[sortField as string];

      const handleBooleanSort = (fieldKey: keyof SignalData) => {
        let aVal = false;
        let bVal = false;

        const aFieldVal = a[fieldKey];
        const bFieldVal = b[fieldKey];

        if (typeof aFieldVal === 'boolean') {
          aVal = aFieldVal;
        } else if (typeof aFieldVal === 'object' && aFieldVal !== null && 'signal' in aFieldVal) {
          aVal = (aFieldVal as { signal: boolean }).signal;
        } else if (Array.isArray(aFieldVal) && aFieldVal.some) {
          aVal = aFieldVal.some((r: any) => r.inside);
        }

        if (typeof bFieldVal === 'boolean') {
          bVal = bFieldVal;
        } else if (typeof bFieldVal === 'object' && bFieldVal !== null && 'signal' in bFieldVal) {
          bVal = (bFieldVal as { signal: boolean }).signal;
        } else if (Array.isArray(bFieldVal) && bFieldVal.some) {
          bVal = bFieldVal.some((r: any) => r.inside);
        }

        return sortOrder === 'asc' ? (aVal === bVal ? 0 : aVal ? 1 : -1) : (aVal === bVal ? 0 : aVal ? -1 : 1);
      };

      switch (sortField) {
        case 'touchedEMA200Today':
        case 'ema70Bounce':
        case 'ema200Bounce':
        case 'isVolumeSpike':
        case 'ema14Bounce':
        case 'bullishBreakout':
        case 'bearishBreakout':
        case 'breakoutFailure':
        case 'testedPrevHigh':
        case 'testedPrevLow':
          return handleBooleanSort(sortField);

        case 'ema14InsideResults':
          return handleBooleanSort('ema14InsideResults');

        case 'pumpStrength':
        case 'dumpStrength':
          const pumpDumpA = a.rsi14 ? getRecentRSIDiff(a.rsi14, 14) : null;
          const pumpDumpB = b.rsi14 ? getRecentRSIDiff(b.rsi14, 14) : null;
          valA = sortField === 'pumpStrength' ? pumpDumpA?.pumpStrength : pumpDumpA?.dumpStrength;
          valB = sortField === 'pumpStrength' ? pumpDumpB?.pumpStrength : pumpDumpB?.dumpStrength;
          break;

        case 'bearishDivergence':
        case 'bullishDivergence':
          const divA = (a as any)[sortField]?.divergence;
          const divB = (b as any)[sortField]?.divergence;

          if (divA === undefined && divB === undefined) return 0;
          if (divA === undefined) return sortOrder === 'asc' ? 1 : -1;
          if (divB === undefined) return sortOrder === 'asc' ? -1 : 1;

          valA = divA;
          valB = divB;
          break;

        case 'priceChangePercent':
          valA = Number(a.priceChangePercent);
          valB = Number(b.priceChangePercent);
          if (isNaN(valA) && isNaN(valB)) return 0;
          if (isNaN(valA)) return sortOrder === 'asc' ? 1 : -1;
          if (isNaN(valB)) return sortOrder === 'asc' ? -1 : 1;
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

        case 'mainTrend':
          const trendOrder: Record<'bullish' | 'bearish' | string, number> = {
            'bullish': 1,
            'bearish': 2,
            'N/A': 3,
          };
          valA = trendOrder[a.mainTrend?.trend || 'N/A'];
          valB = trendOrder[b.mainTrend?.trend || 'N/A'];
          break;

        case 'signal':
          valA = getSignal(a) || '';
          valB = getSignal(b) || '';
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);

        case 'gap':
        case 'gap1':
        case 'gapFromLowToEMA200':
        case 'gapFromHighToEMA200':
            valA = typeof (a as any)[sortField] === 'number' ? (a as any)[sortField] : (sortOrder === 'asc' ? Infinity : -Infinity);
            valB = typeof (b as any)[sortField] === 'number' ? (b as any)[sortField] : (sortOrder === 'asc' ? Infinity : -Infinity);
            break;

        default:
          break;
      }

      if (valA == null && valB == null) return 0;
      if (valA == null) return sortOrder === 'asc' ? 1 : -1;
      if (valB == null) return sortOrder === 'asc' ? -1 : 1;

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
    // The key change is here: `overflow-x-auto` instead of `overflow-auto`
    <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
  <table className="w-full text-[11px] border-collapse">
    
        {/* Table Header */}
        <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
          <tr>
            {/* Sticky Symbol Column */}
            <th
              onClick={() => handleSort('symbol')}
              className="px-2 py-2 bg-gray-800 sticky left-0 z-30 text-left align-middle cursor-pointer whitespace-nowrap border-r border-gray-700 hover:bg-gray-700 w-[100px]"
            >
              Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-right whitespace-nowrap w-[80px]">Price</th>
            <th
              onClick={() => handleSort('priceChangePercent')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              24h Chg (%) {sortField === 'priceChangePercent' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[60px]">Drop 🚨</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[70px]">Recovery 🟢</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[60px]">Bull BO</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[60px]">Bear BO</th>
            <th
              onClick={() => handleSort('prevClose')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[80px]"
            >
              Prev Close {sortField === 'prevClose' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('mainTrend')}
              className="px-2 py-2 text-center whitespace-nowrap cursor-pointer hover:bg-gray-700 w-[90px]"
            >
              Trend (200) {sortField === 'mainTrend' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[70px]">Collapse</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[60px]">Spike</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[70px]">Bear Rev</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[70px]">Bull Rev</th>
            <th
              onClick={() => handleSort('signal')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 w-[100px]"
            >
              Signal {sortField === 'signal' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('pumpStrength')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              RSI P/D {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('latestRSI')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[70px]"
            >
              RSI14 {sortField === 'latestRSI' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('bearishDivergence')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[70px]"
            >
              Bear Div {sortField === 'bearishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('bullishDivergence')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[70px]"
            >
              Bull Div {sortField === 'bullishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[80px]">Vol Color</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[70px]">Vol Div</th>
            <th
              onClick={() => handleSort('isVolumeSpike')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[70px]"
            >
              Vol Spike {sortField === 'isVolumeSpike' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('ema14InsideResults')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[100px]"
            >
              EMA14 Inside {sortField === 'ema14InsideResults' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('gap')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              EMA14&70 Gap {sortField === 'gap' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('gap1')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              EMA70&200 Gap {sortField === 'gap1' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('gapFromLowToEMA200')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[100px]"
            >
              Low→EMA200 {sortField === 'gapFromLowToEMA200' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('gapFromHighToEMA200')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[100px]"
            >
              High→EMA200 {sortField === 'gapFromHighToEMA200' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('ema200Bounce')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              EMA200 Bounce {sortField === 'ema200Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('touchedEMA200Today')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[120px]"
            >
              Touched EMA200 {sortField === 'touchedEMA200Today' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('ema14Bounce')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              EMA14 Bounce {sortField === 'ema14Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              onClick={() => handleSort('ema70Bounce')}
              className="px-2 py-2 text-center cursor-pointer hover:bg-gray-700 whitespace-nowrap w-[90px]"
            >
              EMA70 Bounce {sortField === 'ema70Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-2 py-2 text-center whitespace-nowrap text-green-400 w-[90px]">Bullish Eng.</th>
            <th className="px-2 py-2 text-center whitespace-nowrap text-red-400 w-[90px]">Bearish Eng.</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[80px]">Tested High</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[80px]">Tested Low</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[90px]">Breakout Fail</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[90px]">Top Pattern</th>
            <th className="px-2 py-2 text-center whitespace-nowrap w-[100px]">Bottom Pattern</th>
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
                  <td className="px-2 py-1 bg-gray-900 sticky left-0 z-10 text-left align-middle truncate border-r border-gray-700 w-[100px]">
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

                  <td className="px-2 py-1 text-right text-gray-200 w-[80px]">
                    ${Number(s.currentPrice).toFixed(7)}
                  </td>
                  <td className="px-2 py-1 text-center w-[90px]">
                    <PriceChangePercent percent={s.priceChangePercent} />
                  </td>

                  {/* Drop / Recovery Signals */}
                  <td className="px-2 py-1 text-center w-[60px]">
                    {s.mainTrend?.trend === 'bullish' && didDropFromPeak(10, s.priceChangePercent, 5) ? (
                      <span className="text-yellow-400 font-semibold animate-pulse">🚨 Yes</span>
                    ) : (
                      <span className="text-gray-500">–</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-center w-[70px]">
                    {s.mainTrend?.trend === 'bearish' && didRecoverFromLow(-40, s.priceChangePercent, 10) ? (
                      <span className="text-green-400 font-semibold animate-pulse">🟢 Yes</span>
                    ) : (
                      <span className="text-gray-500">–</span>
                    )}
                  </td>

                  {/* Breakouts */}
                  <td className={`px-2 py-1 text-center w-[60px] ${s.bullishBreakout ? 'text-green-400' : 'text-gray-500'}`}>
                    {s.bullishBreakout ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[60px] ${s.bearishBreakout ? 'text-red-400' : 'text-gray-500'}`}>
                    {s.bearishBreakout ? 'Yes' : 'No'}
                  </td>

                  {/* Prev Close */}
                  <td
                    className={`px-2 py-1 text-center font-semibold w-[80px] ${
                      s.prevClosedGreen ? 'text-green-400' : s.prevClosedRed ? 'text-red-400' : 'text-gray-500'
                    }`}
                  >
                    {s.prevClosedGreen ? 'Green' : s.prevClosedRed ? 'Red' : 'N/A'}
                  </td>

                  {/* Main Trend (200 EMA) */}
                  <td
                    className={`px-2 py-1 w-[90px] ${
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
                  <td className={`px-2 py-1 text-center w-[70px] ${s.bearishCollapse?.signal ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bearishCollapse?.signal ? '🚨' : '–'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[60px] ${s.bullishSpike?.signal ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bullishSpike?.signal ? '✅' : '–'}
                  </td>

                  {/* Reversals */}
                  <td className={`px-2 py-1 text-center w-[70px] ${s.bearishReversal?.signal ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bearishReversal?.signal ? '✅' : '–'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[70px] ${s.bullishReversal?.signal ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                    {s.bullishReversal?.signal ? '❌' : '–'}
                  </td>

                  {/* Signal Zone */}
                  <td
                    className={`px-2 py-1 text-center font-semibold w-[100px] align-middle ${
                      signalText.includes('MAX ZONE')
                        ? 'text-yellow-400'
                        : signalText.includes('BALANCE ZONE')
                        ? 'text-purple-400'
                        : signalText.includes('LOWEST ZONE')
                        ? 'text-green-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {signalText.replace(' ZONE', '').replace('PUMP', '⬆️').replace('DUMP', '⬇️').split('\n').map((line, idx) => (
                      <React.Fragment key={idx}>
                        {line}
                        {idx < signalText.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </td>


                  {/* RSI Pump | Dump */}
                  <td
                    className={`px-2 py-1 text-center font-bold whitespace-nowrap w-[90px] ${
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
                    className={`px-2 py-1 text-center font-semibold w-[70px] ${
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
                  <td className={`px-2 py-1 text-center font-semibold w-[70px] ${s.bearishDivergence?.divergence ? 'text-red-500' : 'text-gray-500'}`}>
                    {s.bearishDivergence?.divergence ? 'Yes' : '–'}
                  </td>
                  <td className={`px-2 py-1 text-center font-semibold w-[70px] ${s.bullishDivergence?.divergence ? 'text-green-500' : 'text-gray-500'}`}>
                    {s.bullishDivergence?.divergence ? 'Yes' : '–'}
                  </td>

                  {/* Volume */}
                  <td
                    className={`px-2 py-1 text-center font-semibold w-[80px] ${
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
                    className={`px-2 py-1 text-center font-semibold w-[70px] ${
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
                    className={`px-2 py-1 text-center font-semibold w-[70px] ${
                      s.isVolumeSpike ? 'text-yellow-400' : 'text-gray-500'
                    }`}
                  >
                    {s.isVolumeSpike ? 'Spike' : '—'}
                  </td>

                  {/* EMA14 Inside */}
                  <td className="px-2 py-1 text-center w-[100px]">
                    {s.ema14InsideResults.some(r => r.inside)
                      ? <span className="text-green-400 font-semibold">Yes</span>
                      : <span className="text-red-400">No</span>}
                  </td>

                  {/* Gaps */}
                  <td className={`px-2 py-1 text-center w-[90px] ${s.gap !== null && s.gap > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {typeof s.gap === 'number' && !isNaN(s.gap) ? `${s.gap.toFixed(1)}%` : 'N/A'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[90px] ${s.gap1 !== null && s.gap1 > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {typeof s.gap1 === 'number' && !isNaN(s.gap1) ? `${s.gap1.toFixed(1)}%` : 'N/A'}
                  </td>

                  {/* EMA200 Proximity */}
                  <td className="px-2 py-1 text-center w-[100px]">
                    {s.mainTrend?.trend === 'bearish' && s.gapFromLowToEMA200 !== null ? (
                      <span className={s.gapFromLowToEMA200 < 1 ? 'text-red-400' : 'text-yellow-400'}>
                        {s.gapFromLowToEMA200.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-1 text-center w-[100px]">
                    {s.mainTrend?.trend === 'bullish' && s.gapFromHighToEMA200 !== null ? (
                      <span className={s.gapFromHighToEMA200 > 5 ? 'text-green-400' : 'text-gray-300'}>
                        {s.gapFromHighToEMA200.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>

                  {/* Bounces & Touches */}
                  <td className={`px-2 py-1 text-center w-[90px] ${s.ema200Bounce ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                    {s.ema200Bounce ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[120px] ${s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
                    {s.touchedEMA200Today ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[90px] ${s.ema14Bounce ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
                    {s.ema14Bounce ? 'Yes' : 'No'}
                  </td>
                  <td className={`px-2 py-1 text-center w-[90px] ${s.ema70Bounce ? 'text-pink-400 font-semibold' : 'text-gray-500'}`}>
                    {s.ema70Bounce ? 'Yes' : 'No'}
                  </td>

                  {/* Engulfing & Patterns */}
                  <td className="px-2 py-1 text-center text-green-400 font-semibold w-[90px]">
                    {s.mainTrend?.trend === 'bearish' && s.hasBullishEngulfing ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-red-400 font-semibold w-[90px]">
                    {s.mainTrend?.trend === 'bullish' && s.hasBearishEngulfing ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-blue-300 font-semibold w-[80px]">
                    {s.testedPrevHigh ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-blue-300 font-semibold w-[80px]">
                    {s.testedPrevLow ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-red-400 font-semibold w-[90px]">
                    {s.breakoutFailure ? 'Yes' : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-yellow-400 font-semibold w-[90px]">
                    {s.mainTrend?.trend === 'bullish' &&
                    (s.isDoubleTopFailure || s.isDoubleTop || s.isDescendingTop)
                      ? s.isDoubleTopFailure ? 'Fail' : s.isDoubleTop ? 'Double' : 'Desc'
                      : '-'}
                  </td>
                  <td className="px-2 py-1 text-center text-green-400 font-semibold w-[100px]">
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
