[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [uri]$RemoteUrl,
    [string]$Branch = "main",
    [string]$ExpectedCommit
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$token = $env:RUWEB_SITES_TOKEN

if ($RemoteUrl.Scheme -ne "https" -or $RemoteUrl.Host -ne "git.chatgpt-team.site") {
    throw "The Sites source remote must be an HTTPS git.chatgpt-team.site URL."
}
if ($Branch -notmatch '^[A-Za-z0-9._/-]+$' -or $Branch.Contains('..')) {
    throw "Branch contains unsupported characters."
}
if ([string]::IsNullOrWhiteSpace($token)) {
    throw "RUWEB_SITES_TOKEN is missing. Request a short-lived Sites source repository credential and expose only its token to this process."
}
if ([string]::IsNullOrWhiteSpace($ExpectedCommit)) {
    $ExpectedCommit = (& git -C $projectRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Could not identify the current release commit." }
}
if ($ExpectedCommit -notmatch '^[0-9a-f]{40}$') {
    throw "ExpectedCommit must be a full 40-character Git commit SHA."
}

$resolvedCommit = (& git -C $projectRoot rev-parse $ExpectedCommit).Trim()
if ($LASTEXITCODE -ne 0 -or $resolvedCommit -ne $ExpectedCommit) {
    throw "ExpectedCommit does not resolve to the exact local commit."
}
$status = @(& git -C $projectRoot status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the release worktree." }
if ($status.Count -gt 0) {
    throw "Refusing to push a Sites source commit from a dirty worktree."
}

$pushRef = "$ExpectedCommit`:refs/heads/$Branch"
if (-not $PSCmdlet.ShouldProcess("$($RemoteUrl.Host)/$Branch", "Push Sites source commit $ExpectedCommit")) {
    return
}
try {
    # Supply the short-lived credential through the child-process environment.
    # It never becomes part of the remote URL, repository config, or command line.
    $env:GIT_CONFIG_COUNT = "1"
    $env:GIT_CONFIG_KEY_0 = "http.extraHeader"
    $env:GIT_CONFIG_VALUE_0 = "Authorization: Bearer $token"
    & git -C $projectRoot push --quiet $RemoteUrl.AbsoluteUri $pushRef
    if ($LASTEXITCODE -ne 0) { throw "Could not push the release commit to the Sites source repository." }

    $remoteLine = @(& git -C $projectRoot ls-remote $RemoteUrl.AbsoluteUri "refs/heads/$Branch") | Select-Object -First 1
    if ($LASTEXITCODE -ne 0) { throw "Could not verify the Sites source repository HEAD." }
} finally {
    Remove-Item Env:\GIT_CONFIG_COUNT, Env:\GIT_CONFIG_KEY_0, Env:\GIT_CONFIG_VALUE_0, Env:\RUWEB_SITES_TOKEN -ErrorAction SilentlyContinue
}
$remoteHead = ($remoteLine -split '\s+')[0]
if ($remoteHead -ne $ExpectedCommit) {
    throw "Sites source verification failed: expected $ExpectedCommit but found $remoteHead."
}

Write-Output "Sites source verified: $Branch -> $remoteHead"
