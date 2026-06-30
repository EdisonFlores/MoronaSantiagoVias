const STORAGE_KEY = "ecuavial-theme";

// Aplica el tema guardado y alterna entre claro/oscuro desde el boton superior.
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);

  document.getElementById("btnTheme")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    updateThemeIcon(next);
  });
}

// Solo cambia el icono; los colores reales viven en las variables CSS del tema.
function updateThemeIcon(theme) {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
}
