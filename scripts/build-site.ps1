$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot "..")).Path
$preferencePath = Join-Path $workspaceRoot "visual-preferences\visual-preferences.md"

if (-not (Test-Path -LiteralPath $preferencePath -PathType Leaf)) {
    throw "Could not find the local visual preference file at $preferencePath."
}

$preferenceText = [IO.File]::ReadAllText($preferencePath, [Text.Encoding]::UTF8)
$styleVersionMatch = [regex]::Match($preferenceText, '(?m)^style_version:\s*(\d{4}\.\d{2}\.\d{2}\.\d+)\s*$')
if (-not $styleVersionMatch.Success) {
    throw "Could not read a YYYY.MM.DD.N style_version from $preferencePath."
}
$styleVersion = $styleVersionMatch.Groups[1].Value

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

Get-ChildItem -LiteralPath $clientRoot.FullName -Filter "*.html" -Recurse | ForEach-Object {
    $html = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
    if ($html.Contains("{{STYLE_VERSION}}")) {
        $html = $html.Replace("{{STYLE_VERSION}}", $styleVersion)
        [IO.File]::WriteAllText($_.FullName, $html, [Text.UTF8Encoding]::new($false))
    }
}

Write-Output "Built site style $styleVersion into $distRoot"
