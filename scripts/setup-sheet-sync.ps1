# One-shot setup for the Trello <-> Google Sheet sync (workers/trello-sheet-sync).
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-sheet-sync.ps1
#   (or: npm run setup:sheet-sync)
#
# What it does, in order (progress is saved in workers/trello-sheet-sync/.setup-state.json so a
# re-run resumes where it stopped; -Reset starts over):
#   1 deps      npm install in the worker folder
#   2 cfauth    wrangler login (Cloudflare) if needed
#   3 trello    opens Trello's authorize page, you paste the token once; you pick the board
#   4 google    gcloud project + Sheets/Drive APIs + service account, creates the Sheet under YOUR
#               Google account and shares it with the service account (same approach as
#               vvd-smart-dashboard/scripts/setup-villevd-shortener-gcp.ps1)
#   5 deploy    wrangler deploy + wrangler secret bulk (nothing secret is ever typed on a command line)
#   6 webhook   registers the Trello webhook and runs the first sync
#   7 connect   builds a "connection code" (copied to the clipboard) - paste it in the Power-Up
#               under Paramètres du Cerveau > Google Sheets, or in the Table view.
#
# Prerequisites: Node 18+, a Cloudflare account, a Google account, a Trello account.
# gcloud is installed for you (no admin rights) if missing. `gcloud auth login
# --enable-gdrive-access` is run for you when not logged in (opens your browser).

param(
  [switch]$Reset,
  [string]$ProjectId,
  [string]$SheetId,
  [string]$BoardId
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WorkerDir = Join-Path $RepoRoot "workers\trello-sheet-sync"
$StatePath = Join-Path $WorkerDir ".setup-state.json"
$DevVarsPath = Join-Path $WorkerDir ".dev.vars"
$KeyPath = Join-Path $WorkerDir ".sa-key.json"
$CodePath = Join-Path $WorkerDir ".connection-code.txt"
$GcloudArchiveDir = Join-Path $env:LOCALAPPDATA "google-cloud-sdk"

# ---------------------------------------------------------------- state ---------------------------------------------
if ($Reset -and (Test-Path $StatePath)) { Remove-Item $StatePath -Force }
$State = @{}
if (Test-Path $StatePath) {
  (Get-Content -Raw $StatePath | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $State[$_.Name] = $_.Value }
}
function Save-State { $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StatePath -Encoding UTF8 }
if ($ProjectId) { $State.projectId = $ProjectId }
if ($SheetId) { $State.sheetId = $SheetId }
if ($BoardId) { $State.boardId = $BoardId }

function Write-Step([string]$Text) { Write-Host "`n== $Text ==" -ForegroundColor Cyan }
function Write-Info([string]$Text) { Write-Host "  $Text" -ForegroundColor DarkGray }

# Runs a native command with stderr noise tolerated; returns its exit code.
function Invoke-Native([scriptblock]$Command) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Command | Out-Host; return [int]$LASTEXITCODE } finally { $ErrorActionPreference = $prev }
}

function Invoke-Step([string]$Name, [string]$Title, [scriptblock]$Body) {
  if ($State["done_$Name"]) { Write-Host "[skip] $Title (already done)" -ForegroundColor DarkGray; return }
  while ($true) {
    try {
      Write-Step $Title
      & $Body
      $State["done_$Name"] = $true
      Save-State
      return
    } catch {
      Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
      $answer = Read-Host "  [R]etry, [S]kip or [A]bort?"
      if ($answer -match '^[sS]') { return }
      if ($answer -match '^[aA]') { throw }
    }
  }
}

