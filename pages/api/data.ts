import { useEffect, useState } from 'react';

export interface SignalData {
  symbol: string;
  signal: string;
  latestRSI: number;
  // You can add more fields here if needed
}

export const useCryptoSignals = () => {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = "https://ts-five-umber.vercel.app/api/data"; // Change to `/api/data` for local dev

  useEffect(() => {
    let isMounted = true;

    const fetchSignals = async () => {
      if (!isMounted) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data: SignalData[] = await response.json();

        if (isMounted) {
          setSignals(data);
        }
      } catch (err: any) {
        console.error("Failed to fetch signal data:", err);
        if (isMounted) {
          setError(err.message || "Unknown error");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 60000); // Refresh every 60s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { signals, loading, error };
};
