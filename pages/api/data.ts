import { useEffect, useState } from 'react';

export interface SignalData {
  symbol: string;
  signal: string;
  latestRSI: number;
  // Add other properties if needed
}

export const useCryptoSignals = () => {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const response = await fetch('/api/data'); // ✅ Or full URL if remote
        const data: SignalData[] = await response.json();
        setSignals(data);
      } catch (error) {
        console.error('Failed to fetch signal data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, []);

  return { signals, loading };
};
