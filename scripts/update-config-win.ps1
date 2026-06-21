# Symlink this repo's rules and skills into the user-level ~\.claude folder.
# Additive: existing non-link files/dirs are left untouched; our own links are
# refreshed. Safe to re-run anytime (e.g. after `git pull`).
#
# Run from an elevated PowerShell (Administrator) or with Developer Mode enabled
# so that creating symlinks is permitted.
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Src  = Join-Path $RepoRoot '.claude'
$Dest = Join-Path $HOME '.claude'

foreach ($kind in 'rules', 'skills') {
    $destKind = Join-Path $Dest $kind
    New-Item -ItemType Directory -Force $destKind | Out-Null

    Get-ChildItem (Join-Path $Src $kind) | ForEach-Object {
        $target = Join-Path $destKind $_.Name
        $existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue

        if ($existing -and -not $existing.LinkType) {
            Write-Host "skip existing: $kind/$($_.Name)"
        }
        else {
            if ($existing) { Remove-Item -LiteralPath $target -Force -Recurse }
            New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
            Write-Host "linked: $kind/$($_.Name)"
        }
    }
}
