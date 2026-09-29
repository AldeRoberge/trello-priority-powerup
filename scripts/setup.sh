#!/usr/bin/env bash
# Guided setup: creates your own copy of the Trello Power-Up on GitHub, renames it,
# turns on GitHub Pages and tells you what is left to do in Trello.
#
#   bash setup.sh --name 'Mon Cerveau' --owner monuser --repo mon-cerveau [--author X] [--app-key KEY]
#
# Missing options are asked interactively.
set -euo pipefail

UPSTREAM="AldeRoberge/trello-priority-powerup"
APP_NAME=""; OWNER=""; REPO=""; AUTHOR=""; APP_KEY=""; SKIP_WAIT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --name) APP_NAME="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --author) AUTHOR="$2"; shift 2 ;;
    --app-key) APP_KEY="$2"; shift 2 ;;
    --upstream) UPSTREAM="$2"; shift 2 ;;
    --skip-wait) SKIP_WAIT=1; shift ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[36m[%s] %s\033[0m\n' "$1" "$2"; }
ok()   { printf '\033[32m    OK  %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !!  %s\033[0m\n' "$1"; }
ask() { # ask "label" "default" -> stdout (reads from the terminal even when piped)
  local v
  read -r -p "$1${2:+ [$2]} " v </dev/tty || true
  printf '%s' "${v:-$2}"
}
need() { command -v "$1" >/dev/null 2>&1 || { echo "'$1' est introuvable. Installez-le : $2" >&2; exit 1; }; }
js_escape() { printf '%s' "$1" | sed -e "s/\\\\/\\\\\\\\/g" -e "s/'/\\\\'/g"; }

# set_line FILE REGEX REPLACEMENT — replaces the first line matching REGEX (awk: no escape processing)
set_line() {
  local file="$1" pattern="$2" replacement="$3" tmp
  tmp="$(mktemp)"
  PAT="$pattern" REP="$replacement" awk '
    !done && $0 ~ ENVIRON["PAT"] { print ENVIRON["REP"]; done = 1; next }
    { print }
    END { exit done ? 0 : 3 }
  ' "$file" >"$tmp" || { rm -f "$tmp"; echo "Ligne '$pattern' introuvable dans $file" >&2; exit 1; }
  mv "$tmp" "$file"
}

printf '\033[35m== Assistant d'"'"'installation du Power-Up Trello ==\033[0m\n'

step 1 "Vérification des outils"
need git "https://git-scm.com/downloads"
need gh  "https://cli.github.com/"
ok "git et gh (GitHub CLI) sont installés"
if ! gh auth status >/dev/null 2>&1; then
  warn "Vous n'êtes pas connecté à GitHub. Connexion…"
  gh auth login --web --git-protocol https
fi
LOGIN="$(gh api user --jq .login)"
ok "Connecté à GitHub en tant que $LOGIN"

step 2 "Vos choix"
[ -n "$APP_NAME" ] || APP_NAME="$(ask "Nom de l'application" "Trello Cerveau")"
[ -n "$REPO" ]     || REPO="$(ask "Nom du dépôt GitHub" "trello-priority-powerup")"
[ -n "$OWNER" ]    || OWNER="$LOGIN"
if [ "$OWNER" != "$LOGIN" ]; then
  warn "Le dépôt sera créé sous votre compte connecté ($LOGIN), pas sous '$OWNER'."
  OWNER="$LOGIN"
fi
[ -n "$AUTHOR" ] || AUTHOR="$OWNER"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Nom de dépôt invalide : $REPO" >&2; exit 1; }
if [ -n "$APP_KEY" ] && ! [[ "$APP_KEY" =~ ^[A-Fa-f0-9]{32}$ ]]; then
  echo "app-key invalide : 32 caractères hexadécimaux attendus." >&2; exit 1
fi

HOST="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]').github.io"
if [ "$(printf '%s' "$REPO" | tr '[:upper:]' '[:lower:]')" = "$HOST" ]; then
  PAGES_URL="https://$HOST/"
else
  PAGES_URL="https://$HOST/$REPO/"
fi
CONNECTOR_URL="${PAGES_URL}index.html"
echo "    Application : $APP_NAME"
echo "    Dépôt       : $OWNER/$REPO"
echo "    Site        : $PAGES_URL"

step 3 "Copie locale du code"
[ ! -e "$REPO" ] || { echo "Le dossier '$REPO' existe déjà. Choisissez un autre nom ou supprimez-le." >&2; exit 1; }
git clone --quiet "https://github.com/$UPSTREAM.git" "$REPO"
cd "$REPO"
# Keep the original as 'upstream' so you can pull future improvements.
git remote rename origin upstream
ok "Cloné dans $(pwd)"

step 4 "Personnalisation du nom ($APP_NAME)"
# brand.js: appName reuses DEFAULT_APP_NAME, so changing the constant renames every fallback too.
set_line components/shared/brand.js '^[[:space:]]*var DEFAULT_APP_NAME' "  var DEFAULT_APP_NAME = '$(js_escape "$APP_NAME")';"
set_line components/shared/brand.js '^[[:space:]]*appAuthor:' "    appAuthor: '$(js_escape "$AUTHOR")',"
if [ -n "$APP_KEY" ]; then
  set_line components/shared/rest-config.js '^[[:space:]]*appKey:' "    appKey: '$(printf '%s' "$APP_KEY" | tr '[:upper:]' '[:lower:]')',"
  ok "appKey enregistrée dans rest-config.js"
else
  warn "Aucune appKey : l'appKey d'origine reste dans rest-config.js (le tri automatique ne fonctionnera pas sur votre domaine)."
fi
git add -A
git commit --quiet -m "Rebrand: $APP_NAME"
ok "Nom enregistré dans components/shared/brand.js"

step 5 "Création du dépôt GitHub et activation de Pages"
gh repo create "$OWNER/$REPO" --public --source . --remote origin --description "$APP_NAME - Power-Up Trello"
ok "Dépôt https://github.com/$OWNER/$REPO créé (public : requis pour Pages gratuit)"

# Pages must be on before the first push so the deploy workflow has somewhere to go.
if ! gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
   && ! gh api -X PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1; then
  warn "Impossible d'activer Pages automatiquement. Faites-le à la main : Settings → Pages → Source = GitHub Actions."
  read -r -p "    Appuyez sur Entrée une fois fait " _ </dev/tty || true
fi
ok "GitHub Pages : source = GitHub Actions"

git branch -M main
git push --quiet -u origin main
ok "Code envoyé — le déploiement démarre"

if [ "$SKIP_WAIT" -eq 0 ]; then
  step 6 "Attente du déploiement (2 à 4 minutes)"
  live=0
  for _ in $(seq 1 48); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$CONNECTOR_URL" || true)" = "200" ]; then live=1; break; fi
    printf '    ...\n'; sleep 10
  done
  if [ "$live" -eq 1 ]; then ok "Le site répond"; else warn "Pas encore en ligne. Suivez l'onglet Actions : https://github.com/$OWNER/$REPO/actions"; fi
fi

step 7 "À faire dans Trello (Trello ne permet pas de créer un Power-Up par script)"
if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$CONNECTOR_URL" | pbcopy && ok "URL du connecteur copiée"
elif command -v xclip >/dev/null 2>&1; then printf '%s' "$CONNECTOR_URL" | xclip -selection clipboard && ok "URL du connecteur copiée"
fi
cat <<EOF

    Iframe connector URL :  $CONNECTOR_URL

    1. Create new Power-Up  -> nom : $APP_NAME, votre workspace, courriel, auteur : $AUTHOR
    2. Iframe connector URL -> collez l'adresse ci-dessus
    3. Onglet Capabilities  -> cochez UNIQUEMENT :
         card-badges, card-detail-badges, card-back-section,
         board-buttons, list-sorters, on-enable
    4. (Optionnel, tri automatique) Onglet API Key -> générez une clé, ajoutez
         ${PAGES_URL%/}  dans Allowed origins, puis relancez ce script avec --app-key <clé>
         ou éditez components/shared/rest-config.js.
    5. Sur un tableau : Power-Ups -> Ajouter -> Custom -> $APP_NAME

EOF
read -r -p "    Appuyez sur Entrée pour ouvrir trello.com/power-ups/admin " _ </dev/tty || true
URL="https://trello.com/power-ups/admin"
if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$URL"
else echo "    Ouvrez : $URL"; fi
printf '\n\033[32mTerminé. Votre dossier local : %s\033[0m\n' "$(pwd)"
echo "Récupérer les mises à jour d'origine plus tard : git pull upstream main"
