import { useEffect, useState, useMemo } from "react";

function calculateEMA(data: number[], period: number) {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let previousEma: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }
    if (i === period - 1) {
      const sma = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
      previousEma = sma;
    }
    if (previousEma !== null) {
      const currentEma = data[i] * k + previousEma * (1 - k);
      ema.push(currentEma);
      previousEma = currentEma;
    }
  }
  return ema;
}

function getCurrentEMAGapPercentage(data: number[], periodShort: number, periodLong: number): number | null {
  const emaShort = calculateEMA(data, periodShort);
  const emaLong = calculateEMA(data, periodLong);

  const lastShort = emaShort[emaShort.length - 1];
  const lastLong = emaLong[emaLong.length - 1];

  // Ensure values are valid numbers
  if (isNaN(lastShort) || isNaN(lastLong)) return null;

  const gapPercentage = ((lastShort - lastLong) / lastLong) * 100;
  return gapPercentage;
}

function isEMA14InsideRange(ema14Arr: number[], ema70Arr: number[], ema200Arr: number[], lookback: number = 5) {
  const results = [];

  for (let i = ema14Arr.length - lookback; i < ema14Arr.length; i++) {
    const val14 = ema14Arr[i];
    const val70 = ema70Arr[i];
    const val200 = ema200Arr[i];

    const lower = Math.min(val70, val200);
    const upper = Math.max(val70, val200);

      const inside = val14 > lower && val14 < upper;

    results.push({
      candleIndex: i,
      inside,
      ema14: val14,
      ema70: val70,
      ema200: val200,
    });
  }

  return results;
}

function calculateRSI(closes: number[], period = 3): number[] {
  if (!Array.isArray(closes) || closes.length <= period) return [];

  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  // Continue calculating RSI
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  // Fill leading entries with NaN
  for (let i = 0; i < period; i++) {
    rsi[i] = NaN;
  }

  return rsi;
}

type TrendResult = {
  trend: 'bullish' | 'bearish';
  type: 'support' | 'resistance';
  crossoverPrice: number;
  breakout: boolean | null;
  isNear?: boolean; // optional proximity flag
};

// Helper to check if current price is near a key level
function isNearLevel(currentPrice: number, levelPrice: number, tolerancePercent = 0.5): boolean {
  const tolerance = (tolerancePercent / 100) * levelPrice;
  return Math.abs(currentPrice - levelPrice) <= tolerance;
}

function getMainTrend(
  ema70: number[],
  ema200: number[],
  closes: number[],
  opens: number[],
  highs: number[],
  lows: number[],
  tolerancePercent = 0.5, // for near crossover level
  dojiToleranceRatio = 0.1 // for body vs range
): TrendResult & { isDojiAfterBreakout?: boolean } {
  const len = ema70.length;
  const lastClose = closes[len - 1];
  const lastOpen = opens[len - 1];
  const lastHigh = highs[len - 1];
  const lastLow = lows[len - 1];

  const isDoji = Math.abs(lastClose - lastOpen) <= (lastHigh - lastLow) * dojiToleranceRatio;

  for (let i = len - 2; i >= 1; i--) {
    const prevEMA70 = ema70[i];
    const prevEMA200 = ema200[i];
    const currEMA70 = ema70[i + 1];
    const currEMA200 = ema200[i + 1];

    // Bullish crossover
    if (prevEMA70 <= prevEMA200 && currEMA70 > currEMA200) {
      const crossoverPrice = closes[i + 1];
      return {
        trend: 'bullish',
        type: 'support',
        crossoverPrice,
        breakout: lastClose > ema200[len - 1],
        isNear: isNearLevel(lastClose, crossoverPrice, tolerancePercent),
        isDojiAfterBreakout: lastClose > ema200[len - 1] && isDoji
      };
    }

    // Bearish crossover
    if (prevEMA70 >= prevEMA200 && currEMA70 < currEMA200) {
      const crossoverPrice = closes[i + 1];
      return {
        trend: 'bearish',
        type: 'resistance',
        crossoverPrice,
        breakout: lastClose < ema200[len - 1],
        isNear: isNearLevel(lastClose, crossoverPrice, tolerancePercent),
        isDojiAfterBreakout: lastClose < ema200[len - 1] && isDoji
      };
    }
  }

  // Fallback trend (no crossover)
  const lastEMA70 = ema70[len - 1];
  const lastEMA200 = ema200[len - 1];
  const fallbackTrend = lastEMA70 >= lastEMA200 ? 'bullish' : 'bearish';
  const fallbackType = fallbackTrend === 'bullish' ? 'support' : 'resistance';

  return {
    trend: fallbackTrend,
    type: fallbackType,
    crossoverPrice: lastClose,
    breakout: null,
    isNear: true,
    isDojiAfterBreakout: false
  };
}

function getRecentRSIDiff(rsi: number[], lookback = 14) {
  if (rsi.length < lookback) return null;

  const recentRSI = rsi.slice(-lookback);
  let recentHigh = -Infinity;
  let recentLow = Infinity;

  for (const value of recentRSI) {
    if (!isNaN(value)) {
      if (value > recentHigh) recentHigh = value;
      if (value < recentLow) recentLow = value;
    }
  }

  const pumpStrength = recentHigh - recentLow;
  const dumpStrength = Math.abs(recentLow - recentHigh);

  const startRSI = recentRSI[0];
  const endRSI = recentRSI[recentRSI.length - 1];
  const direction = endRSI > startRSI ? 'pump' : endRSI < startRSI ? 'dump' : 'neutral';
  const strength = Math.abs(endRSI - startRSI);

  return {
    recentHigh,
    recentLow,
    pumpStrength,
    dumpStrength,
    direction,
    strength
  };
}

const getSignal = (s: any): string => {  
  const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;  
  if (!pumpDump) return 'NO DATA';

  const direction = pumpDump.direction; // 'pump', 'dump', or 'neutral'  
  const strength = pumpDump.strength;  
  const pump = pumpDump.pumpStrength;  
  const dump = pumpDump.dumpStrength;  
  
  const inRange = (val: number | undefined, min: number, max: number) =>  
    val !== undefined && val >= min && val <= max;  
  
  const isAbove30 = (val: number | undefined) =>  
    val !== undefined && val >= 30;  
  
  const pumpAbove30 = isAbove30(pump);
  const dumpAbove30 = isAbove30(dump);

  const pumpInRange_21_26 = inRange(pump, 21, 26);
  const dumpInRange_21_26 = inRange(dump, 21, 26);

  const pumpInRange_1_10 = inRange(pump, 1, 10);
  const dumpInRange_1_10 = inRange(dump, 1, 10);

  const pumpOrDumpInRange_17_19 = inRange(pump, 17, 19) || inRange(dump, 17, 19);

  const {  
    mainTrend, breakout, testedPrevHigh, testedPrevLow,  
    failedBullishBreak, failedBearishBreak, bullishReversal,  
    bearishReversal, bullishBreakout, bearishBreakout,  
    bullishSpike, bearishCollapse, isDoubleTop, isDescendingTop,  
    isDoubleTopFailure, isDoubleBottom, isAscendingBottom,  
    isDoubleBottomFailure, ema14Bounce, ema70Bounce, ema200Bounce,  
    bullishDivergence, bearishDivergence, highestVolumeColorPrev,  
    touchedEMA200Today, priceChangePercent, prevClosedGreen,
    prevClosedRed,
  } = s;  
  
  // ✅ MAX ZONE - Separate pump/dump  
  if (direction === 'pump' && pumpAbove30) return 'MAX ZONE PUMP';  
  if (direction === 'dump' && dumpAbove30) return 'MAX ZONE DUMP';  
  
  // ✅ BALANCE ZONE - Separate pump/dump  
  if (pumpInRange_21_26 && direction === 'pump') return 'BALANCE ZONE PUMP';  
  if (dumpInRange_21_26 && direction === 'dump') return 'BALANCE ZONE DUMP';  
  
  // ✅ LOWEST ZONE - Separate pump/dump
  if (pumpInRange_1_10 && direction === 'pump') return 'LOWEST ZONE PUMP';
  if (dumpInRange_1_10 && direction === 'dump') return 'LOWEST ZONE DUMP';
  
  return 'NO STRONG SIGNAL';  
};



// === RSI-BASED DIVERGENCE (over lookback window) === //
function detectBearishDivergence(prevHigh: number, currHigh: number, prevRSI: number, currRSI: number) {
  const priceIncreased = currHigh > prevHigh;
  const rsiDropped = currRSI < prevRSI;

  if (priceIncreased && rsiDropped) {
    return {
      divergence: true,
      type: 'bearish',
      prevHigh,
      currHigh,
      prevRSI,
      currRSI,
    };
  }

  return { divergence: false };
}

function detectBullishDivergence(prevLow: number, currLow: number, prevRSI: number, currRSI: number) {
  const priceDropped = currLow < prevLow;
  const rsiRose = currRSI > prevRSI;

  if (priceDropped && rsiRose) {
    return {
      divergence: true,
      type: 'bullish',
      prevLow,
      currLow,
      prevRSI,
      currRSI,
    };
  }

  return { divergence: false };
}

function detectBearishVolumeDivergence(prevHigh: number, currHigh: number, volumePrev: number, volumeCurr: number) {
  const priceIncreased = currHigh > prevHigh;
  const volumeDecreased = volumeCurr < volumePrev;

  if (priceIncreased && volumeDecreased) {
    return {
      divergence: true,
      type: 'bearish-volume',
      prevHigh,
      currHigh,
      volumePrev,
      volumeCurr,
    };
  }

  return { divergence: false };
}

function detectBullishVolumeDivergence(prevLow: number, currLow: number, volumePrev: number, volumeCurr: number) {
  const priceDecreased = currLow < prevLow;
  const volumeIncreased = volumeCurr > volumePrev;

  if (priceDecreased && volumeIncreased) {
    return {
      divergence: true,
      type: 'bullish-volume',
      prevLow,
      currLow,
      volumePrev,
      volumeCurr,
    };
  }

  return { divergence: false };
}

type PriceChangePercentProps = {
  percent: number;
  peakPercent?: number;
  dropThreshold?: number;
  lowPercent?: number; // 🟢 for recovery tracking
  recoveryThreshold?: number;
};

function get24hChangePercent(currentPrice: number, price24hAgo: number): number {
  if (currentPrice === 0) return 0;
  const change = ((currentPrice - price24hAgo) / currentPrice) * 100;
  return parseFloat(change.toFixed(2));
}

  function didDropFromPeak(
  peakPercent: number,
  currentPercent: number,
  dropThreshold: number = 5
): boolean {
  const drop = peakPercent - currentPercent;
  return drop >= dropThreshold;
}

function didRecoverFromLow(
  lowPercent: number,
  currentPercent: number,
  recoveryThreshold: number = 5
): boolean {
  const recovery = currentPercent - lowPercent;
  return currentPercent > lowPercent && recovery >= recoveryThreshold;
}

const PriceChangePercent = ({
  percent,
  peakPercent,
  dropThreshold = 5,
  lowPercent,
  recoveryThreshold = 5,
}: PriceChangePercentProps) => {
  const isSignificantDrop =
    typeof peakPercent === 'number' &&
    percent < peakPercent &&
    peakPercent - percent >= dropThreshold;

  const isSignificantRecovery =
    typeof lowPercent === 'number' &&
    percent > lowPercent &&
    percent - lowPercent >= recoveryThreshold;

  const color =
    percent > 0 ? 'text-green-500' :
    percent < 0 ? 'text-red-500' :
    'text-gray-400';

  const icon =
    percent > 0 ? '📈' :
    percent < 0 ? '📉' :
    '➖';

  return (
  <span className={`font-semibold ${color}`}>
    {icon} {typeof percent === 'number' && !isNaN(percent) ? percent.toFixed(2) : 'N/A'}%
    {isSignificantDrop && (
      <span className="ml-1 text-yellow-400 animate-pulse">🚨 Dropped</span>
    )}
    {isSignificantRecovery && (
      <span className="ml-1 text-green-300 animate-pulse">🟢 Recovery</span>
    )}
  </span>
);
};

