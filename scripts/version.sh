#!/bin/zsh
#
# Incremente d'un cran le numero de version du cache, partout a la fois.
#
# Vingt references dans index.html plus CACHE_NAME dans service-worker.js
# doivent porter le meme numero. Les tenir a la main est une source d'erreur :
# au 21 aout 2026 les fichiers etaient a v86 et le cache a v87, par simple
# oubli. Le navigateur sert alors un melange d'anciennes et de nouvelles
# versions, et le symptome est difficile a relier a sa cause.
#
# Usage, depuis la racine du projet :
#   zsh ./scripts/version.sh          incremente
#   zsh ./scripts/version.sh 92       impose une valeur
#
# Un test verifie ensuite la coherence : tests/index.html, suite
# "Coherence du deploiement".

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT_DIR/index.html"
WORKER="$ROOT_DIR/service-worker.js"

for fichier in "$INDEX" "$WORKER"; do
  if [[ ! -f "$fichier" ]]; then
    echo "Fichier introuvable : $fichier" >&2
    exit 1
  fi
done

actuelle_index=$(grep -o '?v=[0-9]*' "$INDEX" | head -1 | tr -d '?v=')
actuelle_cache=$(grep -o 'atlas-connaissance-v[0-9]*' "$WORKER" | head -1 | sed 's/.*-v//')

if [[ -z "$actuelle_index" || -z "$actuelle_cache" ]]; then
  echo "Impossible de lire les versions courantes." >&2
  exit 1
fi

# On repart du plus grand des deux : si l'un a deja ete avance, on ne recule pas.
plus_grande=$(( actuelle_index > actuelle_cache ? actuelle_index : actuelle_cache ))
nouvelle="${1:-$(( plus_grande + 1 ))}"

if ! [[ "$nouvelle" =~ ^[0-9]+$ ]]; then
  echo "La version doit etre un nombre entier." >&2
  exit 1
fi

sed -i '' -E "s/\?v=[0-9]+/?v=${nouvelle}/g" "$INDEX"
sed -i '' -E "s/atlas-connaissance-v[0-9]+/atlas-connaissance-v${nouvelle}/g" "$WORKER"

references=$(grep -c '?v=' "$INDEX")
distinctes=$(grep -o '?v=[0-9]*' "$INDEX" | sort -u | wc -l | tr -d ' ')
cache=$(grep -o 'atlas-connaissance-v[0-9]*' "$WORKER" | head -1)

echo "index.html      : ${references} references, ${distinctes} valeur(s) distincte(s)"
echo "service-worker  : ${cache}"

if [[ "$distinctes" != "1" || "$cache" != "atlas-connaissance-v${nouvelle}" ]]; then
  echo "Incoherence apres ecriture. Verifier a la main." >&2
  exit 1
fi

echo "Version ${actuelle_index}/${actuelle_cache} -> ${nouvelle}, partout."
