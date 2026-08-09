# Site versioning

The visual preference file is the version baseline. Website releases use:

`<preference version>.<site release number>`

For example, preference `2026.08.09.1` and release `1` produce website version
`2026.08.09.1.1`.

The counters live in `static/js/site-version.js` and are independent:

- `github` identifies the GitHub Pages public site release.
- `sites` identifies the ChatGPT Sites release that provides the public API,
  uploaded assets, and private editor.

When the preference version changes, update `preferenceVersion` and reset a
site's counter to `1` when that site first adopts the new preference. When only
one deployed site changes, increment only that site's counter. The build script
refuses to package a Sites release when `preferenceVersion` differs from the
current local preference file.
