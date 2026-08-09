(() => {
    const preferenceVersion = "2026.08.09.1";
    const releaseNumbers = Object.freeze({ github: 2, sites: 2 });
    const target = location.hostname.endsWith("chatgpt.site") ? "sites" : "github";
    const versions = Object.freeze({
        github: `${preferenceVersion}.${releaseNumbers.github}`,
        sites: `${preferenceVersion}.${releaseNumbers.sites}`,
    });
    const version = versions[target];

    window.RuruSiteRelease = Object.freeze({ preferenceVersion, releaseNumbers, target, versions, version });
    document.documentElement.dataset.siteTarget = target;
    // Keep the document-level release marker distinct from the visible
    // [data-site-version] placeholders. Otherwise <html> itself is selected
    // below and assigning textContent replaces the entire page.
    document.documentElement.dataset.releaseVersion = version;

    const applyVersion = () => {
        document.querySelectorAll("[data-site-version]").forEach((element) => {
            element.textContent = version;
        });
        const meta = document.querySelector('meta[name="rurusaika-site-version"]');
        if (meta) meta.content = version;
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyVersion, { once: true });
    } else {
        applyVersion();
    }
})();
