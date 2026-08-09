const root = document.documentElement;
const header = document.querySelector('[data-header]');
const themeButton = document.querySelector('[data-theme-toggle]');
const themeLabel = document.querySelector('[data-theme-label]');
const themeColor = document.querySelector('meta[name="theme-color"]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readSavedTheme() {
    try {
        return localStorage.getItem('ruru-theme');
    } catch {
        return null;
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem('ruru-theme', theme);
    } catch {
        // The page still works when storage is unavailable, such as a restricted file preview.
    }
}

function applyTheme(theme, persist = true) {
    const isLight = theme === 'light';
    root.dataset.theme = isLight ? 'light' : 'dark';
    themeLabel.textContent = isLight ? '深色' : '浅色';
    themeButton.setAttribute('aria-pressed', String(isLight));
    themeButton.setAttribute('aria-label', `切换为${isLight ? '深色' : '浅色'}主题`);
    themeColor.setAttribute('content', isLight ? '#d6d8dd' : '#0b0e10');
    if (persist) saveTheme(isLight ? 'light' : 'dark');
}

applyTheme(readSavedTheme() || 'dark', false);

themeButton.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
});

function updateLocalTime() {
    const target = document.querySelector('[data-local-time]');
    if (!target) return;

    const time = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date());

    target.textContent = `${time} CST`;
}

updateLocalTime();
window.setInterval(updateLocalTime, 30_000);
document.querySelector('[data-year]').textContent = new Date().getFullYear();

function updateHeader() {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
}

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const revealItems = [...document.querySelectorAll('.reveal')];

if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    revealItems.forEach((item, index) => {
        if (item.closest('.hero')) {
            item.style.transitionDelay = `${Math.min(index * 80, 240)}ms`;
        }
        revealObserver.observe(item);
    });
}

const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
const observedSections = navLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

if ('IntersectionObserver' in window && observedSections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        navLinks.forEach((link) => {
            const isActive = link.getAttribute('href') === `#${visible.target.id}`;
            link.classList.toggle('is-active', isActive);
            if (isActive) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.2, 0.6] });

    observedSections.forEach((section) => sectionObserver.observe(section));
}
