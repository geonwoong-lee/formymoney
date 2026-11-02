from datetime import date

from fastapi import APIRouter, Query

from app.schemas.daily_briefing import CamelModel
from app.services.events import upcoming
from app.services.news_digest import korea_today

router = APIRouter()


class EventResponse(CamelModel):
    key: str
    date: date
    d_day: int
    kind: str
    title: str
    why: str
    source_name: str
    source_url: str
    checked_on: date
    tentative: bool


class EventsResponse(CamelModel):
    today: date
    items: list[EventResponse]


@router.get("/events", response_model=EventsResponse)
def get_events(days: int = Query(default=60, ge=1, le=400)) -> EventsResponse:
    today = korea_today()
    return EventsResponse(today=today, items=[
        EventResponse(
            key=event.key, date=event.day, d_day=(event.day - today).days, kind=event.kind, title=event.title,
            why=event.why, source_name=event.source_name, source_url=event.source_url,
            checked_on=event.checked_on, tentative=event.tentative,
        )
        for event in upcoming(today, days)
    ])