function findRelevantLevel(
  ema14: number[],
  ema70: number[],
  closes: number[],
  highs: number[],
  lows: number[],
  trend: 'bullish' | 'bearish'
): { level: number | null; type: 'support' | 'resistance' | null } {
  for (let i = ema14.length - 2; i >= 1; i--) {
    const prev14 = ema14[i - 1];
    const prev70 = ema70[i - 1];
    const curr14 = ema14[i];
    const curr70 = ema70[i];

    if (trend === 'bullish' && prev14 < prev70 && curr14 > curr70) {
      return { level: closes[i], type: 'support' };
    }

    if (trend === 'bearish' && prev14 > prev70 && curr14 < curr70) {
      return { level: closes[i], type: 'resistance' };
    }
  }

  const level = trend === 'bullish' ? Math.max(...highs) : Math.min(...lows);
  const type = trend === 'bullish' ? 'resistance' : 'support';
  return { level, type };
       }


const blacklist = [
  "ALPACAUSDT", "BNXUSDT", "ALPHAUSDT", "OCEANUSDT", "DGBUSDT", "AGIXUSDT",
  "LINAUSDT", "LOKAUSDT", "KEYUSDT", "MDTUSDT", "LOOMUSDT", "RENUSDT",
  "OMNIUSDT", "SLERFUSDT", "STMXUSDT", "UXLINKUSDT", "BSWUSDT", "NEIROETHUSDT",
  "VIDTUSDT", "TROYUSDT", "BAKEUSDT", "AMBUSDT", "MEMEFIUSDT", "NULSUSDT",
  "HIFIUSDT", "LEVERUSDT", "XEMUSDT", "STRAXUSDT", "COMBOUSDT"
];


export default function Home() {
const [signals, setSignals] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});
  const [loading, setLoading] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'starting' | 'scanning' | 'waiting' | 'rate-limited' | 'error'> ('starting');
  const [scannerProgress, setScannerProgress] = useState({ completed: 0, total: 0 });
  const [nextScanAt, setNextScanAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [sortField, setSortField] = useState<string>('symbol');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
const [trendFilters, setTrendFilters] = useState<string[]>([]);
  const [signalFilter, setSignalFilter] = useState<string | null>(null);
	  const [timeframe, setTimeframe] = useState('15m');	  
  const timeframes = ['15m', '4h', '1d'];
	
  


useEffect(() => {
  const stored = localStorage.getItem("favorites");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavorites(new Set(parsed)); // Convert array back to Set
      }
    } catch (err) {
      console.error("Failed to parse favorites:", err);
    }
  }
}, []);

useEffect(() => {
  localStorage.setItem("favorites", JSON.stringify(Array.from(favorites))); // Convert Set to array before storing
}, [favorites]);

const toggleFavorite = (symbol: string) => {
  setFavorites((prev) => {
    const newSet = new Set(prev);
    if (newSet.has(symbol)) {
      newSet.delete(symbol);
    } else {
      newSet.add(symbol);
    }
    return newSet;
  });
};

const [rsi14Filter, setRsi14Filter] = useState<'all' | 'above50' | 'below50'>('all');
const [breakoutFailFilter, setBreakoutFailFilter] = useState<'all' | 'yes' | 'no'>('all');
const [touchedEMA200Filter, setTouchedEMA200Filter] = useState<'all' | 'yes' | 'no'>('all');
const [rsiPumpDumpFilter, setRsiPumpDumpFilter] = useState<'all' | 'pump' | 'dump'>('all');
const [tableSignalFilter, setTableSignalFilter] = useState<string>('all');
const [ema70200CrossFilter, setEma70200CrossFilter] = useState<'all' | 'bullish' | 'bearish' | 'no'>('all');

const searchTerm = search.trim().toLowerCase();

const getPumpDump = (s: any) => s?.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
const getSignalValue = (s: any) => getSignal(s)?.trim() || 'NO DATA';
const getPumpDumpStrength = (s: any) => {
  const pd = getPumpDump(s);
  if (!pd) return null;
  return pd.direction === 'dump' ? pd.dumpStrength : pd.pumpStrength;
};
const getBooleanValue = (value: any) => value ? 1 : 0;

const getSortValue = (s: any, field: string): any => {
  switch (field) {
    case 'symbol': return s.symbol ?? '';
    case 'currentPrice': return Number(s.currentPrice);
    case 'priceChangePercent': return Number(s.priceChangePercent);
    case 'pumpDump': return getPumpDumpStrength(s);
    case 'latestRSI': return typeof s.latestRSI === 'number' ? s.latestRSI : null;
    case 'breakoutFailure': return getBooleanValue(s.breakoutFailure);
    case 'touchedEMA200Today': return getBooleanValue(s.touchedEMA200Today);
    case 'ema70200Cross': return s.ema70200Cross?.timestamp ?? null;
    case 'signal': return getSignalValue(s);
    case 'drop': return getBooleanValue(s.mainTrend?.trend === 'bullish' && didDropFromPeak(10, s.priceChangePercent, 5));
    case 'recovery': return getBooleanValue(s.mainTrend?.trend === 'bearish' && didRecoverFromLow(-40, s.priceChangePercent, 10));
    case 'bullishBreakout': return getBooleanValue(s.bullishBreakout);
    case 'bearishBreakout': return getBooleanValue(s.bearishBreakout);
    case 'prevClose': return s.prevClosedGreen ? 1 : s.prevClosedRed ? -1 : 0;
    case 'mainTrend': return s.mainTrend?.trend ?? '';
    case 'bearishCollapse': return getBooleanValue(s.bearishCollapse?.signal);
    case 'bullishSpike': return getBooleanValue(s.bullishSpike?.signal);
    case 'bearishReversal': return getBooleanValue(s.bearishReversal?.signal);
    case 'bullishReversal': return getBooleanValue(s.bullishReversal?.signal);
    case 'divergenceFromLevel': return getBooleanValue(s.divergenceFromLevel === true || s.divergenceFromLevel === 'true');
    case 'bearishDivergence': return getBooleanValue(s.bearishDivergence?.divergence);
    case 'bullishDivergence': return getBooleanValue(s.bullishDivergence?.divergence);
    case 'highestVolumeColorPrev': return s.highestVolumeColorPrev ?? '';
    case 'bullishVolumeDivergence': return getBooleanValue(s.bullishVolumeDivergence?.divergence);
    case 'isVolumeSpike': return getBooleanValue(s.isVolumeSpike);
    case 'ema14InsideResults': return getBooleanValue(s.ema14InsideResults?.some((r: any) => r.inside));
    case 'gap': return typeof s.gap === 'number' ? s.gap : null;
    case 'gap1': return typeof s.gap1 === 'number' ? s.gap1 : null;
    case 'gapFromLowToEMA200': return typeof s.gapFromLowToEMA200 === 'number' ? s.gapFromLowToEMA200 : null;
    case 'gapFromHighToEMA200': return typeof s.gapFromHighToEMA200 === 'number' ? s.gapFromHighToEMA200 : null;
    case 'ema200Bounce': return getBooleanValue(s.ema200Bounce);
    case 'ema14Bounce': return getBooleanValue(s.ema14Bounce);
    case 'ema70Bounce': return getBooleanValue(s.ema70Bounce);
    case 'hasBullishEngulfing': return getBooleanValue(s.hasBullishEngulfing);
    case 'hasBearishEngulfing': return getBooleanValue(s.hasBearishEngulfing);
    case 'testedPrevHigh': return getBooleanValue(s.testedPrevHigh);
    case 'testedPrevLow': return getBooleanValue(s.testedPrevLow);
    case 'topPattern': return s.isDoubleTopFailure ? 3 : s.isDoubleTop ? 2 : s.isDescendingTop ? 1 : 0;
    case 'bottomPattern': return s.isDoubleBottomFailure ? 3 : s.isDoubleBottom ? 2 : s.isAscendingBottom ? 1 : 0;
    default: return s[field];
  }
};

const trendKeyToMainTrendValue: Record<string, 'bullish' | 'bearish'> = {
  bullishMainTrend: 'bullish',
  bearishMainTrend: 'bearish',
  bullishNearSupport: 'bullish',
  bearishNearResistance: 'bearish',
  bullishBreakup: 'bullish',
  bearishBreakdown: 'bearish',
  bullishDojiAfterBreakout: 'bullish',
  bearishDojiAfterBreakout: 'bearish',
};

const trend200ConditionMatches = (s: any, key: string): boolean => {
  switch (key) {
    case 'bullishNearSupport':
      return s.mainTrend?.trend === 'bullish' && s.mainTrend?.isNear === true;
    case 'bearishNearResistance':
      return s.mainTrend?.trend === 'bearish' && s.mainTrend?.isNear === true;
    case 'bullishBreakup':
      return s.mainTrend?.trend === 'bullish' && s.mainTrend?.breakout === true;
    case 'bearishBreakdown':
      return s.mainTrend?.trend === 'bearish' && s.mainTrend?.breakout === true;
    case 'bullishDojiAfterBreakout':
      return s.mainTrend?.trend === 'bullish' && s.mainTrend?.isDojiAfterBreakout === true;
    case 'bearishDojiAfterBreakout':
      return s.mainTrend?.trend === 'bearish' && s.mainTrend?.isDojiAfterBreakout === true;
    default:
      return false;
  }
};

const trendKeyToBooleanField: Record<string, keyof any> = {
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
  highestVolumeColorPrev: 'highestVolumeColorPrev',
  divergenceFromLevel: 'divergenceFromLevel',
  bullishDivergence: 'bullishDivergence',
  bearishDivergence: 'bearishDivergence'
};

const trendFilterMatches = (s: any, key: string): boolean => {
  // Main Trend filters
  if (key === 'bullishMainTrend') {
    return s.mainTrend?.trend === 'bullish';
  }

  if (key === 'bearishMainTrend') {
    return s.mainTrend?.trend === 'bearish';
  }

  // Trend (200) condition filters
  if ([
    'bullishNearSupport',
    'bearishNearResistance',
    'bullishBreakup',
    'bearishBreakdown',
    'bullishDojiAfterBreakout',
    'bearishDojiAfterBreakout',
  ].includes(key)) {
    return trend200ConditionMatches(s, key);
  }

  // Boolean / signal filters
  const field = trendKeyToBooleanField[key];
  if (!field) return false;

  if (field === 'ema14InsideResults') {
    return s.ema14InsideResults?.some((r: any) => r.inside) === true;
  }

  if (field === 'divergenceFromLevel') {
    return s.divergenceFromLevel === true || s.divergenceFromLevel === 'true';
  }

  if (field === 'bullishDivergence' || field === 'bearishDivergence') {
    return s[field]?.divergence === true;
  }

  if (field === 'bullishBreakout' || field === 'bearishBreakout' ||
      field === 'breakoutFailure' || field === 'testedPrevHigh' ||
      field === 'testedPrevLow' || field === 'bullishReversal' ||
      field === 'bearishReversal' || field === 'bullishSpike' ||
      field === 'bearishCollapse') {
    const value = s[field];
    return value === true || value?.signal === true;
  }

  return Boolean(s[field]);
};

const filteredSignals = signals.filter((s) => {
  const symbol = s.symbol?.toLowerCase() || '';
  const matchesSearch = !searchTerm || symbol.includes(searchTerm);
  const isFavorite = favorites.has(s.symbol);
  if (!matchesSearch || (showOnlyFavorites && !isFavorite)) return false;

  // Multiple Trend filters are combined with AND logic.
  // Example: Bullish Trend + Bullish Divergence + Bullish Near Support
  // means ALL THREE conditions must be true for the same symbol.
  if (trendFilters.length > 0 && !trendFilters.every((key) => trendFilterMatches(s, key))) {
    return false;
  }

  if (signalFilter && getSignalValue(s) !== signalFilter) return false;
  if (tableSignalFilter !== 'all' && getSignalValue(s) !== tableSignalFilter) return false;

  if (rsi14Filter !== 'all') {
    const rsi = typeof s.latestRSI === 'number' ? s.latestRSI : null;
    if (rsi === null) return false;
    if (rsi14Filter === 'above50' && rsi <= 50) return false;
    if (rsi14Filter === 'below50' && rsi > 50) return false;
  }

  if (breakoutFailFilter !== 'all' && (s.breakoutFailure ? 'yes' : 'no') !== breakoutFailFilter) return false;
  if (touchedEMA200Filter !== 'all' && (s.touchedEMA200Today ? 'yes' : 'no') !== touchedEMA200Filter) return false;

  if (ema70200CrossFilter !== 'all') {
    const crossDirection = s.ema70200Cross?.direction ?? 'none';
    const wanted = ema70200CrossFilter === 'no' ? 'none' : ema70200CrossFilter;
    if (crossDirection !== wanted) return false;
  }

  if (rsiPumpDumpFilter !== 'all') {
    const direction = getPumpDump(s)?.direction;
    if (direction !== rsiPumpDumpFilter) return false;
  }

  return true;
});

