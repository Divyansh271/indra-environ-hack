import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  Lock,
  User,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  KeyRound,
} from 'lucide-react';
import { UserSession } from '../types';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'signup';
  onClose: () => void;
  onSuccess: (user: UserSession) => void;
}

const COMMON_COUNTRY_CODES = [
  { code: '+91', country: 'IN', label: 'India (+91)' },
  { code: '+1', country: 'US', label: 'United States (+1)' },
  { code: '+44', country: 'UK', label: 'United Kingdom (+44)' },
  { code: '+971', country: 'AE', label: 'UAE (+971)' },
  { code: '+65', country: 'SG', label: 'Singapore (+65)' },
  { code: '+61', country: 'AU', label: 'Australia (+61)' },
  { code: '+49', country: 'DE', label: 'Germany (+49)' },
  { code: '+33', country: 'FR', label: 'France (+33)' },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Form Fields
  const [countryCode, setCountryCode] = useState<string>('+91');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Reset & sync state when opening modal
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setLoginMethod('password');
      setOtpSent(false);
      setStatusMessage(null);
      setErrors({});
      setPassword('');
      setConfirmPassword('');
      setOtpCode('');
    }
  }, [isOpen, initialMode]);

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  // Clean phone input and format E.164 phone string
  const formatE164Phone = (code: string, rawNumber: string): string => {
    // Strip non-digits
    const cleanDigits = rawNumber.replace(/\D/g, '');
    const cleanCode = code.startsWith('+') ? code : `+${code}`;
    return `${cleanCode}${cleanDigits}`;
  };

  const handlePhoneChange = (val: string) => {
    // If user pastes full international number e.g. "+919876543210"
    const trimmed = val.trim();
    if (trimmed.startsWith('+')) {
      for (const item of COMMON_COUNTRY_CODES) {
        if (trimmed.startsWith(item.code)) {
          setCountryCode(item.code);
          setPhoneNumber(trimmed.slice(item.code.length).replace(/\D/g, ''));
          if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
          return;
        }
      }
    }
    // Otherwise keep digits
    const digitsOnly = val.replace(/\D/g, '');
    setPhoneNumber(digitsOnly);
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
  };

  const validatePhone = (digits: string): boolean => {
    if (!digits) return false;
    // Standard phone length (e.g. 10 digits for India/US, 7-15 digits globally)
    return digits.length >= 7 && digits.length <= 15;
  };

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (mode === 'signup' && !name.trim()) {
      errs.name = 'Full name is required';
    }

    if (!phoneNumber) {
      errs.phone = 'Mobile phone number is required';
    } else if (!validatePhone(phoneNumber)) {
      errs.phone = 'Please enter a valid mobile number (e.g. 10 digits)';
    }

    if (mode === 'signup' || (mode === 'login' && loginMethod === 'password')) {
      if (!password) {
        errs.password = 'Password is required';
      } else if (password.length < 6) {
        errs.password = 'Password must be at least 6 characters';
      }
    }

    if (mode === 'signup') {
      if (!confirmPassword) {
        errs.confirmPassword = 'Confirm your password';
      } else if (confirmPassword !== password) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const getCleanErrorMessage = (err: any): string => {
    const msg = err?.message || String(err || '');
    if (
      msg.includes('phone_provider_disabled') ||
      msg.includes('Phone signups are disabled') ||
      msg.includes('Phone logins are disabled') ||
      msg.includes('Unsupported phone provider')
    ) {
      return 'Phone provider is not active in your Supabase Auth settings. In Supabase Dashboard -> Authentication -> Providers -> Phone: turn on "Enable Phone provider" and save.';
    }
    if (msg.includes('Invalid login credentials')) {
      return 'Invalid phone number or password. Please verify your credentials.';
    }
    if (msg.includes('Token has expired or is invalid')) {
      return 'The SMS verification code is incorrect or expired. Please request a new one.';
    }
    return msg;
  };

  // Helper to record user in public.users table
  const syncUserToDatabase = async (userId: string, userName: string, fullPhone: string) => {
    try {
      await supabase.from('users').upsert({
        id: userId,
        name: userName,
        phone: fullPhone,
      });
    } catch (e) {
      console.warn('Could not upsert into public.users:', e);
    }
  };

  // 1. Submit for Password Login or Sign Up
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // If we're verifying OTP
    if (otpSent) {
      await handleVerifyOtp();
      return;
    }

    // If login with OTP requested
    if (mode === 'login' && loginMethod === 'otp') {
      await handleSendOtp();
      return;
    }

    if (!validate()) return;

    const fullPhone = formatE164Phone(countryCode, phoneNumber);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          phone: fullPhone,
          password,
        });

        if (error) {
          setStatusMessage({ type: 'error', text: getCleanErrorMessage(error) });
          setIsLoading(false);
          return;
        }

        const userMetadata = data.user?.user_metadata;
        const displayName =
          userMetadata?.full_name ||
          userMetadata?.name ||
          data.user?.phone ||
          `Resident (${fullPhone})`;

        const sessionUser: UserSession = {
          id: data.user?.id,
          name: displayName,
          phone: data.user?.phone || fullPhone,
        };

        setStatusMessage({ type: 'success', text: `Welcome back, ${displayName}!` });
        setTimeout(() => {
          onSuccess(sessionUser);
          onClose();
        }, 600);
      } else {
        // Sign Up with Phone & Password
        const { data, error } = await supabase.auth.signUp({
          phone: fullPhone,
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) {
          setStatusMessage({ type: 'error', text: getCleanErrorMessage(error) });
          setIsLoading(false);
          return;
        }

        if (!data.user) {
          setStatusMessage({
            type: 'error',
            text: 'Sign up did not return a user. Please try again.',
          });
          setIsLoading(false);
          return;
        }

        // If session exists immediately, user is verified and logged in
        if (data.session) {
          await syncUserToDatabase(data.user.id, name.trim(), fullPhone);

          const sessionUser: UserSession = {
            id: data.user.id,
            name: name.trim() || `User (${fullPhone})`,
            phone: fullPhone,
          };

          setStatusMessage({
            type: 'success',
            text: `Account created successfully! Logged in as ${sessionUser.name}.`,
          });
          setTimeout(() => {
            onSuccess(sessionUser);
            onClose();
          }, 600);
        } else {
          // Supabase requires Phone verification code (SMS OTP)
          setOtpSent(true);
          setResendCooldown(30);
          setStatusMessage({
            type: 'info',
            text: `A verification code was sent to ${fullPhone}. Enter it below to complete registration.`,
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: getCleanErrorMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Send SMS OTP for OTP Login
  const handleSendOtp = async () => {
    if (!phoneNumber || !validatePhone(phoneNumber)) {
      setErrors({ phone: 'Please enter a valid mobile number first' });
      return;
    }

    const fullPhone = formatE164Phone(countryCode, phoneNumber);
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
      });

      if (error) {
        setStatusMessage({ type: 'error', text: getCleanErrorMessage(error) });
        setIsLoading(false);
        return;
      }

      setOtpSent(true);
      setResendCooldown(30);
      setStatusMessage({
        type: 'info',
        text: `6-digit verification code sent to ${fullPhone}.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: getCleanErrorMessage(err) });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Verify OTP code
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.trim().length < 4) {
      setErrors({ otp: 'Please enter the verification code' });
      return;
    }

    const fullPhone = formatE164Phone(countryCode, phoneNumber);
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: otpCode.trim(),
        type: 'sms',
      });

      if (error) {
        setStatusMessage({ type: 'error', text: getCleanErrorMessage(error) });
        setIsLoading(false);
        return;
      }

      if (data.user) {
        const displayName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          name.trim() ||
          `Resident (${fullPhone})`;

        await syncUserToDatabase(data.user.id, displayName, fullPhone);

        const sessionUser: UserSession = {
          id: data.user.id,
          name: displayName,
          phone: fullPhone,
        };

        setStatusMessage({
          type: 'success',
          text: 'Phone verified successfully! You are logged in.',
        });

        setTimeout(() => {
          onSuccess(sessionUser);
          onClose();
        }, 600);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: getCleanErrorMessage(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setOtpSent(false);
    setStatusMessage(null);
    setErrors({});
    setPassword('');
    setConfirmPassword('');
    setOtpCode('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-sm rounded-xl bg-white border border-slate-200 shadow-xl p-6 dark:border-slate-800 dark:bg-slate-900 transition-colors">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tab switch between Log In and Sign Up */}
        <div className="flex rounded-lg bg-slate-100 p-1 mb-4 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {otpSent
                ? 'Verify Phone Number'
                : mode === 'login'
                ? 'Phone Number Login'
                : 'Create Account with Phone'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {otpSent
                ? 'Enter the code sent to your phone'
                : mode === 'login'
                ? 'Sign in using your mobile number'
                : 'Register with your mobile number to submit observations'}
            </p>
          </div>
        </div>

        {/* Feedback message banner */}
        {statusMessage && (
          <div
            className={`mt-3.5 flex items-start gap-2 rounded-md p-2.5 text-xs font-medium leading-relaxed ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                : statusMessage.type === 'info'
                ? 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800'
                : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            ) : statusMessage.type === 'info' ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            )}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* If OTP Verification State is Active */}
        {otpSent ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                SMS Verification Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value);
                    if (errors.otp) setErrors((prev) => ({ ...prev, otp: '' }));
                  }}
                  placeholder="6-digit code"
                  className="w-full tracking-widest text-center text-sm font-semibold rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  autoFocus
                />
              </div>
              {errors.otp && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.otp}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verify & Sign In
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="hover:underline text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Change number
              </button>

              <button
                type="button"
                disabled={resendCooldown > 0 || isLoading}
                onClick={handleSendOtp}
                className="text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50 cursor-pointer font-medium"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </button>
            </div>
          </form>
        ) : (
          /* Main Phone Auth Form */
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {/* Login Method Sub-Toggle (Password vs SMS OTP) */}
            {mode === 'login' && (
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Login Method:
                </span>
                <div className="flex gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('password');
                      setStatusMessage(null);
                    }}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      loginMethod === 'password'
                        ? 'bg-slate-200 dark:bg-slate-700 font-semibold text-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('otp');
                      setStatusMessage(null);
                    }}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      loginMethod === 'otp'
                        ? 'bg-slate-200 dark:bg-slate-700 font-semibold text-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    SMS OTP
                  </button>
                </div>
              </div>
            )}

            {/* Name field (for signup) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
              </div>
            )}

            {/* Phone Number Field with Country Code */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Mobile Phone Number
              </label>
              <div className="flex gap-1.5">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-24 shrink-0 rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  {COMMON_COUNTRY_CODES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} ({item.country})
                    </option>
                  ))}
                </select>

                <div className="relative flex-1">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="98765 43210"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                Full format: <span className="font-mono text-slate-700 dark:text-slate-300">{formatE164Phone(countryCode, phoneNumber || '0000000000')}</span>
              </p>
              {errors.phone && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.phone}</p>}
            </div>

            {/* Password Field (for Password login or Signup) */}
            {(mode === 'signup' || loginMethod === 'password') && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                    }}
                    placeholder="At least 6 characters"
                    className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password}</p>}
              </div>
            )}

            {/* Confirm Password (for signup) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                    }}
                    placeholder="Re-enter password"
                    className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Connecting to Supabase...
                </>
              ) : mode === 'login' && loginMethod === 'otp' ? (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              ) : mode === 'login' ? (
                'Log In with Phone'
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Sign up with Phone
              </button>
            </p>
          ) : (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
