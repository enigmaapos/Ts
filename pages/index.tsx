import { useEffect, useState } from "react";
import { useCryptoSignals } from "../hooks/useCryptoSignals";
import TimeframeSelector from "../components/TimeframeSelector";
import FilterControls from "../components/FilterControls";
import SignalsTable from "../components/SignalsTable";
import { Timeframe } from "../utils/calculations";

export default function Home() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const { signals, loading, lastUpdatedMap, timeframes } = useCryptoSignals(timeframe);

  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [sortField, setSortField] = useState<string>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [trendFilter, setTrendFilter] = useState<string | null>(null);
  const [signalFilter, setSignalFilter] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("favorites");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setFavorites(new Set(parsed));
        }
      } catch (err) {
        console.error("Failed to parse favorites:", err);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  const toggleFavorite = (symbol: string) => {
    setFavorites(prev => {
      const updated = new Set(prev);
      updated.has(symbol) ? updated.delete(symbol) : updated.add(symbol);
      return updated;
    });
  };

  const handleTimeframeSwitch = (tf: Timeframe) => {
    setTimeframe(tf);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-lg">Fetching signals...</p>
        </div>
      </div>
    );
  }

  return (
    
      <div className="min-h-screen bg-gray-900 text-white p-4 overflow-auto">
          <h2 className="text-2xl font-bold tracking-wide text-yellow-400">
            ⏱ Timeframe: <span className="text-white">{timeframe.toUpperCase()}</span>
          </h2>
          <TimeframeSelector
            timeframe={timeframe}
            setTimeframe={handleTimeframeSwitch}
            timeframes={timeframes}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
          {/* Filters */}
          <div className="flex flex-col gap-6">
            <FilterControls
              signals={signals}
              search={search}
              setSearch={setSearch}
              showOnlyFavorites={showOnlyFavorites}
              setShowOnlyFavorites={setShowOnlyFavorites}
              favorites={favorites}
              setFavorites={setFavorites}
              trendFilter={trendFilter}
              setTrendFilter={setTrendFilter}
              signalFilter={signalFilter}
              setSignalFilter={setSignalFilter}
            />
          </div>

          {/* Sticky Summary Panel */}
          <div className="hidden lg:block sticky top-6 self-start max-h-[calc(100vh-80px)] overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-sm shadow-md scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            <div className="flex flex-col gap-3">
              <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
                <div className="flex items-center gap-2">
                  <span>📈 Bull Trend:</span>
                  <span className="text-green-400 font-bold">-</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>📉 Bear Trend:</span>
                  <span className="text-red-400 font-bold">-</span>
                </div>
              </div>

              <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
                <div className="flex items-center gap-1">
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm">📍 EMA14 Inside</span>
                    <span className="text-sm">EMA70–200:</span>
                  </span>
                  <span className="text-yellow-400 font-bold text-lg">-</span>
                </div>
              </div>

              <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
                <div className="text-white text-sm mb-2 font-semibold">🔹 24h Price Change Summary</div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-500 font-semibold">📈 Green: -</span>
                  <span className="text-red-500 font-semibold">📉 Red: -</span>
                </div>
              </div>

              <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
                <div className="text-white text-sm mb-2 font-semibold">🔸 Volume Color Summary</div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-400 font-semibold">🟢 Green Volume: -</span>
                  <span className="text-red-400 font-semibold">🔴 Red Volume: -</span>
                </div>
              </div>

              {/* Strategy Note */}
              <div className="border border-gray-700 rounded-lg p-4 bg-gray-900 shadow-sm text-sm break-words">
                <div className="text-yellow-300 font-bold mb-2">⚠️ Strategy Note:</div>
                <ul className="list-disc list-inside text-yellow-200 space-y-2">
                  <li>
                    <span className="text-white">If the current day has a Max Zone Pump,</span> it often leads to a
                    <span className="text-red-400 font-semibold"> Bearish candle</span> the next day.
                  </li>
                  <li>
                    <span className="text-white font-semibold">Max Zone Pump Decision Flow:</span>
                    <ul className="list-disc list-inside ml-5 mt-1 space-y-1">
                      <li>
                        <span className="text-green-400 font-semibold">Bullish Sentiment:</span> If the 24H change is green (higher %),
                        expect a <span className="font-semibold">bullish breakout with divergence</span>.
                        <br />
                        → Start selling at the <span className="font-semibold text-red-400">first red candle</span> with
                        RSI &lt; 50 on the <span className="text-white">1-minute</span> timeframe.
                      </li>
                      <li>
                        <span className="text-red-400 font-semibold">Bearish Sentiment:</span> If the 24H change is red (higher %),
                        it likely signals a <span className="font-semibold">failed breakout</span>.
                        <br />
                        → Also sell at the <span className="font-semibold text-red-400">first red candle</span> with
                        RSI &lt; 50 on the <span className="text-white">1-minute</span> timeframe.
                      </li>
                    </ul>
                  </li>
                  <li>
                    <span className="text-white font-semibold">Friday Behavior:</span>
                    Fridays usually show a <span className="text-red-400 font-semibold">bearish trend</span>,
                    but occasionally have a <span className="text-green-400 font-semibold">small bullish move</span> before closing.
                  </li>
                  <li>
                    After Max Zone Pump:
                    <br />
                    → Watch for the <span className="font-semibold text-red-400">first red candle</span> where RSI drops below 50.
                    That candle acts as a decision point.
                  </li>
                  <li>
                    If price stays <span className="font-semibold text-green-400">above the opening</span> of that red candle,
                    it becomes a <span className="text-green-400 font-bold">Buy Signal</span>.
                  </li>
                  <li>
                    If price breaks <span className="font-semibold text-red-400">below the opening</span> of that red candle,
                    it's a clear <span className="text-red-400 font-bold">Sell Signal</span>.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-6 overflow-x-auto">
          <SignalsTable
            signals={signals}
            lastUpdatedMap={lastUpdatedMap}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
            sortField={sortField}
            setSortField={setSortField}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            searchTerm={search.trim().toLowerCase()}
            showOnlyFavorites={showOnlyFavorites}
            trendFilter={trendFilter}
            signalFilter={signalFilter}
          />
        </div>
  );
}
