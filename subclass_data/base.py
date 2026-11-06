"""Helpers for writing the subclass catalog (see subclasses.py for the effect keys a feature can carry)."""


def F(level, name, text, **effects):
    return {"level": level, "name": name, "text": text, **effects}


def S(cls, name, source, features, level=3):
    return {"class": cls, "name": name, "source": source, "level": level, "features": features}


P24, P14, TCE = "PHB 2024", "PHB 2014", "Tasha's"
SR, SR1, LR = "short", "short1", "long"   # resource recovery: all on a Short Rest / one on a Short Rest / Long Rest
PB_LR = "pb"                              # a common maximum: proficiency bonus uses per Long Rest

CATALOG = {}


def add(key, sub):
    if key in CATALOG:
        raise ValueError(f"duplicate subclass key {key}")
    CATALOG[key] = sub
