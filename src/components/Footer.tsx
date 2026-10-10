import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-white py-4 mt-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <div>
          <span className="font-semibold text-slate-700">Zeus</span> — Environmental monitoring prototype for DTU, Delhi.
        </div>
        <div>
          Simulated demonstration data only.
        </div>
      </div>
    </footer>
  );
};
