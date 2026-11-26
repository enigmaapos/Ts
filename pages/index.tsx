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


/**
 * Detects a confirmed 3-point bearish divergence on DAILY candles.
 *
 * Detection order is intentional:
 * 1) Find THREE confirmed descending RSI(14) swing-high points first.
 * 2) At those exact RSI points, require the corresponding candles to be
 *    GREEN, have ascending highs, and each selected candle to break the
 *    immediately preceding candle high.
 * 3) All three selected candle closes must be above EMA14.
 * 4) Only the previous 20 COMPLETED 1D candles are eligible.
 *
 * RSI itself must make three confirmed lower highs. It is NOT enough for
 * RSI to merely be numerically lower at three arbitrary price pivots.
 * The RSI swing-high candles are the anchors; price is evaluated only at
 * those exact timestamps.
 */
function detectThreePointBearishRSIDivergence(
  candles: Array<{ timestamp: number; open: number; high: number; close: number }>,
  rsi14: number[],
  ema14: number[],
  windowSize = 20,
  pivotLeft = 2,
  pivotRight = 2
) {
  const valid =
    Array.isArray(candles) &&
    Array.isArray(rsi14) &&
    Array.isArray(ema14) &&
    candles.length === rsi14.length &&
    candles.length === ema14.length;

  if (!valid || candles.length < 3) {
    return {
      divergence: false,
      status: 'NO DATA' as const,
      pivots: [] as any[],
      priceAscending: false,
      rsiDescending: false,
      ema14Confirmed: false,
      breakoutConfirmed: false,
      greenCandlesConfirmed: false,
      windowSize,
      message: 'Not enough completed 1D candles'
    };
  }

  // Hard boundary: ONLY the latest 20 completed daily candles.
  const windowStart = Math.max(0, candles.length - windowSize);
  const recentCandles = candles.slice(windowStart);
  const recentRsi14 = rsi14.slice(windowStart);
  const recentEma14 = ema14.slice(windowStart);

  if (recentCandles.length < pivotLeft + pivotRight + 3) {
    return {
      divergence: false,
      status: 'NO DATA' as const,
      pivots: [] as any[],
      priceAscending: false,
      rsiDescending: false,
      ema14Confirmed: false,
      breakoutConfirmed: false,
      greenCandlesConfirmed: false,
      windowSize,
      message: `Need at least ${pivotLeft + pivotRight + 3} completed candles inside the ${windowSize}-candle window`
    };
  }

  type Point = {
    index: number;
    absoluteIndex: number;
    timestamp: number;
    rsi: number;
    priceHigh: number;
    open: number;
    close: number;
    ema14: number;
    greenCandle: boolean;
    aboveEma14: boolean;
    breaksPreviousCandleHigh: boolean;
  };

  const rsiHighs: Point[] = [];

  // STEP 1: RSI(14) swing highs are the PRIMARY anchors.
  for (let i = pivotLeft; i < recentCandles.length - pivotRight; i++) {
    const rsi = recentRsi14[i];
    const candle = recentCandles[i];
    const ema = recentEma14[i];

    if (!Number.isFinite(rsi) || !Number.isFinite(candle.high) ||
        !Number.isFinite(candle.close) || !Number.isFinite(ema)) continue;

    let isRsiSwingHigh = true;
    for (let j = i - pivotLeft; j <= i + pivotRight; j++) {
      if (j === i) continue;
      const neighbourRsi = recentRsi14[j];
      if (!Number.isFinite(neighbourRsi) || neighbourRsi >= rsi) {
        isRsiSwingHigh = false;
        break;
      }
    }

    if (isRsiSwingHigh) {
      const previousCandle = recentCandles[i - 1];
      rsiHighs.push({
        index: i,
        absoluteIndex: windowStart + i,
        timestamp: candle.timestamp,
        rsi,
        priceHigh: candle.high,
        open: candle.open,
        close: candle.close,
        ema14: ema,
        aboveEma14: candle.close > ema,
        greenCandle: candle.close > candle.open,
        breaksPreviousCandleHigh:
          !!previousCandle && Number.isFinite(previousCandle.high) &&
          candle.high > previousCandle.high
      });
    }
  }

  if (rsiHighs.length < 3) {
    return {
      divergence: false,
      status: 'NO' as const,
      pivots: rsiHighs.slice(-3),
      priceAscending: false,
      rsiDescending: false,
      ema14Confirmed: false,
      breakoutConfirmed: false,
      greenCandlesConfirmed: false,
      windowSize,
      message: `Fewer than 3 confirmed descending RSI(14) swing-high candidates inside the previous ${windowSize} completed candles`
    };
  }

  // STEP 2: Find three RSI lower highs first, then validate price structure.
  let matched: Point[] | null = null;

  for (let i = 0; i < rsiHighs.length - 2; i++) {
    for (let j = i + 1; j < rsiHighs.length - 1; j++) {
      for (let k = j + 1; k < rsiHighs.length; k++) {
        const p1 = rsiHighs[i];
        const p2 = rsiHighs[j];
        const p3 = rsiHighs[k];

        // RSI must make three descending confirmed swing highs.
        const rsiDescending = p1.rsi > p2.rsi && p2.rsi > p3.rsi;

        if (!rsiDescending) continue;

        // The corresponding candle highs must make three ascending highs.
        const priceAscending =
          p1.priceHigh < p2.priceHigh &&
          p2.priceHigh < p3.priceHigh;

        // Every selected candle must actually break the immediately
        // preceding candle's high, not merely be higher than the prior pivot.
        const breakoutConfirmed =
          p1.breaksPreviousCandleHigh &&
          p2.breaksPreviousCandleHigh &&
          p3.breaksPreviousCandleHigh;

        const ema14Confirmed =
          p1.aboveEma14 && p2.aboveEma14 && p3.aboveEma14;

        // The three RSI anchor candles must be GREEN candles.
        const greenCandlesConfirmed =
          p1.greenCandle && p2.greenCandle && p3.greenCandle;

        if (priceAscending && breakoutConfirmed && ema14Confirmed && greenCandlesConfirmed) {
          matched = [p1, p2, p3];
        }
      }
    }
  }

  if (matched) {
    return {
      divergence: true,
      status: 'CONFIRMED' as const,
      pivots: matched,
      priceAscending: true,
      rsiDescending: true,
      ema14Confirmed: true,
      breakoutConfirmed: true,
      greenCandlesConfirmed: true,
      windowSize,
      message:
        `CONFIRMED: 3 descending RSI(14) swing highs first; corresponding candle highs ascend and each breaks its previous candle high; all 3 closes above EMA14; previous ${windowSize} completed 1D candles only`
    };
  }

  // Diagnostics only — never create a signal.
  let hasRsiTriple = false;
  let hasPriceTriple = false;
  let hasBreakoutTriple = false;
  let hasEmaTriple = false;
  let hasGreenTriple = false;

  for (let i = 0; i < rsiHighs.length - 2; i++) {
    for (let j = i + 1; j < rsiHighs.length - 1; j++) {
      for (let k = j + 1; k < rsiHighs.length; k++) {
        const p1 = rsiHighs[i], p2 = rsiHighs[j], p3 = rsiHighs[k];
        const rsiDescending = p1.rsi > p2.rsi && p2.rsi > p3.rsi;
        if (!rsiDescending) continue;
        hasRsiTriple = true;

        const priceAscending = p1.priceHigh < p2.priceHigh && p2.priceHigh < p3.priceHigh;
        const breakout = p1.breaksPreviousCandleHigh && p2.breaksPreviousCandleHigh && p3.breaksPreviousCandleHigh;
        const ema = p1.aboveEma14 && p2.aboveEma14 && p3.aboveEma14;
        const green = p1.greenCandle && p2.greenCandle && p3.greenCandle;

        if (priceAscending) hasPriceTriple = true;
        if (priceAscending && breakout) hasBreakoutTriple = true;
        if (priceAscending && breakout && ema) hasEmaTriple = true;
        if (priceAscending && breakout && ema && green) hasGreenTriple = true;
      }
    }
  }

  let message = `No complete 3-point bearish divergence inside the previous ${windowSize} completed 1D candles`;
  if (hasGreenTriple) {
    message = 'RSI lower-high sequence, ascending breakout highs, EMA14 and green anchor candles matched, but another complete condition was not simultaneously satisfied';
  } else if (hasEmaTriple) {
    message = 'RSI lower-high sequence and price structure matched, but at least one selected candle was not green or another complete condition was not satisfied';
  } else if (hasBreakoutTriple) {
    message = '3 descending RSI(14) swing highs found with ascending price highs and candle breakouts, but at least one selected candle closed at/below EMA14';
  } else if (hasPriceTriple) {
    message = '3 descending RSI(14) swing highs found, but the corresponding candle highs did not all break upward in ascending order';
  } else if (hasRsiTriple) {
    message = '3 descending RSI(14) swing highs found, but the corresponding candle highs do not form the required ascending breakout sequence';
  }

  return {
    divergence: false,
    status: 'NO' as const,
    pivots: rsiHighs.slice(-3),
    priceAscending: hasPriceTriple,
    rsiDescending: hasRsiTriple,
    ema14Confirmed: hasEmaTriple,
    breakoutConfirmed: hasBreakoutTriple,
    windowSize,
    message
  };
}

type TrendResult = {
  trend: 'bullish' | 'bearish';
  type: 'support' | 'resistance';
  crossoverPrice: number;
  breakout: boolean | null;
  levelSource: 'crossover' | 'fallback';
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
        levelSource: 'crossover',
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
        levelSource: 'crossover',
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
    levelSource: 'fallback',
    breakout: null,
    isNear: true,
    isDojiAfterBreakout: false
  };
}

