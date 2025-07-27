import React from 'react';
import { Timeframe } from '../utils/calculations';

interface TimeframeSelectorProps {
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;
  timeframes: readonly Timeframe[];
}

const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  timeframe,
  setTimeframe,
  timeframes,
}) => {
  return (
    <div className="flex flex-wrap gap-2 my-4">
      {timeframes.map((tf) => (
        <button
          key={tf}
          onClick={() => setTimeframe(tf)}
          className={`px-4 py-2 rounded-xl font-semibold transition-all duration-200 border
            ${timeframe === tf
              ? 'bg-yellow-400 text-black border-yellow-300 shadow-md scale-105'
              : 'bg-gray-800 text-white border-gray-600 hover:bg-gray-700 hover:border-gray-400'}`}
        >
          {tf.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

export default TimeframeSelector;
