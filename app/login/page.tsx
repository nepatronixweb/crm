"use client";
import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { INPUT_STYLES } from "@/components/FormComponents";
import { adjustHexColor, normalizeHexColor } from "@/lib/brandTheme";

type LoginBranding = {
  companyName: string;
  shortCode: string;
  tagline: string;
  logoPath: string;
  brandColor: string;
  brandSecondaryColor: string;
};

const DEFAULT_BRANDING: LoginBranding = {
  companyName: "Welcome to CRM",
  shortCode: "ETG",
  tagline: "World most dynamic CRM",
  logoPath: "",
  brandColor: "#2563eb",
  brandSecondaryColor: "#1d4ed8",
};

const LOGIN_HEADING = "Welcome to CRM";
const LOGIN_SUBTITLE = "World most dynamic CRM";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState<LoginBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setBranding(DEFAULT_BRANDING);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/branding/login?email=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.companyName) setBranding(d as LoginBranding);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [email]);

  const primary = normalizeHexColor(branding.brandColor);
  const secondary = normalizeHexColor(branding.brandSecondaryColor || branding.brandColor);
  const bgDark = adjustHexColor(primary, -55);

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
    <div
      className="min-h-screen flex items-center justify-center p-4 transition-colors duration-500"
      style={{ background: `linear-gradient(160deg, ${bgDark} 0%, ${adjustHexColor(primary, -70)} 100%)` }}
    >
      <div className="relative w-full max-w-md z-10">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 ring-1 ring-white/10 text-center">
          <div className="mb-8">
            {branding.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoPath}
                alt={branding.companyName}
                className="h-14 mx-auto mb-4 object-contain drop-shadow-md"
              />
            ) : (
              <div
                className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
                style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
              >
                {branding.shortCode.slice(0, 3)}
              </div>
            )}
            <h2 className="text-2xl font-bold text-white mb-1">{LOGIN_HEADING}</h2>
            <p className="text-white/70 text-sm">{LOGIN_SUBTITLE}</p>
          </div>

          {error && (
            <div className="flex flex-col items-center gap-2 bg-red-500/20 border border-red-400/50 text-red-100 px-4 py-3.5 rounded-xl mb-6 backdrop-blur-sm ring-1 ring-red-400/30 max-w-sm mx-auto text-center">
              <Lock size={18} className="shrink-0 text-red-300" />
              <div>
                <p className="font-semibold text-sm">Authentication Failed</p>
                <p className="text-xs mt-0.5 opacity-90">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 max-w-sm mx-auto text-center">
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-2.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative group text-left">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-white/90 transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={`${INPUT_STYLES.full} bg-white/10 border-white/20 text-white placeholder-white/50 pl-12 focus:bg-white/20 focus:border-white/40 focus:ring-white/20 backdrop-blur-sm`}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/80 mb-2.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative group text-left">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-white/90 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={`${INPUT_STYLES.full} bg-white/10 border-white/20 text-white placeholder-white/50 pl-12 pr-12 focus:bg-white/20 focus:border-white/40 focus:ring-white/20 backdrop-blur-sm`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/90 transition-colors focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-8 py-3 px-4 text-white rounded-xl font-bold transition-colors duration-200 shadow-lg hover:shadow-xl disabled:shadow-md disabled:cursor-not-allowed flex items-center justify-center gap-2.5 group disabled:opacity-60"
              style={{ background: primary }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = secondary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = primary;
              }}
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

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white/10 text-white/60 backdrop-blur-sm">or</span>
            </div>
          </div>

          <p className="text-center text-xs text-white/50">
            Restricted access — authorized staff only
          </p>
          <p className="text-center text-xs text-white/70 mt-3">
            New customer?{" "}
            <Link href="/trial" className="text-white font-semibold hover:underline underline-offset-2">
              Start a free trial
            </Link>
          </p>
        </div>

        <div className="text-center mt-6 text-xs text-white/40">
          <p>Need help? Contact your administrator</p>
        </div>
      </div>
    </div>
  );
}
