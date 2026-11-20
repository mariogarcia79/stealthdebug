import { env } from "./env";

// What the site says about itself, wherever it is described to machines:
// the RSS feed, the meta tags of post pages, llms.txt.
export const SITE_URL = env.siteUrl;
export const SITE_NAME = "stealthdebug";

export const SITE_DESCRIPTION: Record<string, string> = {
  en: "Hands-on write-ups on reverse engineering embedded systems: opening the hardware, dumping and breaking down firmware, and bypassing software protections.",
  es: "Artículos prácticos sobre ingeniería inversa de sistemas embebidos: abrir el hardware, extraer y desmontar el firmware y saltarse protecciones de software.",
};

// Page title as the frontend sets it (frontend/src/hooks/useDocumentTitle.ts)
export const pageTitle = (title?: string): string => (title ? `${title} · ${SITE_NAME}` : SITE_NAME);

// Public URL of a post in a language: the original's id, ?lang= for a translation
export const postUrl = (originalId: unknown, lang?: string | null): string =>
  `${SITE_URL}/blog/${originalId}${lang ? `?lang=${lang}` : ""}`;

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