// One uniform sorting pipeline: FILTER FIRST, then SORT. Never mutate React state.
const filteredAndSortedSignals = [...filteredSignals].sort((a, b) => {
  const aValue = getSortValue(a, sortField);
  const bValue = getSortValue(b, sortField);
  const aMissing = aValue === null || aValue === undefined || (typeof aValue === 'number' && !Number.isFinite(aValue));
  const bMissing = bValue === null || bValue === undefined || (typeof bValue === 'number' && !Number.isFinite(bValue));

  if (aMissing && bMissing) return String(a.symbol ?? '').localeCompare(String(b.symbol ?? ''));
  if (aMissing) return 1;
  if (bMissing) return -1;

  let result = 0;
  if (typeof aValue === 'number' && typeof bValue === 'number') {
    result = aValue - bValue;
  } else {
    result = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });
  }

  if (result === 0) result = String(a.symbol ?? '').localeCompare(String(b.symbol ?? ''));
  return sortOrder === 'asc' ? result : -result;
});

const toggleSort = (field: string) => {
  if (sortField === field) {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  } else {
    setSortField(field);
    setSortOrder('asc');
  }
};

// 🔹 Count statistics
const bullishMainTrendCount = filteredSignals.filter(
  (s) => s.mainTrend?.trend === 'bullish'
).length;

const bearishMainTrendCount = filteredSignals.filter(
  (s) => s.mainTrend?.trend === 'bearish'
).length;

const bullishNearSupportCount = filteredSignals.filter(
  (s) => trend200ConditionMatches(s, 'bullishNearSupport')
).length;

const bearishNearResistanceCount = filteredSignals.filter(
  (s) => trend200ConditionMatches(s, 'bearishNearResistance')
).length;

const bullishBreakupCount = filteredSignals.filter(
  (s) => trend200ConditionMatches(s, 'bullishBreakup')
).length;

const bearishBreakdownCount = filteredSignals.filter(
  (s) => trend200ConditionMatches(s, 'bearishBreakdown')
).length;

const bullishDojiAfterBreakoutCount = filteredSignals.filter(
  (s) => trend200ConditionMatches(s, 'bullishDojiAfterBreakout')
).length;

const bearishDojiAfterBreakoutCount = filteredSignals.filter(
  (s) => trend200ConditionMatches(s, 'bearishDojiAfterBreakout')
).length;

const bullishBreakoutCount = filteredSignals.filter(
  (s) => s.bullishBreakout === true
).length;

const bearishBreakoutCount = filteredSignals.filter(
  (s) => s.bearishBreakout === true
).length;

const breakoutFailureCount = filteredSignals.filter(
  (s) => s.breakoutFailure === true
).length;

const testedPrevHighCount = filteredSignals.filter(
  (s) => s.testedPrevHigh === true
).length;

const testedPrevLowCount = filteredSignals.filter(
  (s) => s.testedPrevLow === true
).length;

const bullishReversalCount = filteredSignals.filter(
  (s) => s.bullishReversal?.signal === true
).length;

const bearishReversalCount = filteredSignals.filter(
  (s) => s.bearishReversal?.signal === true
).length;

const bullishDivergenceCount = filteredSignals.filter(
  (s) => s.bullishDivergence?.divergence === true
).length;

const bearishDivergenceCount = filteredSignals.filter(
  (s) => s.bearishDivergence?.divergence === true
).length;

// For bullishSpike, check the .signal property inside the object
const bullishSpikeCount = filteredSignals.filter(
  (s) => s.bullishSpike?.signal === true
).length;

// For bearishCollapse, check the .signal property inside the object
const bearishCollapseCount = filteredSignals.filter(
  (s) => s.bearishCollapse?.signal === true
).length;

const ema14InsideResultsCount = filteredSignals.filter(
  (s) => s.ema14InsideResults?.some(r => r.inside)
).length;

// 🔹 Price Change Statistics
const greenPriceChangeCount = filteredSignals.filter(
  (t) => parseFloat(t.priceChangePercent) > 0
).length;

const redPriceChangeCount = filteredSignals.filter(
  (t) => parseFloat(t.priceChangePercent) < 0
).length;

 const greenVolumeCount = filteredSignals.filter(
  (s) => s.highestVolumeColorPrev === 'green'
).length;