function Invoke-GoogleApiWithRetry {
  # New projects / service accounts / APIs need up to a couple of minutes to propagate: 403/404
  # right after creation are normal, so back off and retry, and surface the real response body.
  param([string]$Label, [scriptblock]$Request, [int]$MaxAttempts = 8, [int]$Delay = 15)
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try { return & $Request } catch {
      $status = $null; $body = $null
      if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
        try { $body = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
      }
      $retryable = ($status -in 403, 404, 429) -or ($status -ge 500)
      if ($retryable -and $attempt -lt $MaxAttempts) {
        Write-Host "  $Label attempt $attempt/$MaxAttempts -> HTTP $status (propagation?), retrying in ${Delay}s" -ForegroundColor Yellow
        Start-Sleep -Seconds $Delay
        $Delay = [Math]::Min($Delay * 2, 60)
        continue
      }
      if ($body) { throw "$Label failed (HTTP $status): $body" }
      throw
    }
  }
}

function Add-GcloudToSessionPath {
  foreach ($dir in @(
      (Join-Path $GcloudArchiveDir "google-cloud-sdk\bin"),
      (Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin"),
      (Join-Path ${env:ProgramFiles(x86)} "Google\Cloud SDK\google-cloud-sdk\bin"),
      (Join-Path $env:ProgramFiles "Google\Cloud SDK\google-cloud-sdk\bin"))) {
    if ($dir -and (Test-Path (Join-Path $dir "gcloud.cmd")) -and ($env:Path -notlike "*$dir*")) { $env:Path = "$dir;$env:Path" }
  }
}

function Install-GcloudIfMissing {
  if (Get-Command gcloud -ErrorAction SilentlyContinue) { return }
  Add-GcloudToSessionPath
  if (Get-Command gcloud -ErrorAction SilentlyContinue) { return }
  Write-Info "gcloud not found - installing the Google Cloud CLI from the zip archive (no admin rights)"
  $zip = Join-Path $env:TEMP "google-cloud-cli.zip"
  Invoke-WebRequest -Uri "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-windows-x86_64-bundled-python.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path $GcloudArchiveDir) { Remove-Item $GcloudArchiveDir -Recurse -Force }
  New-Item -ItemType Directory -Path $GcloudArchiveDir -Force | Out-Null
  Expand-Archive -Path $zip -DestinationPath $GcloudArchiveDir -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  $installBat = Join-Path $GcloudArchiveDir "google-cloud-sdk\install.bat"
  # "< NUL" so install.bat's trailing `pause` gets EOF instead of hanging on a keypress.
  Start-Process -FilePath "cmd.exe" -ArgumentList ('/c ""' + $installBat + '" -q --usage-reporting=false --path-update=false --command-completion=false < NUL"') -Wait -NoNewWindow | Out-Null
  Add-GcloudToSessionPath
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw "gcloud installed but not on PATH - reopen your terminal and re-run." }
}

function Get-GcloudAccount {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $out = gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null
  $ErrorActionPreference = $prev
  if ([string]::IsNullOrWhiteSpace($out)) { return $null }
  return $out.Trim()
}

function Get-HumanAuthHeader {
  # Minted fresh per call: a stale scoped token makes the Sheets API answer 404 instead of 401.
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $token = gcloud auth print-access-token --account=$script:Account --scopes="https://www.googleapis.com/auth/drive" 2>$null
  $exit = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($exit -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
    throw "gcloud login for $($script:Account) has no Drive access. Run 'gcloud auth login --enable-gdrive-access', then re-run."
  }
  return @{ Authorization = "Bearer $($token.Trim())" }
}

function Read-DevVars {
  $vars = [ordered]@{}
  if (Test-Path $DevVarsPath) {
    foreach ($line in Get-Content $DevVarsPath) {
      if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $vars[$Matches[1]] = $Matches[2] }
    }
  }
  return $vars
}

function Write-DevVars($vars) {
  $lines = @("# Generated by scripts/setup-sheet-sync.ps1. Gitignored - never commit.")
  foreach ($k in $vars.Keys) { $lines += "$k=$($vars[$k])" }
  Set-Content -Path $DevVarsPath -Value ($lines -join "`n") -NoNewline
}

