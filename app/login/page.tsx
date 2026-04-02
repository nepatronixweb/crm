"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { useBranding } from "@/app/branding-context";
import Image from "next/image";
import { INPUT_STYLES, BUTTON_STYLES } from "@/components/FormComponents";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const branding = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    if (res?.error) {
      if (res.error === "CredentialsSignin") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(res.error);
      }
      setLoading(false);
    } else if (res?.ok) {
      router.push("/dashboard");
    } else {
      setError("Could not sign in. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 animate-pulse" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl opacity-20 animate-pulse animation-delay-2000" />
      <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-600 rounded-full blur-3xl opacity-10 animate-pulse animation-delay-1000" />

      <div className="relative w-full max-w-md z-10">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-2xl overflow-hidden bg-gradient-to-br from-white to-gray-50 ring-2 ring-white/20" style={{ backgroundColor: branding.brandColor }}>
            {branding.logoPath ? (
              <Image src={branding.logoPath} alt={branding.shortCode} width={64} height={64} className="w-full h-full object-contain p-2" />
            ) : (
              <span className="text-white text-xl font-bold tracking-tight">{branding.shortCode}</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">{branding.companyName}</h1>
          <p className="text-sm text-blue-200">{branding.tagline || "CRM Portal — Staff Access"}</p>
        </div>

        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 ring-1 ring-white/10">
          
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-blue-100">Sign in to access your ETG Dashboard</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-3 bg-red-500/20 border border-red-400/50 text-red-100 px-4 py-3.5 rounded-xl mb-6 backdrop-blur-sm ring-1 ring-red-400/30">
              <Lock size={18} className="shrink-0 mt-0.5 text-red-300" />
              <div>
                <p className="font-semibold text-sm">Authentication Failed</p>
                <p className="text-xs mt-0.5 opacity-90">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-2.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative group">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300 group-focus-within:text-blue-100 transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={`${INPUT_STYLES.full} bg-white/10 border-white/20 text-white placeholder-white/50 pl-12 focus:bg-white/20 focus:border-blue-400 focus:ring-blue-400/40 focus:shadow-lg focus:shadow-blue-500/20 backdrop-blur-sm`}
                  placeholder="you@etg.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-2.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative group">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300 group-focus-within:text-blue-100 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={`${INPUT_STYLES.full} bg-white/10 border-white/20 text-white placeholder-white/50 pl-12 pr-12 focus:bg-white/20 focus:border-blue-400 focus:ring-blue-400/40 focus:shadow-lg focus:shadow-blue-500/20 backdrop-blur-sm`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-100 transition-colors focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-8 py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-md disabled:cursor-not-allowed flex items-center justify-center gap-2.5 group"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white/10 text-white/60 backdrop-blur-sm">or</span>
            </div>
          </div>

          {/* Additional Info */}
          <p className="text-center text-xs text-white/50">
            Restricted access — Authorized staff only
          </p>
        </div>

        {/* Footer Message */}
        <div className="text-center mt-6 text-xs text-blue-200/60">
          <p>Need help? Contact your administrator</p>
        </div>
      </div>
    </div>
  );
}
