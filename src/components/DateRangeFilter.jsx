export default function DateRangeFilter({ preset, setPreset, presets, compareEnabled, setCompareEnabled, customStart, customEnd, setCustomStart, setCustomEnd }) {
  return (
    <div className="space-y-2 md:space-y-0">
      {/* Mobile: collapse the 7+ preset buttons into a native select.
          The button row gets ugly on phones (wraps to 3 rows) and the
          dropdown gives proper iOS/Android pickers + huge touch targets. */}
      <div className="flex md:hidden items-center gap-2">
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          aria-label="Date range preset"
          className="flex-1 bg-brand-darker border border-gray-800 text-white text-sm rounded-lg px-3 py-2.5 focus:border-brand-cyan focus:outline-none"
        >
          {Object.entries(presets).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {setCompareEnabled && (
          <button
            type="button"
            onClick={() => setCompareEnabled(!compareEnabled)}
            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              compareEnabled
                ? 'bg-purple-600 text-white'
                : 'bg-brand-darker text-gray-400 border border-gray-800'
            }`}
          >
            Compare
          </button>
        )}
      </div>

      {/* Desktop: original button row */}
      <div className="hidden md:flex flex-wrap items-center gap-2">
        {Object.entries(presets).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreset(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              preset === key
                ? 'bg-brand-cyan text-white'
                : 'bg-brand-darker text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
        {setCompareEnabled && (
          <button
            type="button"
            onClick={() => setCompareEnabled(!compareEnabled)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ml-2 ${
              compareEnabled
                ? 'bg-purple-600 text-white'
                : 'bg-brand-darker text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            Compare
          </button>
        )}
      </div>

      {/* Custom date inputs — show on both, full-width row on mobile */}
      {preset === 'custom' && setCustomStart && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customStart || ''}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-brand-darker border border-gray-700 text-white text-sm rounded-lg px-2 py-2 focus:border-brand-cyan focus:outline-none"
          />
          <span className="text-gray-500 text-sm">to</span>
          <input
            type="date"
            value={customEnd || ''}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-brand-darker border border-gray-700 text-white text-sm rounded-lg px-2 py-2 focus:border-brand-cyan focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
