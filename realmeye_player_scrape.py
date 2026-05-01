#!/usr/bin/env python3
"""
Fetch and parse a RealmEye player profile (characters tab).

Writes a human-readable .txt dump by default. Optional JSON output.

Usage:
  python realmeye_player_scrape.py
  python realmeye_player_scrape.py evolz
  python realmeye_player_scrape.py evolz --txt-out my_dump.txt
  python realmeye_player_scrape.py evolz --json-out snapshot.json --quiet

Requires: pip install beautifulsoup4
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Install dependency: pip install beautifulsoup4", file=sys.stderr)
    raise SystemExit(1) from None

REALMEYE_BASE = "https://www.realmeye.com"
USER_AGENT = "ROTMG-builds-local-test/1.0 (+realmeye scraper; polite)"


def _fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "en,*"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _abs_href(href: str | None) -> str | None:
    if not href:
        return None
    if href.startswith("http"):
        return href
    return f"{REALMEYE_BASE}{href}" if href.startswith("/") else f"{REALMEYE_BASE}/{href}"


def _strip_label(cell_text: str) -> str:
    return re.sub(r"\s+", " ", cell_text).strip()


def parse_summary(soup: BeautifulSoup) -> dict[str, Any]:
    out: dict[str, Any] = {}
    table = soup.select_one("table.summary")
    if not table:
        return out
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        label = _strip_label(cells[0].get_text())
        value_cell = cells[1]

        if label == "Guild":
            a = value_cell.find("a", href=True)
            out["guild"] = {
                "name": _strip_label(a.get_text()) if a else _strip_label(value_cell.get_text()),
                "url": _abs_href(a["href"]) if a else None,
            }
        elif label == "Rank":
            container = value_cell.select_one(".star-container")
            if container:
                num = "".join(
                    t for t in container.find_all(string=True, recursive=False) if t.strip()
                ).strip()
                out["rank"] = int(num) if num.isdigit() else num
            else:
                out["rank"] = _strip_label(value_cell.get_text())
        elif label in ("Exaltations", "Fame"):
            num_span = value_cell.select_one("span.numeric")
            num = _strip_label(num_span.get_text()) if num_span else None
            link = value_cell.find("a", href=True)
            entry: dict[str, Any] = {"raw": _strip_label(value_cell.get_text())}
            if num and num.isdigit():
                entry["value"] = int(num)
            if link:
                entry["rank_url"] = _abs_href(link["href"])
                entry["rank_label"] = _strip_label(link.get_text())
            out[label.lower()] = entry
        else:
            text = _strip_label(value_cell.get_text())
            out[label.lower().replace(" ", "_")] = text
    return out


def parse_nav_tabs(soup: BeautifulSoup) -> list[dict[str, Any]]:
    tabs = []
    for li in soup.select("ul.nav.nav-pills > li"):
        a = li.find("a", href=True)
        if not a:
            continue
        tabs.append(
            {
                "label": _strip_label(a.get_text()),
                "url": _abs_href(a["href"]),
                "active": "active" in (li.get("class") or []),
            }
        )
    return tabs


def _wiki_slug(href: str) -> str | None:
    m = re.match(r"^/wiki/(.+)$", href)
    return m.group(1) if m else None


def parse_characters(soup: BeautifulSoup) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    table = soup.select_one("table#e")
    if not table:
        return rows
    tbody = table.find("tbody")
    if not tbody:
        return rows

    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 8:
            continue

        pet = tds[0].select_one("span.pet[data-item]")
        char_link = tds[1].select_one("a.character")

        placement_td = tds[5]
        pl_a = placement_td.find("a", href=True)
        placement: dict[str, Any] = {
            "display": _strip_label(placement_td.get_text()),
            "url": _abs_href(pl_a["href"]) if pl_a else None,
        }

        equipment: list[dict[str, Any]] = []
        for wrap in tds[6].select("span.item-wrapper"):
            link = wrap.find("a", href=True)
            span = wrap.select_one("span.item[title]")
            title = span.get("title") if span else None
            lines = [l.strip() for l in (title or "").split("\n") if l.strip()]
            name_line = lines[0] if lines else None
            enchantments = lines[1:] if len(lines) > 1 else []
            if link and link["href"].startswith("/wiki/"):
                equipment.append(
                    {
                        "wiki_slug": _wiki_slug(link["href"]),
                        "wiki_url": _abs_href(link["href"]),
                        "title": name_line,
                        "enchantments": enchantments,
                    }
                )
            elif span and span.get("title"):
                equipment.append(
                    {
                        "wiki_slug": None,
                        "wiki_url": None,
                        "title": name_line,
                        "enchantments": enchantments,
                    }
                )

        stats_span = tds[7].select_one("span.player-stats")
        stats_text = _strip_label(stats_span.get_text()) if stats_span else ""
        data_stats = stats_span.get("data-stats") if stats_span else None

        char_entry: dict[str, Any] = {
            "class": _strip_label(tds[2].get_text()),
            "level": _strip_label(tds[3].get_text()),
            "fame": _strip_label(tds[4].get_text()),
            "placement": placement,
            "equipment": equipment,
            "stats": stats_text,
            "stats_data": data_stats,
        }
        if pet:
            char_entry["pet_item_id"] = pet.get("data-item")
        if char_link:
            char_entry["portrait"] = {
                "outfit_url": _abs_href(char_link.get("href")),
                "data_class": char_link.get("data-class"),
                "data_skin": char_link.get("data-skin"),
                "data_dye1": char_link.get("data-dye1"),
                "data_dye2": char_link.get("data-dye2"),
            }
        rows.append(char_entry)
    return rows


def parse_player_page(html: str, player_name: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.select_one("h1 span.entity-name")
    title_name = _strip_label(h1.get_text()) if h1 else player_name
    canonical = soup.find("link", rel="canonical")
    canonical_href = canonical.get("href") if canonical else None
    quoted = urllib.parse.quote(player_name)

    return {
        "player": title_name,
        "canonical_url": _abs_href(canonical_href) if canonical_href else None,
        "profile_url": f"{REALMEYE_BASE}/player/{quoted}",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "summary": parse_summary(soup),
        "tabs": parse_nav_tabs(soup),
        "characters": parse_characters(soup),
    }


def scrape_player_json(player_name: str) -> dict[str, Any]:
    """
    Fetch /player/{name} from RealmEye and return the same structure as --json-out.

    Raises urllib.error.HTTPError (e.g. 404) or urllib.error.URLError on failure.
    """
    url = f"{REALMEYE_BASE}/player/{urllib.parse.quote(player_name)}"
    html = _fetch(url)
    return parse_player_page(html, player_name)


def _format_summary_line(key: str, val: Any) -> list[str]:
    lines: list[str] = []
    if isinstance(val, dict):
        if key == "guild":
            gname = val.get("name", "")
            gurl = val.get("url") or ""
            lines.append(f"  {key}: {gname}")
            if gurl:
                lines.append(f"    url: {gurl}")
        elif "value" in val or "raw" in val:
            lines.append(f"  {key}: {val.get('raw', val)}")
            if val.get("rank_url"):
                lines.append(f"    rank_link: {val['rank_url']} ({val.get('rank_label', '')})")
        else:
            lines.append(f"  {key}: {json.dumps(val, ensure_ascii=False)}")
    else:
        lines.append(f"  {key}: {val}")
    return lines


def format_txt(data: dict[str, Any]) -> str:
    blocks: list[str] = []
    blocks.append("RealmEye player scrape")
    blocks.append("=" * 60)
    blocks.append(f"Player: {data.get('player')}")
    blocks.append(f"Profile: {data.get('profile_url')}")
    if data.get("canonical_url"):
        blocks.append(f"Canonical: {data['canonical_url']}")
    blocks.append(f"Fetched (UTC): {data.get('fetched_at')}")
    blocks.append("")

    blocks.append("Summary")
    blocks.append("-" * 40)
    summary = data.get("summary") or {}
    for k in sorted(summary.keys(), key=lambda x: str(x).lower()):
        blocks.extend(_format_summary_line(k, summary[k]))
    blocks.append("")

    blocks.append("Tabs (other pages for this player)")
    blocks.append("-" * 40)
    for tab in data.get("tabs") or []:
        star = "*" if tab.get("active") else " "
        blocks.append(f"  [{star}] {tab.get('label')}")
        blocks.append(f"       {tab.get('url')}")
    blocks.append("")

    blocks.append(f"Characters ({len(data.get('characters') or [])})")
    blocks.append("-" * 40)
    for i, ch in enumerate(data.get("characters") or [], 1):
        blocks.append(f"--- {i}. {ch.get('class')} (Lv {ch.get('level')}) ---")
        blocks.append(f"  Fame: {ch.get('fame')}")
        pl = ch.get("placement") or {}
        blocks.append(f"  Placement: {pl.get('display')}")
        if pl.get("url"):
            blocks.append(f"  Placement URL: {pl['url']}")
        blocks.append(f"  Stats: {ch.get('stats')}")
        if ch.get("pet_item_id"):
            blocks.append(f"  Pet (RealmEye item id): {ch['pet_item_id']}")
        port = ch.get("portrait")
        if port:
            blocks.append(f"  Outfit / portrait: {port.get('outfit_url')}")
        eq = ch.get("equipment") or []
        if eq:
            blocks.append("  Equipment:")
            for slot in eq:
                slug = slot.get("wiki_slug")
                title = slot.get("title") or ""
                if slug:
                    blocks.append(f"    - {title}")
                    blocks.append(f"      wiki: {REALMEYE_BASE}/wiki/{slug}")
                elif title:
                    blocks.append(f"    - {title}")
                for ench in slot.get("enchantments") or []:
                    blocks.append(f"      * {ench}")
        blocks.append("")

    blocks.append("End of scrape")
    return "\n".join(blocks) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape RealmEye /player/NAME into .txt (and optional JSON).")
    parser.add_argument("player", nargs="?", default="evolz", help="RealmEye username")
    parser.add_argument(
        "--txt-out",
        metavar="FILE",
        help="Write human-readable .txt (default: realmeye_<player>_<timestamp>.txt)",
    )
    parser.add_argument("--json-out", metavar="FILE", help="Also write structured JSON to this file")
    parser.add_argument("--quiet", action="store_true", help="Do not print the .txt body to stdout")
    args = parser.parse_args()

    try:
        data = scrape_player_json(args.player)
    except urllib.error.HTTPError as e:
        url = f"{REALMEYE_BASE}/player/{urllib.parse.quote(args.player)}"
        print(f"HTTP {e.code} for {url}", file=sys.stderr)
        raise SystemExit(2) from e
    except urllib.error.URLError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        raise SystemExit(2) from e
    txt = format_txt(data)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safe_player = re.sub(r"[^\w.-]+", "_", args.player, flags=re.ASCII)
    default_txt = f"realmeye_{safe_player}_{ts}.txt"
    script_dir = Path(__file__).resolve().parent
    txt_path = Path(args.txt_out) if args.txt_out else script_dir / default_txt

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(txt)
    print(f"Wrote {txt_path.resolve()}", file=sys.stderr)

    if args.json_out:
        json_path = Path(args.json_out)
        if not json_path.is_absolute():
            json_path = script_dir / json_path
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Wrote {json_path.resolve()}", file=sys.stderr)

    if not args.quiet:
        sys.stdout.write(txt)


if __name__ == "__main__":
    main()