function Invoke-Trello([string]$Path) {
  $vars = Read-DevVars
  $sep = if ($Path.Contains("?")) { "&" } else { "?" }
  return Invoke-RestMethod -Uri ("https://api.trello.com/1$Path${sep}key=$($vars['TRELLO_KEY'])&token=$($vars['TRELLO_TOKEN'])")
}

# Interactive list picker: arrow keys / PageUp / PageDown / Home / End, type to filter, Enter to
# pick, Esc to cancel. Falls back to a numbered prompt when the console can't do key input.
# Each item needs .Label (main text), .Detail (dim right-hand text) and optionally .Group.
function Select-FromList {
  param([string]$Title, [object[]]$Items, [int]$PageSize = 12)
  if (-not $Items -or -not $Items.Count) { throw "Nothing to choose from." }

  $canKey = $true
  try { if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { $canKey = $false } } catch { $canKey = $false }
  if (-not $canKey) {
    for ($i = 0; $i -lt $Items.Count; $i++) { Write-Host ("  [{0}] {1}  {2}" -f ($i + 1), $Items[$i].Label, $Items[$i].Detail) }
    $n = [int](Read-Host "  $Title (number)") - 1
    if ($n -lt 0 -or $n -ge $Items.Count) { throw "Invalid choice." }
    return $Items[$n]
  }

  $filter = ""
  $index = 0
  $offset = 0
  $height = $PageSize + 4 # title, filter, rows, footer
  Write-Host ""
  for ($i = 0; $i -lt $height; $i++) { Write-Host "" }
  $top = [Console]::CursorTop - $height
  if ($top -lt 0) { $top = 0 }
  $prevCursor = [Console]::CursorVisible
  [Console]::CursorVisible = $false

  function Write-Line([int]$row, [string]$text, $fg, $bg) {
    $w = [Console]::WindowWidth - 1
    if ($text.Length -gt $w) { $text = $text.Substring(0, $w) }
    [Console]::SetCursorPosition(0, $row)
    if ($bg) { Write-Host $text.PadRight($w) -ForegroundColor $fg -BackgroundColor $bg -NoNewline }
    else { Write-Host $text.PadRight($w) -ForegroundColor $fg -NoNewline }
  }

  try {
    while ($true) {
      $shown = @($Items | Where-Object { -not $filter -or ("$($_.Label) $($_.Detail) $($_.Group)" -like "*$filter*") })
      if ($index -ge $shown.Count) { $index = [Math]::Max(0, $shown.Count - 1) }
      if ($index -lt $offset) { $offset = $index }
      if ($index -ge $offset + $PageSize) { $offset = $index - $PageSize + 1 }

      Write-Line $top "  $Title" Cyan $null
      Write-Line ($top + 1) ("  Filter: " + $filter + "_") Yellow $null
      $labelW = 0
      foreach ($it in $shown) { if ($it.Label.Length -gt $labelW) { $labelW = $it.Label.Length } }
      $labelW = [Math]::Min($labelW, 44)
      for ($r = 0; $r -lt $PageSize; $r++) {
        $i = $offset + $r
        if ($i -lt $shown.Count) {
          $it = $shown[$i]
          $label = if ($it.Label.Length -gt $labelW) { $it.Label.Substring(0, $labelW - 1) + [char]0x2026 } else { $it.Label }
          $text = ("{0} {1}  {2}" -f $(if ($i -eq $index) { ">" } else { " " }), $label.PadRight($labelW), $it.Detail)
          if ($i -eq $index) { Write-Line ($top + 2 + $r) $text Black Cyan } else { Write-Line ($top + 2 + $r) $text Gray $null }
        } else {
          Write-Line ($top + 2 + $r) ($(if ($r -eq 0 -and -not $shown.Count) { "  No match" } else { "" })) DarkGray $null
        }
      }
      $more = if ($shown.Count) { "{0}/{1}" -f ($index + 1), $shown.Count } else { "0/0" }
      Write-Line ($top + 2 + $PageSize) ("  Up/Down move, type to filter, Enter select, Esc cancel   " + $more) DarkGray $null

      $key = [Console]::ReadKey($true)
      switch ($key.Key) {
        "UpArrow" { if ($index -gt 0) { $index-- } }
        "DownArrow" { if ($index -lt $shown.Count - 1) { $index++ } }
        "PageUp" { $index = [Math]::Max(0, $index - $PageSize) }
        "PageDown" { $index = [Math]::Min([Math]::Max(0, $shown.Count - 1), $index + $PageSize) }
        "Home" { $index = 0 }
        "End" { $index = [Math]::Max(0, $shown.Count - 1) }
        "Backspace" { if ($filter.Length) { $filter = $filter.Substring(0, $filter.Length - 1); $index = 0; $offset = 0 } }
        "Escape" { throw "Selection cancelled." }
        "Enter" { if ($shown.Count) { return $shown[$index] } }
        default {
          if ($key.KeyChar -and -not [char]::IsControl($key.KeyChar)) { $filter += $key.KeyChar; $index = 0; $offset = 0 }
        }
      }
    }
  } finally {
    for ($r = 0; $r -lt $height; $r++) { Write-Line ($top + $r) "" Gray $null }
    [Console]::SetCursorPosition(0, $top)
    [Console]::CursorVisible = $prevCursor
  }
}

