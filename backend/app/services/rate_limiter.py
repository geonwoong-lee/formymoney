from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable


class SlidingWindowLimiter:
    """In-memory per-key limiter. It resets on restart and is per process, which is enough to cap abuse and cost."""

    def __init__(self, limits: list[tuple[int, int]], clock: Callable[[], float] = time.monotonic) -> None:
        self.limits = limits  # (window seconds, max requests)
        self.clock = clock
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = self.clock()
        window = self.hits[key]
        longest = max(seconds for seconds, _ in self.limits)
        while window and now - window[0] > longest:
            window.popleft()
        for seconds, maximum in self.limits:
            if sum(1 for stamp in window if now - stamp <= seconds) >= maximum:
                return False
        window.append(now)
        if len(self.hits) > 5_000:
            for stale in [name for name, stamps in self.hits.items() if not stamps or now - stamps[-1] > longest]:
                del self.hits[stale]
        return True
