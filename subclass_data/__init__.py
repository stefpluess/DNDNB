"""The subclass catalog: 2024 Player's Handbook, 2014 Player's Handbook and Tasha's Cauldron of Everything.

Summaries are short reminders in our own words, not the books' text. Numbers that the app uses
(dice, uses, AC formulas) follow the books as far as we know them: check them against your copy.
One module per book; each adds its entries with add(key, S(...)).
"""
from . import phb2014, phb2024, tasha  # noqa: F401  (importing registers the entries)
from .base import CATALOG  # noqa: F401
