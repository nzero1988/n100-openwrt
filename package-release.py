#!/usr/bin/env python3
import hashlib, json, pathlib, shutil, sys
source, output, tag = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
output.mkdir(parents=True, exist_ok=True)
manifest = {"tag": tag, "target": "x86/64", "layout": "squashfs-2048-v1"}
for mode, suffix in [("bios", "combined.img.gz"), ("efi", "combined-efi.img.gz")]:
    matches = list(source.glob(f"openwrt*-x86-64-generic-squashfs-{suffix}"))
    if len(matches) != 1:
        raise SystemExit(f"Expected one {mode} image, found {matches}")
    image = matches[0]
    manifest[f"{mode}_file"] = image.name
    manifest[f"{mode}_sha256"] = hashlib.file_digest(image.open("rb"), "sha256").hexdigest()
    shutil.copy2(image, output / image.name)
for name in ["config.buildinfo", "feeds.buildinfo", "version.buildinfo", "sha256sums"]:
    if (source / name).is_file(): shutil.copy2(source / name, output / name)
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
