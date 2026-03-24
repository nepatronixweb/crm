"use client";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission, getRoleLabel, formatDateTime } from "@/lib/utils";
import {
  LayoutDashboard, Users, UserCheck, FileText, FolderOpen,
  GraduationCap, Plane, BarChart3, Settings, Building2,
  ScrollText, LogOut, Menu, X, Bell, MessageCircle,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { UserRole } from "@/types";
import Image from "next/image";
import { useBranding } from "@/app/branding-context";

interface INotif {
  _id: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

interface ToastItem {
  id: string;
  title: string;
  message: string;
  link?: string;
  leaving: boolean;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/leads", label: "Leads", icon: Users, module: "leads" },
  { href: "/students", label: "Students", icon: UserCheck, module: "students" },
  { href: "/documents", label: "Documents", icon: FolderOpen, module: "documents" },
  { href: "/applications", label: "Applications", icon: FileText, module: "applications" },
  { href: "/admissions", label: "Admissions", icon: GraduationCap, module: "admissions" },
  { href: "/visa", label: "Visa", icon: Plane, module: "visa" },
  { href: "/chat", label: "Chat", icon: MessageCircle, module: "chat" },
  { href: "/reports", label: "Analytics", icon: BarChart3, module: "analytics" },
  { href: "/branches", label: "Branches", icon: Building2, module: "branches" },
  { href: "/users", label: "Users", icon: Users, module: "users" },
  { href: "/activity-logs", label: "Activity Logs", icon: ScrollText, module: "activity_logs" },
  { href: "/settings", label: "Settings", icon: Settings, module: "settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = session?.user?.role as UserRole;
  const branding = useBranding();

  // Notifications
  const [notifs, setNotifs] = useState<INotif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [bellShake, setBellShake] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  // Chat unread badge
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const chatEsRef = useRef<EventSource | null>(null);
  const chatAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevChatUnreadRef = useRef(0);

  // Request browser notification permission once
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotif = useCallback((title: string, body: string, link?: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/favicon.ico" });
    if (link) n.onclick = () => { window.focus(); window.location.href = link; n.close(); };
  }, []);

  const showToast = useCallback((notif: INotif) => {
    const id = notif._id + Date.now();
    setToasts((prev) => [...prev, { id, title: notif.title, message: notif.message, link: notif.link, leaving: false }]);
    // start leave animation after 4s, remove after 4.25s
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 250);
    }, 4000);
  }, []);

  const triggerBellShake = useCallback(() => {
    setBellShake(true);
    setTimeout(() => setBellShake(false), 700);
  }, []);

  const applyUpdate = useCallback((newNotifs: INotif[], newUnread: number) => {
    setNotifs((prev) => {
      const existingIds = new Set(prev.map((n) => n._id));
      const incoming = newNotifs.filter((n) => !existingIds.has(n._id));
      if (incoming.length > 0) {
        // trigger UI feedback for each new notification
        incoming.forEach((n) => {
          showToast(n);
          showBrowserNotif(n.title, n.message, n.link);
        });
        triggerBellShake();
      }
      // merge: new items at top
      const merged = [...incoming, ...prev].slice(0, 15);
      return merged;
    });
    setUnreadCount(newUnread);
    prevUnreadRef.current = newUnread;
  }, [showToast, showBrowserNotif, triggerBellShake]);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) {
        const d = await res.json();
        setNotifs(d.notifications ?? []);
        const newUnread = d.unreadCount ?? 0;
        if (newUnread > prevUnreadRef.current) triggerBellShake();
        prevUnreadRef.current = newUnread;
        setUnreadCount(newUnread);
      }
    } catch { /* silent */ }
  }, [triggerBellShake]);

  // SSE connection — reconnects automatically on failure
  useEffect(() => {
    if (!session) return;

    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const es = new EventSource("/api/notifications/stream");
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === "init") {
            // Full initial load from SSE — no toast for existing items
            setNotifs(payload.notifications ?? []);
            setUnreadCount(payload.unreadCount ?? 0);
            prevUnreadRef.current = payload.unreadCount ?? 0;
          } else if (payload.type === "new") {
            applyUpdate(payload.notifications ?? [], payload.unreadCount ?? 0);
          } else if (payload.type === "heartbeat") {
            const incoming = payload.unreadCount ?? 0;
            if (incoming > prevUnreadRef.current) {
              // unread increased since last heartbeat — re-fetch full list
              fetchNotifs();
            }
            prevUnreadRef.current = incoming;
            setUnreadCount(incoming);
          }
        } catch { /* malformed */ }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnect after 5s
        retryTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      clearTimeout(retryTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Chat SSE connection
  useEffect(() => {
    if (!session) return;
    // Lazy-init audio element
    if (!chatAudioRef.current) {
      chatAudioRef.current = new Audio("/sounds/message-tone.mp3");
      chatAudioRef.current.volume = 0.5;
    }
    let retryTimeout: ReturnType<typeof setTimeout>;
    const connectChat = () => {
      const es = new EventSource("/api/chat/stream");
      chatEsRef.current = es;
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          const incoming = payload.unreadCount ?? 0;
          if (payload.type === "chat_init") {
            setChatUnreadCount(incoming);
            prevChatUnreadRef.current = incoming;
          } else if (payload.type === "chat_new" || payload.type === "chat_heartbeat") {
            if (incoming > prevChatUnreadRef.current && !pathname.startsWith("/chat")) {
              chatAudioRef.current?.play().catch(() => {});
            }
            setChatUnreadCount(incoming);
            prevChatUnreadRef.current = incoming;
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        chatEsRef.current = null;
        retryTimeout = setTimeout(connectChat, 5000);
      };
    };
    connectChat();
    return () => { chatEsRef.current?.close(); clearTimeout(retryTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    prevUnreadRef.current = 0;
  };

  const markOneRead = async (id: string) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setNotifs((prev) => prev.map((n) => n._id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => { const v = Math.max(0, c - 1); prevUnreadRef.current = v; return v; });
  };

  const userPermissions = (session?.user?.permissions ?? []) as string[];
  const visibleNav = navItems.filter((item) =>
    item.module === "dashboard" || hasPermission(userPermissions, item.module, role)
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`no-print fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 flex flex-col transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: branding.brandColor }}
            >
              {branding.logoPath ? (
                <Image
                  src={branding.logoPath}
                  alt={branding.shortCode}
                  width={32}
                  height={32}
                  className="w-full h-full object-contain p-0.5"
                />
              ) : (
                <span className="text-white text-xs font-bold">{branding.shortCode.slice(0, 3)}</span>
              )}
            </div>
            <span className="text-white font-semibold text-sm truncate max-w-[140px]">
              {branding.companyName.split(" ").slice(0, 2).join(" ")}
            </span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                  ${isActive ? "text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
                style={isActive ? { backgroundColor: branding.brandColor } : undefined}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: branding.brandColor }}>
              {session?.user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{session?.user?.name}</p>
              <p className="text-gray-400 text-xs truncate">{getRoleLabel(role)}</p>
              <p className="text-gray-500 text-[10px] truncate">{session?.user?.email}</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 w-full px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-sm transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay (mobile only) */}
      {sidebarOpen && (
        <div className="no-print fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Toast notifications (top-center) */}
      <div className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-100 flex flex-col gap-2 items-center pointer-events-none w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-80 bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 flex items-start gap-3 ${
              t.leaving ? "toast-leave" : "toast-enter"
            }`}
          >
            <div className="mt-0.5 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{t.message}</p>
              {t.link && (
                <Link
                  href={t.link}
                  className="text-xs text-blue-300 hover:text-blue-200 underline mt-0.5 inline-block"
                >
                  View →
                </Link>
              )}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-gray-500 hover:text-white shrink-0 mt-0.5"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${sidebarOpen ? "lg:ml-64" : ""}`}>
        <header className="no-print h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-700">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 size={15} />
            <span>{session?.user?.branchName || "All Branches"}</span>
          </div>

          <div className="flex items-center gap-1">
          {/* Chat Icon */}
          {hasPermission(userPermissions, "chat", role) && (
            <Link href="/chat" className="relative p-2 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
              <MessageCircle size={18} />
              {chatUnreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none animate-pulse">
                  {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
                </span>
              )}
            </Link>
          )}

          {/* Notification Bell */}
          <div ref={bellRef} className="relative">
            <button
              onClick={() => { setShowNotifs((v) => !v); if (!showNotifs) fetchNotifs(); }}
              className="relative p-2 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            >
              <Bell size={18} className={bellShake ? "bell-shake" : ""} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-gray-500" />
                    <span className="text-sm font-semibold text-gray-800">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      No notifications yet
                    </div>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n._id}
                        className={`px-4 py-3 transition-colors ${n.read ? "bg-white" : "bg-blue-50"}`}
                      >
                        {n.link ? (
                          <Link
                            href={n.link}
                            onClick={() => { if (!n.read) markOneRead(n._id); setShowNotifs(false); }}
                            className="block group"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-gray-200" : "bg-blue-500"}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{n.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                                <p className="text-[11px] text-gray-400 mt-1">{formatDateTime(n.createdAt)}</p>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="flex items-start gap-2.5">
                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-gray-200" : "bg-blue-500"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800">{n.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[11px] text-gray-400 mt-1">{formatDateTime(n.createdAt)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {notifs.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                    <button
                      onClick={() => { markAllRead(); setShowNotifs(false); }}
                      className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
