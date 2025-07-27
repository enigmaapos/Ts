import React from 'react';

type PriceChangePercentProps = {
  percent: number;
  peakPercent?: number;
  dropThreshold?: number;
  lowPercent?: number;
  recoveryThreshold?: number;
};

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

export default PriceChangePercent;
