// File: components/SignalsTable.tsx

import React, { useMemo } from 'react';
import PriceChangePercent from './PriceChangePercent';
import { SignalData } from '../hooks/useCryptoSignals'; // Assuming SignalData is correctly imported
// REMOVE THESE IMPORTS: getRecentRSIDiff, getSignal are now calculated server-side
// import { getRecentRSIDiff, getSignal, didDropFromPeak, didRecoverFromLow } from '../utils/calculations';
import { didDropFromPeak, didRecoverFromLow } from '../utils/calculations'; // Only keep what's truly client-side display logic

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

// These mappings help translate the filter keys to actual SignalData properties
const trendKeyToMainTrendValue: Record<string, 'bullish' | 'bearish'> = {
  'mainTrend.trend_bullish': 'bullish', // Updated key to match the FilterControls' key
  'mainTrend.trend_bearish': 'bearish', // Updated key to match the FilterControls' key
};

const trendKeyToBooleanField: Record<string, keyof SignalData> = {
  'bullishBreakout': 'bullishBreakout',
  'bearishBreakout': 'bearishBreakout',
  'breakoutFailure': 'breakoutFailure',
  'testedPrevHigh': 'testedPrevHigh',
  'testedPrevLow': 'testedPrevLow',
  'bullishReversal.signal': 'bullishReversal', // Mapped to the object, logic below will check .signal
  'bearishReversal.signal': 'bearishReversal', // Mapped to the object, logic below will check .signal
  'bullishSpike.signal': 'bullishSpike',       // Mapped to the object, logic below will check .signal
  'bearishCollapse.signal': 'bearishCollapse', // Mapped to the object, logic below will check .signal
  'ema14InsideResults': 'ema14InsideResults',
  // Note: highestVolumeColorPrev is not a boolean, so it's handled differently in FilterControls
  // If you add other boolean trend filters in FilterControls, add them here too.
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

      // --- Trend Filtering Logic (Updated) ---
      if (trendFilter) {
        // Handle mainTrend filter (e.g., 'mainTrend.trend_bullish')
        if (trendKeyToMainTrendValue[trendFilter]) {
          const expectedTrend = trendKeyToMainTrendValue[trendFilter];
          if (s.mainTrend?.trend !== expectedTrend) {
            return false;
          }
        }
        // Handle other boolean/signal filters (e.g., 'bullishBreakout', 'bullishReversal.signal')
        else if (trendKeyToBooleanField[trendFilter]) {
          const field = trendKeyToBooleanField[trendFilter];
          const fieldValue = s[field]; // Get the actual value from SignalData

          let matchesTrendFilter = false;

          // Logic to check the boolean status of the field based on its type
          if (typeof fieldValue === 'boolean' && fieldValue === true) {
            matchesTrendFilter = true;
          } else if (
            typeof fieldValue === 'object' &&
            fieldValue !== null &&
            'signal' in fieldValue &&
            (fieldValue as { signal: boolean | undefined }).signal === true // Check for .signal property
          ) {
            matchesTrendFilter = true;
          } else if (
            Array.isArray(fieldValue) &&
            fieldValue.some((item: any) => (item as { inside: boolean }).inside === true) // Check for ema14InsideResults
          ) {
            matchesTrendFilter = true;
          }

          if (!matchesTrendFilter) {
            return false;
          }
        }
      }

      // --- Signal Filtering Logic (Updated) ---
      // Now directly use s.primarySignalText
      if (signalFilter && s.primarySignalText?.trim().toUpperCase() !== signalFilter.trim().toUpperCase()) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (sortField === null) return 0;

      let valA: any = (a as any)[sortField as string];
      let valB: any = (b as any)[sortField as string];

      const handleBooleanSort = (fieldKey: keyof SignalData | string) => { // Allow string for direct access
        let aVal = false;
        let bVal = false;

        // Dynamic access for nested properties (e.g., 'bullishReversal.signal')
        const getNestedValue = (obj: any, path: string) => {
          const parts = path.split('.');
          let current = obj;
          for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
          }
          return current;
        };

        const aFieldVal = getNestedValue(a, fieldKey as string);
        const bFieldVal = getNestedValue(b, fieldKey as string);

        if (typeof aFieldVal === 'boolean') {
          aVal = aFieldVal;
        } else if (Array.isArray(aFieldVal) && aFieldVal.some) {
          aVal = aFieldVal.some((r: any) => r.inside);
        }

        if (typeof bFieldVal === 'boolean') {
          bVal = bFieldVal;
        } else if (Array.isArray(bFieldVal) && bFieldVal.some) {
          bVal = bFieldVal.some((r: any) => r.inside);
        }

        // For boolean sorting, true comes before false for 'asc', and false before true for 'desc'
        return sortOrder === 'asc' ? (aVal === bVal ? 0 : aVal ? -1 : 1) : (aVal === bVal ? 0 : aVal ? 1 : -1);
      };

      // Corrected switch cases to use the actual SignalData properties
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

        // Added cases for properties that were objects with a 'signal' boolean
        case 'bullishReversal':
        case 'bearishReversal':
        case 'bullishSpike':
        case 'bearishCollapse':
          return handleBooleanSort(`${sortField}.signal`); // Sort by the boolean 'signal' property

        case 'pumpStrength':
        case 'dumpStrength':
          // These are now directly available on SignalData if you calculated them on the server
          // Assuming you add pumpStrength and dumpStrength fields to SignalData
          valA = (a as any).pumpStrength; // Example, adjust based on your SignalData
          valB = (b as any).pumpStrength; // Example, adjust based on your SignalData
          if (sortField === 'dumpStrength') {
            valA = (a as any).dumpStrength;
            valB = (b as any).dumpStrength;
          }
          break;

        case 'bearishDivergence':
        case 'bullishDivergence':
        case 'bearishVolumeDivergence': // Added volume divergence sorting
        case 'bullishVolumeDivergence': // Added volume divergence sorting
          // Access the 'divergence' property directly from the object on SignalData
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
          // Now use primarySignalText directly from SignalData
          valA = a.primarySignalText || '';
          valB = b.primarySignalText || '';
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
    <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
  <table className="w-full text-[11px] border-collapse">
    <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
  <tr>
    {/* Symbol */}
    <th
      onClick={() => {
        setSortField('symbol');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 sticky left-0 z-30 text-left align-middle cursor-pointer"
    >
      Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>

	    <th className="px-2 py-1 border border-gray-700 text-right">Current Price</th>
	   <th
  onClick={() => {
    setSortField('priceChangePercent');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  24h Change (%) {sortField === 'priceChangePercent' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
<th className="px-1 py-0.5 bg-gray-800 text-center">
  Drop 🚨
</th>
<th className="px-1 py-0.5 bg-gray-800 text-center">
  Recovery 🟢
</th>	  

    {/* Static Columns */}
    <th className="px-1 py-0.5 text-center">Bull BO</th>
    <th className="px-1 py-0.5 text-center">Bear BO</th>
	<th
  onClick={() => {
    setSortField('prevClose');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Prev Close {sortField === 'prevClose' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
	  
      <th className="px-1 py-0.5 text-center">Trend (200)</th>
	  
<th
  onClick={() => handleSort('bearishCollapse')} // Use handleSort
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Collapse {sortField === 'bearishCollapse' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
<th
  onClick={() => handleSort('bullishSpike')} // Use handleSort
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Spike {sortField === 'bullishSpike' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
<th
  onClick={() => handleSort('bearishReversal')} // Use handleSort
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Bear Rev {sortField === 'bearishReversal' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
<th
  onClick={() => handleSort('bullishReversal')} // Use handleSort
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Bull Rev {sortField === 'bullishReversal' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
	  
	<th
  onClick={() => handleSort('primarySignalText')} // Sort by the new field
  className="px-1 py-0.5 min-w-[60px] text-center cursor-pointer"
>
  Signal {sortField === 'primarySignalText' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
	  
    {/* RSI Pump | Dump */}
    <th
      onClick={() => {
        setSortField('pumpStrength'); // Assuming these are now direct fields in SignalData
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      RSI Pump | Dump {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>
	    <th
  onClick={() => {
    setSortField('latestRSI');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  RSI14 {sortField === 'latestRSI' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>	  

{/* Bearish Divergence */}
    <th
      onClick={() => {
        setSortField('bearishDivergence');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      Bearish Divergence {sortField === 'bearishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>

    {/* Bullish Divergence */}
    <th
      onClick={() => {
        setSortField('bullishDivergence');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      Bullish Divergence {sortField === 'bullishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>

{/* Volume */}
    <th className="p-2 text-center">Volume</th>
	<th
  onClick={() => handleSort('bullishVolumeDivergence')} // Sort by this new field
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Volume Divergence {sortField === 'bullishVolumeDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
	 <th
  onClick={() => {
    setSortField('isVolumeSpike');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Volume Spike {sortField === 'isVolumeSpike' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>	  
	  
<th
  onClick={() => {
    setSortField('ema14InsideResults');
    setSortOrder((prev) =>
      sortField === 'ema14InsideResults' && prev === 'asc' ? 'desc' : 'asc'
    );
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  EMA14 Inside<br />EMA70–200 {sortField === 'ema14InsideResults' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th> 

	  
 <th className="px-4 py-2 border border-gray-700">Ema14&70 Gap %</th>	  
<th className="px-4 py-2 border border-gray-700">Ema70&200 Gap %</th>
	  
<th className="px-1 py-0.5 text-center">Low→EMA200 (%)</th>
<th className="px-1 py-0.5 text-center">High→EMA200 (%)</th>	  
	  	  
<th
  onClick={() => {
    setSortField('ema200Bounce');
    setSortOrder((prev) =>
      sortField === 'ema200Bounce' && prev === 'asc' ? 'desc' : 'asc'
    );
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  EMA200 Bounce {sortField === 'ema200Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th> 
	  
{/* Touched EMA200 Today */}
    <th
      onClick={() => {
        setSortField('touchedEMA200Today');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      Touched EMA200 Today {sortField === 'touchedEMA200Today' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>	  
	  
   {/* More Static Columns */}
    <th className="p-2 text-center">EMA14 Bounce</th>
    <th
      onClick={() => {
        setSortField('ema70Bounce');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
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
  // REMOVED getRecentRSIDiff call here, it should be calculated on the server
  // and accessible as s.pumpStrength, s.dumpStrength, s.pumpDirection
  const pump = (s as any).pumpStrength; // Assuming you've added this to SignalData
  const dump = (s as any).dumpStrength; // Assuming you've added this to SignalData
  const direction = (s as any).pumpDirection; // Assuming you've added this to SignalData

const inRange = (val: number | undefined, min: number, max: number) =>
  val !== undefined && val >= min && val <= max;

const isAbove30 = (val: number | undefined) => val !== undefined && val >= 30;
const validPump = pump !== undefined && pump !== 0;
const validDump = dump !== undefined && dump !== 0;

// You can still perform these checks for display logic if primarySignalText is not sufficient
// However, the "signal" column below will now use s.primarySignalText
// const pumpInRange_21_26 = inRange(pump, 21, 26);
// const dumpInRange_21_26 = inRange(dump, 21, 26);
// const pumpAbove30 = isAbove30(pump);
// const dumpAbove30 = isAbove30(dump);
// const pumpInRange_1_10 = inRange(pump, 1, 10);
// const dumpInRange_1_10 = inRange(dump, 1, 10);
// const pumpInRange_17_19 = inRange(pump, 17, 19);
// const dumpInRange_17_19 = inRange(dump, 17, 19);

// let signal = ''; // This 'signal' variable is no longer needed, use s.primarySignalText


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
		   
{/* Use s.primarySignalText here */}
<td
  className={`px-1 py-0.5 min-w-[40px] text-center font-semibold ${
    s.primarySignalText.trim() === 'MAX ZONE PUMP'
      ? 'text-yellow-300'
      : s.primarySignalText.trim() === 'MAX ZONE DUMP'
      ? 'text-yellow-400'
      : s.primarySignalText.trim() === 'BALANCE ZONE PUMP'
      ? 'text-purple-300 font-bold'
      : s.primarySignalText.trim() === 'BALANCE ZONE DUMP'
      ? 'text-purple-400 font-bold'
      : s.primarySignalText.trim() === 'LOWEST ZONE PUMP'
      ? 'text-green-400 font-bold'
      : s.primarySignalText.trim() === 'LOWEST ZONE DUMP'
      ? 'text-green-500 font-bold'
      : 'text-gray-500'
  }`}
>
  {s.primarySignalText.trim()}
</td>			   

  {/* Pump / Dump */}
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
  {(!direction || (direction === 'pump' && (pump === undefined || pump === 0)) || (direction === 'dump' && (dump === undefined || dump === 0))) && 'N/A'}
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

{/* Divergences */}
{/* Bearish Divergence */}
<td className={`p-2 font-semibold ${s.bearishDivergence?.divergence ? 'text-red-500' : 'text-gray-400'}`}>
 {s.bearishDivergence?.divergence ? 'Yes' : '-'}
</td>

{/* Bullish Divergence */}
<td className={`p-2 font-semibold ${s.bullishDivergence?.divergence ? 'text-green-500' : 'text-gray-400'}`}>
{s.bullishDivergence?.divergence ? 'Yes' : '-'}
</td>	

  {/* Volume */}
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
    s.bullishVolumeDivergence?.divergence || s.bearishVolumeDivergence?.divergence // Check both divergences for styling
      ? (s.bullishVolumeDivergence?.type === 'bullish-volume' ? 'text-green-400' : 'text-red-400')
      : 'text-gray-400'
  }`}
>
  {s.bullishVolumeDivergence?.divergence
    ? 'Bullish'
    : s.bearishVolumeDivergence?.divergence
    ? 'Bearish'
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

<td className={`px-4 py-2 border border-gray-700 ${s.gap > 0 ? 'text-green-400' : 'text-red-400'}`}>
  {typeof s.gap === 'number' && !isNaN(s.gap) ? `${s.gap.toFixed(2)}%` : 'N/A'}
</td>

<td className={`px-4 py-2 border border-gray-700 ${s.gap1 > 0 ? 'text-green-400' : 'text-red-400'}`}>
  {typeof s.gap1 === 'number' && !isNaN(s.gap1) ? `${s.gap1.toFixed(2)}%` : 'N/A'}
</td>
		   
{/* Low → EMA200: Only for bearish trend */}
<td className="px-1 py-0.5 text-center">
  {s.mainTrend?.trend === 'bearish' && s.gapFromLowToEMA200 !== null ? (
    <span className={s.gapFromLowToEMA200 < 1 ? 'text-red-400' : 'text-yellow-400'}>
      {s.gapFromLowToEMA200.toFixed(2)}%
    </span>
  ) : '—'}
</td>

{/* High → EMA200: Only for bullish trend */}
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
		   
  {/* Touched EMA200 */}
  <td className={`p-2 ${s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
    {s.touchedEMA200Today ? 'Yes' : 'No'}
  </td>	   			   

{/* EMA Bounces */}
  <td className={`p-2 ${s.ema14Bounce ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema14Bounce ? 'Yes' : 'No'}
  </td>

  <td className={`p-2 ${s.ema70Bounce ? 'text-pink-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema70Bounce ? 'Yes' : 'No'}
  </td>	   
		   		   
     <td className="px-2 py-1 text-center text-green-400 font-semibold w-[90px]">
                {/* Check hasBullishEngulfing directly */}
                {s.hasBullishEngulfing ? 'Yes' : '-'}
              </td>
              <td className="px-2 py-1 text-center text-red-400 font-semibold w-[90px]">
                {/* Check hasBearishEngulfing directly */}
                {s.hasBearishEngulfing ? 'Yes' : '-'}
              </td>
		   	
		   
  {/* Support/Breakout Detection */}
  <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
    {s.testedPrevHigh ? 'Yes' : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
    {s.testedPrevLow ? 'Yes' : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-red-400 font-semibold">
    {s.breakoutFailure ? 'Yes' : '-'}
  </td>

 <td className="px-2 py-1 text-center text-blue-300 font-semibold w-[80px]">
                {/* This seems to duplicate testedPrevHigh, ensure this is intended for 'Top Pattern' */}
                {s.isDoubleTop || s.isDescendingTop || s.isDoubleTopFailure ? 'Yes' : '-'}
              </td>
              <td className="px-2 py-1 text-center text-blue-300 font-semibold w-[80px]">
                {/* This seems to duplicate testedPrevLow, ensure this is intended for 'Bottom Pattern' */}
                {s.isDoubleBottom || s.isAscendingBottom || s.isDoubleBottomFailure ? 'Yes' : '-'}
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
