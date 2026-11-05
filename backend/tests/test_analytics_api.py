

def test_every_event_the_endpoint_accepts_is_one_the_service_can_record() -> None:
    """The request schema and the service keep separate lists; an event in only one of them is accepted and then fails with a 500."""
    from typing import get_args

    from app.api.v1.endpoints.analytics import EventName
    from app.services.analytics_service import EVENT_NAMES

    assert set(get_args(EventName)) == EVENT_NAMES
