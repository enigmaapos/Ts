// All your existing calculateEMA, getCurrentEMAGapPercentage, isEMA14InsideRange,
// calculateRSI, getRecentRSIDiff, detectBearishDivergence, detectBullishDivergence,
// detectBearishVolumeDivergence, detectBullishVolumeDivergence, isAscendingRSI,
// isDescendingRSI, isAscendingLowOnEMA14Touch, isDescendingHighOnEMA14Touch,
// touchedEMA14 functions go here.

// For brevity, I'm just putting a placeholder, but imagine all your pure functions are here.

export function calculateEMA(data: number[], period: number) {
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

export function getCurrentEMAGapPercentage(data: number[], periodShort: number, periodLong: number): number | null {
  const emaShort = calculateEMA(data, periodShort);
  const emaLong = calculateEMA(data, periodLong);

  const lastShort = emaShort[emaShort.length - 1];
  const lastLong = emaLong[emaLong.length - 1];

  if (isNaN(lastShort) || isNaN(lastLong)) return null;

  const gapPercentage = ((lastShort - lastLong) / lastLong) * 100;
  return gapPercentage;
}

export function isEMA14InsideRange(ema14Arr: number[], ema70Arr: number[], ema200Arr: number[], lookback: number = 5) {
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

export function calculateRSI(closes: number[], period = 3): number[] {
  if (!Array.isArray(closes) || closes.length <= period) return [];

  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  for (let i = 0; i < period; i++) {
    rsi[i] = NaN;
  }

  return rsi;
}

export type TrendResult = {
  trend: 'bullish' | 'bearish';
  type: 'support' | 'resistance';
  crossoverPrice: number;
  breakout: boolean | null;
  isNear?: boolean;
  isDojiAfterBreakout?: boolean;
};

function isNearLevel(currentPrice: number, levelPrice: number, tolerancePercent = 0.5): boolean {
  const tolerance = (tolerancePercent / 100) * levelPrice;
  return Math.abs(currentPrice - levelPrice) <= tolerance;
}

export function getMainTrend(
  ema70: number[],
  ema200: number[],
  closes: number[],
  opens: number[],
  highs: number[],
  lows: number[],
  tolerancePercent = 0.5,
  dojiToleranceRatio = 0.1
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

export function getRecentRSIDiff(rsi: number[], lookback = 14) {
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

export function getSignal(s: any): string {
  const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
  if (!pumpDump) return 'NO DATA';

  const direction = pumpDump.direction;
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

  // const pumpOrDumpInRange_17_19 = inRange(pump, 17, 19) || inRange(dump, 17, 19);

  // MAX ZONE - Separate pump/dump
  if (direction === 'pump' && pumpAbove30) return 'MAX ZONE PUMP';
  if (direction === 'dump' && dumpAbove30) return 'MAX ZONE DUMP';

  // BALANCE ZONE - Separate pump/dump
  if (pumpInRange_21_26 && direction === 'pump') return 'BALANCE ZONE PUMP';
  if (dumpInRange_21_26 && direction === 'dump') return 'BALANCE ZONE DUMP';

  // LOWEST ZONE - Separate pump/dump
  if (pumpInRange_1_10 && direction === 'pump') return 'LOWEST ZONE PUMP';
  if (dumpInRange_1_10 && direction === 'dump') return 'LOWEST ZONE DUMP';

  return 'NO STRONG SIGNAL';
};

export function detectBearishDivergence(prevHigh: number, currHigh: number, prevRSI: number, currRSI: number) {
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

export function detectBullishDivergence(prevLow: number, currLow: number, prevRSI: number, currRSI: number) {
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

export function detectBearishVolumeDivergence(prevHigh: number, currHigh: number, volumePrev: number, volumeCurr: number) {
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

export function detectBullishVolumeDivergence(prevLow: number, currLow: number, volumePrev: number, volumeCurr: number) {
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

export function get24hChangePercent(currentPrice: number, price24hAgo: number): number {
  if (currentPrice === 0) return 0;
  const change = ((currentPrice - price24hAgo) / currentPrice) * 100;
  return parseFloat(change.toFixed(2));
}

export function didDropFromPeak(
  peakPercent: number,
  currentPercent: number,
  dropThreshold: number = 5
): boolean {
  const drop = peakPercent - currentPercent;
  return drop >= dropThreshold;
}

export function didRecoverFromLow(
  lowPercent: number,
  currentPercent: number,
  recoveryThreshold: number = 5
): boolean {
  const recovery = currentPercent - lowPercent;
  return currentPercent > lowPercent && recovery >= recoveryThreshold;
}

export const getSessions = (timeframe?: Timeframe) => {
  const now = new Date();

  if (!timeframe || timeframe === '1d') {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();

    const getUTCMillis = (y: number, m: number, d: number, hPH: number, min: number) =>
      Date.UTC(y, m, d, hPH - 8, min);

    const today8AM_UTC = getUTCMillis(year, month, date, 8, 0);
    const tomorrow745AM_UTC = getUTCMillis(year, month, date + 1, 7, 45);

    let sessionStart: number, sessionEnd: number;
    if (now.getTime() >= today8AM_UTC) {
      sessionStart = today8AM_UTC;
      sessionEnd = tomorrow745AM_UTC;
    } else {
      const yesterday8AM_UTC = getUTCMillis(year, month, date - 1, 8, 0);
      const today745AM_UTC = getUTCMillis(year, month, date, 7, 45);
      sessionStart = yesterday8AM_UTC;
      sessionEnd = today745AM_UTC;
    }

    const prevSessionStart = getUTCMillis(year, month, date - 1, 8, 0);
    const prevSessionEnd = getUTCMillis(year, month, date, 7, 45);

    return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
  } else {
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

export const getLastNSessionStartTimes = (n: number): number[] => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const getUTCMillis = (y: number, m: number, d: number, hour: number, minute: number) => {
    return Date.UTC(y, month, d, hour, minute);
  };

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

export const getRecentSessionHighs = (
  ohlcvData: { timestamp: number; high: number }[],
  sessionStartTimes: number[]
): number[] => {
  return sessionStartTimes.map((start, i) => {
    const end = i < sessionStartTimes.length - 1 ? sessionStartTimes[i + 1] : Infinity;
    const candles = ohlcvData.filter(c => c.timestamp >= start && c.timestamp < end);
    return candles.length ? Math.max(...candles.map(c => c.high)) : 0;
  });
};

export const getRecentSessionLows = (
  ohlcvData: { timestamp: number; low: number }[],
  sessionStartTimes: number[]
): number[] => {
  return sessionStartTimes.map((start, i) => {
    const end = i < sessionStartTimes.length - 1 ? sessionStartTimes[i + 1] : Infinity;
    const candles = ohlcvData.filter(c => c.timestamp >= start && c.timestamp < end);
    return candles.length ? Math.min(...candles.map(c => c.low)) : Infinity;
  });
};

export const detectTopPatterns = (highs: number[]) => {
  const recentTop = highs.at(-1);
  const previousTops = highs.slice(0, -1).filter(h => h > 0);

  if (!recentTop || recentTop === 0 || previousTops.length === 0) {
    return { isDoubleTop: false, isDescendingTop: false, isDoubleTopFailure: false };
  }

  const lastTop = previousTops.at(-1);
  const tolerance = 0.01;

  const isDoubleTop =
    Math.abs(recentTop - lastTop!) / lastTop! < tolerance &&
    recentTop < Math.max(...previousTops);

  const isDescendingTop = previousTops
    .slice(-3)
    .every((h, i, arr) => i === 0 || h < arr[i - 1]);

  const isDoubleTopFailure = recentTop > Math.max(...previousTops);

  return { isDoubleTop, isDescendingTop, isDoubleTopFailure };
};

export const detectBottomPatterns = (lows: number[]) => {
  const recentLow = lows.at(-1);
  const previousLows = lows.slice(0, -1).filter(l => l < Infinity);

  if (!recentLow || recentLow === Infinity || previousLows.length === 0) {
    return { isDoubleBottom: false, isAscendingBottom: false, isDoubleBottomFailure: false };
  }

  const lastLow = previousLows.at(-1);
  const tolerance = 0.01;

  const isDoubleBottom =
    Math.abs(recentLow - lastLow!) / lastLow! < tolerance &&
    recentLow > Math.min(...previousLows);

  const isAscendingBottom = previousLows
    .slice(-3)
    .every((l, i, arr) => i === 0 || l > arr[i - 1]);

  const isDoubleBottomFailure = recentLow < Math.min(...previousLows);

  return { isDoubleBottom, isAscendingBottom, isDoubleBottomFailure };
};

export type BearishSignalInfo = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

export const detectBullishToBearish = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  opens: number[]
): BearishSignalInfo => {
  const len = closes.length;
  if (len < 10) return null;

  const i = len - 1;
  const close = closes[i];
  const ema70Value = ema70[i];
  const ema200Value = ema200[i];

  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
  const isBullishTrend = trendResult.trend === 'bullish';
  if (!isBullishTrend) return null;

  if (isAscendingRSI(rsi14, 3)) return null;

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

export type BullishSignalInfo = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

export const detectBearishToBullish = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  opens: number[]
): BullishSignalInfo => {
  const len = closes.length;
  if (len < 10) return null;

  const i = len - 1;
  const close = closes[i];
  const ema70Value = ema70[i];
  const ema200Value = ema200[i];

  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
  const isBearishTrend = trendResult.trend === 'bearish';
  if (!isBearishTrend) return null;

  if (isDescendingRSI(rsi14.slice(0, i + 1), 3)) return null;

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

export const touchedEMA14 = (price: number, ema14: number, margin = 0.0015): boolean => {
  return Math.abs(price - ema14) / ema14 <= margin;
};

export const isAscendingLowOnEMA14Touch = (lows: number[], ema14: number[]): boolean => {
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

export type BullishSpikeSignal = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

export const detectBullishSpike = (
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

  if (bearishBreakout) return null;

  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
  const isBullishTrend = trendResult.trend === 'bullish';
  if (!isBullishTrend) return null;

  let crossoverIndex70 = -1;
  for (let j = len - 4; j >= 1; j--) {
    if (ema14[j] <= ema70[j] && ema14[j + 1] > ema70[j + 1]) {
      crossoverIndex70 = j + 1;
      break;
    }
  }
  if (crossoverIndex70 === -1) return null;

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

  let lowestLowAfterCrossover = crossoverLow;
  for (let k = crossoverIndex + 1; k < len; k++) {
    if (lows[k] < lowestLowAfterCrossover) {
      lowestLowAfterCrossover = lows[k];
    }
  }

  const touchedEMA70 = currentLow <= ema70Value && currentHigh >= ema70Value;
  if (touchedEMA70) return null;

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

  const entry = close * 1.001;
  const stopLoss = lowestLowAfterCrossover;

  if (stopLoss <= entry) return null;

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

export const isDescendingHighOnEMA14Touch = (highs: number[], ema14: number[]): boolean => {
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

export type BearishCollapseSignal = {
  signal: true;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
} | null;

export const detectBearishCollapse = (
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

  if (bullishBreakout) return null;

  const trendResult = getMainTrend(ema70, ema200, closes, opens, highs, lows);
  const isBearishTrend = trendResult.trend === 'bearish';
  if (!isBearishTrend) return null;

  let crossoverIndex70 = -1;
  for (let j = len - 4; j >= 1; j--) {
    if (ema14[j] >= ema70[j] && ema14[j + 1] < ema70[j + 1]) {
      crossoverIndex70 = j + 1;
      break;
    }
  }
  if (crossoverIndex70 === -1) return null;

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

  let highestHighAfterCrossover = crossoverHigh;
  for (let k = crossoverIndex + 1; k < len; k++) {
    if (highs[k] > highestHighAfterCrossover) {
      highestHighAfterCrossover = highs[k];
    }
  }

  const touchedEMA70 = currentLow <= ema70Value && currentHigh >= ema70Value;
  if (touchedEMA70) return null;

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

  const entry = close * 0.999;
  const stopLoss = highestHighAfterCrossover;

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
};

export const isAscendingRSI = (rsi: number[], window = 3): boolean => {
  const len = rsi.length;
  if (len < window) return false;

  for (let i = len - window; i < len - 1; i++) {
    if (isNaN(rsi[i]) || isNaN(rsi[i + 1]) || rsi[i] >= rsi[i + 1]) {
      return false;
    }
  }
  return true;
};

export const isDescendingRSI = (rsi: number[], window = 3): boolean => {
  const len = rsi.length;
  if (len < window) return false;

  for (let i = len - window; i < len - 1; i++) {
    if (isNaN(rsi[i]) || isNaN(rsi[i + 1]) || rsi[i] <= rsi[i + 1]) {
      return false;
    }
  }
  return true;
};

export const getTestThreshold = (price: number): number => {
  if (price > 10000) return price * 0.00005;
  if (price > 1000) return price * 0.0001;
  if (price > 1) return price * 0.001;
  return price * 0.01;
};

export type CandleData = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number; // Optional based on where it's calculated
  volumeColor?: 'green' | 'red' | 'neutral';
};

export type Timeframe = '15m' | '4h' | '1d';
