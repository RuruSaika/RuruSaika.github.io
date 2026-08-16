(() => {
    const preferenceVersions = Object.freeze({
        github: "2026.08.14.1",
        sites: "2026.08.14.1",
    });
    const releaseNumbers = Object.freeze({ github: 6, sites: 6 });
    const target = location.hostname.endsWith("chatgpt.site") ? "sites" : "github";
    const versions = Object.freeze({
        github: `${preferenceVersions.github}.${releaseNumbers.github}`,
        sites: `${preferenceVersions.sites}.${releaseNumbers.sites}`,
    });
    const preferenceVersion = preferenceVersions[target];
    const version = versions[target];

    window.RuruSiteRelease = Object.freeze({ preferenceVersions, preferenceVersion, releaseNumbers, target, versions, version });
    document.documentElement.dataset.siteTarget = target;
    document.documentElement.dataset.adoptedPreferenceVersion = preferenceVersion;
    // Keep the document-level release marker distinct from the visible
    // [data-site-version] placeholders. Otherwise <html> itself is selected
    // below and assigning textContent replaces the entire page.
    document.documentElement.dataset.releaseVersion = version;

    const applyVersion = () => {
        document.querySelectorAll("[data-site-version]").forEach((element) => {
            element.textContent = version;
        });
        document.querySelectorAll("[data-preference-version]").forEach((element) => {
            element.textContent = preferenceVersion;
        });
        const meta = document.querySelector('meta[name="rurusaika-site-version"]');
        if (meta) meta.content = version;
        const preferenceMeta = document.querySelector('meta[name="rurusaika-preference-version"]');
        if (preferenceMeta) preferenceMeta.content = preferenceVersion;
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyVersion, { once: true });
    } else {
        applyVersion();
    }
})();
