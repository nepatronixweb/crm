"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  DEFAULT_APPLICATION_ROLES,
  normalizeApplicationRoles,
  type ApplicationRoleDef,
} from "@/lib/applicationRoles";
import {
  fdStatusOptionsFromStrings,
  type FdStatusOption,
} from "@/lib/fdStatusOptions";
import { subscribeAppSettingsChanged } from "@/lib/appSettingsSync";

export interface Branding {
  companyName: string;
  shortCode: string;
  tagline: string;
  logoPath: string;
  faviconPath: string;
  brandColor: string;
  paymentQrPath: string;
}

const defaultBranding: Branding = {
  companyName: "Education Tree Global",
  shortCode: "ETG",
  tagline: "CRM Portal - Staff Access",
  logoPath: "",
  faviconPath: "",
  brandColor: "#2563eb",
  paymentQrPath: "",
};

function cloneDefaultRoles(): ApplicationRoleDef[] {
  return DEFAULT_APPLICATION_ROLES.map((r) => ({
    slug: r.slug,
    label: r.label,
    defaultPermissions: [...r.defaultPermissions],
  }));
}

interface BrandingContextValue {
  branding: Branding;
  /** Role catalog from App Settings (labels, slugs, default permissions). Kept in sync with `/api/settings/app`. */
  applicationRoles: ApplicationRoleDef[];
  /** Lead workflow status list from Settings → Front Desk Statuses (same for every module). */
  fdWorkflowStatusOptions: FdStatusOption[];
  refreshBranding: () => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: defaultBranding,
  applicationRoles: cloneDefaultRoles(),
  fdWorkflowStatusOptions: [],
  refreshBranding: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [branding, setBranding] = useState<Branding>(defaultBranding);
  const [applicationRoles, setApplicationRoles] = useState<ApplicationRoleDef[]>(cloneDefaultRoles);
  const [fdWorkflowStatusOptions, setFdWorkflowStatusOptions] = useState<FdStatusOption[]>([]);

  const load = useCallback(() => {
    fetch("/api/settings/app", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (d?.error) return;
        setApplicationRoles(normalizeApplicationRoles(d?.applicationRoles));
        if (Array.isArray(d?.fdStatuses)) {
          setFdWorkflowStatusOptions(fdStatusOptionsFromStrings(d.fdStatuses));
        }
        if (d?.companyName) {
          setBranding({
            companyName: d.companyName || defaultBranding.companyName,
            shortCode: d.shortCode || defaultBranding.shortCode,
            tagline: d.tagline || defaultBranding.tagline,
            logoPath: d.logoPath || "",
            faviconPath: d.faviconPath || "",
            brandColor: d.brandColor || defaultBranding.brandColor,
            paymentQrPath: d.paymentQrPath || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  /** Wait for session (avoid a pre-auth fetch that returns platform defaults while cookies exist). */
  useEffect(() => {
    if (status === "loading") return;
    void load();
  }, [status, load]);

  useEffect(() => {
    const unsub = subscribeAppSettingsChanged(() => {
      void load();
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // Update document title when branding loads
  useEffect(() => {
    document.title = `${branding.shortCode} CRM - ${branding.companyName}`;
  }, [branding.shortCode, branding.companyName]);

  // Update favicon dynamically
  useEffect(() => {
    if (branding.faviconPath) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.faviconPath;
    }
  }, [branding.faviconPath]);

  return (
    <BrandingContext.Provider
      value={{ branding, applicationRoles, fdWorkflowStatusOptions, refreshBranding: load }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const { branding } = useContext(BrandingContext);
  return branding;
}

export function useBrandingRefresh() {
  const { refreshBranding } = useContext(BrandingContext);
  return refreshBranding;
}

/** Application role definitions from Settings → same source as user create/edit role dropdown. */
export function useApplicationRolesCatalog(): ApplicationRoleDef[] {
  const { applicationRoles } = useContext(BrandingContext);
  return applicationRoles;
}

/** Lead workflow statuses from admin Settings — shared by Leads, Dashboard, Reports, etc. */
export function useFdWorkflowStatusOptions(): FdStatusOption[] {
  const { fdWorkflowStatusOptions } = useContext(BrandingContext);
  return fdWorkflowStatusOptions;
}

export type { ApplicationRoleDef, FdStatusOption };
