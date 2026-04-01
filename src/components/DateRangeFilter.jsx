export default function DateRangeFilter({ preset, setPreset, presets, compareEnabled, setCompareEnabled, customStart, customEnd, setCustomStart, setCustomEnd }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Object.entries(presets).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setPreset(key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            preset === key
              ? 'bg-brand-cyan text-white'
              : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          {label}
        </button>
      ))}
      {preset === 'custom' && setCustomStart && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={customStart || ''}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-[#1a1d20] border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5 focus:border-brand-cyan focus:outline-none"
          />
          <span className="text-gray-500 text-sm">to</span>
          <input
            type="date"
            value={customEnd || ''}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-[#1a1d20] border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5 focus:border-brand-cyan focus:outline-none"
          />
        </div>
      )}
      {setCompareEnabled && (
        <button
          onClick={() => setCompareEnabled(!compareEnabled)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ml-2 ${
            compareEnabled
              ? 'bg-purple-600 text-white'
              : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          Compare
        </button>
      )}
    </div>
  );
}
