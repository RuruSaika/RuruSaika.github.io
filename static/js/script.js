const root = document.documentElement;
const themeButton = document.querySelector('[data-theme-toggle]');
const themeLabel = document.querySelector('[data-theme-label]');
const header = document.querySelector('[data-header]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem('ruru-theme', theme);
    themeLabel.textContent = theme === 'light' ? 'DARK' : 'LIGHT';
    themeButton.setAttribute('aria-pressed', String(theme === 'light'));
}

const savedTheme = localStorage.getItem('ruru-theme');
const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
setTheme(initialTheme);

themeButton.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
});

function updateClock() {
    const time = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date());
    document.querySelector('[data-local-time]').textContent = `${time} CST`;
}

updateClock();
window.setInterval(updateClock, 1000);
document.querySelector('[data-year]').textContent = new Date().getFullYear();

window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 24);
}, { passive: true });

const revealItems = document.querySelectorAll('.reveal');

if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('visible'));
} else {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

    revealItems.forEach((item, index) => {
        if (item.closest('.hero')) item.style.transitionDelay = `${Math.min(index * 90, 360)}ms`;
        observer.observe(item);
    });
}
