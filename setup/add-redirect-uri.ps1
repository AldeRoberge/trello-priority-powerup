# Guides you through adding a sign-in address (redirect URI) to your Google OAuth client, then checks it worked.
# Google has no API for this, so the one click-through in the Cloud Console stays manual; this script does the rest.
#   .\scripts\add-redirect-uri.ps1            (for /life)
#   .\scripts\add-redirect-uri.ps1 -App work
param(
  [ValidateSet('life', 'work')][string]$App = 'life',
  [string]$Site = 'https://alderoberge.com'
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$Uri = "$Site/$App/api/auth/google/callback"
$StartUrl = "$Site/$App/api/auth/google"
$Console = 'https://console.cloud.google.com/apis/credentials'

# Returns $true when Google accepts the redirect URI, $false on redirect_uri_mismatch, $null when it cannot tell.
function Test-GoogleAcceptsUri {
  param([string]$SignInUrl)
  try {
    $r = Invoke-WebRequest -Uri $SignInUrl -MaximumRedirection 0 -UseBasicParsing -ErrorAction SilentlyContinue
  } catch { $r = $null }
  if (-not $r) {
    try { $null = Invoke-WebRequest -Uri $SignInUrl -MaximumRedirection 0 -UseBasicParsing } catch { $r = $_.Exception.Response }
  }
  if (-not $r -or -not $r.Headers) { return $null }
  $loc = $r.Headers['Location']
  if ($loc -is [array]) { $loc = $loc[0] }
  if (-not $loc -or $loc -notmatch '^https://accounts\.google\.com/') { return $null }
  try {
    $g = Invoke-WebRequest -Uri $loc -UseBasicParsing -ErrorAction Stop
    return ($g.StatusCode -lt 400 -and $g.Content -notmatch 'redirect_uri_mismatch')
  } catch {
    $body = ''
    try { $body = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch { }
    if ($body -match 'redirect_uri_mismatch') { return $false }
    return $null
  }
}

Write-Host ''
Write-Host "Why this is needed" -ForegroundColor Cyan
Write-Host "  When you sign in on $Site/$App, Google sends you back to a fixed address."
Write-Host "  Google only does that for addresses you listed in advance on your OAuth client."
Write-Host "  Without it you get 'Error 400: redirect_uri_mismatch'."
Write-Host ''
Write-Host "The address to add" -ForegroundColor Cyan
Write-Host "  $Uri"

$copied = $false
try { Set-Clipboard -Value $Uri; $copied = $true } catch { }
if ($copied) { Write-Host '  (copied to your clipboard)' -ForegroundColor DarkGray }

Write-Host ''
Write-Host "What to do in the page that opens" -ForegroundColor Cyan
Write-Host "  1. Click your 'Web application' OAuth 2.0 client (the one /work already uses)."
Write-Host "  2. Under 'Authorized redirect URIs' click 'Add URI' and paste the address (Ctrl+V)."
Write-Host "  3. Click 'Save'. Google can take a minute or two to apply it."
Write-Host ''

$already = Test-GoogleAcceptsUri $StartUrl
if ($already -eq $true) {
  Write-Host "Already done: Google accepts $Uri. Nothing to do." -ForegroundColor Green
  exit 0
}

try { Start-Process $Console } catch { Write-Host "Open this page yourself: $Console" }

if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected) {
  Write-Host 'Not interactive: re-run this script after saving to check it.'
  exit 0
}

for ($i = 1; $i -le 5; $i++) {
  Read-Host 'Press Enter once you have clicked Save (I will check it)' | Out-Null
  $ok = Test-GoogleAcceptsUri $StartUrl
  if ($ok -eq $true) {
    Write-Host "It works. Sign in at $Site/$App/" -ForegroundColor Green
    exit 0
  }
  if ($ok -eq $false) {
    Write-Host 'Google still says redirect_uri_mismatch. Check the address has no typo or trailing slash, and that you edited the right client. It can also take a minute: wait, then press Enter again.' -ForegroundColor Yellow
  } else {
    Write-Host 'Could not check automatically (no answer from the site or Google). Try signing in yourself.' -ForegroundColor Yellow
    exit 0
  }
}
Write-Host "Still not accepted. Re-run: .\scripts\add-redirect-uri.ps1 -App $App" -ForegroundColor Yellow
exit 1
