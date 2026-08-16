$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot "..")).Path
$preferencePath = Join-Path $workspaceRoot "style\STYLE_GUIDE.md"
$siteVersionPath = Join-Path $projectRoot "static\js\site-version.js"

if (-not (Test-Path -LiteralPath $preferencePath -PathType Leaf)) {
    throw "Could not find the local style guide at $preferencePath."
}

$preferenceText = [IO.File]::ReadAllText($preferencePath, [Text.Encoding]::UTF8)
$styleVersionMatch = [regex]::Match($preferenceText, '(?m)^style_version:\s*(\d{4}\.\d{2}\.\d{2}\.\d+)\s*$')
if (-not $styleVersionMatch.Success) {
    throw "Could not read a YYYY.MM.DD.N style_version from $preferencePath."
}
$styleVersion = $styleVersionMatch.Groups[1].Value

$siteVersionText = [IO.File]::ReadAllText($siteVersionPath, [Text.Encoding]::UTF8)
$githubPreferenceMatch = [regex]::Match($siteVersionText, 'github:\s*"(\d{4}\.\d{2}\.\d{2}\.\d+)",')
$sitesPreferenceMatch = [regex]::Match($siteVersionText, 'sites:\s*"(\d{4}\.\d{2}\.\d{2}\.\d+)",')
$githubReleaseMatch = [regex]::Match($siteVersionText, 'github:\s*(\d+)')
$sitesReleaseMatch = [regex]::Match($siteVersionText, 'sites:\s*(\d+)')
if (-not $githubPreferenceMatch.Success -or -not $sitesPreferenceMatch.Success -or -not $githubReleaseMatch.Success -or -not $sitesReleaseMatch.Success) {
    throw "Could not read the dual-site version configuration from $siteVersionPath."
}
$githubPreferenceVersion = $githubPreferenceMatch.Groups[1].Value
$sitesPreferenceVersion = $sitesPreferenceMatch.Groups[1].Value
$githubSiteVersion = "$githubPreferenceVersion.$($githubReleaseMatch.Groups[1].Value)"
$sitesSiteVersion = "$sitesPreferenceVersion.$($sitesReleaseMatch.Groups[1].Value)"

if (Test-Path -LiteralPath $distRoot) {
    $resolvedDist = (Resolve-Path -LiteralPath $distRoot).Path
    if (-not $resolvedDist.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) {
        throw "Refusing to replace a build directory outside the project."
    }
    Remove-Item -LiteralPath $resolvedDist -Recurse -Force
}

$clientRoot = New-Item -ItemType Directory -Force -Path (Join-Path $distRoot "client")
$serverRoot = New-Item -ItemType Directory -Force -Path (Join-Path $distRoot "server")

Copy-Item -LiteralPath (Join-Path $projectRoot "index.html") -Destination $clientRoot.FullName
Copy-Item -LiteralPath (Join-Path $projectRoot "static") -Destination $clientRoot.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "study") -Destination $clientRoot.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "blog") -Destination $clientRoot.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "worker\index.js") -Destination (Join-Path $serverRoot.FullName "index.js")

$sourceCommit = (& git -C $projectRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sourceCommit) {
    throw "Could not identify the source commit for this build."
}
$sourceStatus = @(& git -C $projectRoot status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect the source worktree for this build."
}
$buildState = [ordered]@{
    sourceCommit = $sourceCommit
    sourceDirty = $sourceStatus.Count -gt 0
    githubVersion = $githubSiteVersion
    sitesVersion = $sitesSiteVersion
    builtAtUtc = [DateTime]::UtcNow.ToString("o")
}
$buildStatePath = Join-Path $distRoot "build-state.json"
$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($buildStatePath, ($buildState | ConvertTo-Json) + [Environment]::NewLine, $utf8NoBom)

Write-Output "Current canonical preference: $styleVersion"
Write-Output "Built GitHub site $githubSiteVersion and Sites site $sitesSiteVersion into $distRoot"
