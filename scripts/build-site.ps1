$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot "..")).Path
$preferencePath = Join-Path $workspaceRoot "visual-preferences\visual-preferences.md"
$siteVersionPath = Join-Path $projectRoot "static\js\site-version.js"

if (-not (Test-Path -LiteralPath $preferencePath -PathType Leaf)) {
    throw "Could not find the local visual preference file at $preferencePath."
}

$preferenceText = [IO.File]::ReadAllText($preferencePath, [Text.Encoding]::UTF8)
$styleVersionMatch = [regex]::Match($preferenceText, '(?m)^style_version:\s*(\d{4}\.\d{2}\.\d{2}\.\d+)\s*$')
if (-not $styleVersionMatch.Success) {
    throw "Could not read a YYYY.MM.DD.N style_version from $preferencePath."
}
$styleVersion = $styleVersionMatch.Groups[1].Value

$siteVersionText = [IO.File]::ReadAllText($siteVersionPath, [Text.Encoding]::UTF8)
$sitePreferenceMatch = [regex]::Match($siteVersionText, 'const preferenceVersion = "(\d{4}\.\d{2}\.\d{2}\.\d+)";')
$githubReleaseMatch = [regex]::Match($siteVersionText, 'github:\s*(\d+)')
$sitesReleaseMatch = [regex]::Match($siteVersionText, 'sites:\s*(\d+)')
if (-not $sitePreferenceMatch.Success -or -not $githubReleaseMatch.Success -or -not $sitesReleaseMatch.Success) {
    throw "Could not read the dual-site version configuration from $siteVersionPath."
}
if ($sitePreferenceMatch.Groups[1].Value -ne $styleVersion) {
    throw "Site preference version $($sitePreferenceMatch.Groups[1].Value) does not match preference file version $styleVersion."
}
$githubSiteVersion = "$styleVersion.$($githubReleaseMatch.Groups[1].Value)"
$sitesSiteVersion = "$styleVersion.$($sitesReleaseMatch.Groups[1].Value)"

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
Copy-Item -LiteralPath (Join-Path $projectRoot "worker\index.js") -Destination (Join-Path $serverRoot.FullName "index.js")

Write-Output "Built GitHub site $githubSiteVersion and Sites site $sitesSiteVersion into $distRoot"
