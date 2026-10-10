import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 py-4 mt-8 transition-colors">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-200">Zeus</span> — Environmental monitoring prototype for DTU, Delhi.
        </div>
        <div>
          Simulated demonstration data only.
        </div>
      </div>
    </footer>
  );
};
