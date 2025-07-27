import { useEffect, useState, useMemo } from "react";
import { useCryptoSignals } from "./hooks/useCryptoSignals";
import TimeframeSelector from "../components/TimeframeSelector";
import FilterControls from "../components/FilterControls";
import SignalsTable from "../components/SignalsTable";
import { getRecentRSIDiff, getSignal, Timeframe } from "../utils/calculations";

export default function Home() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1d'); // Explicitly type timeframe
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

  const handleTimeframeSwitch = (tf: Timeframe) => {
    setTimeframe(tf);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-yellow-400 border-opacity-50 mx-auto mb-4"></div>
          <p className="text-lg">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 overflow-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4 tracking-wide">
        ⏱ Current Timeframe: <span className="text-white">{timeframe.toUpperCase()}</span>
      </h2>

      <TimeframeSelector
        timeframe={timeframe}
        setTimeframe={handleTimeframeSwitch}
        timeframes={timeframes}
      />

      <FilterControls
        signals={signals} // Pass signals for calculating counts in FilterControls
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

      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={showOnlyFavorites}
            onChange={() => setShowOnlyFavorites((prev) => !prev)}
            className="accent-yellow-400"
          />
          Show only favorites
        </label>

        <div className="relative">
          <input
            type="text"
            placeholder="Search symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="p-2 pr-20 rounded bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
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
