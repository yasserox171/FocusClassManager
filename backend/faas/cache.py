"""
Versioned cache keys for the analytics endpoints.

Locmem and Redis do not share a way to delete keys by pattern, so instead of
evicting we bump a version number that is part of every analytics cache key:
old entries become unreachable and expire on their own.
"""

from django.core.cache import cache

VERSION_KEY = "faas:analytics:version"


def analytics_version() -> int:
    version = cache.get(VERSION_KEY)
    if version is None:
        cache.set(VERSION_KEY, 1, None)
        return 1
    return int(version)


def bump_analytics_version() -> int:
    try:
        return cache.incr(VERSION_KEY)
    except ValueError:
        # Key missing or expired - start a fresh generation.
        cache.set(VERSION_KEY, 2, None)
        return 2
