import React from 'react';
import { Timeframe } from '../utils/calculations'; // Import Timeframe type

interface TimeframeSelectorProps {
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;
  timeframes: readonly Timeframe[]; // Use readonly array from useCryptoSignals
}

const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({ timeframe, setTimeframe, timeframes }) => {
  return (
    <div className="flex space-x-4 my-4">
      {timeframes.map((tf) => (
        <button
          key={tf}
          onClick={() => setTimeframe(tf)}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-md
            ${timeframe === tf
              ? 'bg-yellow-400 text-black scale-105'
              : 'bg-gray-800 text-white hover:bg-gray-700'}`}
        >
          {tf.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

export default TimeframeSelector;
