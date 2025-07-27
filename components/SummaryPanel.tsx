export const SummaryPanel: React.FC<SummaryPanelProps> = ({ data, title = "Summary Panel", description }) => {
  const [sortField, setSortField] = useState<keyof SummaryDataItem | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: keyof SummaryDataItem) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortField) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue == null) return sortOrder === 'asc' ? -1 : 1;
      if (bValue == null) return sortOrder === 'asc' ? 1 : -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * (sortOrder === 'asc' ? 1 : -1);
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * (sortOrder === 'asc' ? 1 : -1);
      }

      return 0;
    });
  }, [data, sortField, sortOrder]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-sm shadow-md mb-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-blue-400">{title}</h2>
        {description && <p className="text-gray-400">{description}</p>}

        {data.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No summary data available.</p>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="min-w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-700 uppercase tracking-wider sticky top-0 z-20">
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