function Format-Ago([string]$iso) {
  if (-not $iso) { return "" }
  $span = (Get-Date).ToUniversalTime() - ([datetime]$iso).ToUniversalTime()
  if ($span.TotalMinutes -lt 60) { return "active {0} min ago" -f [Math]::Max(1, [int]$span.TotalMinutes) }
  if ($span.TotalHours -lt 48) { return "active {0} h ago" -f [int]$span.TotalHours }
  if ($span.TotalDays -lt 60) { return "active {0} days ago" -f [int]$span.TotalDays }
  return "active {0} months ago" -f [int]($span.TotalDays / 30)
}

function Invoke-Worker([string]$Method, [string]$Path) {
  $vars = Read-DevVars
  return Invoke-RestMethod -Method $Method -Uri ($State.workerUrl.TrimEnd('/') + $Path) -Headers @{ "x-sync-secret" = $vars['SYNC_SECRET'] } -TimeoutSec 120
}

# ---------------------------------------------------------------- steps ---------------------------------------------
Invoke-Step "deps" "1/7 Installing worker dependencies" {
  Push-Location $WorkerDir
  try { if ((Invoke-Native { npm install --no-audit --no-fund }) -ne 0) { throw "npm install failed" } } finally { Pop-Location }
}

Invoke-Step "cfauth" "2/7 Cloudflare login" {
  Push-Location $WorkerDir
  try {
    if ($env:CLOUDFLARE_API_TOKEN) { Write-Info "CLOUDFLARE_API_TOKEN set - skipping login"; return }
    if ((Invoke-Native { npx --yes wrangler whoami *> $null }) -ne 0) {
      if ((Invoke-Native { npx --yes wrangler login }) -ne 0) { throw "wrangler login failed" }
    }
  } finally { Pop-Location }
}

