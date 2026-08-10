# Site versioning

The canonical style guide and deployed websites have deliberately independent
version timelines. `style/STYLE_GUIDE.md` records the newest
available preference version, while each website records the version it has
actually adopted.

Website releases use:

`<adopted preference version>.<site release number>`

For example, preference `2026.08.09.1` and release `1` produce website version
`2026.08.09.1.1`.

Both adopted preference versions and release counters live in
`static/js/site-version.js` and are independent per deployment target:

- `github` identifies the GitHub Pages public site release.
- `sites` identifies the ChatGPT Sites release that provides the public API,
  uploaded assets, and private editor.

A website may remain on an older preference version until the user explicitly
asks it to adopt a newer one. GitHub Pages and ChatGPT Sites do not need to use
the same preference version or release number.

When one website adopts a new preference version, update only that target's
adopted version and reset only that target's release number to `1`. When a
website changes without adopting a new preference version, increment only that
target's release number.

The build script validates the version configuration and reports both the
current canonical preference and the versions adopted by the two websites. A
website being behind the canonical preference is valid and must not block a
build or package operation.
