import os
import re
import json
import hashlib
import logging
import calendar
import feedparser
import nltk
from collections import Counter
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import xml.etree.ElementTree as ET


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OPML_FILE = os.path.join(BASE_DIR, "feeds.opml")
FRONTEND_JSON_OUTPUT = os.path.join(
    BASE_DIR, "..", "frontend", "public", "latest_cyber_news.json"
)

MAX_ARTICLES_PER_FEED = 3
MAX_TAGS = 8
MIN_WORD_LEN = 3
EASTERN_TZ = ZoneInfo("America/New_York")

CUSTOM_STOPWORDS = {
    "cybersecurity",
    "cyber",
    "news",
    "latest",
    "security",
    "attack",
    "attacks",
    "breach",
    "threat",
    "threats",
    "reports",
    "reports",
    "update",
    "updates"
}

KEYWORD_FILTER = {
    "ransomware",
    "malware",
    "apt",
    "phishing",
    "cve",
    "zero-day",
    "vulnerability",
    "breach",
    "exploit",
    "microsoft",
    "google",
    "aws",
    "cloud",
    "linux",
    "windows",
    "macos",
    "apt",
    "campaign",
    "social engineering"
}

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def ensure_nltk_data() -> None:
    try:
        stopwords.words("english")
    except LookupError:
        nltk.download("stopwords")

    try:
        word_tokenize("test sentence")
    except LookupError:
        nltk.download("punkt")

def parse_opml(opml_path: str) -> list[dict[str, str]]:
    tree = ET.parse(opml_path)
    root = tree.getroot()

    feeds: list[dict[str, str]] = []
    for outline in root.findall(".//outline"):
        xml_url = outline.attrib.get("xmlUrl")
        html_url =outline.attrib.get("htmlUrl", "").strip()
        outline_type = outline.attrib.get("type", "").lower()

        title  = (
            outline.attrib.get("text")
            or outline.attrib.get("title")
            or "Untitled Feed"
        ).strip()

        if xml_url and outline_type in {"rss", "atom", ""}:
            feeds.append(
                {
                    "feed_title":title,
                    "feed_url": xml_url.strip(),
                    "site_url": html_url
                }
            )

    seen = set()
    deduped = []
    for feed in feeds:
        if feed["feed_url"] not in seen:
            seen.add(feed["feed_url"])
            deduped.append(feed)
        
    return deduped

def parse_entry_date(entry) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed"):
        value = getattr(entry, attr, None)
        if value:
            try:
                dt = datetime.fromtimestamp(calendar.timegm(value), tz = timezone.utc)
                return dt.astimezone(EASTERN_TZ)
            except Exception:
                pass

    for attr in ("published", "updated", "created"):
        value = getattr(entry, attr, None)
        if value:
            try:
                dt = parsedate_to_datetime(value)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(EASTERN_TZ)
            except Exception:
                pass

    return None

def clean_html(text:str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_keywords(text: str, max_tags: int = 8) -> list[str]:
    if not text:
        return []

    text = text.lower()
    tokens = word_tokenize(text)
    stop_words = set(stopwords.words("english")) | CUSTOM_STOPWORDS

    cleaned = []
    for token in tokens:
        token = token.lower().strip()

        if not re.match(r"^[a-z0-9][a-z0-9\\-_\\.]+$", token):
            continue
        if token in stop_words:
            continue
        if len(token) < MIN_WORD_LEN:
            continue
        if token.isdigit():
            continue

        cleaned.append(token)

    counts = Counter(cleaned)
    ranked = sorted(
        counts.items(),
        key=lambda kv: (
            0 if any(ch.isdigit() for ch in kv[0]) or "-" in kv[0] else 1,
            kv[1],
            len(kv[0]),
        ),
        reverse=True,
    )

    return [word for word, _ in ranked[:max_tags]]


def matches_keyword_filter(text: str) -> bool:
    if not KEYWORD_FILTER:
        return True

    text_lower = text.lower()
    return any(keyword in text_lower for keyword in KEYWORD_FILTER)


def stable_article_id(link: str, title: str) -> str:
    raw = f"{link}|{title}".encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()[:16]


def get_entry_summary(entry) -> str:
    if hasattr(entry, "summary"):
        return clean_html(entry.summary)
    if hasattr(entry, "description"):
        return clean_html(entry.description)
    return ""


def parse_feed(
    feed_title: str,
    feed_url: str,
    site_url: str = "",
    max_articles: int = 3,
) -> list[dict]:
    logging.info(f"Reading feed: {feed_title}")
    parsed = feedparser.parse(feed_url)

    if getattr(parsed, "bozo", 0):
        logging.warning(f"Feed may be malformed: {feed_title}")

    articles = []
    for entry in parsed.entries:
        title = getattr(entry, "title", "").strip()
        link = getattr(entry, "link", "").strip()
        summary = get_entry_summary(entry)
        published = parse_entry_date(entry)
        combined_text = f"{title} {summary}".strip()

        if not title or not link:
            continue

        if not matches_keyword_filter(combined_text):
            continue

        tags = extract_keywords(combined_text, max_tags=MAX_TAGS)

        articles.append(
            {
                "id": stable_article_id(link, title),
                "feed_title": feed_title,
                "feed_url": feed_url,
                "site_url": site_url,
                "title": title,
                "link": link,
                "published_eastern": published.isoformat() if published else None,
                "summary": summary,
                "tags": tags,
            }
        )

    articles.sort(
        key=lambda x: x["published_eastern"] or "",
        reverse=True,
    )

    return articles[:max_articles]


def main() -> None:
    ensure_nltk_data()

    if not os.path.exists(OPML_FILE):
        raise FileNotFoundError(f"OPML file not found: {OPML_FILE}")

    feeds = parse_opml(OPML_FILE)
    logging.info(f"Found {len(feeds)} feed(s) in OPML")

    all_articles = []
    for feed in feeds:
        try:
            articles = parse_feed(
                feed_title=feed["feed_title"],
                feed_url=feed["feed_url"],
                site_url=feed.get("site_url", ""),
                max_articles=MAX_ARTICLES_PER_FEED,
            )
            all_articles.extend(articles)
        except Exception as exc:
            logging.exception(f"Failed processing {feed['feed_title']}: {exc}")

    all_articles.sort(
        key=lambda x: x["published_eastern"] or "",
        reverse=True,
    )

    os.makedirs(os.path.dirname(FRONTEND_JSON_OUTPUT), exist_ok=True)
    with open(FRONTEND_JSON_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, indent=2, ensure_ascii=False)

    logging.info(f"Saved {len(all_articles)} articles to {FRONTEND_JSON_OUTPUT}")


if __name__ == "__main__":
    main()