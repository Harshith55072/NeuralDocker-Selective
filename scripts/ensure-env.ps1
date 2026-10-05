# ensure-env.ps1
# Makes sure .env exists and holds strong, unique values for JWT_SECRET and SERVICE_TOKEN.
#
#  - Creates .env from .env.example if it is missing.
#  - Generates a secret ONLY when the current value is missing, blank, malformed, too short,
#    or one of the publicly known defaults that used to ship in this repo.
#  - A custom value you set yourself (e.g. the host's JWT_SECRET pasted in so two machines
#    can talk to each other) is left untouched.
#  - Never prints secret values. Backs up the old file to .env.bak before changing it.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-env.ps1
param(
    [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) { $EnvFile = Join-Path $root '.env' }
$example = Join-Path $root '.env.example'

$publicJwtDefault  = '404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970'
$placeholderToken  = 'nd-service-token-change-me-in-production'
$utf8NoBom         = New-Object System.Text.UTF8Encoding($false)

function New-RandomBytes([int]$count) {
    $b = New-Object byte[] $count
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($b) } finally { $rng.Dispose() }
    return ,$b
}

function Get-EnvVar([string[]]$lines, [string]$key) {
    $value = $null
    foreach ($l in $lines) {
        if ($l -match ('^\s*' + [regex]::Escape($key) + '\s*=(.*)$')) {
            $value = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $value
}

function Set-EnvVar([string[]]$lines, [string]$key, [string]$value) {
    $out = New-Object System.Collections.Generic.List[string]
    $done = $false
    foreach ($l in $lines) {
        if ($l -match ('^\s*' + [regex]::Escape($key) + '\s*=')) {
            if (-not $done) { $out.Add("$key=$value"); $done = $true }
        } else {
            $out.Add($l)
        }
    }
    if (-not $done) { $out.Add("$key=$value") }
    return ,$out.ToArray()
}

function Test-JwtSecret([string]$v) {
    if ([string]::IsNullOrWhiteSpace($v)) { return $false }
    if ($v -eq $publicJwtDefault) { return $false }
    try { $bytes = [Convert]::FromBase64String($v) } catch { return $false }
    return ($bytes.Length -ge 32)
}

function Test-ServiceToken([string]$v) {
    if ([string]::IsNullOrWhiteSpace($v)) { return $false }
    if ($v -eq $placeholderToken) { return $false }
    return ($v.Length -ge 16)
}

# 1. Make sure .env exists
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $example) {
        Copy-Item $example $EnvFile
        Write-Host "[INFO] No .env found - created one from .env.example"
    } else {
        [System.IO.File]::WriteAllText($EnvFile, '', $utf8NoBom)
        Write-Host "[INFO] No .env found - created an empty one"
    }
}

$text  = [System.IO.File]::ReadAllText($EnvFile)
$lines = [string[]]($text -split "`r?`n")
$changed = @()

# 2. JWT_SECRET
if (-not (Test-JwtSecret (Get-EnvVar $lines 'JWT_SECRET'))) {
    $secret = [Convert]::ToBase64String((New-RandomBytes 48))
    $lines = Set-EnvVar $lines 'JWT_SECRET' $secret
    $changed += 'JWT_SECRET'
}

# 3. SERVICE_TOKEN
if (-not (Test-ServiceToken (Get-EnvVar $lines 'SERVICE_TOKEN'))) {
    $token = -join ((New-RandomBytes 24) | ForEach-Object { $_.ToString('x2') })
    $lines = Set-EnvVar $lines 'SERVICE_TOKEN' $token
    $changed += 'SERVICE_TOKEN'
}

# 4. Write back only if something changed
if ($changed.Count -gt 0) {
    Copy-Item $EnvFile ($EnvFile + '.bak') -Force
    $newText = (($lines -join "`n").TrimEnd("`n")) + "`n"
    [System.IO.File]::WriteAllText($EnvFile, $newText, $utf8NoBom)
    Write-Host ("[INFO] Generated new secret(s) in .env: " + ($changed -join ', '))
    Write-Host "[INFO] Previous file saved as .env.bak. Existing logins will need to sign in again."
    if ($changed -contains 'JWT_SECRET') {
        Write-Host "[INFO] To join another machine's cluster, set JWT_SECRET in .env to that host's value."
    }
} else {
    Write-Host "[OK] .env already has strong JWT_SECRET and SERVICE_TOKEN."
}
exit 0
