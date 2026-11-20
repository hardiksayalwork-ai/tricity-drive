#!/bin/bash
# Re-downloads ALL external assets (all CC0): ambientCG textures + facades, polyhaven HDRIs.
# ferrari.glb + vendor/ are committed in the zip already.
set -e
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
cd "$(dirname "$0")"
mkdir -p assets/env assets/tex assets/fac

curl -s -A "$UA" -o assets/env/day.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_1k.hdr
curl -s -A "$UA" -o assets/env/sunset.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/the_sky_is_on_fire_1k.hdr

fetch_acg() { # $1=AmbientCG ID  $2=local prefix  $3=target dir
  local id=$1 name=$2 dir=$3
  curl -sL -A "$UA" -o /tmp/$id.zip "https://ambientcg.com/get?file=${id}_1K-JPG.zip"
  mkdir -p /tmp/acg-$id && unzip -oq /tmp/$id.zip -d /tmp/acg-$id
  cp /tmp/acg-$id/${id}_1K-JPG_Color.jpg $dir/${name}_alb.jpg 2>/dev/null || cp /tmp/acg-$id/${id}_1K-JPG_Color.jpg $dir/${id}_Color.jpg
  cp /tmp/acg-$id/${id}_1K-JPG_NormalGL.jpg $dir/${name}_nrm.jpg 2>/dev/null || cp /tmp/acg-$id/${id}_1K-JPG_NormalGL.jpg $dir/${id}_NormalGL.jpg
  cp /tmp/acg-$id/${id}_1K-JPG_Roughness.jpg $dir/${name}_rgh.jpg 2>/dev/null || cp /tmp/acg-$id/${id}_1K-JPG_Roughness.jpg $dir/${id}_Roughness.jpg
}
# ground textures
fetch_acg Asphalt026A asphalt assets/tex
fetch_acg PavingStones070 paving assets/tex
fetch_acg Grass001 grass assets/tex
fetch_acg Rock030 rock assets/tex
fetch_acg Concrete034 concrete assets/tex
# building facade scans
for id in Facade002 Facade003 Facade013 Facade017; do
  curl -sL -A "$UA" -o /tmp/$id.zip "https://ambientcg.com/get?file=${id}_1K-JPG.zip"
  mkdir -p /tmp/acg-$id && unzip -oq /tmp/$id.zip -d /tmp/acg-$id
  for m in Color NormalGL Roughness Emission; do
    cp /tmp/acg-$id/${id}_1K-JPG_$m.jpg assets/fac/${id}_$m.jpg 2>/dev/null || true
  done
done
echo "assets restored"
# CC0 3D models (pmndrs/market-assets, github raw, no account)
mkdir -p assets/models
for m in tree-big tree-small palm-detailed-long palm-detailed-short male survivor-male skater-male skater-female sedan hatchback suv taxi police-car delivery-truck house-3 house-4 house-5 house-6 house-7 house1 house-18 tower library-large barn bench; do
  curl -sL --fail -o "assets/models/$m.gltf" "https://raw.githubusercontent.com/pmndrs/market-assets/main/files/models/$m/model.gltf" || echo "MODEL FAIL $m"
done
echo "models restored"
# Sketchfab CC-BY models (downloaded via signed URLs, expire in minutes - re-mint via logged-in session if wiped):
#   buildings_front.glb nyc_dwellings.glb city_pack_7.glb nathan_walking.glb in assets/models/
