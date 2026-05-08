#!/usr/bin/env python3
"""
Download dungeon key item icons from the RealmEye Dungeon Keys wiki page.

Writes PNGs under typed subfolders of the output dir: standard/, guild/, enchanted/,
mystery/, special-keys/ (runes, incantation, treasure map, vial), matching repo layout.

Requires: pip install beautifulsoup4
Optional: pip install pillow (for PNG transparency verification)

Usage:
  python fetch_dungeon_key_icons.py
  python fetch_dungeon_key_icons.py --dry-run
  python fetch_dungeon_key_icons.py --out-dir path/to/icons/keys
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Install dependency: pip install beautifulsoup4", file=sys.stderr)
    raise SystemExit(1) from None

REALMEYE_BASE = "https://www.realmeye.com"
USER_AGENT = "ROTMG-builds-local-test/1.0 (+dungeon-key-icons; polite)"
WIKI_PAGE = f"{REALMEYE_BASE}/wiki/dungeon-keys"
WIKI_IMG_PREFIX = "/s/a/img/wiki/i/"

EXCLUDE_ALTS = frozenset({"Realm Gold", "Soulbound"})

# Wiki alt text omits "Key" for these items (first table column is still the key sprite).
EXTRA_KEY_ALTS_EXACT = frozenset({
    "The Trials of Cronus",
})


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def abs_url(path: str) -> str:
    if path.startswith("http"):
        return path
    return f"{REALMEYE_BASE}{path}" if path.startswith("/") else f"{REALMEYE_BASE}/{path}"


def is_key_item_alt(alt: str) -> bool:
    alt = (alt or "").strip()
    if not alt or alt in EXCLUDE_ALTS:
        return False
    low = alt.lower()
    if low == "realm gold" or low == "soulbound":
        return False
    if low.endswith(" key") or " guild key" in low or " enchanted key" in low:
        return True
    if "mystery key" in low:
        return True
    if low.endswith(" rune"):
        return True
    if "incantation" in low:
        return True
    if low == "treasure map":
        return True
    if low.startswith("vial of"):
        return True
    if alt in EXTRA_KEY_ALTS_EXACT:
        return True
    return False


def slugify_filename_base(alt: str) -> str:
    s = alt.strip().lower().replace("'", "").replace("\u2019", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def key_output_subdir(h2_section_id: str, alt: str) -> str:
    """Map wiki H2 section id + alt text to icons/keys/<subdir>."""
    low = alt.strip().lower()
    if (
        low.endswith(" rune")
        or "incantation" in low
        or low == "treasure map"
        or low.startswith("vial of")
    ):
        return "special-keys"
    sid = (h2_section_id or "").lower()
    if "guild" in sid:
        return "guild"
    if "enchanted" in sid:
        return "enchanted"
    if "mystery" in sid:
        return "mystery"
    return "standard"


def filename_from_alt(alt: str) -> str:
    low = alt.strip().lower()
    base = slugify_filename_base(alt)
    no_extra = (
        low.endswith(" key")
        or low.endswith(" rune")
        or "incantation" in low
        or low == "treasure map"
        or low.startswith("vial of")
        or "mystery key" in low
    )
    if not no_extra:
        base = f"{base}-key"
    return f"{base}.png"


def _image_is_first_column_table_cell(img) -> bool:
    """True if img is not inside a table row, or it sits in the first <td> of its row."""
    td = img.find_parent("td")
    if td is None:
        return True
    tr = td.find_parent("tr")
    if tr is None:
        return True
    tds = tr.find_all("td", recursive=False)
    if not tds:
        return True
    return tds[0] is td


def collect_key_images(html: str) -> list[tuple[str, str, str]]:
    """Return ordered unique (alt, absolute_image_url, output_subdir) tuples."""
    soup = BeautifulSoup(html, "html.parser")
    root = soup.select_one(".wiki-page") or soup.select_one("#d")
    if not root:
        raise SystemExit("Could not find .wiki-page or #d")

    h2_section_id = ""
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str, str]] = []

    for el in root.find_all(["h2", "h3", "img"]):
        if el.name == "h2":
            h2_section_id = el.get("id") or ""
            continue
        if el.name == "h3":
            continue
        if el.name != "img":
            continue
        img = el
        if "img-responsive" not in (img.get("class") or []):
            continue
        if not _image_is_first_column_table_cell(img):
            continue
        src = img.get("src") or ""
        if WIKI_IMG_PREFIX not in src:
            continue
        if not src.lower().endswith(".png"):
            continue
        alt = (img.get("alt") or img.get("title") or "").strip()
        # RealmEye repeats "Secluded Thicket Key" in Enchanted Keys but uses a distinct sprite;
        # the row is the 499-gold enchanted key (wiki alt typo).
        if h2_section_id == "enchanted-keys" and alt == "Secluded Thicket Key":
            alt = "Secluded Thicket Enchanted Key"
        if not is_key_item_alt(alt):
            continue
        url = abs_url(src)
        key = (alt, url)
        if key in seen:
            continue
        seen.add(key)
        subdir = key_output_subdir(h2_section_id, alt)
        out.append((alt, url, subdir))

    return out


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = resp.read()
    dest.write_bytes(data)


def png_has_transparency(path: Path) -> bool | None:
    try:
        from PIL import Image
    except ImportError:
        return None
    with Image.open(path) as im:
        if im.mode in ("RGBA", "LA"):
            return True
        if im.mode == "P" and "transparency" in im.info:
            return True
        if "transparency" in im.info:
            return True
        if im.mode == "RGB":
            return False
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch RealmEye dungeon key icons.")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "icons" / "keys",
        help="Output directory root (default: icons/keys next to this script; PNGs go in subfolders)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        html = fetch(WIKI_PAGE)
    except urllib.error.URLError as e:
        print(f"Failed to fetch wiki: {e}", file=sys.stderr)
        raise SystemExit(1) from e

    items = collect_key_images(html)
    print(f"Found {len(items)} unique key sprites on {WIKI_PAGE}")

    by_name: dict[str, tuple[str, str, str]] = {}
    collisions: list[str] = []
    for alt, url, subdir in items:
        name = filename_from_alt(alt)
        prev = by_name.get(name)
        if prev is not None and prev != (alt, url, subdir):
            collisions.append(
                f"{name}: {prev[0]!r} / {prev[1]} / {prev[2]} vs {alt!r} / {url} / {subdir}"
            )
        by_name[name] = (alt, url, subdir)

    if collisions:
        print("WARN: same output filename from different sources:", file=sys.stderr)
        for c in collisions:
            print(f"  {c}", file=sys.stderr)

    written = 0
    for alt, url, subdir in items:
        name = filename_from_alt(alt)
        dest = args.out_dir / subdir / name
        if args.dry_run:
            print(f"  {subdir}/{name} <= {alt!r}\n           {url}")
            continue
        try:
            download(url, dest)
        except urllib.error.URLError as e:
            print(f"ERROR downloading {url} -> {subdir}/{name}: {e}", file=sys.stderr)
            continue
        written += 1

    if args.dry_run:
        return

    print(f"\nWrote {written} files under {args.out_dir}")

    opaque: list[str] = []
    unchecked = 0
    for p in sorted(args.out_dir.glob("**/*.png")):
        t = png_has_transparency(p)
        if t is None:
            unchecked += 1
            continue
        if not t:
            opaque.append(str(p.relative_to(args.out_dir)))

    if unchecked:
        print(
            f"{unchecked} file(s) not checked (install Pillow: pip install pillow)",
        )
    if opaque:
        print("WARNING: PNGs without alpha:", ", ".join(opaque))
    else:
        if unchecked == 0:
            print("Transparency check: all PNGs have alpha or palette transparency.")


if __name__ == "__main__":
    main()
