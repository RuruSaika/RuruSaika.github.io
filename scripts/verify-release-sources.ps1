[CmdletBinding()]
param(
    [string]$ManifestPath,
    [uri]$SitesRemoteUrl,
    [ValidateSet("All", "GitHub", "Sites")]
    [string]$Scope = "All"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $projectRoot "dist\release-manifest.json"
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Release manifest not found: $ManifestPath"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
$expectedCommit = [string]$manifest.sourceCommit
if ($expectedCommit -notmatch '^[0-9a-f]{40}$') {
    throw "The release manifest does not contain a full source commit SHA."
}
$localHead = (& git -C $projectRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not identify the local release HEAD." }

$results = [ordered]@{}
if ($manifest.sourceRepositories.github.required -and $Scope -in @("All", "GitHub")) {
    $githubBranch = [string]$manifest.sourceRepositories.github.branch
    if ($githubBranch -notmatch '^[A-Za-z0-9._/-]+$' -or $githubBranch.Contains('..')) {
        throw "The release manifest contains an unsupported GitHub source branch."
    }
    $githubLine = @(& git -C $projectRoot ls-remote origin "refs/heads/$githubBranch") | Select-Object -First 1
    if ($LASTEXITCODE -ne 0) { throw "Could not read the GitHub source HEAD." }
    $githubHead = ($githubLine -split '\s+')[0]
    $githubMode = [string]$manifest.sourceRepositories.github.verification
    if ($githubMode -eq "contains") {
        & git -C $projectRoot merge-base --is-ancestor $expectedCommit $localHead
        if ($LASTEXITCODE -ne 0) {
            throw "Local HEAD $localHead no longer contains prepared commit $expectedCommit."
        }
        if ($githubHead -ne $localHead) {
            throw "GitHub source is not ready: expected current local HEAD $localHead but found $githubHead."
        }
        & git -C $projectRoot merge-base --is-ancestor $expectedCommit $githubHead
        if ($LASTEXITCODE -ne 0) {
            throw "GitHub source is not ready: $githubHead does not contain prepared commit $expectedCommit."
        }
    } else {
        if ($localHead -ne $expectedCommit) {
            throw "Local HEAD no longer matches the prepared release manifest."
        }
        if ($githubHead -ne $expectedCommit) {
            throw "GitHub source is not ready: expected exact commit $expectedCommit but found $githubHead."
        }
    }
    $results.github = $githubHead
}

if ($manifest.sourceRepositories.sites.required -and $Scope -in @("All", "Sites")) {
    if (-not $SitesRemoteUrl) {
        throw "SitesRemoteUrl is required to verify a release that targets Sites."
    }
    if ($SitesRemoteUrl.Scheme -ne "https" -or $SitesRemoteUrl.Host -ne "git.chatgpt-team.site") {
        throw "The Sites source remote must be an HTTPS git.chatgpt-team.site URL."
    }
    $token = $env:RUWEB_SITES_TOKEN
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "RUWEB_SITES_TOKEN is missing. Request a short-lived Sites source repository credential for verification."
    }
    $sitesBranch = [string]$manifest.sourceRepositories.sites.branch
    if ($sitesBranch -notmatch '^[A-Za-z0-9._/-]+$' -or $sitesBranch.Contains('..')) {
        throw "The release manifest contains an unsupported Sites source branch."
    }
    if ($localHead -ne $expectedCommit) {
        throw "Sites source verification requires the exact prepared release commit as local HEAD."
    }
    try {
        $env:GIT_CONFIG_COUNT = "1"
        $env:GIT_CONFIG_KEY_0 = "http.extraHeader"
        $env:GIT_CONFIG_VALUE_0 = "Authorization: Bearer $token"
        $sitesLine = @(& git -C $projectRoot ls-remote $SitesRemoteUrl.AbsoluteUri "refs/heads/$sitesBranch") | Select-Object -First 1
        if ($LASTEXITCODE -ne 0) { throw "Could not read the Sites source HEAD." }
    } finally {
        Remove-Item Env:\GIT_CONFIG_COUNT, Env:\GIT_CONFIG_KEY_0, Env:\GIT_CONFIG_VALUE_0, Env:\RUWEB_SITES_TOKEN -ErrorAction SilentlyContinue
    }
    $sitesHead = ($sitesLine -split '\s+')[0]
    if ($sitesHead -ne $expectedCommit) {
        throw "Sites source is not ready: expected $expectedCommit but found $sitesHead."
    }
    $results.sites = $sitesHead
}

if ($results.Count -eq 0) {
    throw "The selected scope does not contain a required source repository for this release."
}
Write-Output "Release source gate passed for $expectedCommit ($Scope)"
$results.GetEnumerator() | ForEach-Object { Write-Output "  $($_.Key): $($_.Value)" }
