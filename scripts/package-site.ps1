param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$archivePath = Join-Path $distRoot "sites-build.tar"
$buildStatePath = Join-Path $distRoot "build-state.json"

if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot "build-site.ps1")
} else {
    foreach ($requiredPath in @(
        (Join-Path $distRoot "client"),
        (Join-Path $distRoot "server"),
        $buildStatePath
    )) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Cannot reuse the build because $requiredPath is missing."
        }
    }

    $buildState = Get-Content -LiteralPath $buildStatePath -Encoding UTF8 -Raw | ConvertFrom-Json
    $sourceCommit = (& git -C $projectRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $buildState.sourceCommit -ne $sourceCommit) {
        throw "Cannot reuse a build produced from a different source commit."
    }
    $sourceStatus = @(& git -C $projectRoot status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect the source worktree before packaging."
    }
    if ($buildState.sourceDirty -or $sourceStatus.Count -gt 0) {
        throw "Cannot reuse a build produced from, or packaged from, a dirty worktree."
    }
}

tar -cf $archivePath `
    -C $projectRoot `
    "dist/client" `
    "dist/server" `
    ".openai/hosting.json"

if ($LASTEXITCODE -ne 0) {
    throw "Could not create the Sites build archive."
}

Write-Output "Packaged Sites build at $archivePath"
