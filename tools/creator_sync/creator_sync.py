#!/usr/bin/env python3
"""Sync Fami Creators' follower counts with Instagram and flag suspicious accounts.

Reads a CSV of creators (name, instagram_handle, declared_followers), looks each
handle up through the Instagram Graph API Business Discovery endpoint, and writes
a report with the real follower count, the gap from what the creator declared,
engagement rate and warning flags. Every run appends to a history file so sudden
follower jumps (often bought followers) can be spotted.

Environment:
  IG_ACCESS_TOKEN    long-lived token of Fami's own Instagram professional account
  IG_USER_ID         Instagram user id of that account
  GRAPH_API_VERSION  optional, default v23.0

Usage:
  python3 creator_sync.py creators.csv report.csv [--history history.csv]
"""

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

GRAPH_HOST = "https://graph.facebook.com"
MEDIA_SAMPLE = 12

# A declared count this much above the real one is flagged as inflated.
INFLATION_THRESHOLD = 0.10
# Engagement below this share of followers suggests bought or inactive followers.
LOW_ENGAGEMENT_THRESHOLD = 0.01
# Growth above this share since the previous check is flagged as a sudden jump.
JUMP_THRESHOLD = 0.15

FLAG_INFLATED = "הצהרה מנופחת"
FLAG_LOW_ENGAGEMENT = "מעורבות נמוכה - לבדוק עוקבים קנויים"
FLAG_JUMP = "קפיצה חדה בעוקבים"
FLAG_NOT_FOUND = "לא נמצא - חשבון אישי או שם שגוי"

REPORT_FIELDS = [
    "name",
    "instagram_handle",
    "declared_followers",
    "actual_followers",
    "gap_pct",
    "avg_likes",
    "avg_comments",
    "engagement_rate_pct",
    "flags",
    "checked_at",
]


class LookupError_(Exception):
    """Instagram could not return data for a handle."""


def normalize_handle(handle):
    return handle.strip().lstrip("@").lower()


def fetch_account(handle, user_id, token, version="v23.0", opener=urllib.request.urlopen):
    """Return Business Discovery data for one Instagram professional account."""
    fields = (
        f"business_discovery.username({handle})"
        f"{{username,followers_count,media_count,"
        f"media.limit({MEDIA_SAMPLE}){{like_count,comments_count,timestamp}}}}"
    )
    query = urllib.parse.urlencode({"fields": fields, "access_token": token})
    url = f"{GRAPH_HOST}/{version}/{user_id}?{query}"
    try:
        with opener(url, timeout=30) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as err:
        try:
            message = json.load(err).get("error", {}).get("message", str(err))
        except (ValueError, AttributeError):
            message = str(err)
        raise LookupError_(message) from err
    if "business_discovery" not in payload:
        raise LookupError_("no business_discovery in response")
    return payload["business_discovery"]


def engagement(account):
    """Average likes and comments over the sampled posts.

    Posts where the creator hid the like count are left out of the likes average.
    """
    media = account.get("media", {}).get("data", [])
    likes = [m["like_count"] for m in media if "like_count" in m]
    comments = [m.get("comments_count", 0) for m in media]
    avg_likes = sum(likes) / len(likes) if likes else None
    avg_comments = sum(comments) / len(comments) if comments else None
    return avg_likes, avg_comments


def evaluate(row, account, previous_followers=None):
    """Build one report row from the creator's declaration and Instagram data."""
    flags = []
    declared = int(row["declared_followers"]) if row.get("declared_followers") else None
    actual = account["followers_count"]

    gap_pct = None
    if declared is not None and actual:
        gap_pct = (declared - actual) / actual
        if gap_pct > INFLATION_THRESHOLD:
            flags.append(FLAG_INFLATED)

    avg_likes, avg_comments = engagement(account)
    rate = None
    if avg_likes is not None and actual:
        rate = (avg_likes + (avg_comments or 0)) / actual
        if rate < LOW_ENGAGEMENT_THRESHOLD:
            flags.append(FLAG_LOW_ENGAGEMENT)

    if previous_followers and (actual - previous_followers) / previous_followers > JUMP_THRESHOLD:
        flags.append(FLAG_JUMP)

    return {
        "actual_followers": actual,
        "gap_pct": _pct(gap_pct),
        "avg_likes": _round(avg_likes),
        "avg_comments": _round(avg_comments),
        "engagement_rate_pct": _pct(rate, digits=2),
        "flags": "; ".join(flags),
    }


def _pct(value, digits=1):
    return "" if value is None else round(value * 100, digits)


def _round(value):
    return "" if value is None else round(value)


def load_history(path):
    """Return the most recent follower count per handle from the history file."""
    latest = {}
    if not path or not os.path.exists(path):
        return latest
    with open(path, newline="", encoding="utf-8") as f:
        for rec in csv.DictReader(f):
            latest[rec["instagram_handle"]] = int(rec["followers"])
    return latest


def append_history(path, entries):
    new_file = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow(["instagram_handle", "followers", "checked_at"])
        writer.writerows(entries)


def run(creators_path, report_path, history_path, user_id, token, version, fetch=fetch_account):
    history = load_history(history_path)
    checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    rows, new_history = [], []

    with open(creators_path, newline="", encoding="utf-8-sig") as f:
        creators = list(csv.DictReader(f))

    for row in creators:
        handle = normalize_handle(row["instagram_handle"])
        out = {
            "name": row.get("name", ""),
            "instagram_handle": handle,
            "declared_followers": row.get("declared_followers", ""),
            "checked_at": checked_at,
        }
        try:
            account = fetch(handle, user_id, token, version)
        except LookupError_ as err:
            print(f"{handle}: {err}", file=sys.stderr)
            out["flags"] = FLAG_NOT_FOUND
        else:
            out.update(evaluate(row, account, history.get(handle)))
            new_history.append([handle, account["followers_count"], checked_at])
        rows.append(out)

    # utf-8-sig so Excel opens the Hebrew flags correctly.
    with open(report_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    if history_path and new_history:
        append_history(history_path, new_history)
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("creators", help="CSV: name, instagram_handle, declared_followers")
    parser.add_argument("report", help="output CSV report")
    parser.add_argument("--history", default="history.csv", help="follower history CSV")
    args = parser.parse_args(argv)

    token = os.environ.get("IG_ACCESS_TOKEN")
    user_id = os.environ.get("IG_USER_ID")
    if not token or not user_id:
        parser.error("set IG_ACCESS_TOKEN and IG_USER_ID (see README.md)")
    version = os.environ.get("GRAPH_API_VERSION", "v23.0")

    rows = run(args.creators, args.report, args.history, user_id, token, version)
    flagged = sum(1 for r in rows if r.get("flags"))
    print(f"checked {len(rows)} creators, {flagged} flagged -> {args.report}")


if __name__ == "__main__":
    main()