function getRecentRSIDiff(rsi: number[], lookback = 14) {
  if (rsi.length < lookback) return null;

  const windowStartIndex = rsi.length - lookback;
  const recentRSI = rsi.slice(-lookback);
  let recentHigh = -Infinity;
  let recentLow = Infinity;
  let highIndex = -1;
  let lowIndex = -1;

  for (let i = 0; i < recentRSI.length; i++) {
    const value = recentRSI[i];
    if (!Number.isFinite(value)) continue;

    if (value > recentHigh) {
      recentHigh = value;
      highIndex = windowStartIndex + i;
    }
    if (value < recentLow) {
      recentLow = value;
      lowIndex = windowStartIndex + i;
    }
  }

  if (highIndex === -1 || lowIndex === -1) return null;

  const pumpStrength = recentHigh - recentLow;
  const dumpStrength = Math.abs(recentLow - recentHigh);

  const startRSI = recentRSI[0];
  const endRSI = recentRSI[recentRSI.length - 1];
  const direction =
    !Number.isFinite(startRSI) || !Number.isFinite(endRSI)
      ? 'neutral'
      : endRSI > startRSI ? 'pump' : endRSI < startRSI ? 'dump' : 'neutral';
  const strength = Number.isFinite(startRSI) && Number.isFinite(endRSI)
    ? Math.abs(endRSI - startRSI)
    : 0;

  return {
    recentHigh,
    recentLow,
    highIndex,
    lowIndex,
    startRSI,
    endRSI,
    windowStartIndex,
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

  const pumpInRange_27_29 = inRange(pump, 27, 29);
  const dumpInRange_27_29 = inRange(dump, 27, 29);
  const pumpInRange_21_26 = inRange(pump, 21, 26);
  const dumpInRange_21_26 = inRange(dump, 21, 26);
  const pumpInRange_11_20 = inRange(pump, 11, 20);
  const dumpInRange_11_20 = inRange(dump, 11, 20);

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
  
  // ✅ UPPER-MIDDLE ZONE - Separate pump/dump
  if (pumpInRange_27_29 && direction === 'pump') return 'UPPER-MIDDLE ZONE PUMP';
  if (dumpInRange_27_29 && direction === 'dump') return 'UPPER-MIDDLE ZONE DUMP';

  // ✅ BALANCE ZONE - Separate pump/dump
  if (pumpInRange_21_26 && direction === 'pump') return 'BALANCE ZONE PUMP';
  if (dumpInRange_21_26 && direction === 'dump') return 'BALANCE ZONE DUMP';

  // ✅ LOWER-MIDDLE ZONE - Separate pump/dump
  if (pumpInRange_11_20 && direction === 'pump') return 'LOWER-MIDDLE ZONE PUMP';
  if (dumpInRange_11_20 && direction === 'dump') return 'LOWER-MIDDLE ZONE DUMP';

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
): { level: number | null; type: 'support' | 'resistance' | null; crossoverPrice: number | null } {
  for (let i = ema14.length - 2; i >= 1; i--) {
    const prev14 = ema14[i - 1];
    const prev70 = ema70[i - 1];
    const curr14 = ema14[i];
    const curr70 = ema70[i];

    if (trend === 'bullish' && prev14 < prev70 && curr14 > curr70) {
      return { level: closes[i], type: 'support', crossoverPrice: closes[i] };
    }

    if (trend === 'bearish' && prev14 > prev70 && curr14 < curr70) {
      return { level: closes[i], type: 'resistance', crossoverPrice: closes[i] };
    }
  }

  const level = trend === 'bullish' ? Math.max(...highs) : Math.min(...lows);
  const type = trend === 'bullish' ? 'resistance' : 'support';
  return { level, type, crossoverPrice: null };
       }


const blacklist = [
];


export default function Home() {
const [signals, setSignals] = useState<any[]>([]);
  const analyzedSymbolSet = useMemo(() => new Set(signals.map((s: any) => s.symbol)), [signals]);
  // Latest all-symbol Binance USDⓈ-M funding-rate snapshot.
  const [fundingRates, setFundingRates] = useState<Record<string, number>>({});
  // Complete Binance Futures symbol universe currently eligible for scanning.
  // This is intentionally separate from `signals`: a symbol can be active on
  // Binance before its technical analysis batch has completed.
  const [activeFuturesSymbols, setActiveFuturesSymbols] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});
  const [loading, setLoading] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'starting' | 'scanning' | 'waiting' | 'rate-limited' | 'error'> ('starting');
  const [scannerProgress, setScannerProgress] = useState({ completed: 0, total: 0 });
  const [nextScanAt, setNextScanAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const favoriteCounts = useMemo(() => ({
    favorites: signals.filter((s: any) => favorites.has(s.symbol)).length,
    notFavorites: signals.filter((s: any) => !favorites.has(s.symbol)).length
  }), [signals, favorites]);
const [coinListView, setCoinListView] = useState<'not-favorites' | 'favorites' | 'all'>('not-favorites');
  const [sortField, setSortField] = useState<string>('symbol');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
const [tablePage, setTablePage] = useState(0);
const TABLE_PAGE_SIZE = 40;
const [trendFilters, setTrendFilters] = useState<string[]>([]);
  const [signalFilter, setSignalFilter] = useState<string | null>(null);
	  const [timeframe, setTimeframe] = useState('15m');
  const timeframes = ['15m', '2h', '4h', '1d', '1M'];
	
  


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
const [priceChange24hFilter, setPriceChange24hFilter] = useState<'all' | 'green' | 'red'>('all');
const [possibleReversalFilter, setPossibleReversalFilter] = useState<'all' | 'buy' | 'sell'>('all');
const [tradeSetupFilter, setTradeSetupFilter] = useState<'all' | 'buy' | 'sell'>('all');
const [fundingRateFilter, setFundingRateFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
const [mtfAlignmentFilter, setMtfAlignmentFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1' | '0' | 'na'>('all');
const [mtfTrendDirectionFilter, setMtfTrendDirectionFilter] = useState<'all' | 'bullish' | 'bearish' | 'mixed' | 'na'>('all');
const [touchedEMA200Filter, setTouchedEMA200Filter] = useState<'all' | 'yes' | 'no'>('all');
const [touchedEMA100Filter, setTouchedEMA100Filter] = useState<'all' | 'yes' | 'no'>('all');
const [touchedEMA200PreviousFilter, setTouchedEMA200PreviousFilter] = useState<'all' | 'yes' | 'no'>('all');
const [touchedEMA100PreviousFilter, setTouchedEMA100PreviousFilter] = useState<'all' | 'yes' | 'no'>('all');
const [ema70200CrossFilter, setEma70200CrossFilter] = useState<'all' | 'bullish' | 'bearish' | 'no'>('all');

const searchTerm = search.trim().toLowerCase();

const getPumpDump = (s: any) => s?.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
const getSignalValue = (s: any) => getSignal(s)?.trim() || 'NO DATA';
const formatSignalExtremeTime = (timestamp: number | null | undefined) =>
  Number.isFinite(timestamp)
    ? new Date(timestamp as number).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      })
    : 'N/A';
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
    case 'fundingRate': return Number.isFinite(fundingRates[s.symbol]) ? fundingRates[s.symbol] : null;
    case 'priceChangePercent': return Number(s.priceChangePercent);
    case 'pumpDump': return getPumpDumpStrength(s);
    case 'latestRSI': return typeof s.latestRSI === 'number' ? s.latestRSI : null;
    case 'breakoutFailure': return getBooleanValue(s.breakoutFailure);
    case 'touchedEMA200Today': return getBooleanValue(s.touchedEMA200Today);
    case 'touchedEMA100Today': return getBooleanValue(s.touchedEMA100Today);
    case 'touchedEMA200PreviousSession': return getBooleanValue(s.touchedEMA200PreviousSession);
    case 'touchedEMA100PreviousSession': return getBooleanValue(s.touchedEMA100PreviousSession);
    case 'latestCandleInsideEMA50EMA70': return getBooleanValue(s.latestCandleInsideEMA50EMA70);
    case 'ema70200Cross': return s.ema70200Cross?.timestamp ?? null;
    case 'signal': return getSignalValue(s);
    case 'drop': return getBooleanValue(s.mainTrend?.trend === 'bullish' && didDropFromPeak(10, s.priceChangePercent, 5));
    case 'recovery': return getBooleanValue(s.mainTrend?.trend === 'bearish' && didRecoverFromLow(-40, s.priceChangePercent, 10));
    case 'bullishBreakout': return getBooleanValue(s.bullishBreakout);
    case 'bearishBreakout': return getBooleanValue(s.bearishBreakout);
    case 'prevClose': return s.prevClosedGreen ? 1 : s.prevClosedRed ? -1 : 0;
    case 'oneDayTwoRedCloses': return s.oneDayTwoPreviousRedCloses === true ? 1 : s.oneDayTwoPreviousRedCloses === false ? 0 : null;
    case 'oneDayThreePointBearishDivergence': return getBooleanValue(s.oneDayThreePointBearishDivergence?.divergence);
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
  prevCloseGreen: 'prevClosedGreen',
  prevCloseRed: 'prevClosedRed',
};

const trendFilterMatches = (s: any, key: string, selectedTimeframe: string): boolean => {
  if (key === 'bullishDivergence') return s.multiTimeframeAlignment?.[selectedTimeframe]?.bullishDivergence?.divergence === true;
  if (key === 'bearishDivergence') return s.multiTimeframeAlignment?.[selectedTimeframe]?.bearishDivergence?.divergence === true;
  if (key === 'bullishMainTrend') return s.mainTrend?.trend === 'bullish';
  if (key === 'bearishMainTrend') return s.mainTrend?.trend === 'bearish';

  const field = trendKeyToBooleanField[key];
  if (!field) return false;
  if (field === 'prevClosedGreen' || field === 'prevClosedRed') return s[field] === true;
  const value = s[field];
  return value === true || value?.signal === true;
};

const filteredSignals = useMemo(() => signals.filter((s) => {
  const symbol = s.symbol?.toLowerCase() || '';
  const matchesSearch = !searchTerm || symbol.includes(searchTerm);
  const isFavorite = favorites.has(s.symbol);
  const matchesFavoriteView =
    coinListView === 'all' ||
    (coinListView === 'favorites' && isFavorite) ||
    (coinListView === 'not-favorites' && !isFavorite);
  if (!matchesSearch || !matchesFavoriteView) return false;

  // Multi-timeframe filters use each timeframe's own Main Trend and its own
  // Position Signal alignment. Incomplete data is never counted as aligned.
  const mtf = s.multiTimeframeAlignment;
  const mtfItems = ['15m', '2h', '4h', '1d', '1M'].map((tf) => mtf?.[tf]);
  const mtfAvailableCount = mtfItems.filter((item) => item && item.aligned !== null && item.aligned !== undefined).length;
  const mtfDataComplete = mtfAvailableCount === mtfItems.length;
  const mtfAlignedCount = mtfItems.filter((item) => item?.aligned === true).length;

  if (mtfAlignmentFilter !== 'all') {
    if (mtfAlignmentFilter === 'na') {
      if (mtfDataComplete) return false;
    } else {
      if (mtfAlignedCount !== Number(mtfAlignmentFilter)) return false;
      if (mtfAlignmentFilter === '5' && !mtfDataComplete) return false;
    }
  }

  if (mtfTrendDirectionFilter !== 'all') {
    const availableTrends = mtfItems.map((item) => item?.mainTrend).filter((trend) => trend === 'bullish' || trend === 'bearish');
    const trendsComplete = availableTrends.length === mtfItems.length;
    if (mtfTrendDirectionFilter === 'na') {
      if (trendsComplete) return false;
    } else {
      if (availableTrends.length === 0) return false;
      const allBullish = availableTrends.every((trend) => trend === 'bullish');
      const allBearish = availableTrends.every((trend) => trend === 'bearish');
      if (mtfTrendDirectionFilter === 'bullish' && !allBullish) return false;
      if (mtfTrendDirectionFilter === 'bearish' && !allBearish) return false;
      if (mtfTrendDirectionFilter === 'mixed' && (allBullish || allBearish)) return false;
    }
  }

  // 24H price-change color filter uses the existing Binance ticker field.
  if (priceChange24hFilter !== 'all') {
    const change = Number.parseFloat(String(s.priceChangePercent ?? ''));
    if (!Number.isFinite(change)) return false;
    if (priceChange24hFilter === 'green' && change <= 0) return false;
    if (priceChange24hFilter === 'red' && change >= 0) return false;
  }

  if (fundingRateFilter !== 'all') {
    const rate = fundingRates[s.symbol];
    if (!Number.isFinite(rate)) return false;
    if (fundingRateFilter === 'positive' && rate <= 0) return false;
    if (fundingRateFilter === 'negative' && rate >= 0) return false;
    if (fundingRateFilter === 'neutral' && rate !== 0) return false;
  }

  // Selected Trend Filters are combined with AND logic.
  if (trendFilters.length > 0 && !trendFilters.every((key) => trendFilterMatches(s, key, timeframe))) {
    return false;
  }

  // Dedicated 15m Possible Reversal filter. WAIT/N/A remain visible when
  // the filter is set to All; BUY and SELL select only confirmed labels.
  if (possibleReversalFilter !== 'all') {
    const reversalSignal = s.multiTimeframeAlignment?.['15m']?.possibleReversal?.signal;
    if (reversalSignal !== possibleReversalFilter.toUpperCase()) return false;
  }

  // Match the exact BUY/SELL setup rules displayed in the 15m Trade Setup column.
  if (tradeSetupFilter !== 'all') {
    const setupItem = s.multiTimeframeAlignment?.['15m'];
    const sellSetup = setupItem?.bullishBreakout === true && setupItem?.bearishDivergence?.divergence === true;
    const buySetup = setupItem?.bearishBreakout === true && setupItem?.bullishDivergence?.divergence === true;
    if (tradeSetupFilter === 'buy' && !buySetup) return false;
    if (tradeSetupFilter === 'sell' && !sellSetup) return false;
  }

  if (signalFilter && getSignalValue(s) !== signalFilter) return false;

  if (rsi14Filter !== 'all') {
    const rsi = typeof s.latestRSI === 'number' ? s.latestRSI : null;
    if (rsi === null) return false;
    if (rsi14Filter === 'above50' && rsi <= 50) return false;
    if (rsi14Filter === 'below50' && rsi > 50) return false;
  }

  if (touchedEMA200Filter !== 'all' && (s.touchedEMA200Today ? 'yes' : 'no') !== touchedEMA200Filter) return false;
  if (touchedEMA100Filter !== 'all' && (s.touchedEMA100Today ? 'yes' : 'no') !== touchedEMA100Filter) return false;
  if (touchedEMA200PreviousFilter !== 'all' && (s.touchedEMA200PreviousSession ? 'yes' : 'no') !== touchedEMA200PreviousFilter) return false;
  if (touchedEMA100PreviousFilter !== 'all' && (s.touchedEMA100PreviousSession ? 'yes' : 'no') !== touchedEMA100PreviousFilter) return false;

  if (ema70200CrossFilter !== 'all') {
    const crossDirection = s.ema70200Cross?.direction ?? 'none';
    const wanted = ema70200CrossFilter === 'no' ? 'none' : ema70200CrossFilter;
    if (crossDirection !== wanted) return false;
  }

  return true;
}), [
  signals, searchTerm, favorites, coinListView,
  fundingRateFilter, fundingRates, mtfAlignmentFilter, mtfTrendDirectionFilter, trendFilters, signalFilter, priceChange24hFilter, possibleReversalFilter, tradeSetupFilter,
  rsi14Filter, touchedEMA200Filter,
  touchedEMA100Filter, touchedEMA200PreviousFilter, touchedEMA100PreviousFilter,
  ema70200CrossFilter
]);

