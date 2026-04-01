export default function ErrorState({ message }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
        <svg className="w-8 h-8 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-red-400 text-sm font-medium">{message || 'Something went wrong'}</p>
        <p className="text-gray-500 text-xs mt-1">Check your Supabase connection and try again.</p>
      </div>
    </div>
  );
}