Invoke-Step "trello" "3/7 Trello token + board" {
  $config = Get-Content -Raw (Join-Path $RepoRoot "components\shared\rest-config.js")
  if ($config -notmatch "appKey:\s*'([0-9a-f]{32})'") { throw "No appKey in components/shared/rest-config.js (create one at https://trello.com/power-ups/admin > API Key)." }
  $appKey = $Matches[1]
  $vars = Read-DevVars
  if (-not $vars['TRELLO_TOKEN']) {
    $url = "https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Trello%20Cerveau%20Sheet%20Sync&key=$appKey"
    Write-Info "Opening Trello - click Allow, then copy the token shown on the page."
    Start-Process $url
    $secure = Read-Host "  Paste the Trello token" -AsSecureString
    $token = [System.Net.NetworkCredential]::new("", $secure).Password.Trim()
    if ($token.Length -lt 32) { throw "That doesn't look like a Trello token." }
    $vars['TRELLO_KEY'] = $appKey
    $vars['TRELLO_TOKEN'] = $token
    Write-DevVars $vars
  }
  $me = Invoke-Trello "/members/me?fields=username"
  Write-Info "Trello account: $($me.username)"

  if (-not $State.boardId) {
    $boards = @(Invoke-Trello "/members/me/boards?filter=open&fields=name,url,dateLastActivity&organization=true&organization_fields=displayName" | ForEach-Object { $_ })
    if (-not $boards.Count) { throw "No open Trello boards found." }
    $items = @($boards | Sort-Object { $_.dateLastActivity } -Descending | ForEach-Object {
        $ws = if ($_.organization -and $_.organization.displayName) { $_.organization.displayName } else { "Personal" }
        [pscustomobject]@{ Label = $_.name; Detail = ("{0}  |  {1}" -f $ws, (Format-Ago $_.dateLastActivity)); Group = $ws; Board = $_ }
      })
    $picked = Select-FromList -Title "Which Trello board should be synced?" -Items $items
    $State.boardId = $picked.Board.id
    $State.boardName = $picked.Board.name
  }
  $vars = Read-DevVars
  $vars['TRELLO_BOARD_ID'] = $State.boardId
  Write-DevVars $vars
  Write-Info "Board: $($State.boardName)"
}

Invoke-Step "google" "4/7 Google Cloud project, service account and Sheet" {
  Install-GcloudIfMissing
  $script:Account = Get-GcloudAccount
  if (-not $script:Account) {
    if ((Invoke-Native { gcloud auth login --enable-gdrive-access }) -ne 0) { throw "gcloud login failed" }
    $script:Account = Get-GcloudAccount
  }
  Write-Info "gcloud account: $($script:Account)"

  if (-not $State.projectId) {
    $suffix = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    $State.projectId = "trello-sheet-$suffix"
    Save-State
  }
  $pid_ = $State.projectId
  if ((Invoke-Native { gcloud projects describe $pid_ *> $null }) -ne 0) {
    Write-Info "Creating GCP project $pid_"
    if ((Invoke-Native { gcloud projects create $pid_ --name="Trello Sheet Sync" }) -ne 0) { throw "Create project failed" }
  }
  if ((Invoke-Native { gcloud services enable sheets.googleapis.com drive.googleapis.com --project $pid_ }) -ne 0) { throw "Enable APIs failed" }
  Write-Info "Waiting for API enablement to propagate..."
  Start-Sleep -Seconds 30

  $saId = "trello-sheet-sync"
  $saEmail = "$saId@$pid_.iam.gserviceaccount.com"
  if ((Invoke-Native { gcloud iam service-accounts describe $saEmail --project $pid_ *> $null }) -ne 0) {
    if ((Invoke-Native { gcloud iam service-accounts create $saId --project $pid_ --display-name "Trello Sheet Sync" }) -ne 0) { throw "Create service account failed" }
    Start-Sleep -Seconds 10
  }
  if (Test-Path $KeyPath) { Remove-Item $KeyPath -Force }
  if ((Invoke-Native { gcloud iam service-accounts keys create $KeyPath --iam-account=$saEmail --project $pid_ }) -ne 0) { throw "Create key failed" }
  $key = Get-Content -Raw $KeyPath | ConvertFrom-Json
  Remove-Item $KeyPath -Force

  if (-not $State.sheetId) {
    Get-HumanAuthHeader | Out-Null # fail fast if Drive access is missing
    # The Sheet is created under the human account (bare service accounts have no Drive quota)
    # and then shared to the service account.
    $body = @{
      properties = @{ title = "Trello - $($State.boardName)" }
      sheets     = @(
        @{ properties = @{ title = "Tasks"; gridProperties = @{ frozenRowCount = 1 } } }
        @{ properties = @{ title = "_SyncState"; hidden = $true } }
        @{ properties = @{ title = "_Config"; hidden = $true } }
        @{ properties = @{ title = "_SyncLog"; hidden = $true } }
      )
    } | ConvertTo-Json -Depth 6
    $created = Invoke-GoogleApiWithRetry -Label "Create spreadsheet" -Request {
      Invoke-RestMethod -Method Post -Uri "https://sheets.googleapis.com/v4/spreadsheets" -Headers (Get-HumanAuthHeader) -ContentType "application/json; charset=utf-8" -Body $body
    }
    $State.sheetId = $created.spreadsheetId
    Save-State
  }
  $perm = @{ role = "writer"; type = "user"; emailAddress = $saEmail } | ConvertTo-Json
  Invoke-GoogleApiWithRetry -Label "Share spreadsheet" -Request {
    Invoke-RestMethod -Method Post -Uri "https://www.googleapis.com/drive/v3/files/$($State.sheetId)/permissions?sendNotificationEmail=false" -Headers (Get-HumanAuthHeader) -ContentType "application/json; charset=utf-8" -Body $perm
  } | Out-Null

  $vars = Read-DevVars
  $vars['GOOGLE_SERVICE_ACCOUNT_EMAIL'] = $key.client_email
  $vars['GOOGLE_SERVICE_ACCOUNT_KEY'] = ($key.private_key -replace "`r`n", "\n" -replace "`n", "\n")
  $vars['GOOGLE_SHEET_ID'] = $State.sheetId
  Write-DevVars $vars
  Write-Info "Sheet: https://docs.google.com/spreadsheets/d/$($State.sheetId)/edit"
}

