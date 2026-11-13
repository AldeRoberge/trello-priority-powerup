# One-time setup of https://alderoberge.com/work (the standalone app), run after setup-sheet-sync.ps1.
#   npm run setup:work
# Deploys the Worker (route alderoberge.com/work/*, Durable Object for the data) and sets the Google sign-in
# secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET (random, kept if it exists) and WORK_ALLOWED_EMAILS.
# Safe to run again: press Enter to keep a value already set. Nothing secret is typed on a command line.
#   -GoogleClientId, -GoogleClientSecret, -Emails   skip the matching question (for a script)

param(
  [string]$GoogleClientId = "",
  [string]$GoogleClientSecret = "",
  [string]$Emails = ""
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root = Split-Path -Parent $PSScriptRoot
$WorkerDir = Join-Path $Root "workers\trello-sheet-sync"
$RedirectUri = "https://alderoberge.com/work/api/auth/google/callback"

function Write-Step([string]$Text) { Write-Host "`n== $Text ==" -ForegroundColor Cyan }
function Write-Info([string]$Text) { Write-Host "  $Text" -ForegroundColor DarkGray }

# Runs a native command, shows its output, returns only the exit code (a function returns ALL its output in 5.1).
function Invoke-Native([scriptblock]$Command) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Command | Out-Host; return [int]$LASTEXITCODE } finally { $ErrorActionPreference = $prev }
}

function Test-GoogleClientId([string]$Value) { return [bool]($Value -match '^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$') }
function Test-GoogleClientSecret([string]$Value) { return [bool]($Value -match '^GOCSPX-[A-Za-z0-9_-]{10,}$') }

# Returns the cleaned, lower-case address list ("a@b.c,d@e.f") or $null when any entry is not an address.
function ConvertTo-EmailList([string]$Value) {
  $items = @($Value -split '[,;\s]+' | Where-Object { $_ })
  if ($items.Count -eq 0) { return $null }
  foreach ($item in $items) { if ($item -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { return $null } }
  return (($items | ForEach-Object { $_.ToLowerInvariant() } | Select-Object -Unique) -join ",")
}

# Asks until the answer passes $Test. An empty answer keeps the existing value when $HasExisting, else asks again.
function Read-Valid([string]$Prompt, [scriptblock]$Convert, [string]$Hint, [bool]$HasExisting) {
  while ($true) {
    $suffix = if ($HasExisting) { " (Entree = garder)" } else { "" }
    try { $answer = Read-Host ($Prompt + $suffix) } catch { throw "Question impossible sans terminal interactif: passez le parametre en argument." }
    $answer = "$answer".Trim()
    if (-not $answer -and $HasExisting) { return $null }
    $value = & $Convert $answer
    if ($value) { return $value }
    Write-Host "  Valeur invalide. $Hint" -ForegroundColor Yellow
  }
}

function Get-DeployedSecretNames {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $raw = (& npx --yes wrangler secret list --format json 2>$null) -join "`n"
    $items = $raw | ConvertFrom-Json | ForEach-Object { $_ }   # a JSON array arrives as one object in 5.1: flatten
    return @($items | ForEach-Object { $_.name })
  } catch { return @() } finally { $ErrorActionPreference = $prev }
}

function New-SessionSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

# Dot-sourced by tests with $env:SETUP_WORK_LIB = "1": only the helpers above are defined.
if ($env:SETUP_WORK_LIB -eq "1") { return }

Set-Location $WorkerDir
try {
  Write-Step "1/3 Verification"
  if (-not (Test-Path (Join-Path $WorkerDir "node_modules"))) {
    if ((Invoke-Native { npm install --no-audit --no-fund }) -ne 0) { throw "npm install a echoue" }
  }
  if ((Invoke-Native { npx --yes wrangler whoami }) -ne 0) {
    if ((Invoke-Native { npx --yes wrangler login }) -ne 0) { throw "wrangler login a echoue" }
  }
  $have = Get-DeployedSecretNames
  foreach ($need in @("TRELLO_KEY", "TRELLO_TOKEN", "TRELLO_BOARD_ID", "SYNC_SECRET")) {
    if ($have -notcontains $need) { throw "Le secret $need manque: lancez d'abord  npm run setup:sheet-sync" }
  }

  Write-Step "2/3 Connexion Google"
  Write-Host "  Dans Google Cloud Console > APIs et services > Identifiants > Creer des identifiants > ID client OAuth (Application Web)"
  Write-Host "  ajoutez cette URI de redirection autorisee (aussi sur un client existant, ex. celui de /storage):"
  Write-Host "    $RedirectUri" -ForegroundColor Green
  Write-Host "  Page des identifiants: https://console.cloud.google.com/apis/credentials"

  $secrets = [ordered]@{}
  if ($GoogleClientId) {
    if (-not (Test-GoogleClientId $GoogleClientId)) { throw "GoogleClientId invalide (attendu: ...apps.googleusercontent.com)" }
    $secrets["GOOGLE_CLIENT_ID"] = $GoogleClientId
  } else {
    $v = Read-Valid "ID client" { param($a) if (Test-GoogleClientId $a) { $a } else { $null } } "Il ressemble a 123-abc.apps.googleusercontent.com" ($have -contains "GOOGLE_CLIENT_ID")
    if ($v) { $secrets["GOOGLE_CLIENT_ID"] = $v }
  }
  if ($GoogleClientSecret) {
    if (-not (Test-GoogleClientSecret $GoogleClientSecret)) { throw "GoogleClientSecret invalide (attendu: GOCSPX-...)" }
    $secrets["GOOGLE_CLIENT_SECRET"] = $GoogleClientSecret
  } else {
    $v = Read-Valid "Secret client" { param($a) if (Test-GoogleClientSecret $a) { $a } else { $null } } "Il commence par GOCSPX-" ($have -contains "GOOGLE_CLIENT_SECRET")
    if ($v) { $secrets["GOOGLE_CLIENT_SECRET"] = $v }
  }
  if ($Emails) {
    $list = ConvertTo-EmailList $Emails
    if (-not $list) { throw "Emails invalides" }
    $secrets["WORK_ALLOWED_EMAILS"] = $list
  } else {
    $v = Read-Valid "Adresses Google autorisees (separees par des virgules)" { param($a) ConvertTo-EmailList $a } "Exemple: moi@gmail.com" ($have -contains "WORK_ALLOWED_EMAILS")
    if ($v) { $secrets["WORK_ALLOWED_EMAILS"] = $v }
  }
  if ($have -notcontains "SESSION_SECRET") { $secrets["SESSION_SECRET"] = New-SessionSecret }

  Write-Step "3/3 Deploiement"
  if ((Invoke-Native { npx --yes wrangler deploy }) -ne 0) { throw "wrangler deploy a echoue" }
  if ($secrets.Count -gt 0) {
    $bulk = Join-Path $env:TEMP ("work-secrets-" + [guid]::NewGuid().ToString("N") + ".json")
    try {
      ($secrets | ConvertTo-Json) | Set-Content -Path $bulk -Encoding UTF8
      if ((Invoke-Native { npx --yes wrangler secret bulk $bulk }) -ne 0) { throw "wrangler secret bulk a echoue" }
    } finally { Remove-Item $bulk -Force -ErrorAction SilentlyContinue }
  }
  Write-Host "`nPret: https://alderoberge.com/work/" -ForegroundColor Green
  Write-Info "Pour changer une valeur, relancez: npm run setup:work"
} finally {
  Set-Location $Root
}
