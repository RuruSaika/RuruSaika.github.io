function openTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.style.display = 'none');

    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabId).style.display = "block";
    event.target.classList.add('active');
}

function toggleFAQ(element) {
    const item = element.parentElement;
    item.classList.toggle('open');
}

function toggleTheme(isDark) {
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    document.getElementById("themeLabel").textContent = isDark ? "dark" : "light";
}

window.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem("theme") || "light";
    const isDark = savedTheme === "dark"
    toggleTheme(isDark);
    document.getElementById("themeSwitcher").checked = isDark;
});

document.getElementById("themeSwitcher").addEventListener("change",(e) => {
    toggleTheme(e.target.checked);
});