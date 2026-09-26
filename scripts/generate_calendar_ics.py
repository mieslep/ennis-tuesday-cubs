#!/usr/bin/env python3
"""Generate the public calendar feed from assets/calendar.json."""

from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "calendar.json"
OUTPUT = ROOT / "assets" / "ennis-tuesday-cubs.ics"
LOCAL_ZONE = ZoneInfo("Europe/Dublin")
HOST = "mieslep.github.io"


def escape(value):
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def fold(line):
    """Fold a content line without splitting a UTF-8 character."""
    chunks = []
    current = []
    current_size = 0
    limit = 75
    for character in line:
        size = len(character.encode("utf-8"))
        if current and current_size + size > limit:
            chunks.append("".join(current))
            current = []
            current_size = 0
            limit = 74  # A continuation line begins with one space.
        current.append(character)
        current_size += size
    chunks.append("".join(current))
    return "\r\n ".join(chunks)


def utc_stamp(value, clock):
    local = datetime.combine(date.fromisoformat(value), time.fromisoformat(clock), LOCAL_ZONE)
    return local.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def make_event(uid, summary, start_date, end_date=None, start_time=None, end_time=None,
               description="", location="", status="CONFIRMED", stamp=""):
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stamp}",
    ]
    if start_time and end_time:
        lines.extend([
            f"DTSTART:{utc_stamp(start_date, start_time)}",
            f"DTEND:{utc_stamp(end_date or start_date, end_time)}",
        ])
    else:
        start = date.fromisoformat(start_date)
        inclusive_end = date.fromisoformat(end_date or start_date)
        lines.extend([
            f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(inclusive_end + timedelta(days=1)).strftime('%Y%m%d')}",
        ])
    lines.append(f"SUMMARY:{escape(summary)}")
    if description:
        lines.append(f"DESCRIPTION:{escape(description)}")
    if location:
        lines.append(f"LOCATION:{escape(location)}")
    lines.extend([
        f"STATUS:{status}",
        "END:VEVENT",
    ])
    return lines


def calendar_events(data, stamp):
    schedule = data["meetingSchedule"]
    no_meetings = set(schedule["noMeetingDates"])
    overrides = {item["date"]: item for item in schedule["overrides"]}
    start = date.fromisoformat(schedule["startDate"])
    end = date.fromisoformat(schedule["endDate"])
    events = []

    current = start
    while current <= end:
        date_string = current.isoformat()
        if current.isoweekday() % 7 == schedule["weekday"]:
            if date_string in no_meetings:
                events.extend(make_event(
                    f"no-meeting-{date_string}@{HOST}",
                    "No Cubs meeting",
                    date_string,
                    description="There is no Tuesday Cubs meeting on this date.",
                    stamp=stamp,
                ))
            else:
                override = overrides.get(date_string, {})
                events.extend(make_event(
                    f"meeting-{date_string}@{HOST}",
                    override.get("title", "Tuesday Cubs meeting"),
                    date_string,
                    start_time=schedule["startTime"],
                    end_time=schedule["endTime"],
                    description=override.get("description", ""),
                    location=override.get("location", ""),
                    status=override.get("status", "CONFIRMED"),
                    stamp=stamp,
                ))
        current += timedelta(days=1)

    for event in data["events"]:
        identity = hashlib.sha1(event["title"].encode("utf-8")).hexdigest()[:10]
        events.extend(make_event(
            f"event-{event['startDate']}-{identity}@{HOST}",
            event["title"],
            event["startDate"],
            end_date=event.get("endDate"),
            start_time=event.get("startTime"),
            end_time=event.get("endTime"),
            description=event.get("description", ""),
            location=event.get("location", ""),
            status=event.get("status", "CONFIRMED"),
            stamp=stamp,
        ))

    return events


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ennis Tuesday Cubs//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape(data['calendarName'])}",
        "X-WR-TIMEZONE:Europe/Dublin",
        *calendar_events(data, stamp),
        "END:VCALENDAR",
    ]
    content = "\r\n".join(fold(line) for line in lines) + "\r\n"
    OUTPUT.write_text(content, encoding="utf-8", newline="")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