const redVolumeCount = filteredSignals.filter(
  (s) => s.highestVolumeColorPrev === 'red'
).length;

	const divergenceFromLevelCount = filteredSignals.filter(
  (s) => s.divergenceFromLevel === 'true'
).length;

	
const signalCounts = useMemo(() => {
  const counts = {
    maxZonePump: 0,
    maxZoneDump: 0,
    balanceZonePump: 0,
    balanceZoneDump: 0,
    lowestZonePump: 0,
    lowestZoneDump: 0,
  };

  signals.forEach((s: any) => {
    const signal = getSignal(s)?.trim().toUpperCase();

    switch (signal) {
      case 'MAX ZONE PUMP':
        counts.maxZonePump++;
        break;
      case 'MAX ZONE DUMP':
        counts.maxZoneDump++;
        break;
      case 'BALANCE ZONE PUMP':
        counts.balanceZonePump++;
        break;
      case 'BALANCE ZONE DUMP':
        counts.balanceZoneDump++;
        break;
      case 'LOWEST ZONE PUMP':
        counts.lowestZonePump++;
        break;
      case 'LOWEST ZONE DUMP':
        counts.lowestZoneDump++;
        break;
    }
  });

  return counts;
}, [signals]);
	
  useEffect(() => {
    let isMounted = true;

    // The scanner is intentionally started in the background. The React UI
    // must never wait for exchangeInfo or the first analysis batch to render.
    setLoading(false);
    setScannerStatus('starting');
    setScannerProgress({ completed: 0, total: 0 });
    setNextScanAt(null);

    // Binance-safe high-throughput scanner:
    // - 15 symbols are analysed per scan cycle.
    // - Only 3 symbols run concurrently, avoiding large request bursts.
    // - Waves are spaced instead of using setInterval, so slow scans never overlap.
    // - 429/418 responses honour Retry-After and use exponential backoff.
    // - Binance's returned 1-minute request-weight header is monitored.
    const BATCH_SIZE = 15;
    const MAX_CONCURRENT = 3;
    const WAVE_DELAY_MS = 650;
    const BETWEEN_CYCLE_DELAY_MS = 1000;
    const MAX_RETRIES = 3;
    const RATE_LIMIT_WEIGHT = 2400;
    const RATE_LIMIT_SOFT_CAP = 0.75;
    let currentIndex = 0;
    let symbols: string[] = [];
    let lastUsedWeight1m = 0;
    let ratePauseUntil = 0;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const getRetryAfterMs = (response: Response, fallbackMs: number) => {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = retryAfter ? Number(retryAfter) : NaN;
      return Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds * 1000)
        : fallbackMs;
    };

    const safeFetchJson = async <T = any>(url: string, label = 'Binance request'): Promise<T> => {
      let attempt = 0;

      while (attempt <= MAX_RETRIES) {
        if (!isMounted) throw new Error('Scanner stopped');

        const now = Date.now();
        if (ratePauseUntil > now) {
          await delay(ratePauseUntil - now);
        }

        try {
          const response = await fetch(url);

          const usedWeightHeader =
            response.headers.get('X-MBX-USED-WEIGHT-1M') ||
            response.headers.get('x-mbx-used-weight-1m');

          const usedWeight = Number(usedWeightHeader);
          if (Number.isFinite(usedWeight)) {
            lastUsedWeight1m = usedWeight;
          }

          if (response.ok) {
            if (isMounted) setScannerStatus('scanning');
            return await response.json() as T;
          }

          if (response.status === 429 || response.status === 418) {
            const exponential = Math.min(30_000, 1000 * Math.pow(2, attempt));
            const retryMs = getRetryAfterMs(response, exponential);
            ratePauseUntil = Math.max(ratePauseUntil, Date.now() + retryMs);

            setScannerStatus('rate-limited');
            console.warn(
              `⚠️ ${label}: HTTP ${response.status}. Backing off ${Math.ceil(retryMs / 1000)}s.`
            );

            attempt++;
            if (attempt > MAX_RETRIES) {
              throw new Error(`${label} rate limited (${response.status})`);
            }

            await delay(retryMs);
            continue;
          }

          const body = await response.text().catch(() => '');
          throw new Error(`${label} HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
        } catch (err: any) {
          if (err?.name === 'AbortError' || err?.message === 'Scanner stopped') {
            throw err;
          }

          attempt++;
          if (attempt > MAX_RETRIES) throw err;

          const retryMs = Math.min(10_000, 750 * Math.pow(2, attempt - 1));
          await delay(retryMs);
        }
      }

      throw new Error(`${label} failed`);
    };

    // Define available timeframes
const timeframes = ['15m', '4h', '1d'] as const;

// Derive Timeframe type from the array
type Timeframe = typeof timeframes[number];

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  rsi?: number;
  volumeColor?: 'green' | 'red' | 'neutral';
};

// === EMA70/EMA200 session crossover — strict 08:00 PH -> 08:00 PH ===
// Only crosses that occur inside the CURRENT 08:00–08:00 PH session count.
// The first 08:00 candle may cross using the immediately preceding 07:45
// candle as its comparison candle. If no cross occurs in the session, result is NO.
function detectLatestEMA70200SessionCross(
  candles: Array<{ timestamp: number }>,
  ema70: number[],
  ema200: number[],
  sessionStart: number,
  sessionEnd: number
) {
  let latest: {
    direction: 'bullish' | 'bearish' | 'none';
    timestamp: number | null;
    candleIndex: number | null;
  } = { direction: 'none', timestamp: null, candleIndex: null };

  for (let i = 1; i < candles.length; i++) {
    const ts = candles[i]?.timestamp;
    if (!Number.isFinite(ts) || ts < sessionStart || ts >= sessionEnd) continue;

    const prev70 = ema70[i - 1];
    const prev200 = ema200[i - 1];
    const curr70 = ema70[i];
    const curr200 = ema200[i];

    if (![prev70, prev200, curr70, curr200].every(Number.isFinite)) continue;

    if (prev70 <= prev200 && curr70 > curr200) {
      latest = { direction: 'bullish', timestamp: ts, candleIndex: i };
    } else if (prev70 >= prev200 && curr70 < curr200) {
      latest = { direction: 'bearish', timestamp: ts, candleIndex: i };
    }
  }

  return latest;
}

// Unified getSessions function
const getSessions = (timeframe?: Timeframe) => {
  const now = new Date();

  if (!timeframe || timeframe === '1d') {
    // Exact daily trading session: 08:00 PH -> 08:00 PH next day.
    // Binance timestamps are UTC, so PH (UTC+8) is converted to UTC.
    // sessionEnd is EXCLUSIVE: the 07:45 candle is the final 15m candle;
    // the next 08:00 candle starts the next session.
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();

    const getPHMillis = (y: number, m: number, d: number, hPH: number, min: number) =>
      Date.UTC(y, m, d, hPH - 8, min);

    const today8AM_UTC = getPHMillis(year, month, date, 8, 0);

    let sessionStart: number;
    let sessionEnd: number;

    if (now.getTime() >= today8AM_UTC) {
      sessionStart = today8AM_UTC;
      sessionEnd = getPHMillis(year, month, date + 1, 8, 0);
    } else {
      sessionStart = getPHMillis(year, month, date - 1, 8, 0);
      sessionEnd = today8AM_UTC;
    }

    const prevSessionStart = sessionStart - 24 * 60 * 60 * 1000;
    const prevSessionEnd = sessionStart;

    return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
  } else {
    // Generic timeframe sessions (15m, 4h)
    const nowMillis = now.getTime();
    const MILLISECONDS: Record<Exclude<Timeframe, '1d'>, number> = {
      '15m': 15 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
    };

    const tfMillis = MILLISECONDS[timeframe];
    const sessionStart = Math.floor(nowMillis / tfMillis) * tfMillis;
    const sessionEnd = sessionStart + tfMillis;
    const prevSessionStart = sessionStart - tfMillis;
    const prevSessionEnd = sessionStart;

    return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
  }
};

    const fetchAndAnalyze = async (symbol: string, interval: string) => {
  try {
    const raw = await safeFetchJson<any[]>(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`,
      `${symbol} klines`
    );

        const candles: Candle[] = raw.map((c: any) => ({
          timestamp: +c[0],
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
          volume: +c[5],
          closeTime: +c[6],
        }));

const closes = candles.map(c => c.close);
const highs = candles.map(c => c.high);
const lows = candles.map(c => c.low);
const volumes = candles.map(c => c.volume); // ✅ Add volume here	      
const opens = candles.map(c => c.open);

	      
const ema14 = calculateEMA(closes, 14);
const ema70 = calculateEMA(closes, 70);
const ema200 = calculateEMA(closes, 200);
const rsi14 = calculateRSI(closes, 14);
      	      
candles.forEach((c, i) => {
  c.rsi = rsi14[i];
  
  // Add volume color based on candle body
  c.volumeColor =
    c.close > c.open
      ? 'green'
      : c.close < c.open
      ? 'red'
      : 'neutral';
  
  // Volume is already assumed to be present as c.volume
});

    const ticker24h = await safeFetchJson<any>(
      `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`,
      `${symbol} 24h ticker`
    );



    const currentPrice = parseFloat(ticker24h.lastPrice);
    const price24hAgo = parseFloat(ticker24h.openPrice);
    const priceChangePercent = parseFloat(ticker24h.priceChangePercent);
	  const isUp = priceChangePercent > 0;    	      

const lastOpen = candles.at(-1)?.open!;
const lastClose = candles.at(-1)?.close!;
const lastEMA14 = ema14.at(-1)!;
const lastEMA70 = ema70.at(-1)!;
const lastEMA200 = ema200.at(-1)!;


const mainTrend = getMainTrend(ema70, ema200, closes, opens, highs, lows);
const trend = lastEMA14 > lastEMA70 ? "bullish" : "bearish";

const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions();
        

        // ONLY COMPLETED 15m CANDLES are eligible.
        // Session boundaries are exact: 08:00 PH inclusive -> next-day 08:00 PH exclusive.
        // Therefore the 07:45 candle is the final candle of the session and the
        // next 08:00 candle belongs to the next session.
        const nowMs = Date.now();
        const candlesToday = candles.filter(c =>
          c.timestamp >= sessionStart &&
          c.timestamp < sessionEnd &&
          Number.isFinite(c.closeTime) &&
          c.closeTime <= nowMs
        );
        const candlesPrev = candles.filter(c =>
          c.timestamp >= prevSessionStart &&
          c.timestamp < prevSessionEnd &&
          Number.isFinite(c.closeTime) &&
          c.closeTime <= nowMs
        );

        const todaysLowestLow = candlesToday.length > 0 ? Math.min(...candlesToday.map(c => c.low)) : null;
        const todaysHighestHigh = candlesToday.length > 0 ? Math.max(...candlesToday.map(c => c.high)) : null;
        const prevSessionLow = candlesPrev.length > 0 ? Math.min(...candlesPrev.map(c => c.low)) : null;
        const prevSessionHigh = candlesPrev.length > 0 ? Math.max(...candlesPrev.map(c => c.high)) : null;

	     // Filter all candles that fall within the previous session range
const prevSessionCandles = candles.filter((candle) => {
  return candle.timestamp >= prevSessionStart &&
    candle.timestamp < prevSessionEnd &&
    Number.isFinite(candle.closeTime) &&
    candle.closeTime <= nowMs;
});

let prevClosedGreen: boolean | null = null;
let prevClosedRed: boolean | null = null;

if (prevSessionCandles.length >= 2) {
  const firstCandle = prevSessionCandles[0];
  const lastCandle = prevSessionCandles[prevSessionCandles.length - 1];

  prevClosedGreen = lastCandle.close > firstCandle.open;
  prevClosedRed = lastCandle.close < firstCandle.open;
}
       
	const bullishBreakout = todaysHighestHigh !== null && prevSessionHigh !== null && todaysHighestHigh > prevSessionHigh;
        const bearishBreakout = todaysLowestLow !== null && prevSessionLow !== null && todaysLowestLow < prevSessionLow;
        const breakout = bullishBreakout || bearishBreakout;
	      
          const failedBullishBreak =
    todaysHighestHigh !== null &&
    prevSessionHigh !== null &&
    todaysHighestHigh <= prevSessionHigh;

  const failedBearishBreak =
    todaysLowestLow !== null &&
    prevSessionLow !== null &&
    todaysLowestLow >= prevSessionLow;

  // Combined Breakout Fail is YES only when BOTH boundaries failed.
// Wicks count because session high/low are used; no close confirmation is required.
const highBreakoutFail = failedBullishBreak;
const lowBreakoutFail = failedBearishBreak;
const breakoutFailure = highBreakoutFail && lowBreakoutFail;

  // Optional: Add test failure signal
  const getTestThreshold = (price: number): number => {
  if (price > 10000) return price * 0.00005;     // 0.005% for BTC/ETH
  if (price > 1000) return price * 0.0001;       // 0.01%
  if (price > 1) return price * 0.001;           // 0.1%
  return price * 0.01;                           // 1% for sub-$1 coins
};
        
  const testedPrevHigh =
  todaysHighestHigh !== null &&
  prevSessionHigh !== null &&
  Math.abs(todaysHighestHigh - prevSessionHigh) <= getTestThreshold(prevSessionHigh) &&
  todaysHighestHigh <= prevSessionHigh;

const testedPrevLow =
  todaysLowestLow !== null &&
  prevSessionLow !== null &&
  Math.abs(todaysLowestLow - prevSessionLow) <= getTestThreshold(prevSessionLow) &&
  todaysLowestLow >= prevSessionLow;

  let breakoutTestSignal = '';
  if (testedPrevHigh) breakoutTestSignal = '🟡 Tested & Failed to Break Previous High';
  else if (testedPrevLow) breakoutTestSignal = '🟡 Tested & Failed to Break Previous Low';


// Utility to generate UTC timestamp at specific hour
const getUTCMillis = (year: number, month: number, date: number, hour: number, minute: number) => {
  return Date.UTC(year, month, date, hour, minute);
};

// Get the start times for the last N sessions at 8AM UTC
const getLastNSessionStartTimes = (n: number): number[] => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const today8AM_UTC = getUTCMillis(year, month, date, 8, 0);
  const isAfter8AM = now.getTime() >= today8AM_UTC;
  const baseDate = isAfter8AM ? date : date - 1;

  const sessionStarts: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const sessionDate = baseDate - i;
    sessionStarts.push(getUTCMillis(year, month, sessionDate, 8, 0));
  }

  return sessionStarts;
};

// Extract highs per session
const getRecentSessionHighs = (
  ohlcvData: { timestamp: number; high: number }[],
  sessionStartTimes: number[]
): number[] => {
  return sessionStartTimes.map((start, i) => {
    const end = i < sessionStartTimes.length - 1 ? sessionStartTimes[i + 1] : Infinity;
    const candles = ohlcvData.filter(c => c.timestamp >= start && c.timestamp < end);
    return candles.length ? Math.max(...candles.map(c => c.high)) : 0;
  });
};

// Extract lows per session
const getRecentSessionLows = (
  ohlcvData: { timestamp: number; low: number }[],
  sessionStartTimes: number[]
): number[] => {
  return sessionStartTimes.map((start, i) => {
    const end = i < sessionStartTimes.length - 1 ? sessionStartTimes[i + 1] : Infinity;
    const candles = ohlcvData.filter(c => c.timestamp >= start && c.timestamp < end);
    return candles.length ? Math.min(...candles.map(c => c.low)) : Infinity;
  });
};

// Detect top pattern types
const detectTopPatterns = (highs: number[]) => {
  const recentTop = highs.at(-1);
  const previousTops = highs.slice(0, -1).filter(h => h > 0);

  if (!recentTop || recentTop === 0 || previousTops.length === 0) {
    return { isDoubleTop: false, isDescendingTop: false, isDoubleTopFailure: false };
  }

  const lastTop = previousTops.at(-1);
  const tolerance = 0.01; // 1%

  const isDoubleTop =
    Math.abs(recentTop - lastTop!) / lastTop! < tolerance &&
    recentTop < Math.max(...previousTops);

  const isDescendingTop = previousTops
    .slice(-3)
    .every((h, i, arr) => i === 0 || h < arr[i - 1]);

  const isDoubleTopFailure = recentTop > Math.max(...previousTops);

  return { isDoubleTop, isDescendingTop, isDoubleTopFailure };
};

// Detect bottom pattern types
const detectBottomPatterns = (lows: number[]) => {
  const recentLow = lows.at(-1);
  const previousLows = lows.slice(0, -1).filter(l => l < Infinity);

  if (!recentLow || recentLow === Infinity || previousLows.length === 0) {
    return { isDoubleBottom: false, isAscendingBottom: false, isDoubleBottomFailure: false };
  }

  const lastLow = previousLows.at(-1);
  const tolerance = 0.01; // 1%

  const isDoubleBottom =
    Math.abs(recentLow - lastLow!) / lastLow! < tolerance &&
    recentLow > Math.min(...previousLows);

  const isAscendingBottom = previousLows
    .slice(-3)
    .every((l, i, arr) => i === 0 || l > arr[i - 1]);

  const isDoubleBottomFailure = recentLow < Math.min(...previousLows);

  return { isDoubleBottom, isAscendingBottom, isDoubleBottomFailure };
};

// === Usage ===
const sessionStartTimes = getLastNSessionStartTimes(2);
const sessionHighs = getRecentSessionHighs(candles, sessionStartTimes);
const sessionLows = getRecentSessionLows(candles, sessionStartTimes);

const { isDoubleTop, isDescendingTop, isDoubleTopFailure } = detectTopPatterns(sessionHighs);
const { isDoubleBottom, isAscendingBottom, isDoubleBottomFailure } = detectBottomPatterns(sessionLows);

// Debug pattern detection
console.log({
  sessionHighs,
  sessionLows,
  isDoubleTop,
  isDescendingTop,
  isDoubleTopFailure,
  isDoubleBottom,
  isAscendingBottom,
  isDoubleBottomFailure
});

const ema14InsideResults = isEMA14InsideRange(ema14, ema70, ema200, 5);	      

const gap = getCurrentEMAGapPercentage(closes, 14, 70);
const gap1 = getCurrentEMAGapPercentage(closes, 70, 200);	      

	      const nearEMA14 = closes.slice(-3).some(c => Math.abs(c - lastEMA14) / c < 0.002);          
const nearEMA70 = closes.slice(-3).some(c => Math.abs(c - lastEMA70) / c < 0.002);
const nearEMA200 = closes.slice(-3).some(c => Math.abs(c - lastEMA200) / c < 0.002);


const ema14Bounce = nearEMA14 && lastClose > lastEMA14;         	      
const ema70Bounce = nearEMA70 && lastClose > lastEMA70;
const ema200Bounce = nearEMA200 && lastClose > lastEMA200;
const { sessionStart: emaCrossSessionStart, sessionEnd: emaCrossSessionEnd } = getSessions('1d');
const ema70200Cross = detectLatestEMA70200SessionCross(candles, ema70, ema200, emaCrossSessionStart, emaCrossSessionEnd);

// TRUE EMA200 TOUCH — exact 08:00 -> 08:00 PH session.
// Each 15m candle is tested against the EMA200 calculated for THAT candle.
// A touch exists when the candle's actual price range intersects EMA200:
//     candle.low <= candleEMA200 <= candle.high
// No comparison against the latest EMA200 and no close-proximity approximation.
const touchedEMA200Today = candlesToday.some((candle) => {
  const candleIndex = candles.indexOf(candle);
  const candleEMA200 = ema200[candleIndex];

  return Number.isFinite(candleEMA200) &&
    candle.low <= candleEMA200 &&
    candle.high >= candleEMA200;
});

// === Extract highs and lows from each session ===
const highsPrev = candlesPrev.map(c => c.high);
const highsToday = candlesToday.map(c => c.high);
const lowsPrev = candlesPrev.map(c => c.low);
const lowsToday = candlesToday.map(c => c.low);

// === Get last high/low of previous session and highest/lowest of today ===
const prevHigh = Math.max(...highsPrev);
const currHigh = Math.max(...highsToday);

const prevLow = Math.min(...lowsPrev);
const currLow = Math.min(...lowsToday);

// === Align RSI data ===
// Ensure rsi14 includes enough data to cover both sessions
const rsiPrev = rsi14[rsi14.length - candlesToday.length - 1]; // Last RSI from prev session
const rsiCurr = rsi14[rsi14.length - 1]; // Latest RSI from today

// === Run divergence detection ===
const bearishDivergence = detectBearishDivergence(prevHigh, currHigh, rsiPrev, rsiCurr);
const bullishDivergence = detectBullishDivergence(prevLow, currLow, rsiPrev, rsiCurr);

// === Extract volumes from each session ===
const volumesPrev = candlesPrev.map(c => c.volume);
const volumesToday = candlesToday.map(c => c.volume);

// === Get highest volume candle value from each session ===
const volumePrev = Math.max(...volumesPrev);
const volumeCurr = Math.max(...volumesToday);

	      
const bearishVolumeDivergence = detectBearishVolumeDivergence(prevHigh, currHigh, volumePrev, volumeCurr);
const bullishVolumeDivergence = detectBullishVolumeDivergence(prevLow, currLow, volumePrev, volumeCurr);
	      
// === Log results ===
if (bearishDivergence.divergence) {
  console.log("🔻 Bearish Divergence Detected:", bearishDivergence);
}

if (bullishDivergence.divergence) {
  console.log("🔼 Bullish Divergence Detected:", bullishDivergence);
}

const prevVolumesWithColor = candlesPrev.map(candle => {
  const color = candle.close > candle.open
    ? 'green'
    : candle.close < candle.open
    ? 'red'
    : 'neutral';
  return {
    ...candle,
    volumeColor: color,
  };
});
	      

// === Step 3: Find the highest volume candle ===
const highestVolumeCandlePrev = prevVolumesWithColor.reduce((max, curr) =>
  curr.volume > max.volume ? curr : max
, prevVolumesWithColor[0]); // Provide initial value to avoid reduce crash

// === Step 4: Log or use the color ===
if (highestVolumeCandlePrev) {
  const highestVolumeColorPrev = highestVolumeCandlePrev.volumeColor;
  console.log('🔴 Highest Volume (Yesterday):', highestVolumeCandlePrev.volume);
  console.log('🟢 Color:', highestVolumeColorPrev);
} else {
  console.log('No candles found in previous session.');
}

const highestVolumeColorPrev = highestVolumeCandlePrev?.volumeColor ?? 'neutral';	  

// === Step 5: Detect volume spike in current session ===
const avgPrevVolume =
  candlesPrev.reduce((sum, c) => sum + c.volume, 0) / candlesPrev.length;

const latestCandle = candles[candles.length - 1];
const recentVolume = latestCandle?.volume ?? 0;

const isVolumeSpike = recentVolume > avgPrevVolume * 1.5; // You can tweak 1.5 threshold	      

// ✅ Engulfing Candle Pattern Detection in Today’s Session
const engulfingPatterns = [];

// Step 1: Get session-wide high/low and their indices
let sessionHigh = -Infinity;
let sessionLow = Infinity;
let sessionHighIndex = -1;
let sessionLowIndex = -1;

candlesToday.forEach((candle, idx) => {
  if (candle.high > sessionHigh) {
    sessionHigh = candle.high;
    sessionHighIndex = idx;
  }
  if (candle.low < sessionLow) {
    sessionLow = candle.low;
    sessionLowIndex = idx;
  }
});

// Step 2: Scan for engulfing patterns *only after* the high/low occurred
for (let i = 1; i < candlesToday.length - 1; i++) {
  const prev = candlesToday[i - 1];
  const curr = candlesToday[i];
  const next = candlesToday[i + 1];

  const isPrevBearish = prev.close < prev.open;
  const isCurrBullish = curr.close > curr.open;
  const isNextBullish = next.close > next.open;

  const isPrevBullish = prev.close > prev.open;
  const isCurrBearish = curr.close < curr.open;
  const isNextBearish = next.close < next.open;

  const bullishEngulfing =
    isPrevBearish &&
    isCurrBullish &&
    curr.open < prev.close &&
    curr.close > prev.open;

  const bearishEngulfing =
    isPrevBullish &&
    isCurrBearish &&
    curr.open > prev.close &&
    curr.close < prev.open;

  // ✅ Apply condition: pattern must come after the high or low
  const bullishConfirmed =
    bullishEngulfing &&
    isNextBullish &&
    next.close > curr.close &&
    i > sessionHighIndex;

  const bearishConfirmed =
    bearishEngulfing &&
    isNextBearish &&
    next.close < curr.close &&
    i > sessionLowIndex;

  if (bullishConfirmed) {
    engulfingPatterns.push({ index: i, type: 'bullishConfirmed', candle: curr, confirm: next });
  } else if (bearishConfirmed) {
    engulfingPatterns.push({ index: i, type: 'bearishConfirmed', candle: curr, confirm: next });
  }
}

const hasBullishEngulfing = engulfingPatterns.some(p => p.type === 'bullishConfirmed');
const hasBearishEngulfing = engulfingPatterns.some(p => p.type === 'bearishConfirmed');

// Sample component using the above
   const latestRSI = rsi14.at(-1);

const ema200Value = ema200[ema200.length - 1];
	      
let gapFromLowToEMA200 = null;
let gapFromHighToEMA200 = null;

if (todaysLowestLow !== null && ema200Value > 0) {
  gapFromLowToEMA200 = ((ema200Value - todaysLowestLow) / ema200Value) * 100;
}

if (todaysHighestHigh !== null && ema200Value > 0) {
  gapFromHighToEMA200 = ((todaysHighestHigh - ema200Value) / ema200Value) * 100;
}

const currentRSI = rsi14.at(-1);
          const prevHighIdx = highs.lastIndexOf(prevSessionHigh!);
          const prevLowIdx = lows.lastIndexOf(prevSessionLow!);
          const prevHighRSI = prevHighIdx !== -1 ? rsi14[prevHighIdx] : null;
          const prevLowRSI = prevLowIdx !== -1 ? rsi14[prevLowIdx] : null;
	  
const { level, type } = findRelevantLevel(ema14, ema70, closes, highs, lows, trend);
          const highestHigh = Math.max(...highs);
          const lowestLow = Math.min(...lows);
          const inferredLevel = trend === 'bullish' ? highestHigh : lowestLow;
          const inferredLevelType = trend === 'bullish' ? 'resistance' : 'support';

           let divergenceFromLevel = false;
          let divergenceFromLevelType: 'bullish' | 'bearish' | null = null;

          if (type && level !== null) {
            const levelIdx = closes.findIndex(c => Math.abs(c - level) / c < 0.002);
            if (levelIdx !== -1) {
              const pastRSI = rsi14[levelIdx];
              if (type === 'resistance' && lastClose > level && currentRSI! < pastRSI) {
                divergenceFromLevel = true;
                divergenceFromLevelType = 'bearish';
              } else if (type === 'support' && lastClose < level && currentRSI! > pastRSI) {
                divergenceFromLevel = true;
                divergenceFromLevelType = 'bullish';
              }
            }
          }

	  
const isAscendingRSI = (rsi: number[], window = 3): boolean => {
  const len = rsi.length;
  if (len < window) return false;

  for (let i = len - window; i < len - 1; i++) {
    if (rsi[i] >= rsi[i + 1]) {
      return false;
    }
  }
  return true;
};

const isDescendingRSI = (rsi: number[], window = 3): boolean => {
  const len = rsi.length;
  if (len < window) return false;

  for (let i = len - window; i < len - 1; i++) {
    if (rsi[i] <= rsi[i + 1]) {
      return false;
    }
  }
  return true;
};
	      
type BearishSignalInfo = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

/**
 * Detect Bullish to Bearish Reversal Signal (return full SL/TP trade plan)
 */
const detectBullishToBearish = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  opens: number[] // ✅ Added for trend detection
): BearishSignalInfo => {
  const len = closes.length;
  if (len < 10) return null;

  const i = len - 1;
  const close = closes[i];
  const ema70Value = ema70[i];
  const ema200Value = ema200[i];

  // ✅ Must be in a bullish main trend
  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
  const isBullishTrend = trendResult.trend === 'bullish';
  if (!isBullishTrend) return null;

  // ❌ Reject if RSI is still climbing (structure not exhausted)
  if (isAscendingRSI(rsi14, 3)) return null;

  // ✅ Detect EMA14 > EMA70 crossover (recent bullish structure)
  let crossoverIndex = -1;
  for (let j = len - 10; j >= 1; j--) {
    if (ema14[j] <= ema70[j] && ema14[j + 1] > ema70[j + 1]) {
      crossoverIndex = j + 1;
      break;
    }
  }

  if (crossoverIndex === -1) return null;

  const crossoverLow = lows[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];
  let lastHigh: number | null = null;

  for (let k = crossoverIndex + 1; k < len - 1; k++) {
    const nearEMA70 = highs[k] >= ema70[k] && lows[k] <= ema70[k];
    const closeAboveEMA70 = closes[k] > ema70[k];

    const fallingRSI = rsi14[k] < crossoverRSI;
    const rsiBelow50 = rsi14[k] < 50;
    const belowCrossoverLow = closes[k] < crossoverLow;

    const currentHigh = highs[k];
    const isDescendingHigh = lastHigh !== null && currentHigh < lastHigh;

    if (nearEMA70 || closeAboveEMA70) {
      if (lastHigh === null || currentHigh < lastHigh) {
        lastHigh = currentHigh;
      }

      const finalClose = closes[len - 1];
      const finalEMA14 = ema14[len - 1];

      const descendingCloseBelowEMA14 = finalClose < finalEMA14;
      const descendingCurrentRSI = isDescendingRSI(rsi14.slice(0, len), 3);

      const triggerCandle =
        isDescendingHigh &&
        fallingRSI &&
        rsiBelow50 &&
        belowCrossoverLow &&
        descendingCloseBelowEMA14 &&
        descendingCurrentRSI;

      if (triggerCandle) {
        const entry = lows[k] - lows[k] * 0.001;
        const stopLoss = lastHigh!;

        if (stopLoss <= entry) return null;

        const risk = stopLoss - entry;
        const tp1 = entry - risk;
        const tp2 = entry - 2 * risk;

        return {
          signal: true,
          entry,
          stopLoss,
          tp1,
          tp2,
        };
      }
    }
  }

  return null;
};
        
type BullishSignalInfo = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

/**
 * Detects a bullish reversal after a bearish trend.
 */
const detectBearishToBullish = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  opens: number[] // ✅ Required for trend detection
): BullishSignalInfo => {
  const len = closes.length;
  if (len < 10) return null;

  const i = len - 1;
  const close = closes[i];
  const ema70Value = ema70[i];
  const ema200Value = ema200[i];

  // ✅ Require the main trend to be bearish
  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
  const isBearishTrend = trendResult.trend === 'bearish';
  if (!isBearishTrend) return null;

  // ❌ Invalidate if RSI is falling
  if (isDescendingRSI(rsi14.slice(0, i + 1), 3)) return null;

  // ✅ Find recent EMA14 < EMA70 crossover
  let crossoverIndex = -1;
  for (let j = len - 10; j >= 1; j--) {
    if (ema14[j] >= ema70[j] && ema14[j + 1] < ema70[j + 1]) {
      crossoverIndex = j + 1;
      break;
    }
  }

  if (crossoverIndex === -1) return null;

  const crossoverHigh = highs[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];
  let lastLow: number | null = null;

  for (let k = crossoverIndex + 1; k < len - 1; k++) {
    const nearEMA70 = highs[k] >= ema70[k] && lows[k] <= ema70[k];
    const closeBelowEMA70 = closes[k] < ema70[k];
    const rsi = rsi14[k];

    const risingRSI = rsi > crossoverRSI;
    const rsiAbove50 = rsi > 50;
    const closeAboveCrossoverHigh = closes[k] > crossoverHigh;

    const currentLow = lows[k];
    const isAscendingLow = lastLow !== null && currentLow > lastLow;

    if (nearEMA70 || closeBelowEMA70) {
      if (lastLow === null || currentLow > lastLow) {
        lastLow = currentLow;
      }

      const finalClose = closes[len - 1];
      const finalEMA14 = ema14[len - 1];
      const closingAboveEMA14 = finalClose > finalEMA14;
      const ascendingRSI = isAscendingRSI(rsi14.slice(0, len), 3);

      const triggerCandle =
        isAscendingLow &&
        risingRSI &&
        rsiAbove50 &&
        closeAboveCrossoverHigh &&
        closingAboveEMA14 &&
        ascendingRSI;

      if (triggerCandle) {
        const entry = highs[len - 1] + highs[len - 1] * 0.001;
        const stopLoss = lastLow!;

        if (stopLoss >= entry) return null;

        const risk = entry - stopLoss;
        const tp1 = entry + risk;
        const tp2 = entry + 2 * risk;

        return {
          signal: true,
          entry,
          stopLoss,
          tp1,
          tp2,
        };
      }
    }
  }

  return null;
};


    
// Usage
  const bullishReversal = detectBullishToBearish(
  ema14,
  ema70,
ema200,	  
  rsi14,
  lows,
  highs,
  closes,
opens,	  
);


