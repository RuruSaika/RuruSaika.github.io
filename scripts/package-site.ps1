$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$archivePath = Join-Path $distRoot "sites-build.tar"

& (Join-Path $PSScriptRoot "build-site.ps1")

tar -cf $archivePath `
    -C $projectRoot `
    "dist/client" `
    "dist/server" `
    ".openai/hosting.json"

if ($LASTEXITCODE -ne 0) {
    throw "Could not create the Sites build archive."
}

Write-Output "Packaged Sites build at $archivePath"
