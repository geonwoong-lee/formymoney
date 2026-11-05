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
        self.last_sweep = clock()

    def allow(self, key: str) -> bool:
        now = self.clock()
        # 가장 긴 창이 지난 키(접속 주소)는 판정보다 먼저, 그 창마다 한 번씩 지운다(거절되는 요청이 와도 정리된다).
        # 그래서 마지막 요청 뒤 늦어도 가장 긴 창의 두 배 안에 지워지고(요청이 전혀 없으면 다음 요청 때), 서버를 다시 켜면 모두 사라진다.
        self._sweep(now)
        window = self.hits[key]
        longest = max(seconds for seconds, _ in self.limits)
        while window and now - window[0] > longest:
            window.popleft()
        for seconds, maximum in self.limits:
            if sum(1 for stamp in window if now - stamp <= seconds) >= maximum:
                return False
        window.append(now)
        return True

    def _sweep(self, now: float) -> None:
        longest = max(seconds for seconds, _ in self.limits)
        if len(self.hits) <= 5_000 and now - self.last_sweep <= longest:
            return
        self.last_sweep = now
        for stale in [name for name, stamps in self.hits.items() if not stamps or now - stamps[-1] > longest]:
            del self.hits[stale]
