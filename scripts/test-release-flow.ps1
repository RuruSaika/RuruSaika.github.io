[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("ruweb-release-flow-" + [guid]::NewGuid().ToString("N"))
$remoteRoot = "$testRoot-remote.git"

function Invoke-TestGit {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & git @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Test Git command failed: git $($Arguments -join ' ')" }
}

function Write-TestManifest {
    param(
        [Parameter(Mandatory)][string]$Commit,
        [Parameter(Mandatory)][ValidateSet("exact", "contains")][string]$Mode
    )
    $manifest = [ordered]@{
        schemaVersion = 2
        sourceCommit = $Commit
        strategy = if ($Mode -eq "contains") { "SitesFirst" } else { "Parallel" }
        sourceRepositories = [ordered]@{
            github = [ordered]@{ required = $true; remote = "origin"; branch = "main"; expectedCommit = $Commit; verification = $Mode }
            sites = [ordered]@{ required = $false; remote = "ephemeral credential required"; branch = "main"; expectedCommit = $Commit; verification = "exact" }
        }
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $testRoot "dist\release-manifest.json") -Encoding UTF8
}

try {
    New-Item -ItemType Directory -Path (Join-Path $testRoot "scripts"), (Join-Path $testRoot "dist") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot "scripts\push-release-sources.ps1"), (Join-Path $sourceRoot "scripts\push-sites-source.ps1"), (Join-Path $sourceRoot "scripts\verify-release-sources.ps1") -Destination (Join-Path $testRoot "scripts")
    Set-Content -LiteralPath (Join-Path $testRoot ".gitignore") -Value "dist/" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $testRoot "seed.txt") -Value "seed" -Encoding UTF8

    Invoke-TestGit @("init", "--bare", $remoteRoot)
    Invoke-TestGit @("-C", $testRoot, "init")
    Invoke-TestGit @("-C", $testRoot, "config", "user.name", "RuWeb release test")
    Invoke-TestGit @("-C", $testRoot, "config", "user.email", "release-test@localhost")
    Invoke-TestGit @("-C", $testRoot, "config", "core.autocrlf", "false")
    Invoke-TestGit @("-C", $testRoot, "add", ".")
    Invoke-TestGit @("-C", $testRoot, "commit", "-m", "test: seed release flow")
    Invoke-TestGit @("-C", $testRoot, "branch", "-M", "main")
    $remoteUri = "file:///" + ([IO.Path]::GetFullPath($remoteRoot).Replace("\", "/"))
    Invoke-TestGit @("-C", $testRoot, "remote", "add", "origin", $remoteUri)
    Invoke-TestGit @("-C", $testRoot, "push", "-u", "origin", "main")
    $preparedCommit = (& git -C $testRoot rev-parse HEAD).Trim()

    Write-TestManifest -Commit $preparedCommit -Mode exact
    & (Join-Path $testRoot "scripts\verify-release-sources.ps1") -Scope GitHub

    Set-Content -LiteralPath (Join-Path $testRoot "snapshot.txt") -Value "snapshot" -Encoding UTF8
    Invoke-TestGit @("-C", $testRoot, "add", "snapshot.txt")
    Invoke-TestGit @("-C", $testRoot, "commit", "-m", "test: synchronized snapshot")
    Invoke-TestGit @("-C", $testRoot, "push", "origin", "main")
    Write-TestManifest -Commit $preparedCommit -Mode contains
    & (Join-Path $testRoot "scripts\verify-release-sources.ps1") -Scope GitHub

    Set-Content -LiteralPath (Join-Path $testRoot "release.txt") -Value "release" -Encoding UTF8
    Invoke-TestGit @("-C", $testRoot, "add", "release.txt")
    Invoke-TestGit @("-C", $testRoot, "commit", "-m", "test: parallel release")
    $parallelCommit = (& git -C $testRoot rev-parse HEAD).Trim()
    Write-TestManifest -Commit $parallelCommit -Mode exact
    & (Join-Path $testRoot "scripts\push-release-sources.ps1") -Scope GitHub

    Write-Output "Release source flow tests passed."
} finally {
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    foreach ($path in @($testRoot, $remoteRoot)) {
        $fullPath = [IO.Path]::GetFullPath($path)
        if ($fullPath.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $fullPath)) {
            Remove-Item -LiteralPath $fullPath -Recurse -Force
        }
    }
}
