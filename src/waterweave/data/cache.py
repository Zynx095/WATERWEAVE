from typing import Callable, Any, Dict, Tuple
from datetime import datetime, timezone, timedelta

_cache: Dict[str, Tuple[datetime, Any]] = {}

def _all_missing(result: Any) -> bool:
    """True for a non-empty list of observations that all failed to produce a value."""
    if not isinstance(result, list) or not result:
        return False
    return all(getattr(getattr(o, "quality", None), "missing", False) for o in result)


def ttl_cache(ttl_seconds: int = 300):
    """
    Simple in-memory TTL cache decorator for provider fetch methods.
    Useful when running offline or without Streamlit's @st.cache_data context.
    """
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs) -> Any:
            # Create a simple cache key from func name and args (ignoring self for class methods if needed, 
            # but simplest is just stringifying args)
            key = f"{func.__module__}.{func.__name__}:{str(args)}:{str(kwargs)}"
            now = datetime.now(timezone.utc)
            if key in _cache:
                timestamp, data = _cache[key]
                if now - timestamp < timedelta(seconds=ttl_seconds):
                    return data
            
            # Cache miss or expired
            result = func(*args, **kwargs)
            # A fetch that produced only missing values (a network error) is
            # not kept: caching it would hide live data for the whole TTL.
            if not _all_missing(result):
                _cache[key] = (now, result)
            return result
        return wrapper
    return decorator

def clear_cache():
    """Clears the data provider cache."""
    _cache.clear()
