"""A short memory of public answers, so a question many people ask in the same words is not worked out again each time.

Only an answer to a plain question is kept: no earlier conversation and none of the visitor's own plan was involved, so
the same words always mean the same thing and nothing personal can be handed to someone else. Entries expire quickly because
the figures behind an answer (rates, indexes, news) change through the day, and the oldest are dropped when it is full.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Callable
from threading import Lock

from app.services.assistant_chat import AssistantReply

TTL_SECONDS = 15 * 60
MAX_ENTRIES = 200


def cache_key(message: str) -> str:
    return " ".join(message.split()).lower()


class AnswerCache:
    def __init__(self, ttl_seconds: int = TTL_SECONDS, max_entries: int = MAX_ENTRIES, clock: Callable[[], float] = time.monotonic) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.clock = clock
        self._entries: OrderedDict[str, tuple[float, AssistantReply]] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> AssistantReply | None:
        with self._lock:
            found = self._entries.get(key)
            if found is None:
                return None
            stored_at, reply = found
            if self.clock() - stored_at > self.ttl_seconds:
                del self._entries[key]
                return None
            self._entries.move_to_end(key)
            return reply

    def put(self, key: str, reply: AssistantReply) -> None:
        with self._lock:
            self._entries[key] = (self.clock(), reply)
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)
