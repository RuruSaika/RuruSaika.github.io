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
$status = @(& git -C $projectRoot status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the release worktree." }
if ($status.Count -gt 0) { throw "Refusing to push release sources from a dirty worktree." }

$pushGithub = $manifest.sourceRepositories.github.required -and $Scope -in @("All", "GitHub")
$pushSites = $manifest.sourceRepositories.sites.required -and $Scope -in @("All", "Sites")
if (-not $pushGithub -and -not $pushSites) {
    throw "The selected scope does not contain a required source repository for this release."
}
if ($pushSites) {
    if (-not $SitesRemoteUrl) { throw "SitesRemoteUrl is required for a Sites source push." }
    if ([string]::IsNullOrWhiteSpace($env:RUWEB_SITES_TOKEN)) {
        throw "RUWEB_SITES_TOKEN is missing. Request a short-lived Sites source repository credential first."
    }
}

$strategy = [string]$manifest.strategy
$githubMode = [string]$manifest.sourceRepositories.github.verification
foreach ($branch in @(
    [string]$manifest.sourceRepositories.github.branch,
    [string]$manifest.sourceRepositories.sites.branch
)) {
    if ($branch -and ($branch -notmatch '^[A-Za-z0-9._/-]+$' -or $branch.Contains('..'))) {
        throw "The release manifest contains an unsupported source branch."
    }
}
if ($strategy -eq "SitesFirst" -and $Scope -eq "All") {
    throw "SitesFirst releases are sequential: push -Scope Sites, deploy and sync the snapshot, then push -Scope GitHub."
}
if ($pushSites -and $localHead -ne $expectedCommit) {
    throw "Sites source pushes require the exact prepared release commit as local HEAD."
}
$githubPushCommit = $expectedCommit
if ($pushGithub -and $githubMode -eq "contains") {
    & git -C $projectRoot merge-base --is-ancestor $expectedCommit $localHead
    if ($LASTEXITCODE -ne 0) {
        throw "Local HEAD $localHead no longer contains prepared commit $expectedCommit."
    }
    $githubPushCommit = $localHead
} elseif ($pushGithub -and $localHead -ne $expectedCommit) {
    throw "Local HEAD no longer matches the prepared release manifest."
}

$jobs = @()
try {
    try {
        if ($pushGithub) {
            $githubBranch = [string]$manifest.sourceRepositories.github.branch
            $jobs += Start-Job -Name "github-source" -ArgumentList $projectRoot, $githubPushCommit, $githubBranch -ScriptBlock {
                param($Root, $Commit, $Branch)
                & git -C $Root push --quiet origin "$Commit`:refs/heads/$Branch"
                if ($LASTEXITCODE -ne 0) { throw "GitHub source push failed." }
            }
        }
        if ($pushSites) {
            $sitesBranch = [string]$manifest.sourceRepositories.sites.branch
            $sitesPushScript = Join-Path $PSScriptRoot "push-sites-source.ps1"
            $jobs += Start-Job -Name "sites-source" -ArgumentList $sitesPushScript, $SitesRemoteUrl.AbsoluteUri, $sitesBranch, $expectedCommit -ScriptBlock {
                param($ScriptPath, $Remote, $Branch, $Commit)
                & $ScriptPath -RemoteUrl $Remote -Branch $Branch -ExpectedCommit $Commit
            }
        }

        $jobs | Wait-Job | Out-Null
        $failedJobs = @($jobs | Where-Object State -ne "Completed")
        foreach ($job in $jobs) {
            Receive-Job -Job $job
        }
        if ($failedJobs.Count -gt 0) {
            throw "One or more release source pushes failed; no Sites version may be saved."
        }
    } finally {
        $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
    }

    $verifyArguments = @{
        ManifestPath = $ManifestPath
        Scope = $Scope
    }
    if ($pushSites) { $verifyArguments.SitesRemoteUrl = $SitesRemoteUrl }
    & (Join-Path $PSScriptRoot "verify-release-sources.ps1") @verifyArguments
} finally {
    if ($pushSites) {
        Remove-Item Env:\RUWEB_SITES_TOKEN -ErrorAction SilentlyContinue
    }
}
