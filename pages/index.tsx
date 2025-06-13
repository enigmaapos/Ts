import React, { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { CandlestickController, CandlestickElement } from "chartjs-chart-financial";
import 'chartjs-adapter-date-fns';
import axios from "axios";

// Register Chart.js plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CandlestickController,
  CandlestickElement
);

type Candle = {
  x: number; // timestamp
  o: number;
  h: number;
  l: number;
  c: number;
};

type Signal = {
  time: number;
  type: "bullish" | "bearish";
  reason: string;
};

export default function BitcoinSignalAnalyzer() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [ema70, setEma70] = useState<number[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);

  const fetchCandles = async () => {
    try {
      const response = await axios.get(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=15m&limit=500"
      );

      const raw = response.data.data.reverse();

      const formatted: Candle[] = raw.map((candle: string[]) => ({
        x: new Date(parseInt(candle[0])).getTime(),
        o: parseFloat(candle[1]),
        h: parseFloat(candle[2]),
        l: parseFloat(candle[3]),
        c: parseFloat(candle[4]),
      }));

      setCandles(formatted);
    } catch (error) {
      console.error("Failed to fetch candles:", error);
    }
  };

  const calculateEMA = (period: number, closes: number[]) => {
    const ema: number[] = [];
    const k = 2 / (period + 1);

    closes.forEach((close, i) => {
      if (i < period) {
        ema.push(NaN);
      } else if (i === period) {
        const sma = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
        ema.push(sma);
      } else {
        const prevEma = ema[ema.length - 1];
        ema.push((close - prevEma) * k + prevEma);
      }
    });

    return ema;
  };

  const findATH = (candles: Candle[]) => Math.max(...candles.map(c => c.h));
  const findATL = (candles: Candle[]) => Math.min(...candles.map(c => c.l));

  const detectSignals = (candles: Candle[], ema: number[]) => {
    const signals: Signal[] = [];

    const ath = findATH(candles);
    const atl = findATL(candles);

    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      const prevEma = ema[i - 1];
      const currEma = ema[i];

      // Conditions for bullish reversal
      const bullish =
        prev.l < curr.l &&
        prev.c < prevEma &&
        curr.c > currEma &&
        Math.abs(curr.c - atl) / atl < 0.01;

      // Conditions for bearish reversal
      const bearish =
        prev.h > curr.h &&
        prev.c > prevEma &&
        curr.c < currEma &&
        Math.abs(curr.c - ath) / ath < 0.01;

      if (bullish) {
        signals.push({
          time: curr.x,
          type: "bullish",
          reason: "Near ATL & crossed above EMA70",
        });
      }

      if (bearish) {
        signals.push({
          time: curr.x,
          type: "bearish",
          reason: "Near ATH & crossed below EMA70",
        });
      }
    }

    return signals;
  };

  useEffect(() => {
    fetchCandles();
  }, []);

  useEffect(() => {
    if (candles.length > 0) {
      const closes = candles.map(c => c.c);
      const ema = calculateEMA(70, closes);
      setEma70(ema);
      const detected = detectSignals(candles, ema);
      setSignals(detected);
    }
  }, [candles]);

  const chartData = {
    datasets: [
      {
        label: "BTC/USDT 15m",
        data: candles,
        type: "candlestick",
        borderColor: "rgba(0,0,0,1)",
        color: {
          up: "#26a69a",
          down: "#ef5350",
          unchanged: "#888",
        },
      },
      {
        label: "EMA70",
        data: candles.map((c, i) => ({ x: c.x, y: ema70[i] })),
        type: "line" as const,
        borderColor: "blue",
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  };

  const options = {
    scales: {
      x: {
        type: "time" as const,
        time: {
          unit: "hour",
        },
      },
      y: {
        beginAtZero: false,
      },
    },
    plugins: {
      legend: { display: true },
      tooltip: { mode: "index", intersect: false },
    },
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">BTC 15m Signal Analyzer</h2>
      <Chart type="candlestick" data={chartData} options={options} />
      <div className="mt-6">
        <h3 className="font-semibold">Signals</h3>
        <ul className="mt-2">
          {signals.map((signal, i) => (
            <li key={i} className={`text-${signal.type === "bullish" ? "green-600" : "red-600"}`}>
              [{new Date(signal.time).toLocaleString()}] {signal.type.toUpperCase()} - {signal.reason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