// One uniform sorting pipeline: FILTER FIRST, then SORT. Never mutate React state.
const filteredAndSortedSignals = useMemo(() => [...filteredSignals].sort((a, b) => {
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
}), [filteredSignals, sortField, sortOrder]);

// Render only one page of results. The scanner still analyzes every eligible
// symbol; pagination limits DOM work rather than reducing market coverage.
const totalTablePages = Math.max(1, Math.ceil(filteredAndSortedSignals.length / TABLE_PAGE_SIZE));
const visibleTableSignals = useMemo(() => {
  const safePage = Math.min(tablePage, totalTablePages - 1);
  const start = safePage * TABLE_PAGE_SIZE;
  return filteredAndSortedSignals.slice(start, start + TABLE_PAGE_SIZE);
}, [filteredAndSortedSignals, tablePage, totalTablePages]);

// Return to the first page when the user's view/filter/sort changes. Do not
// reset on incoming scan batches, so the current page remains stable.
useEffect(() => {
  setTablePage(0);
}, [search, coinListView, favorites, trendFilters, signalFilter, timeframe,
    priceChange24hFilter, fundingRateFilter, mtfAlignmentFilter,
    mtfTrendDirectionFilter, rsi14Filter, touchedEMA200Filter,
    touchedEMA100Filter, touchedEMA200PreviousFilter, touchedEMA100PreviousFilter,
    ema70200CrossFilter, sortField, sortOrder]);

const toggleSort = (field: string) => {
  if (sortField === field) {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  } else {
    setSortField(field);
    setSortOrder('asc');
  }
};