Invoke-Step "deploy" "5/7 Deploying the Worker and pushing secrets" {
  $vars = Read-DevVars
  if (-not $vars['SYNC_SECRET']) { $vars['SYNC_SECRET'] = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }
  if ($vars['ALLOWED_ORIGINS'] -and $vars['ALLOWED_ORIGINS'] -notmatch '^https?://[A-Za-z0-9.-]+(:\d+)?(,https?://[A-Za-z0-9.-]+(:\d+)?)*$') { $vars.Remove('ALLOWED_ORIGINS') }
  if (-not $vars['ALLOWED_ORIGINS']) {
    $origin = "https://YOUR-USER.github.io"
    $remote = (git -C $RepoRoot remote get-url origin 2>$null)
    if ($remote -match 'github\.com[:/]([^/]+)/') { $origin = "https://$($Matches[1].ToLower()).github.io" }
    while ($true) {
      $typed = Read-Host "  Origin of your hosted Power-Up, e.g. https://you.github.io [$origin]"
      $candidate = if ($typed) { $typed.Trim().TrimEnd('/') } else { $origin }
      if ($candidate -match '^https?://[A-Za-z0-9.-]+(:\d+)?$') { $vars['ALLOWED_ORIGINS'] = $candidate; break }
      Write-Host "  That is not an origin (expected scheme + host, no path). Press Enter to accept the default." -ForegroundColor Yellow
    }
  }
  Write-DevVars $vars

  Push-Location $WorkerDir
  try {
    $out = Join-Path $env:TEMP ("wrangler-out-" + [guid]::NewGuid().ToString("N") + ".json")
    $env:WRANGLER_OUTPUT_FILE_PATH = $out
    if ((Invoke-Native { npx --yes wrangler deploy }) -ne 0) { throw "wrangler deploy failed" }
    Remove-Item Env:\WRANGLER_OUTPUT_FILE_PATH -ErrorAction SilentlyContinue
    $workerUrl = $null
    if (Test-Path $out) {
      foreach ($line in Get-Content $out) {
        try { $e = $line | ConvertFrom-Json } catch { continue }
        if ($e.targets) { $workerUrl = @($e.targets)[0] }
      }
      Remove-Item $out -Force -ErrorAction SilentlyContinue
    }
    if ($workerUrl -and $workerUrl -notmatch '^https?://') { $workerUrl = "https://$workerUrl" }
    if (-not $workerUrl) { $workerUrl = (Read-Host "  Could not detect the workers.dev URL. Paste it").Trim() }
    $State.workerUrl = $workerUrl
    Save-State

    $bulk = Join-Path $env:TEMP ("secrets-" + [guid]::NewGuid().ToString("N") + ".json")
    $payload = [ordered]@{}
    foreach ($k in 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_KEY', 'GOOGLE_SHEET_ID', 'TRELLO_KEY', 'TRELLO_TOKEN', 'TRELLO_BOARD_ID', 'SYNC_SECRET', 'ALLOWED_ORIGINS') {
      $payload[$k] = $vars[$k]
    }
    # The key is stored with literal \n in .dev.vars; the Worker accepts both forms.
    ($payload | ConvertTo-Json) | Set-Content -Path $bulk -Encoding UTF8
    try { if ((Invoke-Native { npx --yes wrangler secret bulk $bulk }) -ne 0) { throw "wrangler secret bulk failed" } }
    finally { Remove-Item $bulk -Force -ErrorAction SilentlyContinue }
  } finally { Pop-Location }
  Write-Info "Worker: $($State.workerUrl)"
}

