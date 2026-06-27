//translate.js
import { translations } from "./i18n.js";

const STORAGE_KEY = "ecuavial-lang";
const LANGUAGE_ORDER = ["es", "en", "sh"];

function getSafeLanguage(value) {
  return LANGUAGE_ORDER.includes(value) ? value : "es";
}

export function getCurrentLanguage() {
  return getSafeLanguage(localStorage.getItem(STORAGE_KEY) || "es");
}

function updateLanguageControl(lang) {
  const trigger = document.getElementById("btnLang");
  const display = document.getElementById("langDisplay");
  const options = document.querySelectorAll(".language-option");

  if (trigger) trigger.dataset.lang = lang;
  if (display) display.textContent = lang.toUpperCase();
  options.forEach((option) => {
    const isSelected = option.dataset.lang === lang;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", String(isSelected));
  });
}

function setLanguageMenuState(isOpen) {
  const trigger = document.getElementById("btnLang");
  const menu = document.getElementById("languageMenu");

  if (!trigger || !menu) return;

  trigger.setAttribute("aria-expanded", String(isOpen));
  menu.classList.toggle("show", isOpen);
}

function applyLanguage(next, onLanguageChanged) {
  localStorage.setItem(STORAGE_KEY, next);
  applyTranslations(next);
  updateLanguageControl(next);

  if (next === "sh") {
    showShuarWarning();
  }

  if (typeof onLanguageChanged === "function") {
    onLanguageChanged(next);
  }
}

function showShuarWarning() {
  const dict = translations.es;
  let modal = document.getElementById("shuarWarningModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "shuarWarningModal";
    modal.className = "language-warning-modal";
    modal.innerHTML = `
      <div class="language-warning-card" role="dialog" aria-modal="true" aria-labelledby="shuarWarningTitle">
        <button class="language-warning-close" type="button" aria-label="${dict.close}">
          <i class="bi bi-x-lg"></i>
        </button>
        <div class="language-warning-icon">
          <i class="bi bi-translate"></i>
        </div>
        <h3 id="shuarWarningTitle"></h3>
        <p id="shuarWarningText"></p>
        <button class="btn-primary language-warning-accept" type="button"></button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".language-warning-close").addEventListener("click", () => {
      modal.classList.remove("show");
    });

    modal.querySelector(".language-warning-accept").addEventListener("click", () => {
      modal.classList.remove("show");
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("show");
    });
  }

  modal.querySelector("#shuarWarningTitle").textContent = dict.shuarWarningTitle;
  modal.querySelector("#shuarWarningText").textContent = dict.shuarWarningText;
  modal.querySelector(".language-warning-accept").textContent = dict.shuarWarningAccept;
  modal.classList.add("show");
}

export function initLanguage(onLanguageChanged) {
  const saved = getCurrentLanguage();
  applyTranslations(saved);
  updateLanguageControl(saved);

  document.querySelector(".language-select-wrap")?.addEventListener("click", (event) => {
    if (event.target.closest(".language-option")) return;

    const menu = document.getElementById("languageMenu");
    setLanguageMenuState(!menu?.classList.contains("show"));
  });

  document.querySelectorAll(".language-option").forEach((option) => {
    option.addEventListener("click", () => {
      const next = getSafeLanguage(option.dataset.lang);
      setLanguageMenuState(false);
      applyLanguage(next, onLanguageChanged);
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".language-select-wrap")) {
      setLanguageMenuState(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setLanguageMenuState(false);
    }
  });
}

export function applyTranslations(lang) {
  const safeLang = getSafeLanguage(lang);
  const dict = { ...translations.es, ...(translations[safeLang] || {}) };

  document.documentElement.setAttribute("lang", safeLang);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
}
