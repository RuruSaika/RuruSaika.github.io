$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"

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
Copy-Item -LiteralPath (Join-Path $projectRoot "old_index.html") -Destination $clientRoot.FullName
Copy-Item -LiteralPath (Join-Path $projectRoot "static") -Destination $clientRoot.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "study") -Destination $clientRoot.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "worker\index.js") -Destination (Join-Path $serverRoot.FullName "index.js")

Write-Output "Built site into $distRoot"