const bearishReversal = detectBearishToBullish(
  ema14,
  ema70,
ema200,	
  rsi14,
  highs,
  lows,
  closes,
opens,	
);


        
const touchedEMA14 = (price: number, ema14: number, margin = 0.0015): boolean => {
  return Math.abs(price - ema14) / ema14 <= margin;
};

const isAscendingLowOnEMA14Touch = (lows: number[], ema14: number[]): boolean => {
  const len = lows.length;
  const latestIndex = len - 1;
  if (!touchedEMA14(lows[latestIndex], ema14[latestIndex])) return false;

  for (let i = latestIndex - 1; i >= 0; i--) {
    if (touchedEMA14(lows[i], ema14[i])) {
      return lows[latestIndex] > lows[i];
    }
  }
  return false;
};

type BullishSpikeSignal = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

/**
 * Main function to detect bullish spike signals with trade levels.
 */
const detectBullishSpike = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  opens: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): BullishSpikeSignal => {
  const len = closes.length;
  if (len < 10) return null;

  const close = closes[len - 1];
  const currentLow = lows[len - 1];
  const currentHigh = highs[len - 1];
  const ema14Value = ema14[len - 1];
  const ema70Value = ema70[len - 1];
  const ema200Value = ema200[len - 1];
  const rsi = rsi14[len - 1];

  // Reject if it's already a breakout candle
  if (bearishBreakout) return null;

  // ✅ Fix: Only reject if the main trend is NOT bullish
  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
const isBullishTrend = trendResult.trend === 'bullish';
if (!isBullishTrend) return null;

  // Find EMA14 > EMA70 crossover
  let crossoverIndex70 = -1;
  for (let j = len - 4; j >= 1; j--) {
    if (ema14[j] <= ema70[j] && ema14[j + 1] > ema70[j + 1]) {
      crossoverIndex70 = j + 1;
      break;
    }
  }
  if (crossoverIndex70 === -1) return null;

  // Find EMA14 > EMA200 crossover
  let crossoverIndex200 = -1;
  for (let j = len - 4; j >= 1; j--) {
    if (ema14[j] <= ema200[j] && ema14[j + 1] > ema200[j + 1]) {
      crossoverIndex200 = j + 1;
      break;
    }
  }
  if (crossoverIndex200 === -1) return null;

  const crossoverIndex = Math.max(crossoverIndex70, crossoverIndex200);
  const crossoverLow = lows[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];

  // Find lowest low after crossover
  let lowestLowAfterCrossover = crossoverLow;
  for (let k = crossoverIndex + 1; k < len; k++) {
    if (lows[k] < lowestLowAfterCrossover) {
      lowestLowAfterCrossover = lows[k];
    }
  }

  // Reject if current candle touches EMA70
  const touchedEMA70 = currentLow <= ema70Value && currentHigh >= ema70Value;
  if (touchedEMA70) return null;

  // Spike criteria
  const aboveEMA70 = close > ema70Value;
  const aboveEMA200 = close > ema200Value;
  const aboveEMA14 = close > ema14Value;
  const ascendingLow = currentLow > lowestLowAfterCrossover;
  const risingRSI = rsi > crossoverRSI;
  const rsiAbove50 = rsi > 50;
  const higherThanCrossoverLow = close > crossoverLow;
  const ascendingRSITrend = isAscendingRSI(rsi14.slice(0, len), 3);
  const ema14TouchAscendingLow = isAscendingLowOnEMA14Touch(lows, ema14);

  const conditionsMet = (
    aboveEMA70 &&
    aboveEMA200 &&
    (aboveEMA14 || ema14TouchAscendingLow) &&
    ascendingLow &&
    risingRSI &&
    rsiAbove50 &&
    higherThanCrossoverLow &&
    ascendingRSITrend
  );

  if (!conditionsMet) return null;

  // Entry, SL, TP
  const entry = close * 1.001;
  const stopLoss = lowestLowAfterCrossover;

  if (stopLoss >= entry) return null;

  const risk = entry - stopLoss;
  const tp1 = entry + risk;
  const tp2 = entry + 2 * risk;

  return {
    signal: true,
    entry,
    stopLoss,
    tp1,
    tp2,
  };
};



