#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Les sauvegardes contiennent le contenu integral des pages et le depot est public :
# elles sont ecrites hors du depot par defaut. Passer un chemin en argument pour surcharger.
BACKUP_DIR="${1:-${ATLAS_BACKUP_DIR:-$HOME/Atlas-backups}}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"

case "$BACKUP_DIR" in
  "$ROOT_DIR"|"$ROOT_DIR"/*)
    echo "Refus : $BACKUP_DIR est dans le depot Git, qui est public." >&2
    echo "Choisis un dossier externe, par exemple \$HOME/Atlas-backups." >&2
    exit 1
    ;;
esac

SUPABASE_RPC_URL="${SUPABASE_RPC_URL:-https://cmmlgojptwolqbriexse.supabase.co/rest/v1/rpc/get_app_payload}"

# Jeton d'acces : depuis la version authentifiee, la cle publiable ne suffit plus.
# Renseigner SUPABASE_ACCESS_TOKEN (jeton d'un compte autorise) avant de lancer le script.
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_zoF-bkuVgEm9e7cbFG8lwA_kxRIHoPk}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$SUPABASE_ANON_KEY}"

PAYLOAD_FILE="$BACKUP_DIR/atlas-payload-$TIMESTAMP.json"
NOTES_FILE="$BACKUP_DIR/atlas-notes-$TIMESTAMP.json"
SUMMARY_FILE="$BACKUP_DIR/atlas-summary-$TIMESTAMP.json"

mkdir -p "$BACKUP_DIR"

curl -fsS -X POST "$SUPABASE_RPC_URL" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  | jq '.' > "$PAYLOAD_FILE"

jq '.notes' "$PAYLOAD_FILE" > "$NOTES_FILE"
jq '{note_count: (.notes | length), snapshot_count: (.snapshots | length), snapshots: [.snapshots[] | {createdAt, noteCount, label}]}' \
  "$PAYLOAD_FILE" > "$SUMMARY_FILE"

cp "$PAYLOAD_FILE" "$BACKUP_DIR/atlas-payload-latest.json"
cp "$NOTES_FILE" "$BACKUP_DIR/atlas-notes-latest.json"
cp "$SUMMARY_FILE" "$BACKUP_DIR/atlas-summary-latest.json"

echo "Backup saved:"
echo "  payload: $PAYLOAD_FILE"
echo "  notes:   $NOTES_FILE"
echo "  summary: $SUMMARY_FILE"
