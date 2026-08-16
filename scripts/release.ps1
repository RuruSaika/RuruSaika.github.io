[CmdletBinding()]
param(
    [string]$CommitMessage,
    [ValidateSet("Both", "GitHub", "Sites")]
    [string]$Target = "Both",
    [switch]$PlanOnly,
    [switch]$SkipFetch
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$siteVersionPath = Join-Path $projectRoot "static\js\site-version.js"
$manifestPath = Join-Path $projectRoot "dist\release-manifest.json"
$sitesFirstPrefixes = @("worker/", "db/", "drizzle/")
$sitesFirstFiles = @(".openai/hosting.json")
$utf8NoBom = [Text.UTF8Encoding]::new($false)

function Invoke-Git {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [switch]$Capture
    )

    if ($Capture) {
        $output = @(& git -C $projectRoot @Arguments)
        if ($LASTEXITCODE -ne 0) {
            throw "Git failed: git $($Arguments -join ' ')"
        }
        return $output
    }

    & git -C $projectRoot @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git failed: git $($Arguments -join ' ')"
    }
}

function Resolve-ToolPath {
    param(
        [Parameter(Mandatory)]
        [string]$CommandName,
        [Parameter(Mandatory)]
        [string]$FallbackRelativePath
    )

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $fallback = Join-Path $env:USERPROFILE $FallbackRelativePath
    if (Test-Path -LiteralPath $fallback -PathType Leaf) {
        return $fallback
    }

    throw "Could not find $CommandName. Install it or make it available on PATH."
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

function Get-ReleaseFiles {
    $files = @()
    $files += Invoke-Git -Arguments @("diff", "--name-only", "HEAD", "--") -Capture
    $files += Invoke-Git -Arguments @("ls-files", "--others", "--exclude-standard") -Capture
    return @($files | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-ReleaseStrategy {
    param(
        [Parameter(Mandatory)]
        [string[]]$Files
    )

    foreach ($file in $Files) {
        $normalized = $file.Replace("\", "/")
        if ($sitesFirstFiles -contains $normalized) {
            return "SitesFirst"
        }
        foreach ($prefix in $sitesFirstPrefixes) {
            if ($normalized.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                return "SitesFirst"
            }
        }
    }
    return "Parallel"
}

function Update-ReleaseNumbers {
    param(
        [Parameter(Mandatory)]
        [ValidateSet("Both", "GitHub", "Sites")]
        [string]$ReleaseTarget
    )

    $text = [IO.File]::ReadAllText($siteVersionPath, [Text.Encoding]::UTF8)
    $pattern = 'const releaseNumbers = Object\.freeze\(\{ github: (\d+), sites: (\d+) \}\);'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) {
        throw "Could not read release counters from $siteVersionPath."
    }

    $github = [int]$match.Groups[1].Value
    $sites = [int]$match.Groups[2].Value
    if ($ReleaseTarget -in @("Both", "GitHub")) { $github++ }
    if ($ReleaseTarget -in @("Both", "Sites")) { $sites++ }

    $replacement = "const releaseNumbers = Object.freeze({ github: $github, sites: $sites });"
    $updated = ([regex]::new($pattern)).Replace($text, $replacement, 1)
    [IO.File]::WriteAllText($siteVersionPath, $updated, $utf8NoBom)
}

function Invoke-SourceChecks {
    param(
        [Parameter(Mandatory)]
        [string]$Strategy
    )

    Invoke-Git -Arguments @("diff", "--check")

    $node = Resolve-ToolPath -CommandName "node" -FallbackRelativePath ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    $javascriptFiles = @(
        "worker/index.js",
        "study/shared.js",
        "study/admin/admin.js",
        "static/js/blog.js",
        "static/js/article.js",
        "static/js/script.js",
        "scripts/sync-public-blog.mjs"
    )
    foreach ($file in $javascriptFiles) {
        Invoke-CheckedCommand -FilePath $node -Arguments @("--check", (Join-Path $projectRoot $file))
    }
    Invoke-CheckedCommand -FilePath $node -Arguments @((Join-Path $projectRoot "scripts\test-markdown.mjs"))

    if ($Strategy -eq "SitesFirst") {
        $python = Resolve-ToolPath -CommandName "python" -FallbackRelativePath ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
        Invoke-CheckedCommand -FilePath $python -Arguments @((Join-Path $projectRoot "scripts\test-migrations.py"))
    }
}

$branch = (Invoke-Git -Arguments @("branch", "--show-current") -Capture | Select-Object -First 1).Trim()
if ($branch -ne "main") {
    throw "Releases must be prepared from main; the current branch is '$branch'."
}

$releaseFiles = Get-ReleaseFiles
if ($releaseFiles.Count -eq 0) {
    throw "There are no uncommitted release changes to prepare."
}
$strategy = Get-ReleaseStrategy -Files $releaseFiles
if ($strategy -eq "SitesFirst" -and $Target -eq "GitHub") {
    throw "API, database, or hosting changes cannot be prepared as a GitHub-only release."
}

Write-Output "Release target: $Target"
Write-Output "Release strategy: $strategy"
Write-Output "Changed files:"
$releaseFiles | ForEach-Object { Write-Output "  $_" }

if ($PlanOnly) {
    Write-Output "Plan only: no files, commits, builds, or remote refs were changed."
    return
}
if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    throw "Provide -CommitMessage for a release preparation, or use -PlanOnly to inspect the strategy."
}

if (-not $SkipFetch) {
    Invoke-Git -Arguments @("fetch", "origin", "main")
}

Invoke-SourceChecks -Strategy $strategy
Update-ReleaseNumbers -ReleaseTarget $Target
Invoke-Git -Arguments @("diff", "--check")
Invoke-Git -Arguments @("add", "--all")
Invoke-Git -Arguments @("commit", "-m", $CommitMessage)

if (-not $SkipFetch) {
    Invoke-Git -Arguments @("rebase", "origin/main")
}

$committedFiles = @(Invoke-Git -Arguments @("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD") -Capture)

$remainingChanges = @(Invoke-Git -Arguments @("status", "--porcelain", "--untracked-files=all") -Capture)
if ($remainingChanges.Count -gt 0) {
    throw "The worktree is not clean after commit/rebase; refusing to build a release archive."
}

Invoke-SourceChecks -Strategy $strategy
& (Join-Path $PSScriptRoot "test-release-flow.ps1")
& (Join-Path $PSScriptRoot "build-site.ps1")
& (Join-Path $PSScriptRoot "package-site.ps1") -SkipBuild

$buildStatePath = Join-Path $projectRoot "dist\build-state.json"
$buildState = Get-Content -LiteralPath $buildStatePath -Encoding UTF8 -Raw | ConvertFrom-Json
$githubRequired = $Target -in @("Both", "GitHub")
$sitesRequired = $Target -in @("Both", "Sites")
$manifest = [ordered]@{
    schemaVersion = 2
    strategy = $strategy
    target = $Target
    sourceCommit = $buildState.sourceCommit
    githubVersion = $buildState.githubVersion
    sitesVersion = $buildState.sitesVersion
    archive = "dist/sites-build.tar"
    sitesProjectId = (Get-Content -LiteralPath (Join-Path $projectRoot ".openai\hosting.json") -Encoding UTF8 -Raw | ConvertFrom-Json).project_id
    sourceRepositories = [ordered]@{
        github = [ordered]@{
            required = $githubRequired
            remote = "origin"
            branch = "main"
            expectedCommit = $buildState.sourceCommit
            verification = if ($strategy -eq "SitesFirst") { "contains" } else { "exact" }
        }
        sites = [ordered]@{
            required = $sitesRequired
            remote = "ephemeral credential required"
            branch = "main"
            expectedCommit = $buildState.sourceCommit
            verification = "exact"
        }
    }
    sourceGateRequiredBeforeSitesSave = $sitesRequired
    sourcePushOrder = if ($strategy -eq "SitesFirst") {
        @("sites", "deploy-sites", "sync-public-snapshot", "github")
    } else {
        @("github+sites", "deploy-sites")
    }
    changedFiles = $committedFiles
    preparedAtUtc = [DateTime]::UtcNow.ToString("o")
}
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4) + [Environment]::NewLine, $utf8NoBom)

Write-Output "Release preparation complete: $manifestPath"
if ($Target -eq "GitHub") {
    Write-Output "Next: push this exact commit to GitHub main, then verify the live Pages site."
} elseif ($Target -eq "Sites") {
    Write-Output "Next: request a Sites source credential, push/verify this commit with push-sites-source.ps1, pass verify-release-sources.ps1, then save/deploy the archive."
} elseif ($strategy -eq "SitesFirst") {
    Write-Output "Next: push/verify Sites source, pass the Sites source gate, save/deploy Sites, sync the public snapshot, then commit and push GitHub main."
} else {
    Write-Output "Next: push this commit to GitHub and Sites source in parallel, verify both source HEADs, then save/deploy Sites and verify both live sites."
}
