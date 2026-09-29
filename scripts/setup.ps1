<#
.SYNOPSIS
  Guided setup: creates your own copy of the Trello Power-Up on GitHub, renames it,
  turns on GitHub Pages and tells you what is left to do in Trello.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup.ps1 -AppName 'Mon Cerveau' -Owner monuser -Repo mon-cerveau

  Missing parameters are asked interactively.
#>
param(
  [string]$AppName,
  [string]$Owner,
  [string]$Repo,
  [string]$Author,
  [string]$AppKey,
  [string]$Upstream = 'AldeRoberge/trello-priority-powerup',
  [switch]$SkipWait
)

$ErrorActionPreference = 'Stop'

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    !!  $text" -ForegroundColor Yellow }
function Ask($label, $default) {
  $suffix = if ($default) { " [$default]" } else { '' }
  $v = Read-Host "$label$suffix"
  if ([string]::IsNullOrWhiteSpace($v)) { $default } else { $v.Trim() }
}
function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "'$cmd' est introuvable. Installez-le : $hint"
  }
}
function Run-Native {
  # Runs a native command and throws on a non-zero exit code.
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') a échoué (code $LASTEXITCODE)." }
}
function Js-Escape($s) { $s.Replace('\', '\\').Replace("'", "\'") }

Write-Host "== Assistant d'installation du Power-Up Trello ==" -ForegroundColor Magenta

# 1. Prerequisites ------------------------------------------------------------
Step 1 'Vérification des outils'
Need git 'winget install --id Git.Git'
Need gh  'winget install --id GitHub.cli'
Ok 'git et gh (GitHub CLI) sont installés'

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Warn "Vous n'êtes pas connecté à GitHub. Une fenêtre de connexion va s'ouvrir."
  Run-Native gh @('auth', 'login', '--web', '--git-protocol', 'https')
}
$login = (& gh api user --jq .login).Trim()
Ok "Connecté à GitHub en tant que $login"

# 2. Choices ------------------------------------------------------------------
Step 2 'Vos choix'
if (-not $AppName) { $AppName = Ask "Nom de l'application" 'Trello Cerveau' }
if (-not $Repo)    { $Repo    = Ask 'Nom du dépôt GitHub' 'trello-priority-powerup' }
if (-not $Owner)   { $Owner   = $login }
if ($Owner -ne $login) {
  Warn "Le dépôt sera créé sous votre compte connecté ($login), pas sous '$Owner'."
  $Owner = $login
}
if (-not $Author) { $Author = $Owner }
if ($Repo -notmatch '^[A-Za-z0-9._-]+$') { throw "Nom de dépôt invalide : $Repo" }
if ($AppKey -and $AppKey -notmatch '^[a-fA-F0-9]{32}$') { throw 'AppKey invalide : 32 caractères hexadécimaux attendus.' }

$host_ = "$($Owner.ToLower()).github.io"
$pagesUrl = if ($Repo.ToLower() -eq $host_) { "https://$host_/" } else { "https://$host_/$Repo/" }
$connectorUrl = "${pagesUrl}index.html"
Write-Host "    Application : $AppName"
Write-Host "    Dépôt       : $Owner/$Repo"
Write-Host "    Site        : $pagesUrl"

# 3. Local copy ---------------------------------------------------------------
Step 3 'Copie locale du code'
$dir = Join-Path (Get-Location) $Repo
if (Test-Path $dir) { throw "Le dossier '$dir' existe déjà. Choisissez un autre nom de dépôt ou supprimez-le." }
Run-Native git @('clone', '--quiet', "https://github.com/$Upstream.git", $dir)
Set-Location $dir
# Keep the original as 'upstream' so you can pull future improvements.
Run-Native git @('remote', 'rename', 'origin', 'upstream')
Ok "Cloné dans $dir"

# 4. Rebrand ------------------------------------------------------------------
Step 4 "Personnalisation du nom ($AppName)"
function Set-Line($file, $pattern, $replacement) {
  $lines = Get-Content -LiteralPath $file -Encoding UTF8
  $hit = $false
  $out = foreach ($l in $lines) {
    if (-not $hit -and $l -match $pattern) { $hit = $true; $replacement } else { $l }
  }
  if (-not $hit) { throw "Ligne '$pattern' introuvable dans $file" }
  [IO.File]::WriteAllLines((Join-Path (Get-Location) $file), $out, (New-Object Text.UTF8Encoding $false))
}
# brand.js: appName reuses DEFAULT_APP_NAME, so changing the constant renames every fallback too.
Set-Line 'components/shared/brand.js' '^\s*var DEFAULT_APP_NAME' "  var DEFAULT_APP_NAME = '$(Js-Escape $AppName)';"
Set-Line 'components/shared/brand.js' '^\s*appAuthor:' "    appAuthor: '$(Js-Escape $Author)',"
if ($AppKey) {
  Set-Line 'components/shared/rest-config.js' '^\s*appKey:' "    appKey: '$($AppKey.ToLower())',"
  Ok 'appKey enregistrée dans rest-config.js'
} else {
  Warn "Aucune appKey : l'appKey d'origine reste dans rest-config.js (le tri automatique ne fonctionnera pas sur votre domaine)."
}
Run-Native git @('add', '-A')
Run-Native git @('commit', '--quiet', '-m', "Rebrand: $AppName")
Ok 'Nom enregistré dans components/shared/brand.js'

# 5. GitHub repo + Pages ------------------------------------------------------
Step 5 'Création du dépôt GitHub et activation de Pages'
Run-Native gh @('repo', 'create', "$Owner/$Repo", '--public', '--source', '.', '--remote', 'origin',
  '--description', "$AppName - Power-Up Trello")
Ok "Dépôt https://github.com/$Owner/$Repo créé (public : requis pour Pages gratuit)"

# Pages must be on before the first push so the deploy workflow has somewhere to go.
& gh api -X POST "repos/$Owner/$Repo/pages" -f build_type=workflow *> $null
if ($LASTEXITCODE -ne 0) {
  & gh api -X PUT "repos/$Owner/$Repo/pages" -f build_type=workflow *> $null
  if ($LASTEXITCODE -ne 0) {
    Warn "Impossible d'activer Pages automatiquement. Faites-le à la main : Settings → Pages → Source = GitHub Actions."
    Read-Host '    Appuyez sur Entrée une fois fait'
  }
}
Ok 'GitHub Pages : source = GitHub Actions'

Run-Native git @('branch', '-M', 'main')
Run-Native git @('push', '--quiet', '-u', 'origin', 'main')
Ok 'Code envoyé — le déploiement démarre'

# 6. Wait for the site --------------------------------------------------------
if (-not $SkipWait) {
  Step 6 'Attente du déploiement (2 à 4 minutes)'
  $deadline = (Get-Date).AddMinutes(8)
  $live = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $connectorUrl -UseBasicParsing -TimeoutSec 15
      if ($r.StatusCode -eq 200) { $live = $true; break }
    } catch { }
    Write-Host '    ...' -NoNewline
    Start-Sleep -Seconds 10
  }
  Write-Host ''
  if ($live) { Ok 'Le site répond' } else { Warn "Pas encore en ligne. Suivez l'onglet Actions : https://github.com/$Owner/$Repo/actions" }
}

