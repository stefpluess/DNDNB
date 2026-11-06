"""The subclass catalog: 2024 Player's Handbook, 2014 Player's Handbook and Tasha's Cauldron of Everything.

Summaries are short reminders in our own words, not the books' text. Numbers that the app uses
(dice, uses, AC formulas) follow the books as far as we know them: check them against your copy.
One module per book; each adds its entries with add(key, S(...)).
"""
from . import phb2014, phb2024, tasha  # noqa: F401  (importing registers the entries)
from .base import CATALOG  # noqa: F401

# Older versions and the 2024 version that replaces them. The 2024 rules are the campaign's rules, so the
# sheet offers the 2024 version first and files these under "older versions". Tasha's subclasses without a
# 2024 version (Circle of Wildfire, Rune Knight...) aren't listed here: they're still the current version.
SUPERSEDED = {
    # Tasha's subclasses reworked in the 2024 Player's Handbook
    "fey-wanderer-tce": "fey-wanderer-2024", "psi-warrior-tce": "psi-warrior-2024", "soulknife-tce": "soulknife-2024",
    "aberrant-mind-tce": "aberrant-2024", "clockwork-soul-tce": "clockwork-2024", "stars-tce": "stars-2024",
    "glory-tce": "glory-2024", "mercy-tce": "mercy-2024",
    # 2014 Player's Handbook subclasses with a 2024 version
    "berserker-2014": "berserker-2024", "lore-2014": "lore-2024", "valor-2014": "valor-2024",
    "life-2014": "life-2024", "light-2014": "light-2024", "trickery-2014": "trickery-2024", "war-2014": "war-2024",
    "land-2014": "land-2024", "moon-2014": "moon-2024",
    "battle-master-2014": "battle-master-2024", "champion-2014": "champion-2024", "eldritch-knight-2014": "eldritch-knight-2024",
    "open-hand-2014": "open-hand-2024", "shadow-2014": "shadow-2024", "four-elements-2014": "elements-2024",
    "devotion-2014": "devotion-2024", "ancients-2014": "ancients-2024", "vengeance-2014": "vengeance-2024",
    "hunter-2014": "hunter-2024", "beast-master-2014": "beast-master-2024",
    "thief-2014": "thief-2024", "assassin-2014": "assassin-2024", "arcane-trickster-2014": "arcane-trickster-2024",
    "draconic-2014": "draconic-2024", "wild-magic-2014": "wild-magic-sorcerer-2024",
    "archfey-2014": "archfey-2024", "fiend-2014": "fiend-2024", "great-old-one-2014": "great-old-one-2024",
    "abjuration-2014": "abjurer-2024", "divination-2014": "diviner-2024", "evocation-2014": "evoker-2024", "illusion-2014": "illusionist-2024",
}

