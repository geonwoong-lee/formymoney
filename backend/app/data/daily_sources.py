from datetime import date


DAILY_SOURCE_POLICIES: dict[str, dict[str, object]] = {
    "fsc_press": {
        "name": "금융위원회 보도자료",
        "allowed_host": "www.fsc.go.kr",
        "allowed_path_prefix": "/no010101/",
        "feed_url": "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111",
        "listing_url": "https://www.fsc.go.kr/no010101",
        "rights_url": "https://www.fsc.go.kr/ut020104",
        "rights_checked_on": date(2026, 10, 29),
        "usage_status": "summary_allowed",
        "summary_allowed": True,
        "active": True,
    },
    "bok_press": {
        "name": "한국은행 보도자료",
        "allowed_host": "www.bok.or.kr",
        "allowed_path_prefix": "/portal/",
        "feed_url": "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690",
        "listing_url": "https://www.bok.or.kr/portal/bbs/B0000552/list.do?menuNo=200690",
        "rights_url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200228",
        "rights_checked_on": date(2026, 10, 29),
        "usage_status": "discovery_only",
        "summary_allowed": False,
        "active": True,
    },
    "bok_terms": {
        "name": "한국은행 경제금융용어 자료",
        "allowed_host": "www.bok.or.kr",
        "allowed_path_prefix": "/portal/",
        "feed_url": None,
        "listing_url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200191",
        "rights_url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200228",
        "rights_checked_on": date(2026, 10, 29),
        "usage_status": "candidate_only",
        "summary_allowed": False,
        "active": True,
    },
}
