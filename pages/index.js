import { useEffect, useState } from 'react';

export default function Home() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/breakouts')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Binance USDT Perpetual Breakouts</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="table-auto w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1">Pair</th>
              <th className="border px-2 py-1">Breakout</th>
              <th className="border px-2 py-1">Prev High</th>
              <th className="border px-2 py-1">Prev Low</th>
              <th className="border px-2 py-1">Current</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="text-center">
                <td className="border px-2 py-1">{row.symbol}</td>
                <td className="border px-2 py-1">{row.breakout}</td>
                <td className="border px-2 py-1">{row.prevHigh}</td>
                <td className="border px-2 py-1">{row.prevLow}</td>
                <td className="border px-2 py-1">{row.currentPrice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
