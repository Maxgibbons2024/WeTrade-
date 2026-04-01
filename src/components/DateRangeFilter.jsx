export default function DateRangeFilter({ preset, setPreset, presets, compareEnabled, setCompareEnabled }) {
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
