# Release process

RuWeb has two deployment targets with different responsibilities:

- GitHub Pages serves the public static site and its mirrored public blog snapshot.
- ChatGPT Sites serves the public API, uploaded assets, and the private editor.

The preparation command classifies a release from its changed paths:

- `Parallel` is used for ordinary UI, renderer, editor, and documentation changes. The same prepared commit is pushed to both GitHub and the Sites source repository in parallel. Sites version saving starts only after both source HEADs have been verified.
- `SitesFirst` is used when `worker/`, `db/`, `drizzle/`, or `.openai/hosting.json` changes. Sites must be deployed first; the new public API snapshot is then synchronized and committed before GitHub is pushed.

Inspect the decision without changing anything:

```powershell
.\scripts\release.ps1 -PlanOnly
```

Prepare a release for both targets:

```powershell
.\scripts\release.ps1 -CommitMessage "Describe the release"
```

`-Target GitHub` or `-Target Sites` can be used for a target-specific release. The script increments only the selected release counter. By default it increments both counters.

A full preparation performs these steps:

1. Fetch `origin/main` unless `-SkipFetch` is explicitly used.
2. Run whitespace, JavaScript syntax, Markdown, and—when applicable—migration checks.
3. Increment the selected website release counter and create the release commit.
4. Rebase that commit onto `origin/main`.
5. Build once, package the exact clean commit without rebuilding, and write `dist/release-manifest.json`.
6. Record the required GitHub and Sites source repositories and the exact expected commit in the manifest.

The script deliberately stops before push and production deployment. ChatGPT Sites has a source repository separate from GitHub. `save_site_version` rejects an archive when its `commit_sha` is not already the HEAD of that Sites repository, even when the same commit has been pushed to GitHub.

For a release targeting Sites:

1. Request a short-lived Sites source repository credential through the controlled Sites interface.
2. Expose only its token to the current process as `RUWEB_SITES_TOKEN`; never write it to Git configuration, a remote URL, a manifest, or a file. The push and verification scripts pass it to Git only through the child-process environment and remove it when the stage ends.
3. Push every source required by the current stage and run the gate. `All` starts the GitHub and Sites pushes concurrently:

   ```powershell
   .\scripts\push-release-sources.ps1 -SitesRemoteUrl <credential-remote-url>
   ```

   The lower-level Sites-only helper remains available when diagnosing a source push:

   ```powershell
   .\scripts\push-sites-source.ps1 -RemoteUrl <credential-remote-url> -ExpectedCommit <manifest-source-commit>
   ```

4. The orchestrator invokes `verify-release-sources.ps1` automatically. Only after it passes may the Sites version be saved and deployed. Both live sites still require cache-bypassed behavioral verification.

For `Parallel`, use the default `All` scope. For `SitesFirst`, first use `-Scope Sites`, deploy Sites, synchronize and commit the new public API snapshot, then use `-Scope GitHub`. The Sites check requires an exact HEAD match; after synchronization the GitHub check accepts a HEAD that contains the prepared release commit.

The public blog mirror runs hourly or by manual dispatch. When its snapshot commit changes `main`, the normal Pages source update already starts a Pages build; the mirror workflow must not request a second rebuild.
The mirror fetches post details with a small concurrency limit and reuses valid
image snapshots already stored in the repository, reducing API round trips
without changing the generated snapshot format.
