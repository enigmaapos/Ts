import React, { useState, useMemo } from 'react';

// Define a simple interface for the data items this panel will display.
// You should adjust this to match the actual structure of your data.
interface SummaryDataItem {
  id: string; // Unique identifier for each row
  name: string; // e.g., "BTCUSDT", "Overall Market"
  value: number; // e.g., a current price, total volume, or a metric score
  change: number; // e.g., 24h price change, percentage change for a metric
  // Add any other properties your summary items might have
}

// Define the props for the SummaryPanel component
interface SummaryPanelProps {
  // This panel likely takes an array of data to display
  data: SummaryDataItem[];
  title?: string; // Optional title for the panel
  description?: string; // Optional description
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({ data, title = "Summary Panel", description }) => {
  // State to manage the current sort field and order
  const [sortField, setSortField] = useState<keyof SummaryDataItem | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // Default to descending for numbers, adjust as needed

  // Function to handle sorting when a column header is clicked
  const handleSort = (field: keyof SummaryDataItem) => {
    if (sortField === field) {
      // If clicking the same field, toggle the sort order
      setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      // If clicking a new field, set it as the sort field and default to 'asc'
      // You can change 'asc' to 'desc' here if you want new fields to default to descending
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Memoize the sorted data to avoid re-sorting on every render if props haven't changed
  const sortedData = useMemo(() => {
    if (!sortField) {
      return data; // No sorting applied
    }

    const sortableData = [...data]; // Create a shallow copy to avoid mutating the prop

    return sortableData.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      // Handle null/undefined values if your data might have them
      if (aValue === null || aValue === undefined) return sortOrder === 'asc' ? -1 : 1;
      if (bValue === null || bValue === undefined) return sortOrder === 'asc' ? 1 : -1;

      // Basic numeric or string comparison
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * (sortOrder === 'asc' ? 1 : -1);
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * (sortOrder === 'asc' ? 1 : -1);
      }
      // Add more specific comparison logic if needed for other types or custom sort rules

      return 0; // No change in order if types are incomparable or unknown
    });
  }, [data, sortField, sortOrder]);

  return (
     <div className="sticky top-0 z-30 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-sm shadow-md">
  <div className="flex flex-col gap-3">
 
      <h2 className="text-2xl font-bold text-blue-400 mb-2">{title}</h2>
      {description && <p className="text-gray-400 text-sm mb-4">{description}</p>}

      {data.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No summary data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-700 uppercase tracking-wider">
              <tr>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-600 rounded-tl-lg"
                  onClick={() => handleSort('name')}
                >
                  Metric {sortField === 'name' && (sortOrder === 'asc' ? '🔼' : '🔽')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-600"
                  onClick={() => handleSort('value')}
                >
                  Value {sortField === 'value' && (sortOrder === 'asc' ? '🔼' : '🔽')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-600 rounded-tr-lg"
                  onClick={() => handleSort('change')}
                >
                  24h Change {sortField === 'change' && (sortOrder === 'asc' ? '🔼' : '🔽')}
                </th>
                {/* Add more headers here for other sortable fields */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sortedData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-750 transition-colors duration-150">
                  <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                  <td className="px-4 py-3">{item.value.toFixed(2)}</td>
                  <td className={`px-4 py-3 ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.change.toFixed(2)}%
                  </td>
                  {/* Render other item properties here */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
       </div>
  );
};
