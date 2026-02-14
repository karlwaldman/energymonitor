export const SITE_VARIANT: string = (() => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("energymonitor-variant")?.trim();
    if (stored === "tech" || stored === "full" || stored === "energy")
      return stored;
  }
  return (import.meta.env.VITE_VARIANT || "full").trim();
})();
