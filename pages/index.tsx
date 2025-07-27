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

  // Load favorites from localStorage
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

  // Save favorites to localStorage
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
    <div className="min-h-screen bg-gray-900 text-white px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-2">
        <h2 className="text-2xl font-bold tracking-wide text-yellow-400">
          ⏱ Timeframe: <span className="text-white">{timeframe.toUpperCase()}</span>
        </h2>
        <TimeframeSelector
          timeframe={timeframe}
          setTimeframe={handleTimeframeSwitch}
          timeframes={timeframes}
        />
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
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

        {/* Search and Favorites Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyFavorites}
              onChange={() => setShowOnlyFavorites(prev => !prev)}
              className="accent-yellow-400"
            />
            <span>Show only favorites</span>
          </label>

          <div className="relative w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 p-2 pr-16 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-200"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 bg-red-500 hover:bg-red-600 rounded text-white transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
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
