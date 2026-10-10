import React from 'react';
import { MapPin, RefreshCw, LogIn, UserPlus, LogOut, User } from 'lucide-react';
import { UserSession } from '../types';

interface NavbarProps {
  currentLocation: string;
  user: UserSession | null;
  onChangeLocation: () => void;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  user,
  onChangeLocation,
  onOpenLogin,
  onOpenSignup,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 h-14">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-sm">
            Z
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-slate-900 text-base tracking-tight">
              Zeus
            </span>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              EnviroWatch
            </span>
          </div>
        </div>

        {/* Selected Location Pill + Change */}
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
          <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="max-w-[130px] sm:max-w-[220px] truncate font-medium">
            {currentLocation}
          </span>
          <button
            onClick={onChangeLocation}
            className="ml-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
          >
            Change
          </button>
        </div>

        {/* User Auth Controls */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-700 font-medium hidden sm:inline max-w-[120px] truncate">
                {user.name}
              </span>
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <LogOut className="h-3 w-3" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenLogin}
                className="rounded px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
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