Invoke-Step "webhook" "6/7 Trello webhook + first sync" {
  Start-Sleep -Seconds 5
  $hook = Invoke-GoogleApiWithRetry -Label "Register webhook" -MaxAttempts 5 -Delay 5 -Request { Invoke-Worker "Post" "/webhook/register" }
  Write-Info "Webhook: $($hook.webhook)"
  $sync = Invoke-GoogleApiWithRetry -Label "First sync" -MaxAttempts 6 -Delay 10 -Request { Invoke-Worker "Post" "/sync" }
  Write-Info ("First sync: {0} cards, {1} rows added" -f $sync.sync.cards, $sync.sync.appended)
}

Invoke-Step "connect" "7/7 Connection code for the Power-Up" {
  $vars = Read-DevVars
  $payload = @{ v = 1; workerUrl = $State.workerUrl.TrimEnd('/'); secret = $vars['SYNC_SECRET']; sheetUrl = "https://docs.google.com/spreadsheets/d/$($State.sheetId)/edit" } | ConvertTo-Json -Compress
  $code = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
  Set-Content -Path $CodePath -Value $code -NoNewline
  try { Set-Clipboard -Value $code } catch {}
  Write-Host "  Connection code copied to the clipboard (also saved in $CodePath)." -ForegroundColor Green
}

# Always show the code: step 7 is skipped on re-runs, and the clipboard is long gone by then.
if (Test-Path $CodePath) {
  $savedCode = (Get-Content -Raw $CodePath).Trim()
  if ($savedCode) {
    Write-Host "`nConnection code (paste it in the Power-Up):" -ForegroundColor Cyan
    Write-Host $savedCode -ForegroundColor White
    try { Set-Clipboard -Value $savedCode; Write-Host "(copied to the clipboard again; also saved in $CodePath)" -ForegroundColor DarkGray } catch {}
  }
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host "  Sheet:  https://docs.google.com/spreadsheets/d/$($State.sheetId)/edit" -ForegroundColor Green
Write-Host "  Worker: $($State.workerUrl)" -ForegroundColor Green
Write-Host "Next: in Trello open 'Paramètres du Cerveau' > Google Sheets (or the Table view) and paste the connection code." -ForegroundColor Green
Write-Host "Edits in the Sheet reach Trello within about a minute; Trello edits reach the Sheet within seconds." -ForegroundColor Green