const isDescendingHighOnEMA14Touch = (highs: number[], ema14: number[]): boolean => {
  const len = highs.length;
  const latestIndex = len - 1;
  if (!touchedEMA14(highs[latestIndex], ema14[latestIndex])) return false;

  for (let i = latestIndex - 1; i >= 0; i--) {
    if (touchedEMA14(highs[i], ema14[i])) {
      return highs[latestIndex] < highs[i];
    }
  }
  return false;
};

  type BearishCollapseSignal = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

/**
 * Main function to detect bearish collapse signals with trade levels.
 */
const detectBearishCollapse = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  opens: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): BearishCollapseSignal => {
  const len = closes.length;
  if (len < 10) return null;

  const close = closes[len - 1];
  const currentLow = lows[len - 1];
  const currentHigh = highs[len - 1];
  const ema14Value = ema14[len - 1];
  const ema70Value = ema70[len - 1];
  const ema200Value = ema200[len - 1];
  const rsi = rsi14[len - 1];

  // ❌ Reject if bullish breakout candle
  if (bullishBreakout) return null;

  // ✅ Require that the main trend is bearish
  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
const isBearishTrend = trendResult.trend === 'bearish';
if (!isBearishTrend) return null;
	
  // Find EMA14 < EMA70 crossover
  let crossoverIndex70 = -1;
  for (let j = len - 4; j >= 1; j--) {
    if (ema14[j] >= ema70[j] && ema14[j + 1] < ema70[j + 1]) {
      crossoverIndex70 = j + 1;
      break;
    }
  }
  if (crossoverIndex70 === -1) return null;

  // Find EMA14 < EMA200 crossover
  let crossoverIndex200 = -1;
  for (let j = len - 4; j >= 1; j--) {
    if (ema14[j] >= ema200[j] && ema14[j + 1] < ema200[j + 1]) {
      crossoverIndex200 = j + 1;
      break;
    }
  }
  if (crossoverIndex200 === -1) return null;

  const crossoverIndex = Math.max(crossoverIndex70, crossoverIndex200);
  const crossoverHigh = highs[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];

  // Find highest high after crossover for stop loss
  let highestHighAfterCrossover = crossoverHigh;
  for (let k = crossoverIndex + 1; k < len; k++) {
    if (highs[k] > highestHighAfterCrossover) {
      highestHighAfterCrossover = highs[k];
    }
  }

  // Reject if current candle touches EMA70 (possible retest, not breakdown)
  const touchedEMA70 = currentLow <= ema70Value && currentHigh >= ema70Value;
  if (touchedEMA70) return null;

  // Core collapse criteria
  const belowEMA70 = close < ema70Value;
  const belowEMA200 = close < ema200Value;
  const belowEMA14 = close < ema14Value;
  const descendingHigh = currentHigh < highestHighAfterCrossover;
  const fallingRSI = rsi < crossoverRSI;
  const rsiBelow50 = rsi < 50;
  const lowerThanCrossoverHigh = close < crossoverHigh;
  const descendingRSITrend = isDescendingRSI(rsi14.slice(0, len), 3);
  const ema14TouchDescendingHigh = isDescendingHighOnEMA14Touch(highs, ema14);

  const conditionsMet = (
    belowEMA70 &&
    belowEMA200 &&
    (belowEMA14 || ema14TouchDescendingHigh) &&
    descendingHigh &&
    fallingRSI &&
    rsiBelow50 &&
    lowerThanCrossoverHigh &&
    descendingRSITrend
  );

  if (!conditionsMet) return null;

  // Calculate trade levels
  const entry = close * 0.999; // Entry: 0.1% below close
  const stopLoss = highestHighAfterCrossover;

  if (stopLoss <= entry) return null;

  const risk = stopLoss - entry;
  const tp1 = entry - risk; // 1:1 risk-reward
  const tp2 = entry - 2 * risk; // 2:1 risk-reward

  return {
    signal: true,
    entry,
    stopLoss,
    tp1,
    tp2,
  };
};


        
      // ✅ Usage
const bullishSpike = detectBullishSpike(
  ema14,
  ema70,
  ema200,
  rsi14,
  lows,
  highs,
  closes,
opens,	
  bullishBreakout,
  bearishBreakout
); 


