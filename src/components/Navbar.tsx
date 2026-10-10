import React from 'react';
import { MapPin, LogOut, Sun, Moon } from 'lucide-react';
import { UserSession } from '../types';

interface NavbarProps {
  currentLocation: string;
  user: UserSession | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onChangeLocation: () => void;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  user,
  darkMode,
  onToggleDarkMode,
  onChangeLocation,
  onOpenLogin,
  onOpenSignup,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 transition-colors">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 h-14">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-sm shadow-xs">
            Z
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight">
              Zeus
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
              EnviroWatch
            </span>
          </div>
        </div>

        {/* Selected Location Pill + Change */}
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="max-w-[110px] sm:max-w-[200px] truncate font-medium">
            {currentLocation}
          </span>
          <button
            onClick={onChangeLocation}
            className="ml-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            Change
          </button>
        </div>

        {/* Right Controls: Dark Mode Toggle + User Auth */}
        <div className="flex items-center gap-2">
          {/* Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600" />
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium hidden sm:inline max-w-[110px] truncate">
                {user.name}
              </span>
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <LogOut className="h-3 w-3" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenLogin}
                className="rounded px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Log In
              </button>
              <button
                onClick={onOpenSignup}
                className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
