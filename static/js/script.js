const root = document.documentElement;
const themeButton = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const themeColor = document.querySelector('meta[name="theme-color"]');

function readSavedTheme() {
    try {
        return localStorage.getItem("ruru-theme");
    } catch {
        return null;
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem("ruru-theme", theme);
    } catch {
        // Theme switching remains available when browser storage is restricted.
    }
}

function applyTheme(theme, persist = true) {
    const isLight = theme === "light";
    root.dataset.theme = isLight ? "light" : "dark";
    themeLabel.textContent = isLight ? "深色" : "浅色";
    themeButton.setAttribute("aria-pressed", String(isLight));
    themeButton.setAttribute("aria-label", `切换为${isLight ? "深色" : "浅色"}主题`);
    themeColor.setAttribute("content", isLight ? "#d8d9dd" : "#0b0e10");
    if (persist) saveTheme(isLight ? "light" : "dark");
}

applyTheme(readSavedTheme() || "dark", false);

themeButton.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "light" ? "dark" : "light");
});

const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();

const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
        const current = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!current) return;
        navLinks.forEach((link) => {
            const active = link.getAttribute("href") === `#${current.target.id}`;
            link.classList.toggle("is-active", active);
            if (active) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
        });
    }, { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.2, 0.6] });

    sections.forEach((section) => observer.observe(section));
}
