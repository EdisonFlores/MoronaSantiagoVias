//translate.js
import { translations } from "./i18n.js";

const STORAGE_KEY = "ecuavial-lang";

export function getCurrentLanguage() {
  return localStorage.getItem(STORAGE_KEY) || "es";
}

export function initLanguage(onLanguageChanged) {
  const saved = getCurrentLanguage();
  applyTranslations(saved);

  document.getElementById("btnLang")?.addEventListener("click", () => {
    const current = getCurrentLanguage();
    const next = current === "es" ? "en" : "es";
    localStorage.setItem(STORAGE_KEY, next);
    applyTranslations(next);

    if (typeof onLanguageChanged === "function") {
      onLanguageChanged(next);
    }
  });
}

export function applyTranslations(lang) {
  const dict = translations[lang] || translations.es;

  document.documentElement.setAttribute("lang", lang);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
}