// ✅ Usage
const bearishCollapse = detectBearishCollapse(
  ema14,
  ema70,
  ema200,
  rsi14,
  lows,
  highs,
  closes,
opens,	
  bullishBreakout,
  bearishBreakout
); 
	      
        
        return {
  symbol,
  bullishMainTrendCount,
  bearishMainTrendCount,
  bullishBreakoutCount,
  bearishBreakoutCount,       
  testedPrevHighCount,   // ✅ New
  testedPrevLowCount,    // ✅ New
  divergenceFromLevelCount,
mainTrend,
  breakout,
  bullishBreakout,
  bearishBreakout,
prevClosedGreen,
prevClosedRed,		
  bullishReversalCount,
  bearishReversalCount,
  bullishReversal,		
  bearishReversal,
divergenceFromLevel,		
  bullishSpike,
  bearishCollapse,	
  rsi14,
latestRSI,		
  testedPrevHigh,
  testedPrevLow,
  previousSessionHigh: prevSessionHigh,
  previousSessionLow: prevSessionLow,
  currentSessionHigh: todaysHighestHigh,
  currentSessionLow: todaysLowestLow,
     isDoubleTop,
  isDescendingTop,
  isDoubleTopFailure,
  isDoubleBottom,
  isAscendingBottom,
  isDoubleBottomFailure,       
  breakoutTestSignal,
  breakoutFailure,
  highBreakoutFail,
  lowBreakoutFail,
  failedBearishBreak,
  failedBullishBreak,
		ema14InsideResults,
		ema14InsideResultsCount,
		gap,
		gap1,
		ema14Bounce,
		ema70Bounce,
  ema200Bounce,
		touchedEMA200Today,
		ema70200Cross,
		bearishDivergence,
		bullishDivergence,
		bearishVolumeDivergence,
		bullishVolumeDivergence,
		highestVolumeColorPrev,
		greenVolumeCount,
		redVolumeCount,
		isVolumeSpike,
		hasBullishEngulfing,
		hasBearishEngulfing,
		   currentPrice,
      price24hAgo,
      priceChangePercent,
      isUp,
		greenPriceChangeCount, 
		redPriceChangeCount,
		gapFromLowToEMA200,
		gapFromHighToEMA200,
};
      } catch (err) {
        console.error("Error processing", symbol, err);
        return null;
      }
    };
	  

      const fetchSymbols = async () => {
      if (isMounted) setScannerStatus('starting');
      const info = await safeFetchJson<any>(
        "https://fapi.binance.com/fapi/v1/exchangeInfo",
        "exchangeInfo"
      );
      symbols = info.symbols
  .filter(
    (s: any) =>
      s.contractType === "PERPETUAL" &&
      s.quoteAsset === "USDT" &&
      !blacklist.includes(s.symbol)
  )
  .slice(0, 500)
  .map((s: any) => s.symbol);

        if (isMounted) {
          setScannerProgress({ completed: 0, total: symbols.length });
          setScannerStatus('scanning');
        }
	  };

  const fetchBatch = async () => {
  if (!symbols.length || !isMounted) return;

  setScannerStatus('scanning');
  setNextScanAt(null);

  const batch = symbols.slice(currentIndex, currentIndex + BATCH_SIZE);
  currentIndex = (currentIndex + BATCH_SIZE) % symbols.length;

  const results: any[] = [];

  // Process a maximum of 3 symbols concurrently. This is substantially faster
  // than the old fully-serial scanner while keeping request bursts bounded.
  for (let offset = 0; offset < batch.length && isMounted; offset += MAX_CONCURRENT) {
    const wave = batch.slice(offset, offset + MAX_CONCURRENT);

    const waveResults = await Promise.all(
      wave.map(async (symbol) => {
        try {
          return await fetchAndAnalyze(symbol, timeframe);
        } catch (err: any) {
          if (err?.message === 'Scanner stopped') return null;
          console.warn(`Error on ${symbol}:`, err?.message || err);
          return null;
        }
      })
    );

    for (const result of waveResults) {
      if (result) results.push(result);
    }

    if (!isMounted || offset + MAX_CONCURRENT >= batch.length) break;

    const usageRatio = lastUsedWeight1m / RATE_LIMIT_WEIGHT;
    const adaptiveDelay =
      usageRatio >= 0.90 ? 5000 :
      usageRatio >= 0.80 ? 2500 :
      usageRatio >= RATE_LIMIT_SOFT_CAP ? 1200 :
      WAVE_DELAY_MS;

    await delay(adaptiveDelay);
  }

  if (isMounted) {
    setSignals(prev => {
      const updated = [...prev];
      const updatedMap: { [symbol: string]: number } = { ...lastUpdatedMap };

      for (const result of results) {
        const index = updated.findIndex(r => r.symbol === result.symbol);
        if (index >= 0) updated[index] = result;
        else updated.push(result);
        updatedMap[result.symbol] = Date.now();
      }

      setLastUpdatedMap(updatedMap);
      return updated;
    });
  }
};

  // A self-scheduling loop deliberately replaces setInterval. setInterval can
  // start a second scan while the previous scan is still running, causing
  // accidental Binance 429 bursts.
  const runBatches = async () => {
    await fetchSymbols();

    while (isMounted) {
      await fetchBatch();

      if (!isMounted) break;

      const usageRatio = lastUsedWeight1m / RATE_LIMIT_WEIGHT;
      const cycleDelay =
        usageRatio >= 0.90 ? 5000 :
        usageRatio >= 0.80 ? 2500 :
        BETWEEN_CYCLE_DELAY_MS;

      if (isMounted) {
        setScannerStatus('waiting');
        setNextScanAt(Date.now() + cycleDelay);
      }
      await delay(cycleDelay);
    }
  };

  runBatches().catch((err) => {
    if (isMounted && err?.message !== 'Scanner stopped') {
      setScannerStatus('error');
      console.error('Scanner loop stopped:', err);
    }
  });

  return () => {
    // Stop the self-scheduling loop. Any in-flight request is allowed to
    // finish, but no new Binance request will be started after unmount.
    isMounted = false;
  };
}, [timeframe]); // ✅ triggers on timeframe change

  const handleTimeframeSwitch = (tf: string) => {
    setTimeframe(tf);
    setSignals([]); // Clear old data
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };	

    const SortableTh = ({ field, children, className = '' }: { field: string; children: any; className?: string }) => (
      <th
        onClick={() => toggleSort(field)}
        title={`Sort by ${typeof children === 'string' ? children : field}`}
        className={`px-1 py-0.5 bg-gray-800 text-center cursor-pointer select-none whitespace-nowrap border border-gray-700 hover:bg-gray-700 ${className}`}
      >
        {children} {sortField === field ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
      </th>
    );

    return (
	    
  <div className="min-h-screen bg-gray-900 text-white p-4 overflow-auto">
    <h2 className="text-2xl font-bold text-yellow-400 mb-4 tracking-wide">
  ⏱ Current Timeframe: <span className="text-white">{timeframe.toUpperCase()}</span>
</h2>

    <div className="mb-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={scannerStatus === 'error' ? 'text-red-400' : scannerStatus === 'rate-limited' ? 'text-yellow-400' : scannerStatus === 'scanning' ? 'text-green-400' : 'text-gray-300'}>
          {scannerStatus === 'starting' && '🟡 SCANNER INITIALIZING'}
          {scannerStatus === 'scanning' && '🟢 SCANNING IN BACKGROUND'}
          {scannerStatus === 'waiting' && '🔵 WAITING FOR NEXT BATCH'}
          {scannerStatus === 'rate-limited' && '🟠 BINANCE RATE-LIMIT BACKOFF'}
          {scannerStatus === 'error' && '🔴 SCANNER ERROR'}
        </span>
        <span className="text-gray-300">
          Progress: {scannerProgress.completed}/{scannerProgress.total || '—'}
        </span>
        {nextScanAt && scannerStatus === 'waiting' && (
          <span className="text-gray-300">
            Next batch: {new Date(nextScanAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        )}
      </div>
    </div>

    <div className="flex space-x-4 my-4">
    {timeframes.map((tf) => (
       <button
            key={tf}
            onClick={() => handleTimeframeSwitch(tf)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-md 
              ${timeframe === tf
                ? 'bg-yellow-400 text-black scale-105'
                : 'bg-gray-800 text-white hover:bg-gray-700'}`}
          >
            {tf.toUpperCase()}
          </button>
  ))}
</div>

<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-4">
  {/* 🟢 Filter Controls Section */}
  <div className="flex flex-col gap-4 text-sm">

    {/* 🔷 Trend Filters Section */}
<div>
  <p className="text-gray-400 mb-2 font-semibold">
    📊 Trend Filters — Tap to filter data based on trend-related patterns (e.g. breakouts, reversals):
  </p>
  <div className="flex flex-wrap gap-2">
    {[
      {
        label: 'Bullish Trend',
        key: 'bullishMainTrend',
        count: bullishMainTrendCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Trend',
        key: 'bearishMainTrend',
        count: bearishMainTrendCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish + Near Support',
        key: 'bullishNearSupport',
        count: bullishNearSupportCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish + Near Resistance',
        key: 'bearishNearResistance',
        count: bearishNearResistanceCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish + Breakup',
        key: 'bullishBreakup',
        count: bullishBreakupCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish + Breakdown',
        key: 'bearishBreakdown',
        count: bearishBreakdownCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish + Doji After Breakout',
        key: 'bullishDojiAfterBreakout',
        count: bullishDojiAfterBreakoutCount,
        color: 'text-purple-300',
      },
      {
        label: 'Bearish + Doji After Breakout',
        key: 'bearishDojiAfterBreakout',
        count: bearishDojiAfterBreakoutCount,
        color: 'text-purple-300',
      },
      {
        label: 'Bullish Reversal',
        key: 'bullishReversal',
        count: bullishReversalCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Reversal',
        key: 'bearishReversal',
        count: bearishReversalCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish Divergence',
        key: 'bullishDivergence',
        count: bullishDivergenceCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Divergence',
        key: 'bearishDivergence',
        count: bearishDivergenceCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish Spike',
        key: 'bullishSpike',
        count: bullishSpikeCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Collapse',
        key: 'bearishCollapse',
        count: bearishCollapseCount,
        color: 'text-red-300',
      },
      {
        label: 'Breakout Failure',
        key: 'breakoutFailure',
        count: breakoutFailureCount,
        color: 'text-yellow-300',
      },
      {
        label: 'Bullish Breakout',
        key: 'bullishBreakout',
        count: bullishBreakoutCount,
        color: 'text-yellow-400',
      },
      {
        label: 'Bearish Breakout',
        key: 'bearishBreakout',
        count: bearishBreakoutCount,
        color: 'text-yellow-400',
      },
      {
        label: 'Tested Prev High',
        key: 'testedPrevHigh',
        count: testedPrevHighCount,
        color: 'text-blue-300',
      },
      {
        label: 'Tested Prev Low',
        key: 'testedPrevLow',
        count: testedPrevLowCount,
        color: 'text-blue-300',
      },
	{
        label: 'Div from lev',
        key: 'divergenceFromLevel',
        count: divergenceFromLevelCount,
        color: 'text-blue-300',
      },
    ].map(({ label, key, count, color }) => (
      <button
        key={key}
        onClick={() => setTrendFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
        className={`px-3 py-1 rounded-full flex items-center gap-1 ${
          trendFilters.includes(key) ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'
        }`}
      >
        <span>{label}</span>
        <span className={`text-xs font-bold ${color}`}>{count}</span>
      </button>
    ))}
  </div>
</div>

    {/* ✅ Signal Filters Section */}
    <div>
      <p className="text-gray-400 mb-2 font-semibold">📈 Signal Filters — Tap to show signals based on technical zones or momentum shifts:</p>
      <div className="flex flex-wrap gap-2">
        {[
  {
    label: 'MAX ZONE PUMP',
    key: 'MAX ZONE PUMP',
    count: signalCounts.maxZonePump,
    color: 'text-yellow-300',
  },
  {
    label: 'MAX ZONE DUMP',
    key: 'MAX ZONE DUMP',
    count: signalCounts.maxZoneDump,
    color: 'text-yellow-400',
  },
  {
    label: 'BALANCE ZONE PUMP',
    key: 'BALANCE ZONE PUMP',
    count: signalCounts.balanceZonePump,
    color: 'text-purple-300',
  },
  {
    label: 'BALANCE ZONE DUMP',
    key: 'BALANCE ZONE DUMP',
    count: signalCounts.balanceZoneDump,
    color: 'text-purple-400',
  },
  {
    label: 'LOWEST ZONE PUMP',
    key: 'LOWEST ZONE PUMP',
    count: signalCounts.lowestZonePump,
    color: 'text-yellow-500',
  },
  {
    label: 'LOWEST ZONE DUMP',
    key: 'LOWEST ZONE DUMP',
    count: signalCounts.lowestZoneDump,
    color: 'text-yellow-600',
  },
	
        ].map(({ label, key, count, color }) => (
          <button
            key={key}
            onClick={() => setSignalFilter(signalFilter === key ? null : key)}
            className={`px-3 py-1 rounded-full flex items-center gap-1 ${
              signalFilter === key
                ? 'bg-green-500 text-black'
                : 'bg-gray-700 text-white'
            }`}
          >
            <span>{label}</span>
            <span className={`text-xs font-bold ${color}`}>{count}</span>
          </button>
        ))}
      </div>
    </div>

    {/* 🔎 Uniform Table Filters */}
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-900">
      <p className="text-gray-400 mb-2 font-semibold">🔎 Table Filters</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>RSI14</span>
          <select value={rsi14Filter} onChange={(e) => setRsi14Filter(e.target.value as typeof rsi14Filter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="above50">Above 50</option>
            <option value="below50">50 or below</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>Breakout Fail</span>
          <select value={breakoutFailFilter} onChange={(e) => setBreakoutFailFilter(e.target.value as typeof breakoutFailFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>Touched EMA200 (08:00–08:00)</span>
          <select value={touchedEMA200Filter} onChange={(e) => setTouchedEMA200Filter(e.target.value as typeof touchedEMA200Filter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>EMA70/200 Cross (08:00–08:00)</span>
          <select value={ema70200CrossFilter} onChange={(e) => setEma70200CrossFilter(e.target.value as typeof ema70200CrossFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="bullish">Bullish Cross</option>
            <option value="bearish">Bearish Cross</option>
            <option value="no">No Cross</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>Signal</span>
          <select value={tableSignalFilter} onChange={(e) => setTableSignalFilter(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="MAX ZONE PUMP">MAX ZONE PUMP</option>
            <option value="MAX ZONE DUMP">MAX ZONE DUMP</option>
            <option value="BALANCE ZONE PUMP">BALANCE ZONE PUMP</option>
            <option value="BALANCE ZONE DUMP">BALANCE ZONE DUMP</option>
            <option value="LOWEST ZONE PUMP">LOWEST ZONE PUMP</option>
            <option value="LOWEST ZONE DUMP">LOWEST ZONE DUMP</option>
            <option value="NO DATA">NO DATA</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>RSI Pump | Dump</span>
          <select value={rsiPumpDumpFilter} onChange={(e) => setRsiPumpDumpFilter(e.target.value as typeof rsiPumpDumpFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="pump">Pump</option>
            <option value="dump">Dump</option>
          </select>
        </label>
      </div>
    </div>

    {/* 🔴 Clear Button */}
    <div>
      <button
        onClick={() => {
          setSearch('');
          setTrendFilters([]);
          setSignalFilter(null);
          setTableSignalFilter('all');
          setRsi14Filter('all');
          setBreakoutFailFilter('all');
          setTouchedEMA200Filter('all');
          setEma70200CrossFilter('all');
          setRsiPumpDumpFilter('all');
          setShowOnlyFavorites(false);
        }}
        className="px-4 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600"
      >
        Clear All Filters
      </button>
    </div>
  </div>

{/* 📊 Summary Panel */}
<div className="sticky top-0 z-30 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-sm shadow-md">
  <div className="flex flex-col gap-3">

    {/* 📈 Trend Counts */}
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

	{/* 📍 EMA14 Inside Range */}
	<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">  
    <div className="flex items-center gap-1">
      <span className="flex flex-col leading-tight">
        <span className="text-sm">📍 EMA14 Inside</span>
        <span className="text-sm">EMA70–200:</span>
      </span>
      <span className="text-yellow-400 font-bold text-lg">{ema14InsideResultsCount}</span>
    </div>
</div>
		
    {/* 🔹 24h Price Change Summary */}
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
      <div className="text-white text-sm mb-2 font-semibold">🔹 24h Price Change Summary</div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-green-500 font-semibold">📈 Green: {greenPriceChangeCount}</span>
        <span className="text-red-500 font-semibold">📉 Red: {redPriceChangeCount}</span>     
      </div>
	</div>    

{/* 🔸 Volume Color Summary */}
<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
  <div className="text-white text-sm mb-2 font-semibold">🔸 Volume Color Summary</div>
  <div className="flex items-center gap-4 text-sm">
    <span className="text-green-400 font-semibold">🟢 Green Volume: {greenVolumeCount}</span>
    <span className="text-red-400 font-semibold">🔴 Red Volume: {redVolumeCount}</span>
  </div>
</div>
  </div>
</div>
</div>

<div className="flex flex-wrap gap-4 mb-4 items-center">
  {/* 🔸 Favorites Toggle */}
  <label className="flex items-center gap-2 text-sm text-white">
    <input
      type="checkbox"
      checked={showOnlyFavorites}
      onChange={() => setShowOnlyFavorites(prev => !prev)}
      className="accent-yellow-400"
    />
    Show only favorites
  </label>

  {/* 🔸 Search Input */}
  <div className="relative">
    <input
      type="text"
      placeholder="Search symbol..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="p-2 pr-20 rounded bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
    />
    
    {/* 🔸 Clear Button (only shows if there's input) */}
    {search && (
      <button
        onClick={() => setSearch('')}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-xs px-2 py-1 bg-red-500 hover:bg-red-600 rounded text-white"
      >
        Clear
      </button>
    )}
  </div>
</div>	
	  

<div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
  <table className="w-full text-[11px] border-collapse">
    <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
      <tr>
        <SortableTh field="symbol" className="sticky left-0 z-30 text-left">Symbol</SortableTh>
        <SortableTh field="currentPrice">Current Price</SortableTh>
        <SortableTh field="priceChangePercent">24h Change (%)</SortableTh>
		<SortableTh field="prevClose">Prev Close</SortableTh>
		<SortableTh field="bearishDivergence">Bearish Divergence</SortableTh>
        <SortableTh field="bullishDivergence">Bullish Divergence</SortableTh>
        <SortableTh field="pumpDump">RSI Pump | Dump</SortableTh>
        <SortableTh field="latestRSI">RSI14</SortableTh>
        <SortableTh field="breakoutFailure">Breakout Fail</SortableTh>
        <SortableTh field="touchedEMA200Today">Touched EMA200 (08:00–08:00)</SortableTh>
        <SortableTh field="ema70200Cross">Latest EMA70/200 Cross (08:00–08:00)</SortableTh>
        <SortableTh field="signal">Signal</SortableTh>
        <SortableTh field="drop">Drop 🚨</SortableTh>
        <SortableTh field="recovery">Recovery 🟢</SortableTh>
        <SortableTh field="bullishBreakout">Bull BO</SortableTh>
        <SortableTh field="bearishBreakout">Bear BO</SortableTh>
        <SortableTh field="mainTrend">Trend (200)</SortableTh>
        <SortableTh field="bearishCollapse">Collapse</SortableTh>
        <SortableTh field="bullishSpike">Spike</SortableTh>
        <SortableTh field="bearishReversal">Bear Rev</SortableTh>
        <SortableTh field="bullishReversal">Bull Rev</SortableTh>
        <SortableTh field="divergenceFromLevel">Div From Lev</SortableTh>
        <SortableTh field="highestVolumeColorPrev">Volume</SortableTh>
        <SortableTh field="bullishVolumeDivergence">Volume Divergence</SortableTh>
        <SortableTh field="isVolumeSpike">Volume Spike</SortableTh>
        <SortableTh field="ema14InsideResults">EMA14 Inside EMA70–200</SortableTh>
        <SortableTh field="gap">Ema14&70 Gap %</SortableTh>
        <SortableTh field="gap1">Ema70&200 Gap %</SortableTh>
        <SortableTh field="gapFromLowToEMA200">Low→EMA200 (%)</SortableTh>
        <SortableTh field="gapFromHighToEMA200">High→EMA200 (%)</SortableTh>
        <SortableTh field="ema200Bounce">EMA200 Bounce</SortableTh>
        <SortableTh field="ema14Bounce">EMA14 Bounce</SortableTh>
        <SortableTh field="ema70Bounce">EMA70 Bounce</SortableTh>
        <SortableTh field="hasBullishEngulfing">Bullish Engulfing</SortableTh>
        <SortableTh field="hasBearishEngulfing">Bearish Engulfing</SortableTh>
        <SortableTh field="testedPrevHigh">Tested High</SortableTh>
        <SortableTh field="testedPrevLow">Tested Low</SortableTh>
        <SortableTh field="topPattern">Top Pattern</SortableTh>
        <SortableTh field="bottomPattern">Bottom Pattern</SortableTh>
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
const validPump = pump !== undefined && pump !== 0;
const validDump = dump !== undefined && dump !== 0;

// ✅ Early return: skip rendering if both are invalid or 0
if (!validPump && !validDump && tableSignalFilter !== 'NO DATA') return null;

const pumpInRange_21_26 = inRange(pump, 21, 26);
const dumpInRange_21_26 = inRange(dump, 21, 26);
const pumpAbove30 = isAbove30(pump);
const dumpAbove30 = isAbove30(dump);

const pumpInRange_1_10 = inRange(pump, 1, 10);
const dumpInRange_1_10 = inRange(dump, 1, 10);

const pumpInRange_17_19 = inRange(pump, 17, 19);
const dumpInRange_17_19 = inRange(dump, 17, 19);

let signal = '';

// ✅ MAX ZONE
if (direction === 'pump' && pumpAbove30) {
  signal = 'MAX ZONE PUMP';
} else if (direction === 'dump' && dumpAbove30) {
  signal = 'MAX ZONE DUMP';
}

// ✅ BALANCE ZONE
else if (direction === 'pump' && pumpInRange_21_26) {
  signal = 'BALANCE ZONE PUMP';
} else if (direction === 'dump' && dumpInRange_21_26) {
  signal = 'BALANCE ZONE DUMP';
}

// ✅ LOWEST ZONE
else if (direction === 'pump' && pumpInRange_1_10) {
  signal = 'LOWEST ZONE PUMP';
} else if (direction === 'dump' && dumpInRange_1_10) {
  signal = 'LOWEST ZONE DUMP';
}

	

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
        onClick={() => {
          setFavorites((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.has(s.symbol) ? newSet.delete(s.symbol) : newSet.add(s.symbol);
            return newSet;
          });
        }}
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

			   <td
  className={`px-1 py-0.5 text-center font-semibold ${
    s.prevClosedGreen ? 'text-green-400' : s.prevClosedRed ? 'text-red-400' : 'text-gray-500'
  }`}
>
  {s.prevClosedGreen ? 'Green' : s.prevClosedRed ? 'Red' : 'N/A'}
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

			     <td className="px-1 py-0.5 text-center text-red-400 font-semibold">
    {s.breakoutFailure ? 'Yes' : '-'}
  </td>

			   {/* Touched EMA200 */}
  <td className={`p-2 ${s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
    {s.touchedEMA200Today ? 'Yes' : 'No'}
  </td>	  

  {/* Latest EMA70/EMA200 cross in the current 08:00–08:00 PH session */}
  <td className={`px-2 py-1 text-center font-semibold ${
    s.ema70200Cross?.direction === 'bullish'
      ? 'text-green-400'
      : s.ema70200Cross?.direction === 'bearish'
      ? 'text-red-400'
      : 'text-gray-500'
  }`}>
    {s.ema70200Cross?.direction === 'bullish'
      ? `🟢 Bullish — ${new Date(s.ema70200Cross.timestamp).toLocaleString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : s.ema70200Cross?.direction === 'bearish'
      ? `🔴 Bearish — ${new Date(s.ema70200Cross.timestamp).toLocaleString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : 'No'}
  </td>

			   <td
  className={`px-1 py-0.5 min-w-[40px] text-center font-semibold ${
    signal.trim() === 'MAX ZONE PUMP'
      ? 'text-yellow-300'
      : signal.trim() === 'MAX ZONE DUMP'
      ? 'text-yellow-400'
      : signal.trim() === 'BALANCE ZONE PUMP'
      ? 'text-purple-300 font-bold'
      : signal.trim() === 'BALANCE ZONE DUMP'
      ? 'text-purple-400 font-bold'
      : signal.trim() === 'LOWEST ZONE PUMP'
      ? 'text-green-400 font-bold'
      : signal.trim() === 'LOWEST ZONE DUMP'
      ? 'text-green-500 font-bold'
      : 'text-gray-500'
  }`}
>
  {signal.trim()}
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
                    className={`p-2 ${
                      s.divergenceFromLevel
                        ? 'bg-indigo-700 text-white'
                        : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    {s.divergenceFromLevel ? 'Yes' : 'No'}
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
		   

{/* EMA Bounces */}
  <td className={`p-2 ${s.ema14Bounce ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema14Bounce ? 'Yes' : 'No'}
  </td>

  <td className={`p-2 ${s.ema70Bounce ? 'text-pink-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema70Bounce ? 'Yes' : 'No'}
  </td>	   
		   		   
<td className="p-2 text-center text-green-400 font-semibold">
  {s.mainTrend === 'bearish' && s.hasBullishEngulfing ? 'Yes' : '-'}
</td>
<td className="p-2 text-center text-red-400 font-semibold">
  {s.mainTrend === 'bullish' && s.hasBearishEngulfing ? 'Yes' : '-'}
</td>		   	   
		   	
		   
  {/* Support/Breakout Detection */}
  <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
    {s.testedPrevHigh ? 'Yes' : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
    {s.testedPrevLow ? 'Yes' : '-'}
  </td>


  <td className="px-1 py-0.5 text-center text-yellow-400 font-semibold">
    {s.mainTrend === 'bullish'
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
    {s.mainTrend === 'bearish'
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

            
    </div>                    
  );
}
  
