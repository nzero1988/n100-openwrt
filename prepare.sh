#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")" && pwd)
src=${1:?Usage: prepare.sh OPENWRT_SOURCE}
src=$(realpath "$src")
base=$(dirname "$src")
clone_pin() {
  local url=$1 dest=$2 sha=$3
  if [[ ! -d "$dest/.git" ]]; then git clone "$url" "$dest"; fi
  git -C "$dest" fetch origin "$sha" --depth 1
  git -C "$dest" checkout --detach "$sha"
}
clone_pin https://github.com/fw876/helloworld.git "$base/ssr-feed" 04fe559424048d44aaf7c53f3b3c9a775c513a3b
clone_pin https://github.com/vernesong/OpenClash.git "$base/openclash-feed" e553e82e01c697aefbe1555261a503f425e00ccd
mkdir -p "$src/package/custom"
cp -a "$base/openclash-feed/luci-app-openclash" "$src/package/custom/"
cd "$src"
cp feeds.conf.default feeds.conf
printf '\nsrc-link ssr %s\n' "$base/ssr-feed" >> feeds.conf
./scripts/feeds update -a
./scripts/feeds install -a
# This unused LuCI app in the pinned release feeds has a Kconfig cycle.
if [[ -L package/feeds/luci/luci-app-weechat ]]; then unlink package/feeds/luci/luci-app-weechat; fi
cp "$repo/config.seed" .config
mkdir -p files
cp -a "$repo/files/." files/
chmod +x files/etc/uci-defaults/99-n100 files/usr/sbin/n100-update
# Reuse the packaged mihomo binary for OpenClash; neither proxy is enabled by default.
mkdir -p files/etc/openclash/core
ln -sfn /usr/libexec/mihomo files/etc/openclash/core/clash_meta
make defconfig
for sym in TARGET_x86_64 PACKAGE_luci-app-openclash PACKAGE_luci-app-ssr-plus PACKAGE_mihomo PACKAGE_kmod-igc; do
  grep -qx "CONFIG_${sym}=y" .config || { echo "Missing required selection: $sym" >&2; exit 1; }
done
