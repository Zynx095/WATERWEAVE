from ..registry import registry
from .open_meteo import OpenMeteoProvider
from .bbmp_static import BbmpStaticProvider

# Register providers
registry.register(OpenMeteoProvider())
registry.register(BbmpStaticProvider())
