import re
import json
import httpx

SCB_FH_URL = (
    "https://api.scb.se/OV0104/v1/doris/sv/ssd/BO/BO0501/BO0501B/FastprisFHRegAr"
)

# Typical fritidshus living area used to convert average total price → kr/m².
# SCB does not publish size-normalised prices for fritidshus.
TYPICAL_SQM = 85

# Fastighetsbyran URL county slug → SCB riksområde code
COUNTY_TO_RIKS = {
    "stockholms-lan":       "RIKS1",
    "uppsala-lan":          "RIKS2",
    "sodermanlands-lan":    "RIKS2",
    "ostergotlands-lan":    "RIKS2",
    "orebro-lan":           "RIKS2",
    "vastmanlands-lan":     "RIKS2",
    "jonkopings-lan":       "RIKS3",
    "kronobergs-lan":       "RIKS3",
    "kalmar-lan":           "RIKS3",
    "gotlands-lan":         "RIKS3",
    "blekinge-lan":         "RIKS4",
    "skane-lan":            "RIKS4",
    "hallands-lan":         "RIKS5",
    "vastra-gotalands-lan": "RIKS5",
    "varmlands-lan":        "RIKS6",
    "dalarnas-lan":         "RIKS6",
    "gavleborgs-lan":       "RIKS6",
    "vasternorrlands-lan":  "RIKS7",
    "jamtlands-lan":        "RIKS7",
    "vasterbottens-lan":    "RIKS8",
    "norrbottens-lan":      "RIKS8",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "sv-SE,sv;q=0.9",
}

ENERGY_MAP = {
    "A": 0.06,
    "B": 0.04,
    "C": 0.02,
    "D": 0.0,
    "E": -0.02,
    "F": -0.04,
    "G": -0.06,
}

# Ordered: most specific / best first
HEATING_MAP = [
    ("bergvärme",       0.06),
    ("luft/vatten",     0.04),
    ("fjärrvärme",      0.03),
    ("luft/luft",       0.02),
    ("pellets",        -0.03),
    ("olja",           -0.03),
    ("direktverkande", -0.05),
]


def extract_objekt_id(url: str) -> str:
    m = re.search(r"objektID=(\d+)", url)
    if not m:
        raise ValueError("No objektID found in URL")
    return m.group(1)


def fetch_preloaded_state(url: str) -> dict:
    import base64
    r = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=15)
    r.raise_for_status()

    # The state is base64-encoded: window.__PRELOADED_STATE__ = 'eyJ...'
    m = re.search(r"window\.__PRELOADED_STATE__\s*=\s*'([A-Za-z0-9+/=]+)'", r.text)
    if m:
        return json.loads(base64.b64decode(m.group(1)).decode("utf-8"))

    # Fallback: raw JSON object (older page format)
    m = re.search(
        r"window\.__PRELOADED_STATE__\s*=\s*(\{.+?\});\s*</script>",
        r.text,
        re.DOTALL,
    )
    if m:
        return json.loads(m.group(1))

    raise ValueError("__PRELOADED_STATE__ not found in page HTML")


def find_in_posts(posts: list[dict], rubrik: str) -> str | None:
    """Search a flat list of fakta posts for a matching rubrik, case-insensitive."""
    needle = rubrik.lower()
    for post in posts:
        if (post.get("rubrik") or "").lower() == needle:
            return post.get("subItem") or ""
    return None


def flatten_posts(detaljer) -> list[dict]:
    """Accept either a list of sections or a dict of sections."""
    posts = []
    sections = detaljer if isinstance(detaljer, list) else detaljer.values()
    for section in sections:
        posts.extend(section.get("post", []))
    return posts


def map_heating(text: str) -> float:
    t = text.lower()
    for keyword, val in HEATING_MAP:
        if keyword in t:
            return val
    return 0.0  # unknown → neutral adjustment


def map_hoa(text: str) -> float:
    """Parse '11 200 kr/år' → nearest adj_hoa bracket."""
    before_kr = text.split("kr")[0]
    digits = re.sub(r"\D", "", before_kr)
    if not digits:
        return 0.0
    amt = int(digits)
    if amt < 5_000:
        return 0.02
    if amt < 10_000:
        return 0.0
    if amt < 15_000:
        return -0.02
    return -0.04


def extract_county_slug(url: str) -> str | None:
    m = re.search(r"/till-salu/([a-z]+(?:-[a-z]+)*-lan)/", url)
    return m.group(1) if m else None


def fetch_scb_median_psm(riks: str) -> int | None:
    """Return estimated kr/m² for fritidshus in the given riksområde (latest year)."""
    payload = {
        "query": [
            {"code": "Region",       "selection": {"filter": "item", "values": [riks]}},
            {"code": "ContentsCode", "selection": {"filter": "item", "values": ["BO0501Q6"]}},
            {"code": "Tid",          "selection": {"filter": "top",  "values": ["1"]}},
        ],
        "response": {"format": "json"},
    }
    try:
        r = httpx.post(SCB_FH_URL, json=payload, timeout=10)
        r.raise_for_status()
        rows = r.json().get("data", [])
        if rows:
            avg_tkr = float(rows[0]["values"][0])
            return round((avg_tkr * 1000) / TYPICAL_SQM)
    except Exception:
        pass
    return None


def parse_listing(url: str) -> dict:
    state = fetch_preloaded_state(url)
    obj_id = extract_objekt_id(url)

    obj_info = state.get("maeklarObjekt", {}).get("objektInfo", {})
    if obj_id not in obj_info:
        raise ValueError(f"objektID {obj_id} not found in preloaded state")

    root = obj_info[obj_id]["data"]["maeklarObjekt"]
    basfakta = root.get("basfakta", {})
    fakta = root.get("fakta", {})
    all_posts = flatten_posts(fakta.get("detaljer", {}))

    # Parse plot: "2 153 kvm" → 2153
    tomt_raw = basfakta.get("tomtArea", "")
    plot = int(re.sub(r"\D", "", tomt_raw)) if tomt_raw else None

    address = basfakta.get("gatuadress", "")
    municipality = root.get("kommunNamn", "")
    title = ", ".join(filter(None, [address, municipality])) or None

    result: dict = {
        "asking":    basfakta.get("oformateratPris"),
        "sqm":       basfakta.get("oformateradArea"),
        "plot":      plot,
        "buildyear": int(basfakta["byggnadsAar"]) if basfakta.get("byggnadsAar") else None,
        "taxval":    root.get("taxeringsvaerde"),
        "opex":      fakta.get("totalDriftskostnad"),
        "title":     title,
    }

    # Energy class → adj_energy
    energy_raw = find_in_posts(all_posts, "Energiklass")
    if energy_raw:
        letter = energy_raw.strip()[0].upper()
        result["adj_energy"] = ENERGY_MAP.get(letter, 0.0)

    # Heating → adj_heating
    heating_raw = find_in_posts(all_posts, "Uppvärmning")
    if heating_raw:
        result["adj_heating"] = map_heating(heating_raw)

    # HOA / samfällighet → adj_hoa
    hoa_raw = find_in_posts(all_posts, "Väg och samfällighet")
    if hoa_raw:
        result["adj_hoa"] = map_hoa(hoa_raw)

    # Regional median kr/m² from SCB (fritidshus average price ÷ typical sqm)
    county_slug = extract_county_slug(url)
    riks = COUNTY_TO_RIKS.get(county_slug or "")
    if riks:
        median_psm = fetch_scb_median_psm(riks)
        if median_psm:
            result["medianpsm"] = median_psm

    # Strip None values so the frontend knows which fields were found
    return {k: v for k, v in result.items() if v is not None}