const summaryCounts = useMemo(() => {
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

const prevCloseGreenCount = filteredSignals.filter(
  (s) => s.prevClosedGreen === true
).length;

const prevCloseRedCount = filteredSignals.filter(
  (s) => s.prevClosedRed === true
).length;

const oneDayTwoRedClosesCount = filteredSignals.filter(
  (s) => s.oneDayTwoPreviousRedCloses === true
).length;

const oneDayThreePointBearishDivergenceCount = filteredSignals.filter(
  (s) => s.oneDayThreePointBearishDivergence?.divergence === true
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
// 24H summary is intentionally independent of active table filters, matching
// the all-symbol Funding Rate Summary behavior.
const greenPriceChangeCount = signals.filter(
  (t) => Number.parseFloat(String(t.priceChangePercent ?? '')) > 0
).length;

const redPriceChangeCount = signals.filter(
  (t) => Number.parseFloat(String(t.priceChangePercent ?? '')) < 0
).length;

 const greenVolumeCount = filteredSignals.filter(
  (s) => s.highestVolumeColorPrev === 'green'
).length;

const redVolumeCount = filteredSignals.filter(
  (s) => s.highestVolumeColorPrev === 'red'
).length;

// Funding counts cover the complete active USDT-perpetual universe, not only
// coins whose technical-analysis batch has already reached the table.
const fundingRateUniverse = activeFuturesSymbols.length > 0
  ? activeFuturesSymbols
  : Object.keys(fundingRates);
const positiveFundingCount = fundingRateUniverse.filter(
  (symbol) => Number.isFinite(fundingRates[symbol]) && fundingRates[symbol] > 0
).length;
const negativeFundingCount = fundingRateUniverse.filter(
  (symbol) => Number.isFinite(fundingRates[symbol]) && fundingRates[symbol] < 0
).length;
const neutralFundingCount = fundingRateUniverse.filter(
  (symbol) => Number.isFinite(fundingRates[symbol]) && fundingRates[symbol] === 0
).length;

	const divergenceFromLevelCount = filteredSignals.filter(
  (s) => s.divergenceFromLevel === 'true'
).length;

	
return {
  bullishMainTrendCount,
  bearishMainTrendCount,
  bullishNearSupportCount,
  bearishNearResistanceCount,
  bullishBreakupCount,
  bearishBreakdownCount,
  bullishDojiAfterBreakoutCount,
  bearishDojiAfterBreakoutCount,
  bullishBreakoutCount,
  bearishBreakoutCount,
  breakoutFailureCount,
  testedPrevHighCount,
  testedPrevLowCount,
  bullishReversalCount,
  bearishReversalCount,
  bullishDivergenceCount,
  bearishDivergenceCount,
  prevCloseGreenCount,
  prevCloseRedCount,
  oneDayTwoRedClosesCount,
  oneDayThreePointBearishDivergenceCount,
  bullishSpikeCount,
  bearishCollapseCount,
  ema14InsideResultsCount,
  greenPriceChangeCount,
  redPriceChangeCount,
  greenVolumeCount,
  redVolumeCount,
  fundingRateUniverse,
  positiveFundingCount,
  negativeFundingCount,
  neutralFundingCount,
  divergenceFromLevelCount
};
}, [filteredSignals, fundingRates, activeFuturesSymbols]);

const signalCounts = useMemo(() => {
  const counts = {
    maxZonePump: 0,
    maxZoneDump: 0,
    upperMiddleZonePump: 0,
    upperMiddleZoneDump: 0,
    balanceZonePump: 0,
    lowerMiddleZonePump: 0,
    lowerMiddleZoneDump: 0,
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
      case 'UPPER-MIDDLE ZONE PUMP':
        counts.upperMiddleZonePump++;
        break;
      case 'UPPER-MIDDLE ZONE DUMP':
        counts.upperMiddleZoneDump++;
        break;
      case 'BALANCE ZONE PUMP':
        counts.balanceZonePump++;
        break;
      case 'LOWER-MIDDLE ZONE PUMP':
        counts.lowerMiddleZonePump++;
        break;
      case 'LOWER-MIDDLE ZONE DUMP':
        counts.lowerMiddleZoneDump++;
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
    // - Only 3 symbols run concurrently to offset additional timeframe kline requests.
    // - 1M candles are cached for 5 minutes because monthly analysis uses completed months.
    // - Waves are spaced instead of using setInterval, so slow scans never overlap.
    // - 429/418 responses honour Retry-After and use exponential backoff.
    // - Binance's returned 1-minute request-weight header is monitored.
    const BATCH_SIZE = 15;
    const MAX_CONCURRENT = 3;
    const WAVE_DELAY_MS = 1000;
    const BETWEEN_CYCLE_DELAY_MS = 1500;
    const MAX_RETRIES = 3;
    const RATE_LIMIT_WEIGHT = 2400;
    const RATE_LIMIT_SOFT_CAP = 0.65;
    let currentIndex = 0;
    let symbols: string[] = [];
    let lastUsedWeight1m = 0;
    let ratePauseUntil = 0;
    let lastFundingRefreshAt = 0;
    const FUNDING_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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

    // Monthly candles change slowly and the monthly metrics use completed candles.
    // Cache 1M klines for five minutes to limit the extra Binance request load.
    const monthlyKlineCache = new Map<string, { expiresAt: number; raw: any[] }>();
    const fetchKlines = async (symbol: string, interval: string, label: string) => {
      if (interval === '1M') {
        const cached = monthlyKlineCache.get(symbol);
        if (cached && cached.expiresAt > Date.now()) return cached.raw;
        const raw = await safeFetchJson<any[]>(
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`,
          label
        );
        monthlyKlineCache.set(symbol, { raw, expiresAt: Date.now() + 5 * 60 * 1000 });
        return raw;
      }
      return safeFetchJson<any[]>(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`,
        label
      );
    };

    // Define available timeframes
const timeframes = ['15m', '2h', '4h', '1d', '1M'] as const;

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

  if (timeframe === '1M') {
    // Binance 1M candles are calendar-month candles keyed to UTC month starts.
    // Monthly analysis uses completed monthly candles; lower timeframes retain
    // the existing Philippine 08:00–08:00 session behavior unchanged.
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const sessionStart = Date.UTC(year, month, 1);
    const sessionEnd = Date.UTC(year, month + 1, 1);
    const prevSessionStart = Date.UTC(year, month - 1, 1);
    const prevSessionEnd = sessionStart;
    return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
  }

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
    const MILLISECONDS: Record<Exclude<Timeframe, '1d' | '1M'>, number> = {
      '15m': 15 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
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
    const [raw, ticker24h] = await Promise.all([
      fetchKlines(symbol, interval, `${symbol} klines`),
      safeFetchJson<any>(
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`,
        `${symbol} 24h ticker`
      )
    ]);

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
const ema50 = calculateEMA(closes, 50);
const ema70 = calculateEMA(closes, 70);
const ema100 = calculateEMA(closes, 100);
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

    const currentPrice = parseFloat(ticker24h.lastPrice);
    const price24hAgo = parseFloat(ticker24h.openPrice);
    const priceChangePercent = parseFloat(ticker24h.priceChangePercent);
	  const isUp = priceChangePercent > 0;    	      

const lastOpen = candles.at(-1)?.open!;
const lastClose = candles.at(-1)?.close!;
const lastEMA14 = ema14.at(-1)!;
const lastEMA50 = ema50.at(-1)!;
const lastEMA70 = ema70.at(-1)!;
const latestEmaZoneCandle = candles.at(-1);
// Latest Binance kline is the currently forming candle when closeTime is still in the future.
// Match the scanner's existing EMA calculation and define 'inside EMA50/EMA70' as its live close lying between both EMA values.
const latestCandleInsideEMA50EMA70 = Boolean(
  latestEmaZoneCandle && Number.isFinite(lastEMA50) && Number.isFinite(lastEMA70) &&
  latestEmaZoneCandle.close >= Math.min(lastEMA50, lastEMA70) &&
  latestEmaZoneCandle.close <= Math.max(lastEMA50, lastEMA70)
);
const lastEMA200 = ema200.at(-1)!;


const mainTrend = Number.isFinite(ema70.at(-1)) && Number.isFinite(ema200.at(-1))
  ? getMainTrend(ema70, ema200, closes, opens, highs, lows)
  : null;
const trend = lastEMA14 > lastEMA70 ? "bullish" : "bearish";

const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions(interval === '1M' ? '1M' : undefined);
// Always retain the existing PH 08:00–08:00 window for lower-timeframe MTF panels,
// even when the selected scanner timeframe is 1M.
const lowerTimeframePhSession = getSessions();
        

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

if (prevSessionCandles.length >= (interval === '1M' ? 1 : 2)) {
  const firstCandle = prevSessionCandles[0];
  const lastCandle = prevSessionCandles[prevSessionCandles.length - 1];

  prevClosedGreen = lastCandle.close > firstCandle.open;
  prevClosedRed = lastCandle.close < firstCandle.open;
}

// Independent 15m / 2h / 4h / 1d / 1M metrics.
// Existing lower-timeframe session calculations retain the PH 08:00–08:00
// boundaries. The 1M timeframe uses UTC calendar-month candle boundaries.
// Reuse selected-timeframe candles/indicators and fetch other intervals in parallel.
const alignmentTimeframes = ['15m', '2h', '4h', '1d', '1M'] as const;
type AlignmentTimeframe = typeof alignmentTimeframes[number];

const loadedTimeframes = await Promise.all(alignmentTimeframes.map(async (tf) => {
  if (tf === interval) return { tf, tfCandles: candles, error: null as string | null };
  try {
    const tfRaw = await fetchKlines(symbol, tf, `${symbol} ${tf} metrics klines`);
    const tfCandles: Candle[] = tfRaw.map((c: any) => ({
      timestamp: +c[0], open: +c[1], high: +c[2], low: +c[3],
      close: +c[4], volume: +c[5], closeTime: +c[6]
    }));
    return { tf, tfCandles, error: null as string | null };
  } catch (err: any) {
    return { tf, tfCandles: [] as Candle[], error: err?.message || 'Data unavailable' };
  }
}));

const multiTimeframeAlignment: Record<string, any> = {};
for (const loaded of loadedTimeframes) {
  const tf = loaded.tf;
  try {
    const minimumCandles = tf === '1M' ? 15 : 200;
    if (loaded.error || loaded.tfCandles.length < minimumCandles) {
      throw new Error(loaded.error || `Insufficient candle history (need ${minimumCandles})`);
    }

    const tfCandles = loaded.tfCandles;
    const tfCloses = tfCandles.map(c => c.close);
    const tfOpens = tfCandles.map(c => c.open);
    const tfHighs = tfCandles.map(c => c.high);
    const tfLows = tfCandles.map(c => c.low);

    // Reuse selected-timeframe indicator arrays instead of calculating them twice.
    const tfEMA70 = tf === interval ? ema70 : calculateEMA(tfCloses, 70);
    const tfEMA100 = tf === interval ? ema100 : calculateEMA(tfCloses, 100);
    const tfEMA200 = tf === interval ? ema200 : calculateEMA(tfCloses, 200);
    const tfRSI14 = tf === interval ? rsi14 : calculateRSI(tfCloses, 14);
    const tfMainTrend = tf === interval
      ? mainTrend
      : Number.isFinite(tfEMA70.at(-1)) && Number.isFinite(tfEMA200.at(-1))
      ? getMainTrend(tfEMA70, tfEMA200, tfCloses, tfOpens, tfHighs, tfLows)
      : null;

    // Monthly candles are evaluated against their own calendar month. All
    // existing 15m/2h/4h/1d session calculations keep their previous PH window.
    const tfSession = tf === '1M' ? getSessions('1M') : lowerTimeframePhSession;

    const completedIndexed = tfCandles
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => Number.isFinite(c.closeTime) && c.closeTime <= nowMs);

    const currentSessionIndexed = completedIndexed.filter(({ c }) =>
      c.timestamp >= tfSession.sessionStart && c.timestamp < tfSession.sessionEnd
    );
    const previousSessionIndexed = completedIndexed.filter(({ c }) =>
      c.timestamp >= tfSession.prevSessionStart && c.timestamp < tfSession.prevSessionEnd
    );

    const previousSessionCandles = previousSessionIndexed.map(({ c }) => c);
    const previousSessionOpen = previousSessionCandles.length >= 1
      ? previousSessionCandles[0].open : null;
    const previousSessionClose = previousSessionCandles.length >= 1
      ? previousSessionCandles[previousSessionCandles.length - 1].close : null;
    const previousClose = previousSessionOpen === null || previousSessionClose === null
      ? null
      : previousSessionClose > previousSessionOpen ? 'green'
      : previousSessionClose < previousSessionOpen ? 'red' : 'neutral';

    const positionSignal = previousClose === 'green'
      ? 'SELL — Resistance Failure'
      : previousClose === 'red'
      ? 'BUY — Support Failure'
      : null;

    const aligned = positionSignal && tfMainTrend?.trend
      ? ((tfMainTrend.trend === 'bullish' && previousClose === 'red') ||
         (tfMainTrend.trend === 'bearish' && previousClose === 'green'))
      : null;

    // Classify the countertrend level independently for each timeframe.
    // BUY against a bearish Main Trend is countertrend resistance.
    // SELL against a bullish Main Trend is countertrend support.
    const countertrendType = aligned === null
      ? 'N/A'
      : aligned
      ? 'WITH MAIN TREND'
      : positionSignal?.startsWith('BUY')
      ? 'COUNTERTREND — RESISTANCE'
      : positionSignal?.startsWith('SELL')
      ? 'COUNTERTREND — SUPPORT'
      : 'N/A';

    const previousSessionHigh = previousSessionIndexed.length
      ? Math.max(...previousSessionIndexed.map(({ c }) => c.high)) : null;
    const previousSessionLow = previousSessionIndexed.length
      ? Math.min(...previousSessionIndexed.map(({ c }) => c.low)) : null;
    const currentSessionHigh = currentSessionIndexed.length
      ? Math.max(...currentSessionIndexed.map(({ c }) => c.high)) : null;
    const currentSessionLow = currentSessionIndexed.length
      ? Math.min(...currentSessionIndexed.map(({ c }) => c.low)) : null;

    // Active RSI price divergence for this timeframe, using completed candles
    // and the exact Philippines 08:00–08:00 session.
    const previousSessionLastIndex = previousSessionIndexed.length ? previousSessionIndexed[previousSessionIndexed.length - 1].index : -1;
    const currentSessionLastIndex = currentSessionIndexed.length ? currentSessionIndexed[currentSessionIndexed.length - 1].index : -1;
    const previousHighItem = previousSessionIndexed.length ? previousSessionIndexed.reduce((best, item) => item.c.high > best.c.high ? item : best) : null;
    const currentHighItem = currentSessionIndexed.length ? currentSessionIndexed.reduce((best, item) => item.c.high > best.c.high ? item : best) : null;
    const previousLowItem = previousSessionIndexed.length ? previousSessionIndexed.reduce((best, item) => item.c.low < best.c.low ? item : best) : null;
    const currentLowItem = currentSessionIndexed.length ? currentSessionIndexed.reduce((best, item) => item.c.low < best.c.low ? item : best) : null;
    const previousSessionRSI = previousSessionLastIndex >= 0 ? tfRSI14[previousSessionLastIndex] : NaN;
    const currentSessionRSI = currentSessionLastIndex >= 0 ? tfRSI14[currentSessionLastIndex] : NaN;

    // Today's-session Possible Reversal: compare today's price breakout against
    // the previous session extreme, while RSI uses today's own RSI extreme
    // versus the latest completed RSI in today's session.
    const sessionRSIItems = currentSessionIndexed
      .map(({ c, index }) => ({ c, index, rsi: tfRSI14[index] }))
      .filter(item => Number.isFinite(item.rsi));
    const highestSessionRSIItem = sessionRSIItems.length
      ? sessionRSIItems.reduce((best, item) => item.rsi > best.rsi ? item : best)
      : null;
    const lowestSessionRSIItem = sessionRSIItems.length
      ? sessionRSIItems.reduce((best, item) => item.rsi < best.rsi ? item : best)
      : null;
    const possibleReversalDataAvailable = Boolean(
      previousSessionIndexed.length && currentSessionIndexed.length &&
      Number.isFinite(currentSessionRSI) && sessionRSIItems.length
    );
    const possibleReversalSell = possibleReversalDataAvailable &&
      tfMainTrend?.trend === 'bullish' &&
      currentSessionHigh !== null && previousSessionHigh !== null &&
      currentSessionHigh > previousSessionHigh &&
      highestSessionRSIItem !== null && currentSessionRSI < highestSessionRSIItem.rsi;
    const possibleReversalBuy = possibleReversalDataAvailable &&
      tfMainTrend?.trend === 'bearish' &&
      currentSessionLow !== null && previousSessionLow !== null &&
      currentSessionLow < previousSessionLow &&
      lowestSessionRSIItem !== null && currentSessionRSI > lowestSessionRSIItem.rsi;
    const possibleReversal = {
      available: possibleReversalDataAvailable && Boolean(tfMainTrend?.trend),
      signal: possibleReversalSell ? 'SELL' : possibleReversalBuy ? 'BUY' : 'WAIT',
      mainTrend: tfMainTrend?.trend ?? null,
      previousPrice: possibleReversalSell ? previousSessionHigh : possibleReversalBuy ? previousSessionLow : null,
      breakoutPrice: possibleReversalSell ? currentSessionHigh : possibleReversalBuy ? currentSessionLow : null,
      rsiExtreme: possibleReversalSell ? highestSessionRSIItem?.rsi ?? null : possibleReversalBuy ? lowestSessionRSIItem?.rsi ?? null : null,
      currentRSI: Number.isFinite(currentSessionRSI) ? currentSessionRSI : null,
      priceTimestamp: possibleReversalSell ? currentHighItem?.c.timestamp ?? null : possibleReversalBuy ? currentLowItem?.c.timestamp ?? null : null,
      rsiExtremeTimestamp: possibleReversalSell ? highestSessionRSIItem?.c.timestamp ?? null : possibleReversalBuy ? lowestSessionRSIItem?.c.timestamp ?? null : null,
      currentRSITimestamp: currentSessionLastIndex >= 0 ? tfCandles[currentSessionLastIndex].timestamp : null
    };

    const divergenceDataAvailable = Boolean(previousSessionIndexed.length && currentSessionIndexed.length &&
      Number.isFinite(previousSessionRSI) && Number.isFinite(currentSessionRSI));
    const bearishDivergence = {
      available: divergenceDataAvailable,
      divergence: divergenceDataAvailable && currentSessionHigh! > previousSessionHigh! && currentSessionRSI < previousSessionRSI,
      type: 'bearish',
      previousPrice: previousSessionHigh,
      currentPrice: currentSessionHigh,
      previousRSI: Number.isFinite(previousSessionRSI) ? previousSessionRSI : null,
      currentRSI: Number.isFinite(currentSessionRSI) ? currentSessionRSI : null,
      previousTimestamp: previousHighItem?.c.timestamp ?? null,
      currentTimestamp: currentHighItem?.c.timestamp ?? null
    };
    const bullishDivergence = {
      available: divergenceDataAvailable,
      divergence: divergenceDataAvailable && currentSessionLow! < previousSessionLow! && currentSessionRSI > previousSessionRSI,
      type: 'bullish',
      previousPrice: previousSessionLow,
      currentPrice: currentSessionLow,
      previousRSI: Number.isFinite(previousSessionRSI) ? previousSessionRSI : null,
      currentRSI: Number.isFinite(currentSessionRSI) ? currentSessionRSI : null,
      previousTimestamp: previousLowItem?.c.timestamp ?? null,
      currentTimestamp: currentLowItem?.c.timestamp ?? null
    };

    const bullishBreakout = currentSessionHigh !== null && previousSessionHigh !== null
      ? currentSessionHigh > previousSessionHigh : null;
    const bearishBreakout = currentSessionLow !== null && previousSessionLow !== null
      ? currentSessionLow < previousSessionLow : null;

    const latestCompletedIndex = completedIndexed.length
      ? completedIndexed[completedIndexed.length - 1].index : -1;
    const latestRSI14 = latestCompletedIndex >= 0
      ? tfRSI14[latestCompletedIndex] : NaN;
    const rsi14Zone = Number.isFinite(latestRSI14)
      ? latestRSI14 > 50 ? 'ABOVE 50' : latestRSI14 < 50 ? 'BELOW 50' : 'AT 50'
      : 'N/A';

    const hasEMATouch = (items: { c: Candle; index: number }[], emaValues: number[]) =>
      items.some(({ c, index }) =>
        Number.isFinite(emaValues[index]) &&
        c.low <= emaValues[index] && c.high >= emaValues[index]
      );

    const ema100Available = Number.isFinite(tfEMA100.at(-1));
    const ema200Available = Number.isFinite(tfEMA200.at(-1));
    const ema100CurrentTouch = currentSessionIndexed.length && ema100Available
      ? hasEMATouch(currentSessionIndexed, tfEMA100) : null;
    const ema100PreviousTouch = previousSessionIndexed.length && ema100Available
      ? hasEMATouch(previousSessionIndexed, tfEMA100) : null;
    const ema200CurrentTouch = currentSessionIndexed.length && ema200Available
      ? hasEMATouch(currentSessionIndexed, tfEMA200) : null;
    const ema200PreviousTouch = previousSessionIndexed.length && ema200Available
      ? hasEMATouch(previousSessionIndexed, tfEMA200) : null;

    // Latest historical EMA70/EMA200 crossover on this timeframe.
    let latestCrossover: any = null;
    for (let i = tfCandles.length - 2; i >= 0; i--) {
      const previous70 = tfEMA70[i];
      const previous200 = tfEMA200[i];
      const current70 = tfEMA70[i + 1];
      const current200 = tfEMA200[i + 1];
      if (![previous70, previous200, current70, current200].every(Number.isFinite)) continue;
      if ((previous70 <= previous200 && current70 > current200) ||
          (previous70 >= previous200 && current70 < current200)) {
        latestCrossover = {
          direction: current70 > current200 ? 'BULLISH' : 'BEARISH',
          price: tfCandles[i + 1].close,
          timestamp: tfCandles[i + 1].timestamp
        };
        break;
      }
    }

    multiTimeframeAlignment[tf] = {
      mainTrend: tfMainTrend?.trend ?? null,
      positionSignal,
      countertrendType,
      previousClose,
      alignment: aligned === null ? 'N/A' : aligned ? 'TREND ALIGNED' : 'COUNTERTREND',
      aligned,
      bullishBreakout,
      bearishBreakout,
      latestRSI14: Number.isFinite(latestRSI14) ? latestRSI14 : null,
      rsi14Zone,
      ema100CurrentTouch,
      ema100PreviousTouch,
      ema200CurrentTouch,
      ema200PreviousTouch,
      latestCrossover,
      bearishDivergence,
      bullishDivergence,
      possibleReversal
    };
  } catch (err: any) {
    console.warn(`${symbol} ${tf} metrics unavailable:`, err?.message || err);
    multiTimeframeAlignment[tf] = {
      mainTrend: null, positionSignal: null, countertrendType: 'N/A', previousClose: null,
      alignment: 'N/A', aligned: null, bullishBreakout: null, bearishBreakout: null,
      latestRSI14: null, rsi14Zone: 'N/A',
      ema100CurrentTouch: null, ema100PreviousTouch: null,
      ema200CurrentTouch: null, ema200PreviousTouch: null, latestCrossover: null,
      bearishDivergence: { available: false, divergence: false, type: 'bearish', previousPrice: null, currentPrice: null, previousRSI: null, currentRSI: null, previousTimestamp: null, currentTimestamp: null },
      bullishDivergence: { available: false, divergence: false, type: 'bullish', previousPrice: null, currentPrice: null, previousRSI: null, currentRSI: null, previousTimestamp: null, currentTimestamp: null },
      possibleReversal: { available: false, signal: 'N/A', mainTrend: null, previousPrice: null, breakoutPrice: null, rsiExtreme: null, currentRSI: null, priceTimestamp: null, rsiExtremeTimestamp: null, currentRSITimestamp: null }
    };
  }
}

const availableAlignmentCount = alignmentTimeframes.filter(tf => multiTimeframeAlignment[tf]?.aligned !== null).length;
const alignedTimeframeCount = alignmentTimeframes.filter(tf => multiTimeframeAlignment[tf]?.aligned === true).length;
const overallMultiTimeframeAlignment = availableAlignmentCount
  ? `${alignedTimeframeCount}/5 ALIGNED (${availableAlignmentCount}/5 DATA)` : 'N/A';

// === 1D TWO PREVIOUS RED CLOSES ===
// Only the two most recent COMPLETED Binance 1D candles are evaluated.
// The current/forming 1D candle is deliberately excluded so the signal
// cannot flip while today's candle is still open.
let oneDayTwoPreviousRedCloses: boolean | null = null;
let oneDayPreviousRedCloseCount = 0;

if (interval === '1d') {
  const completedDailyCandles = candles.filter((candle) =>
    Number.isFinite(candle.closeTime) && candle.closeTime <= nowMs
  );

  const previousDailyCandles = completedDailyCandles.slice(-2);
  oneDayPreviousRedCloseCount = previousDailyCandles.filter(
    (candle) => candle.close < candle.open
  ).length;

  oneDayTwoPreviousRedCloses =
    previousDailyCandles.length === 2 && oneDayPreviousRedCloseCount === 2;
}


// PRESERVED FOR FUTURE USE — DISABLED.
// The original 1D three-point RSI divergence implementation is retained in
// the prior source ZIP. Its pivot scan is not run during normal scanning.
const oneDayThreePointBearishDivergence = {
  divergence: false, status: 'DISABLED' as const, pivots: [],
  priceAscending: false, rsiDescending: false, ema14Confirmed: false,
  windowSize: 20,
  message: 'Disabled to reduce scanner workload; preserved for future use'
};
       
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

// Philippine trading session: 08:00 Asia/Manila = 00:00 UTC.
// Use UTC timestamps only so device timezone settings cannot shift session boundaries.
const getLastNSessionStartTimes = (n: number): number[] => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const todayPHSessionStartUTC = getUTCMillis(year, month, date, 0, 0);
  const isAfterPHSessionStart = now.getTime() >= todayPHSessionStartUTC;
  const baseDate = isAfterPHSessionStart ? date : date - 1;

  const sessionStarts: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const sessionDate = baseDate - i;
    sessionStarts.push(getUTCMillis(year, month, sessionDate, 0, 0));
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

// TRUE EMA100 TOUCH — same strict Philippines session as EMA200: 08:00 today
// inclusive to 08:00 tomorrow exclusive. EMA100 is calculated independently
// from this scan timeframe's own candle closes; each candle is checked against
// its matching EMA100 value. Only completed candles in candlesToday count.
const touchedEMA100Today = candlesToday.some((candle) => {
  const candleIndex = candles.indexOf(candle);
  const candleEMA100 = ema100[candleIndex];

  return Number.isFinite(candleEMA100) &&
    candle.low <= candleEMA100 &&
    candle.high >= candleEMA100;
});

// PREVIOUS SESSION EMA200 TOUCH — exact previous PH 08:00 -> current PH 08:00 session.
// Each completed previous-session candle is tested against its matching EMA200 value.
const touchedEMA200PreviousSession = candlesPrev.some((candle) => {
  const candleIndex = candles.indexOf(candle);
  const candleEMA200 = ema200[candleIndex];

  return Number.isFinite(candleEMA200) &&
    candle.low <= candleEMA200 &&
    candle.high >= candleEMA200;
});

// PREVIOUS SESSION EMA100 TOUCH — same exact previous PH session boundary.
const touchedEMA100PreviousSession = candlesPrev.some((candle) => {
  const candleIndex = candles.indexOf(candle);
  const candleEMA100 = ema100[candleIndex];

  return Number.isFinite(candleEMA100) &&
    candle.low <= candleEMA100 &&
    candle.high >= candleEMA100;
});

// Legacy selected-timeframe divergence preparation is dormant. The reusable
// detector functions remain above; active calculations now run once per
// timeframe inside multiTimeframeAlignment using the already-loaded candles.


// EMA200 pullback setup removed; standard EMA200 touch/crossover calculations remain active.

// === Extract volumes from each session ===
// Dormant legacy divergence preparation/logging removed from runtime.

	      
// PRESERVED FOR FUTURE USE — DISABLED: volume-divergence detector functions
// remain in the source but are not executed during normal scanning.
const bearishVolumeDivergence = { divergence: false };
const bullishVolumeDivergence = { divergence: false };
	      
// Dormant legacy divergence preparation/logging removed from runtime.

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
	  
const { level, type, crossoverPrice } = findRelevantLevel(ema14, ema70, closes, highs, lows, trend);
          const highestHigh = Math.max(...highs);
          const lowestLow = Math.min(...lows);
          const inferredLevel = trend === 'bullish' ? highestHigh : lowestLow;
          const inferredLevelType = trend === 'bullish' ? 'resistance' : 'support';

          // PRESERVED FOR FUTURE USE — DISABLED. This code is intentionally
          // commented out because there is no current divergence-from-level output.
          /*
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
          */
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
  const bullishReversal = Number.isFinite(ema200.at(-1)) ? detectBullishToBearish(
  ema14,
  ema70,
ema200,	  
  rsi14,
  lows,
  highs,
  closes,
opens,	  
) : null;


const bearishReversal = Number.isFinite(ema200.at(-1)) ? detectBearishToBullish(
  ema14,
  ema70,
ema200,	
  rsi14,
  highs,
  lows,
  closes,
opens,	
) : null;


        
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
const bullishSpike = Number.isFinite(ema200.at(-1)) ? detectBullishSpike(
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
) : null; 


// ✅ Usage
const bearishCollapse = Number.isFinite(ema200.at(-1)) ? detectBearishCollapse(
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
) : null; 
	      
        
        const selectedTimeframeDivergence = multiTimeframeAlignment[interval] ?? {};
        const bearishDivergence = selectedTimeframeDivergence.bearishDivergence ?? { divergence: false };
        const bullishDivergence = selectedTimeframeDivergence.bullishDivergence ?? { divergence: false };

        return {
  symbol,
  bullishMainTrendCount: summaryCounts.bullishMainTrendCount,
  bearishMainTrendCount: summaryCounts.bearishMainTrendCount,
  bullishBreakoutCount: summaryCounts.bullishBreakoutCount,
  bearishBreakoutCount: summaryCounts.bearishBreakoutCount,       
  testedPrevHighCount: summaryCounts.testedPrevHighCount,   // ✅ New
  testedPrevLowCount: summaryCounts.testedPrevLowCount,    // ✅ New
  divergenceFromLevelCount: summaryCounts.divergenceFromLevelCount,
mainTrend,
  multiTimeframeAlignment,
  overallMultiTimeframeAlignment,
  breakout,
  bullishBreakout,
  bearishBreakout,
prevClosedGreen,
prevClosedRed,
  oneDayTwoPreviousRedCloses,
  oneDayPreviousRedCloseCount,
  oneDayThreePointBearishDivergence,
  oneDayBearishRsiPumpEmaFilterMatch: interval === '1d' &&
    mainTrend?.trend === 'bearish' &&
    typeof latestRSI === 'number' && latestRSI > 50 &&
    (() => {
      const pd = getRecentRSIDiff(rsi14, 14);
      return pd?.direction === 'pump' &&
        typeof pd.pumpStrength === 'number' &&
        pd.pumpStrength >= 9 && pd.pumpStrength <= 13;
    })() &&
    ema14InsideResults.some((r: any) => r.inside === true),
  bullishReversalCount: summaryCounts.bullishReversalCount,
  bearishReversalCount: summaryCounts.bearishReversalCount,
  bullishReversal,		
  bearishReversal,
divergenceFromLevel,
  divergenceFromLevelPrice: crossoverPrice,
  divergenceFromLevelLevelType: type,
  divergenceFromLevelType,
  bullishSpike,
  bearishCollapse,	
  rsi14,
  rsi14Timestamps: candles.map((c: any) => c.timestamp),
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
		ema14InsideResultsCount: summaryCounts.ema14InsideResultsCount,
		gap,
		gap1,
		ema14Bounce,
		ema70Bounce,
  ema200Bounce,
			touchedEMA200Today,
			touchedEMA100Today,
      touchedEMA200PreviousSession,
      touchedEMA100PreviousSession,
      latestCandleInsideEMA50EMA70,
      latestCandleInsideEMA50EMA70Details: {
        isForming: Boolean(latestEmaZoneCandle && latestEmaZoneCandle.closeTime > Date.now()),
        candleClose: latestEmaZoneCandle?.close ?? null,
        ema50: Number.isFinite(lastEMA50) ? lastEMA50 : null,
        ema70: Number.isFinite(lastEMA70) ? lastEMA70 : null,
      },
			ema70200Cross,
		bearishDivergence,
		bullishDivergence,
		bearishVolumeDivergence,
		bullishVolumeDivergence,
		highestVolumeColorPrev,
		greenVolumeCount: summaryCounts.greenVolumeCount,
		redVolumeCount: summaryCounts.redVolumeCount,
		isVolumeSpike,
		hasBullishEngulfing,
		hasBearishEngulfing,
		   currentPrice,
      price24hAgo,
      priceChangePercent,
      isUp,
		greenPriceChangeCount: summaryCounts.greenPriceChangeCount, 
		redPriceChangeCount: summaryCounts.redPriceChangeCount,
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
      // IMPORTANT: Do NOT truncate this list. Binance can have more than
      // 500 active USDⓈ-M perpetual contracts, and truncating here makes
      // perfectly active Binance Futures symbols invisible to the UI.
      // Keep only symbols that Binance currently reports as TRADING.
      symbols = info.symbols
  .filter(
    (s: any) =>
      s.status === "TRADING" &&
      s.contractType === "PERPETUAL" &&
      s.quoteAsset === "USDT" &&
      !blacklist.includes(s.symbol)
  )
  .map((s: any) => s.symbol)
  .filter((symbol: string) => Boolean(symbol));

        if (isMounted) {
          // Publish the complete active-contract universe immediately.
          // Analysis results arrive progressively afterwards.
          setActiveFuturesSymbols([...symbols]);
          setScannerProgress({ completed: 0, total: symbols.length });
          setScannerStatus('scanning');
        }
	  };

  const fetchBatch = async () => {
  if (!symbols.length || !isMounted) return;

  setScannerStatus('scanning');
  setNextScanAt(null);

  // Funding changes less frequently than candle prices. Refresh the all-symbol
  // snapshot every five minutes instead of downloading it for every batch.
  if (Date.now() - lastFundingRefreshAt >= FUNDING_REFRESH_INTERVAL_MS) {
  try {
    const premiumIndex = await safeFetchJson<any[]>(
      "https://fapi.binance.com/fapi/v1/premiumIndex",
      "all-symbol funding rates"
    );
    const nextFundingRates: Record<string, number> = {};
    for (const item of premiumIndex) {
      const rate = Number(item?.lastFundingRate);
      if (typeof item?.symbol === 'string' && Number.isFinite(rate)) {
        nextFundingRates[item.symbol] = rate;
      }
    }
    if (isMounted) {
      setFundingRates(nextFundingRates);
      lastFundingRefreshAt = Date.now();
    }
  } catch (fundingError: any) {
    // Funding is supplemental; retain the last successful snapshot on failure.
    console.warn("Funding-rate refresh failed; retaining last successful snapshot:", fundingError?.message || fundingError);
  }
  }

  const batch = symbols.slice(currentIndex, currentIndex + BATCH_SIZE);
  currentIndex += batch.length;
  if (currentIndex >= symbols.length) currentIndex = 0;

  const results: any[] = [];

  // Process a maximum of 3 symbols concurrently. Each symbol's candle and
  // ticker requests run together; adaptive backoff still protects Binance.
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
      // Map-based upsert avoids repeatedly scanning the growing signals array
      // with findIndex (quadratic work as the Futures universe fills).
      const bySymbol = new Map<string, any>(prev.map(item => [item.symbol, item]));
      const updatedMap: { [symbol: string]: number } = { ...lastUpdatedMap };
      const updatedAt = Date.now();

      for (const result of results) {
        bySymbol.set(result.symbol, result);
        updatedMap[result.symbol] = updatedAt;
      }

      setLastUpdatedMap(updatedMap);
      return Array.from(bySymbol.values());
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
        <span className="text-green-300">
          Active Futures: {activeFuturesSymbols.length || '—'}
        </span>
        {nextScanAt && scannerStatus === 'waiting' && (
          <span className="text-gray-300">
            Next batch: {new Date(nextScanAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        )}
      </div>
    </div>

    {/* 🟢 COMPLETE ACTIVE BINANCE FUTURES UNIVERSE
        This list is independent of the scanner batches. It guarantees that
        every currently TRADING USDT perpetual returned by Binance exchangeInfo
        is visible immediately, even while technical analysis is still queued. */}
    <div className="mb-4 rounded-lg border border-green-700 bg-gray-800/80 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-bold text-green-400">🟢 ACTIVE BINANCE FUTURES</span>
        <span className="text-gray-300">
          {activeFuturesSymbols.length} active USDT perpetuals
        </span>
        <span className="text-gray-500 text-xs">
          • Complete exchangeInfo list • analysis loads in batches
        </span>
      </div>
      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
        {activeFuturesSymbols.length > 0 ? activeFuturesSymbols.slice(0, 80).map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => setSearch(symbol)}
            className={`px-2 py-0.5 rounded text-[10px] border ${
              analyzedSymbolSet.has(symbol)
                ? 'border-green-700 bg-gray-700 text-green-300'
                : 'border-gray-700 bg-gray-900 text-gray-400'
            }`}
            title={analyzedSymbolSet.has(symbol)
              ? `${symbol}: analyzed`
              : `${symbol}: waiting for analysis batch`}
          >
            {symbol}
          </button>
        )) : (
          <span className="text-gray-500 text-xs">Loading active Binance Futures contracts…</span>
        )}
      </div>
      {activeFuturesSymbols.length > 80 && (
        <div className="mt-2 text-[10px] text-gray-500">
          Showing 80 of {activeFuturesSymbols.length} active contracts here to keep the page responsive. All eligible contracts remain in the scanner queue; use the main table search after analysis to find a symbol.
        </div>
      )}
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
<p className="text-[11px] text-gray-500 -mt-2 mb-3">1M uses Binance calendar-month candles. EMA70/EMA100/EMA200 and Main Trend show N/A when the symbol does not have enough monthly history; no trend is inferred from insufficient data.</p>

<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-4">
  {/* 🟢 Filter Controls Section */}
  <div className="flex flex-col gap-4 text-sm">

    {/* 🔷 Trend Filters Section */}
<div>
  <p className="text-gray-400 mb-2 font-semibold">
    📊 Trend Filters — Filter by Main Trend, previous session close, or breakout results shown in the scanner:
  </p>
  <div className="flex flex-wrap gap-2">
    {[
      {
        label: 'Bullish Trend',
        key: 'bullishMainTrend',
        count: summaryCounts.bullishMainTrendCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Trend',
        key: 'bearishMainTrend',
        count: summaryCounts.bearishMainTrendCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish Divergence',
        key: 'bullishDivergence',
        count: signals.filter((s) => s.multiTimeframeAlignment?.[timeframe]?.bullishDivergence?.divergence === true).length,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Divergence',
        key: 'bearishDivergence',
        count: signals.filter((s) => s.multiTimeframeAlignment?.[timeframe]?.bearishDivergence?.divergence === true).length,
        color: 'text-red-300',
      },
      {
        label: 'Previous Close Green',
        key: 'prevCloseGreen',
        count: summaryCounts.prevCloseGreenCount,
        color: 'text-green-300',
      },
      {
        label: 'Previous Close Red',
        key: 'prevCloseRed',
        count: summaryCounts.prevCloseRedCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish Breakout',
        key: 'bullishBreakout',
        count: summaryCounts.bullishBreakoutCount,
        color: 'text-yellow-400',
      },
      {
        label: 'Bearish Breakout',
        key: 'bearishBreakout',
        count: summaryCounts.bearishBreakoutCount,
        color: 'text-yellow-400',
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

    {/* 🟢🔴 24H Price Change Color Filter */}
    <div>
      <p className="text-gray-400 mb-2 font-semibold">24H Price Change — Green / Red:</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPriceChange24hFilter((current) => current === 'green' ? 'all' : 'green')}
          className={`px-3 py-1.5 rounded border font-semibold transition-colors ${priceChange24hFilter === 'green' ? 'bg-green-600 text-white border-green-400' : 'bg-gray-800 text-green-300 border-green-700 hover:bg-gray-700'}`}
        >
          🟢 Green ({summaryCounts.greenPriceChangeCount})
        </button>
        <button
          type="button"
          onClick={() => setPriceChange24hFilter((current) => current === 'red' ? 'all' : 'red')}
          className={`px-3 py-1.5 rounded border font-semibold transition-colors ${priceChange24hFilter === 'red' ? 'bg-red-600 text-white border-red-400' : 'bg-gray-800 text-red-300 border-red-700 hover:bg-gray-700'}`}
        >
          🔴 Red ({summaryCounts.redPriceChangeCount})
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1">Select Green or Red; tap the active filter again to show both. Summary counts always include all analyzed symbols, regardless of active filters.</p>
    </div>

    {/* 🎯 15m Possible Reversal Filter */}
    <div>
      <p className="text-gray-400 mb-2 font-semibold">🎯 15m Possible Reversal:</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPossibleReversalFilter(v => v === 'buy' ? 'all' : 'buy')} className={`px-3 py-1.5 rounded border font-semibold ${possibleReversalFilter === 'buy' ? 'bg-green-600 text-white border-green-400' : 'bg-gray-800 text-green-300 border-green-700 hover:bg-gray-700'}`}>BUY ({signals.filter(s => s.multiTimeframeAlignment?.['15m']?.possibleReversal?.signal === 'BUY').length})</button>
        <button type="button" onClick={() => setPossibleReversalFilter(v => v === 'sell' ? 'all' : 'sell')} className={`px-3 py-1.5 rounded border font-semibold ${possibleReversalFilter === 'sell' ? 'bg-red-600 text-white border-red-400' : 'bg-gray-800 text-red-300 border-red-700 hover:bg-gray-700'}`}>SELL ({signals.filter(s => s.multiTimeframeAlignment?.['15m']?.possibleReversal?.signal === 'SELL').length})</button>
      </div>
      <p className="text-xs text-gray-500 mt-1">Tap the active filter again to show all reversal states.</p>
    </div>

    {/* 🧭 15m Trade Setup Filter */}
    <div>
      <p className="text-gray-400 mb-2 font-semibold">🧭 15m Trade Setup:</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTradeSetupFilter(v => v === 'buy' ? 'all' : 'buy')} className={`px-3 py-1.5 rounded border font-semibold ${tradeSetupFilter === 'buy' ? 'bg-green-600 text-white border-green-400' : 'bg-gray-800 text-green-300 border-green-700 hover:bg-gray-700'}`}>BUY SETUP ({signals.filter(s => s.multiTimeframeAlignment?.['15m']?.bearishBreakout === true && s.multiTimeframeAlignment?.['15m']?.bullishDivergence?.divergence === true).length})</button>
        <button type="button" onClick={() => setTradeSetupFilter(v => v === 'sell' ? 'all' : 'sell')} className={`px-3 py-1.5 rounded border font-semibold ${tradeSetupFilter === 'sell' ? 'bg-red-600 text-white border-red-400' : 'bg-gray-800 text-red-300 border-red-700 hover:bg-gray-700'}`}>SELL SETUP ({signals.filter(s => s.multiTimeframeAlignment?.['15m']?.bullishBreakout === true && s.multiTimeframeAlignment?.['15m']?.bearishDivergence?.divergence === true).length})</button>
      </div>
      <p className="text-xs text-gray-500 mt-1">Tap the active filter again to show all trade setups.</p>
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
    label: 'UPPER-MIDDLE ZONE PUMP',
    key: 'UPPER-MIDDLE ZONE PUMP',
    count: signalCounts.upperMiddleZonePump,
    color: 'text-orange-300',
  },
  {
    label: 'UPPER-MIDDLE ZONE DUMP',
    key: 'UPPER-MIDDLE ZONE DUMP',
    count: signalCounts.upperMiddleZoneDump,
    color: 'text-orange-400',
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
    label: 'LOWER-MIDDLE ZONE PUMP',
    key: 'LOWER-MIDDLE ZONE PUMP',
    count: signalCounts.lowerMiddleZonePump,
    color: 'text-cyan-300',
  },
  {
    label: 'LOWER-MIDDLE ZONE DUMP',
    key: 'LOWER-MIDDLE ZONE DUMP',
    count: signalCounts.lowerMiddleZoneDump,
    color: 'text-cyan-400',
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

    {/* 🔎 Scanner Output Filters */}
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
          <span>Touched EMA100 (08:00–08:00 PH)</span>
          <select value={touchedEMA100Filter} onChange={(e) => setTouchedEMA100Filter(e.target.value as typeof touchedEMA100Filter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="yes">Yes — touched this session</option>
            <option value="no">No — not touched this session</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>Touched EMA100 Previous Session (08:00–08:00 PH)</span>
          <select value={touchedEMA100PreviousFilter} onChange={(e) => setTouchedEMA100PreviousFilter(e.target.value as typeof touchedEMA100PreviousFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="yes">Yes — touched previous session</option>
            <option value="no">No — not touched previous session</option>
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
          <span>Touched EMA200 Previous Session (08:00–08:00 PH)</span>
          <select value={touchedEMA200PreviousFilter} onChange={(e) => setTouchedEMA200PreviousFilter(e.target.value as typeof touchedEMA200PreviousFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="yes">Yes — touched previous session</option>
            <option value="no">No — not touched previous session</option>
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
          <span>MTF Alignment (15m / 2H / 4H / 1D / 1M)</span>
          <select value={mtfAlignmentFilter} onChange={(e) => setMtfAlignmentFilter(e.target.value as typeof mtfAlignmentFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All alignment results</option>
            <option value="5">5/5 — All five aligned</option>
            <option value="4">4 aligned — available data</option>
            <option value="3">3 aligned — available data</option>
            <option value="2">2 aligned — available data</option>
            <option value="1">1 aligned — available data</option>
            <option value="0">0 aligned — available data</option>
            <option value="na">N/A — Incomplete alignment data</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>MTF Main Trend Direction</span>
          <select value={mtfTrendDirectionFilter} onChange={(e) => setMtfTrendDirectionFilter(e.target.value as typeof mtfTrendDirectionFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All trend directions</option>
            <option value="bullish">All available timeframes Bullish</option>
            <option value="bearish">All available timeframes Bearish</option>
            <option value="mixed">Mixed — Bullish and Bearish</option>
            <option value="na">N/A — Incomplete trend data</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-300">
          <span>Funding Rate</span>
          <select value={fundingRateFilter} onChange={(e) => setFundingRateFilter(e.target.value as typeof fundingRateFilter)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white">
            <option value="all">All</option>
            <option value="positive">Positive — longs pay shorts</option>
            <option value="negative">Negative — shorts pay longs</option>
            <option value="neutral">Neutral — zero rate</option>
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
          setRsi14Filter('all');
          setPriceChange24hFilter('all');
          setTouchedEMA200Filter('all');
          setTouchedEMA100Filter('all');
          setTouchedEMA200PreviousFilter('all');
          setTouchedEMA100PreviousFilter('all');
          setEma70200CrossFilter('all');
          setFundingRateFilter('all');
          setMtfAlignmentFilter('all');
          setMtfTrendDirectionFilter('all');
          setCoinListView('not-favorites');
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
      <span className="text-green-400 font-bold">{summaryCounts.bullishMainTrendCount}</span>
    </div>
    <div className="flex items-center gap-2">
      <span>📉 Bear Trend:</span>
      <span className="text-red-400 font-bold">{summaryCounts.bearishMainTrendCount}</span>
    </div>
	</div>	

	{/* 📍 EMA14 Inside Range */}
	<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">  
    <div className="flex items-center gap-1">
      <span className="flex flex-col leading-tight">
        <span className="text-sm">📍 EMA14 Inside</span>
        <span className="text-sm">EMA70–200:</span>
      </span>
      <span className="text-yellow-400 font-bold text-lg">{summaryCounts.ema14InsideResultsCount}</span>
    </div>
</div>
		
    {/* 🔹 24h Price Change Summary */}
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
      <div className="text-white text-sm mb-2 font-semibold">🔹 24h Price Change Summary</div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-green-500 font-semibold">📈 Green: {summaryCounts.greenPriceChangeCount}</span>
        <span className="text-red-500 font-semibold">📉 Red: {summaryCounts.redPriceChangeCount}</span>     
      </div>
	</div>    

{/* 🔸 Volume Color Summary */}
<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
  <div className="text-white text-sm mb-2 font-semibold">🔸 Volume Color Summary</div>
  <div className="flex items-center gap-4 text-sm">
    <span className="text-green-400 font-semibold">🟢 Green Volume: {summaryCounts.greenVolumeCount}</span>
    <span className="text-red-400 font-semibold">🔴 Red Volume: {summaryCounts.redVolumeCount}</span>
  </div>
</div>

{/* 💰 Funding Rate Summary */}
<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
  <div className="text-white text-sm mb-2 font-semibold">💰 Funding Rate Summary</div>
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
    <span className="text-green-400 font-semibold">🟢 Positive: {summaryCounts.positiveFundingCount}</span>
    <span className="text-red-400 font-semibold">🔴 Negative: {summaryCounts.negativeFundingCount}</span>
    <span className="text-gray-300 font-semibold">⚪ Neutral: {summaryCounts.neutralFundingCount}</span>
  </div>
  <div className="text-[10px] text-gray-500 mt-1">Counts cover all active USDT perpetuals from the latest successful Binance funding snapshot.</div>
</div>
  </div>
</div>
</div>

<div className="flex flex-wrap gap-4 mb-4 items-center">
  {/* 🔸 Favorites Views — additive replacement for the old single toggle */}
  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Coin favorites views">
    <button
      type="button"
      onClick={() => setCoinListView('not-favorites')}
      aria-pressed={coinListView === 'not-favorites'}
      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
        coinListView === 'not-favorites'
          ? 'bg-yellow-500 text-gray-950 border-yellow-400'
          : 'bg-gray-800 text-gray-200 border-gray-600 hover:bg-gray-700'
      }`}
    >
      ☆ Not Yet Favorited ({favoriteCounts.notFavorites})
    </button>
    <button
      type="button"
      onClick={() => setCoinListView('favorites')}
      aria-pressed={coinListView === 'favorites'}
      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
        coinListView === 'favorites'
          ? 'bg-yellow-500 text-gray-950 border-yellow-400'
          : 'bg-gray-800 text-gray-200 border-gray-600 hover:bg-gray-700'
      }`}
    >
      ⭐ Favorites ({favoriteCounts.favorites})
    </button>
    <button
      type="button"
      onClick={() => setCoinListView('all')}
      aria-pressed={coinListView === 'all'}
      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
        coinListView === 'all'
          ? 'bg-yellow-500 text-gray-950 border-yellow-400'
          : 'bg-gray-800 text-gray-200 border-gray-600 hover:bg-gray-700'
      }`}
    >
      All Coins ({signals.length})
    </button>
  </div>

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
	  

<div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
  <span className="text-gray-300">
    Showing {filteredAndSortedSignals.length === 0 ? 0 : tablePage * TABLE_PAGE_SIZE + 1}–{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, filteredAndSortedSignals.length)} of {filteredAndSortedSignals.length} analyzed symbols
  </span>
  <div className="flex items-center gap-2">
    <button type="button" onClick={() => setTablePage(0)} disabled={tablePage === 0}
      className="px-2 py-1 rounded border border-gray-600 disabled:opacity-30 hover:bg-gray-700">First</button>
    <button type="button" onClick={() => setTablePage(page => Math.max(0, page - 1))} disabled={tablePage === 0}
      className="px-2 py-1 rounded border border-gray-600 disabled:opacity-30 hover:bg-gray-700">Previous</button>
    <span className="text-yellow-300 tabular-nums">Page {Math.min(tablePage + 1, totalTablePages)} / {totalTablePages}</span>
    <button type="button" onClick={() => setTablePage(page => Math.min(totalTablePages - 1, page + 1))} disabled={tablePage >= totalTablePages - 1}
      className="px-2 py-1 rounded border border-gray-600 disabled:opacity-30 hover:bg-gray-700">Next</button>
    <button type="button" onClick={() => setTablePage(totalTablePages - 1)} disabled={tablePage >= totalTablePages - 1}
      className="px-2 py-1 rounded border border-gray-600 disabled:opacity-30 hover:bg-gray-700">Last</button>
  </div>
</div>

<div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
  <table className="w-full text-[11px] border-collapse min-w-[1100px]">
    <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
      <tr>
        <SortableTh field="symbol" className="sticky left-0 z-30 text-left">Symbol</SortableTh>
        <SortableTh field="currentPrice">Current Price</SortableTh>
        <SortableTh field="fundingRate">Funding Fee (%)</SortableTh>
        <SortableTh field="priceChangePercent">24h Change (%)</SortableTh>
        <th className="px-3 py-2 text-center whitespace-nowrap">15m — PH Session</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">15m Trade Setup</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">15m Possible Reversal</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">Signal ({timeframe.toUpperCase()})</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">2H — PH Session</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">4H — PH Session</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">1D — PH Session</th>
        <th className="px-3 py-2 text-center whitespace-nowrap">1M — Monthly</th>
        <th className="px-2 py-2 text-center whitespace-nowrap">MTF Alignment</th>
      </tr>
    </thead>
    <tbody>
      {visibleTableSignals.map((s) => {
        const renderTimeframe = (tf: '15m' | '2h' | '4h' | '1d' | '1M') => {
          const item = s.multiTimeframeAlignment?.[tf];
          if (!item) {
            return <td key={tf} className="px-3 py-2 text-center text-gray-500">N/A — timeframe data unavailable</td>;
          }

          const touchLabel = (value: boolean | null | undefined) =>
            value === true ? 'YES' : value === false ? 'NO' : 'N/A';
          const alignmentClass = item.aligned === true ? 'text-green-400'
            : item.aligned === false ? 'text-yellow-300' : 'text-gray-500';
          const breakoutClass = (value: boolean | null) =>
            value === true ? 'text-green-400' : value === false ? 'text-gray-500' : 'text-gray-500';
          const crossover = item.latestCrossover;
          const crossoverTime = crossover?.timestamp
            ? new Date(crossover.timestamp).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
              })
            : 'N/A';

          return (
            <td key={tf} className="px-3 py-2 border-b border-gray-700 align-top min-w-[250px]">
              <div className="flex flex-col gap-1.5 leading-tight">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">{tf === '1M' ? 'Previous month close' : 'Previous PH close'}</span>
                  <strong className={
                    item.previousClose === 'green' ? 'text-green-400' :
                    item.previousClose === 'red' ? 'text-red-400' : 'text-gray-500'
                  }>
                    {item.previousClose ? item.previousClose.toUpperCase() : 'N/A'}
                  </strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Main Trend</span>
                  <strong className={
                    item.mainTrend === 'bullish' ? 'text-green-400' :
                    item.mainTrend === 'bearish' ? 'text-red-400' : 'text-gray-500'
                  }>
                    {item.mainTrend?.toUpperCase() ?? 'N/A'}
                  </strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Position Signal</span>
                  <strong className="text-white text-right">{item.positionSignal ?? 'N/A'}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Countertrend Type</span>
                  <strong className={
                    item.countertrendType === 'COUNTERTREND — RESISTANCE' ? 'text-red-400 text-right' :
                    item.countertrendType === 'COUNTERTREND — SUPPORT' ? 'text-green-400 text-right' :
                    item.countertrendType === 'WITH MAIN TREND' ? 'text-blue-300 text-right' : 'text-gray-500 text-right'
                  }>{item.countertrendType ?? 'N/A'}</strong>
                </div>
                <div className="border-t border-gray-700 pt-1 mt-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">Bearish Divergence</span>
                    <strong className={item.bearishDivergence?.divergence ? 'text-red-400' : 'text-gray-500'}>
                      {item.bearishDivergence?.available === false ? 'N/A' : item.bearishDivergence?.divergence ? 'YES' : 'NO'}
                    </strong>
                  </div>
                  {item.bearishDivergence?.divergence && (
                    <div className="text-[10px] text-gray-400">
                      High: {Number(item.bearishDivergence.previousPrice).toFixed(7)} → {Number(item.bearishDivergence.currentPrice).toFixed(7)}
                      {' | '}RSI: {Number(item.bearishDivergence.previousRSI).toFixed(2)} → {Number(item.bearishDivergence.currentRSI).toFixed(2)}
                      <div>{tf === '1M' ? 'Candle times' : 'PH candle times'}: {formatSignalExtremeTime(item.bearishDivergence.previousTimestamp)} → {formatSignalExtremeTime(item.bearishDivergence.currentTimestamp)}</div>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">Bullish Divergence</span>
                    <strong className={item.bullishDivergence?.divergence ? 'text-green-400' : 'text-gray-500'}>
                      {item.bullishDivergence?.available === false ? 'N/A' : item.bullishDivergence?.divergence ? 'YES' : 'NO'}
                    </strong>
                  </div>
                  {item.bullishDivergence?.divergence && (
                    <div className="text-[10px] text-gray-400">
                      Low: {Number(item.bullishDivergence.previousPrice).toFixed(7)} → {Number(item.bullishDivergence.currentPrice).toFixed(7)}
                      {' | '}RSI: {Number(item.bullishDivergence.previousRSI).toFixed(2)} → {Number(item.bullishDivergence.currentRSI).toFixed(2)}
                      <div>{tf === '1M' ? 'Candle times' : 'PH candle times'}: {formatSignalExtremeTime(item.bullishDivergence.previousTimestamp)} → {formatSignalExtremeTime(item.bullishDivergence.currentTimestamp)}</div>
                    </div>
                  )}
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Trend Alignment</span>
                  <strong className={alignmentClass}>{item.alignment}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Bullish / Bearish Breakout</span>
                  <span>
                    <strong className={breakoutClass(item.bullishBreakout)}>
                      {item.bullishBreakout === null ? 'N/A' : item.bullishBreakout ? 'YES' : 'NO'}
                    </strong>
                    <span className="text-gray-500"> / </span>
                    <strong className={item.bearishBreakout === true ? 'text-red-400' : 'text-gray-500'}>
                      {item.bearishBreakout === null ? 'N/A' : item.bearishBreakout ? 'YES' : 'NO'}
                    </strong>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">RSI14</span>
                  <strong className={
                    item.rsi14Zone === 'ABOVE 50' ? 'text-green-400' :
                    item.rsi14Zone === 'BELOW 50' ? 'text-red-400' : 'text-gray-500'
                  }>
                    {item.latestRSI14 === null ? 'N/A' : `${item.latestRSI14.toFixed(2)} — ${item.rsi14Zone}`}
                  </strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">EMA100 Touch (Current / Previous)</span>
                  <strong className="text-yellow-300">
                    {touchLabel(item.ema100CurrentTouch)} / {touchLabel(item.ema100PreviousTouch)}
                  </strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">EMA200 Touch (Current / Previous)</span>
                  <strong className="text-yellow-300">
                    {touchLabel(item.ema200CurrentTouch)} / {touchLabel(item.ema200PreviousTouch)}
                  </strong>
                </div>
                <div className="border-t border-gray-700 pt-1 mt-0.5">
                  <div className="text-gray-400">Latest EMA70/200 Crossover</div>
                  <strong className={
                    crossover?.direction === 'BULLISH' ? 'text-green-400' :
                    crossover?.direction === 'BEARISH' ? 'text-red-400' : 'text-gray-500'
                  }>
                    {crossover
                      ? `${crossover.direction} @ ${Number(crossover.price).toFixed(7)}`
                      : 'N/A — no historical crossover'}
                  </strong>
                  <div className="text-[10px] text-gray-500">{crossoverTime}</div>
                </div>
              </div>
            </td>
          );
        };

        return (
          <tr key={s.symbol} className="border-b border-gray-700 hover:bg-blue-800/20">
            <td className="px-1 py-2 bg-gray-900 sticky left-0 z-10 text-left truncate max-w-[100px]">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">{s.symbol}</span>
                <button
                  className="ml-1 text-yellow-400 hover:text-yellow-300"
                  onClick={() => {
                    setFavorites((prev: Set<string>) => {
                      const next = new Set(prev);
                      next.has(s.symbol) ? next.delete(s.symbol) : next.add(s.symbol);
                      return next;
                    });
                  }}
                >
                  {favorites.has(s.symbol) ? '★' : '☆'}
                </button>
              </div>
            </td>
            <td className="px-2 py-2 text-right whitespace-nowrap">
              ${Number(s.currentPrice).toFixed(7)}
            </td>
            <td className={`px-2 py-2 text-center font-semibold whitespace-nowrap ${
              !Number.isFinite(fundingRates[s.symbol]) ? 'text-gray-500' :
              fundingRates[s.symbol] > 0 ? 'text-green-400' :
              fundingRates[s.symbol] < 0 ? 'text-red-400' : 'text-gray-300'
            }`}>
              {Number.isFinite(fundingRates[s.symbol])
                ? `${fundingRates[s.symbol] > 0 ? '+' : ''}${(fundingRates[s.symbol] * 100).toFixed(4)}%`
                : 'N/A'}
            </td>
            <td className="px-2 py-2 text-center whitespace-nowrap">
              <PriceChangePercent percent={s.priceChangePercent} />
            </td>
            {renderTimeframe('15m')}
            <td className="px-3 py-2 text-center align-middle min-w-[145px]">
              {(() => {
                const item = s.multiTimeframeAlignment?.['15m'];
                const bearishAvailable = item?.bearishDivergence?.available === true;
                const bullishAvailable = item?.bullishDivergence?.available === true;
                const breakoutAvailable = item && item.bullishBreakout !== null && item.bearishBreakout !== null;
                if (!item || !breakoutAvailable || !bearishAvailable || !bullishAvailable) {
                  return <strong className="text-gray-500">N/A — incomplete 15m data</strong>;
                }

                const sellSetup = item.bullishBreakout === true && item.bearishDivergence?.divergence === true;
                const buySetup = item.bearishBreakout === true && item.bullishDivergence?.divergence === true;
                if (sellSetup && buySetup) {
                  return <strong className="text-yellow-300">CONFLICT — WAIT</strong>;
                }
                if (sellSetup) {
                  return (
                    <div className="flex flex-col gap-1 leading-tight">
                      <strong className="text-red-400 text-sm">SELL SETUP</strong>
                      <span className="text-[10px] text-gray-400">Bullish breakout + bearish divergence</span>
                    </div>
                  );
                }
                if (buySetup) {
                  return (
                    <div className="flex flex-col gap-1 leading-tight">
                      <strong className="text-green-400 text-sm">BUY SETUP</strong>
                      <span className="text-[10px] text-gray-400">Bearish breakout + bullish divergence</span>
                    </div>
                  );
                }
                return <strong className="text-gray-500">WAIT</strong>;
              })()}
            </td>
            <td className="px-3 py-2 text-center align-middle min-w-[190px]">
              {(() => {
                const reversal = s.multiTimeframeAlignment?.['15m']?.possibleReversal;
                if (!reversal || reversal.available !== true) {
                  return <strong className="text-gray-500">N/A — incomplete data</strong>;
                }
                if (reversal.signal === 'WAIT') {
                  return <strong className="text-gray-500">WAIT</strong>;
                }
                const isSell = reversal.signal === 'SELL';
                return (
                  <div className="flex flex-col gap-1 leading-tight">
                    <strong className={`text-sm ${isSell ? 'text-red-400' : 'text-green-400'}`}>
                      POSSIBLE REVERSAL — {reversal.signal}
                    </strong>
                    <span className="text-[10px] text-gray-300">
                      {isSell ? 'Bullish trend · Higher high' : 'Bearish trend · Lower low'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Price: {Number(reversal.previousPrice).toPrecision(7)} → {Number(reversal.breakoutPrice).toPrecision(7)}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      RSI14: {Number(reversal.rsiExtreme).toFixed(2)} → {Number(reversal.currentRSI).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      Price: {formatSignalExtremeTime(reversal.priceTimestamp)}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      RSI extreme: {formatSignalExtremeTime(reversal.rsiExtremeTimestamp)}
                    </span>
                  </div>
                );
              })()}
            </td>
            <td className="px-2 py-2 text-center align-top min-w-[230px]">
              {(() => {
                const signal = getSignalValue(s);
                const pd = getPumpDump(s);
                const timestamps: number[] = Array.isArray(s.rsi14Timestamps) ? s.rsi14Timestamps : [];
                const highTime = pd ? timestamps[pd.highIndex] : undefined;
                const lowTime = pd ? timestamps[pd.lowIndex] : undefined;
                const directionLabel = pd?.direction === 'pump' ? 'PUMP'
                  : pd?.direction === 'dump' ? 'DUMP' : pd ? 'NEUTRAL' : 'N/A';
                const directionClass = pd?.direction === 'pump' ? 'text-green-400'
                  : pd?.direction === 'dump' ? 'text-red-400' : 'text-gray-400';
                return (
                  <div className="flex flex-col gap-1 leading-tight text-[10px]">
                    <strong className={`text-xs ${directionClass}`}>{directionLabel} — {signal}</strong>
                    {pd ? (
                      <>
                        <div className="text-white">Δ {pd.pumpStrength.toFixed(2)} <span className="text-gray-500">(RSI High − Low)</span></div>
                        <div className="text-gray-300">H: {pd.recentHigh.toFixed(2)} <span className="text-gray-500">@ {formatSignalExtremeTime(highTime)}</span></div>
                        <div className="text-gray-300">L: {pd.recentLow.toFixed(2)} <span className="text-gray-500">@ {formatSignalExtremeTime(lowTime)}</span></div>
                        <div className="text-gray-400">Start → End: {pd.startRSI.toFixed(2)} → {pd.endRSI.toFixed(2)}</div>
                      </>
                    ) : <span className="text-gray-500">RSI data unavailable</span>}
                  </div>
                );
              })()}
            </td>
            {renderTimeframe('2h')}
            {renderTimeframe('4h')}
            {renderTimeframe('1d')}
            {renderTimeframe('1M')}
            <td className={`px-2 py-2 text-center font-bold whitespace-nowrap ${
              s.overallMultiTimeframeAlignment?.startsWith('5/') ? 'text-green-400' :
              s.overallMultiTimeframeAlignment?.startsWith('4/') || s.overallMultiTimeframeAlignment?.startsWith('3/') || s.overallMultiTimeframeAlignment?.startsWith('2/') ? 'text-yellow-300' : 'text-gray-400'
            }`}>
              {s.overallMultiTimeframeAlignment ?? 'N/A'}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
<div className="flex justify-end mt-2">
  <div className="flex items-center gap-2 text-xs">
    <button type="button" onClick={() => setTablePage(page => Math.max(0, page - 1))} disabled={tablePage === 0}
      className="px-2 py-1 rounded border border-gray-600 disabled:opacity-30 hover:bg-gray-700">Previous</button>
    <span className="text-yellow-300 tabular-nums">Page {Math.min(tablePage + 1, totalTablePages)} / {totalTablePages}</span>
    <button type="button" onClick={() => setTablePage(page => Math.min(totalTablePages - 1, page + 1))} disabled={tablePage >= totalTablePages - 1}
      className="px-2 py-1 rounded border border-gray-600 disabled:opacity-30 hover:bg-gray-700">Next</button>
  </div>
</div>

            
    </div>                    
  );
}
  