"""2014 Player's Handbook: the original 40 subclasses. Summaries in our own words; check the book
for the exact rules."""
from .base import LR, P14, SR, F, S, add

# ====================================================================== Fighter

add("champion-2014", S("fighter", "Champion", P14, [
    F(3, "Improved Critical", "Weapon attacks score a critical hit on a 19 or 20.", crit=19),
    F(7, "Remarkable Athlete", "Add half your proficiency bonus (rounded up) to Str, Dex and Con checks that don't already use it; running long jumps go Str-modifier feet farther.",
      check=dict(abilities=["str", "dex", "con"], add="half_pb_up", unproficient=True)),
    F(10, "Additional Fighting Style", "Choose a second Fighting Style."),
    F(15, "Superior Critical", "Critical hits on an 18–20.", crit=18),
    F(18, "Survivor", "At the start of each of your turns, if you have at most half your HP (and more than 0), regain 5 + Con modifier HP."),
]))