# 7. Manual Trello part -------------------------------------------------------
Step 7 'À faire dans Trello (Trello ne permet pas de créer un Power-Up par script)'
try { Set-Clipboard -Value $connectorUrl; Ok 'URL du connecteur copiée dans le presse-papiers' } catch { }
Write-Host @"

    Iframe connector URL :  $connectorUrl

    1. Create new Power-Up  -> nom : $AppName, votre workspace, courriel, auteur : $Author
    2. Iframe connector URL -> collez l'adresse ci-dessus
    3. Onglet Capabilities  -> cochez UNIQUEMENT :
         card-badges, card-detail-badges, card-back-section,
         board-buttons, list-sorters, on-enable
    4. (Optionnel, tri automatique) Onglet API Key -> générez une clé, ajoutez
         $($pagesUrl.TrimEnd('/'))  dans Allowed origins, puis relancez ce script avec -AppKey <clé>
         ou éditez components/shared/rest-config.js.
    5. Sur un tableau : Power-Ups -> Ajouter -> Custom -> $AppName

"@
Read-Host '    Appuyez sur Entrée pour ouvrir trello.com/power-ups/admin'
Start-Process 'https://trello.com/power-ups/admin'
Write-Host ""
Write-Host "Terminé. Votre dossier local : $dir" -ForegroundColor Green
Write-Host "Récupérer les mises à jour d'origine plus tard : git pull upstream main"
