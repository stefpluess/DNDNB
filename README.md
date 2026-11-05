# Initiative Ledger

A local battle tracker for the DM, built for the **D&D 2024 rules ("5.5e", SRD 5.2)**. It runs on your computer and opens in your browser.

- **Combat view**: initiative order, HP, temp HP, conditions with round timers, spell slots, death saves, monster stat blocks with clickable attack and damage rolls, and a dice log.
- **Party view**: character sheets. AC, attack bonus, damage, saves, skills, spell DC and initiative are calculated from ability scores, proficiencies and equipped gear.
- **Bestiary**: your own homebrew creatures, built from scratch or copied from an SRD monster, with a live 2024-style stat block.
- **Library**: SRD 5.2 monsters, spells, weapons, armor, magic items and conditions, downloaded once from Open5e and stored locally so it works offline at the table.

It only needs Python 3.9 or newer. No packages to install.

## First run

```
python import_srd.py      # downloads SRD 5.2 into data/srd.db, takes about a minute
python server.py --open   # starts the app and opens http://127.0.0.1:8765
```

You only need `import_srd.py` once, or again to refresh the data. It downloads everything before changing anything, never empties a category if the download comes back unusable, and ends with a short sanity check (a goblin, a longsword, a shield, chain mail, fireball) so you can see the data reads correctly. On Windows, use `py` instead of `python` if `python` isn't found.

**Want an offline backup of the data?** Keep a copy of the raw download and re-import from it any time:

```
python import_srd.py --save-dir srd-backup     # download and keep the JSON
python import_srd.py --from-dir srd-backup     # later, offline
```

If you used an earlier 2014 version of this app, run `python import_srd.py` once. It replaces the old data; your characters are kept.

## Using it

**Combat**
- Search the library on the left. `+` adds a monster; set *Add* to 3 for three numbered goblins. Initiative is rolled for each one.
- The *Party* tab in the library adds your characters, or the whole party at once.
- The `Dmg` box on each row: type a number, press Enter to deal damage, or Shift+Enter to heal. Shift-click the `−` button (or *Damage* in the inspector) for damage from a critical hit, which matters at 0 HP: it counts as two death save failures.
- Click a row to open it in the inspector on the right. There you can manage conditions, slots, death saves and notes, and see the full stat block.
- Click `+4 to hit` or `1d6+2 slashing` to roll. Extra damage, such as a dragon's fire on Rend, gets its own button. Shift-click a damage button to roll a critical hit (dice doubled). Monster initiative uses the stat block's Initiative bonus.
- Keyboard shortcuts: `N` next turn, `P` back, `/` search.
- The tracker handles these rules for you:
  - Temp HP absorbs damage first and doesn't stack.
  - A concentrating creature that takes damage gets a reminder of the save DC (10 or half the damage, up to 30).
  - Exhaustion is a level from 1 to 6. Adding it again raises the level; clicking the chip lowers it. For PCs the level is stored on the sheet.
  - At 0 HP, concentration ends and PCs get death saves. *Roll death save* applies the result: 10 or higher succeeds, a natural 20 brings them back with 1 HP, and a natural 1 counts as two failures. Exhaustion lowers the roll.
  - Condition timers count down at the end of the creature's turn. *Back* undoes that countdown for the turn it steps back over.
  - Removing the creature whose turn it is passes the turn to the next one.

**Party**
- Create a character. Set the class and level, then click *Fill from class* to fill in the 2024 saving throws, armor and weapon proficiencies. For example, Rogues get martial weapons with Finesse or Light, and Monks get martial weapons with Light.
- Add gear by searching the item box. Tick *Eq.* to wear or wield an item. Set *Magic* to 1 for a +1 weapon, armor or shield.
- Known magic items apply their bonuses automatically once equipped and attuned:
  - Ring and Cloak of Protection, Bracers of Defense
  - Gauntlets of Ogre Power, Headband of Intellect, Amulet of Health
  - Belts of Giant Strength
- Use *Add custom item* for anything else, and set its AC, save, attack, damage or spell DC bonus by hand.
- **Weapon Mastery**: tick a weapon's mastery (Sap, Topple, Vex and so on) in the inventory, and it shows on the attack.
- **Exhaustion** on the sheet takes 2 per level off every d20 Test (attacks, saves, skills, initiative, spell attacks) and 5 ft per level off speed. A long rest removes one level.
- Paladins and Rangers get spell slots from level 1, following the 2024 table.
- Fighting style feats (Archery, Defense, Dueling), finesse weapons, versatile weapons, Unarmored Defense (Barbarian, Monk), medium armor's Dex cap and heavy armor's Strength requirement are all handled.
- PCs in combat share HP and spell slots with their sheet. Damage taken in the tracker shows up on the sheet.

**Bestiary (homebrew creatures)**
- Click *New creature*, or type in *Copy an SRD monster* to start from an existing stat block.
- Edit the basics: name, size, type, CR, AC, HP (or hit dice plus *Average*), speeds, ability scores, save proficiencies, skills, resistances, senses and languages.
- Proficiency bonus, XP, saves, passive Perception and initiative are worked out for you. Type an initiative value only to override it.
- Traits and actions: for an attack, pick Melee or Ranged and fill in damage dice and type, plus optional extra damage. Leave *To hit* empty to use proficiency plus Strength or Dexterity.
- The description is written automatically in the 2024 style until you type your own. If you change the attack fields of an action with a hand-written (or copied) description, a note offers to rewrite it so the text and the roll buttons agree.
- Actions can be Bonus Actions, Reactions or Legendary Actions, with Recharge or per-day limits.
- Everything saves as you type, and the stat block on the right updates live.
- Your creatures appear in the combat library (marked *Homebrew*) with the same roll buttons as SRD monsters. *Add to combat* in the editor uses the count from the library.
- Homebrew is stored in `data/campaign.db`, so re-importing the SRD never touches it.

## Files

| File | What it does |
|---|---|
| `server.py` | Local web server and JSON API (standard library only) |
| `rules.py` | The 2024 rules math for character sheets |
| `homebrew.py` | Homebrew creatures: derived stats, attacks and auto descriptions |
| `common.py` | Shared constants (abilities, skills, sizes, CR tables) and formatting; the front end reads them via `/api/meta` |
| `import_srd.py` | Downloads or imports SRD 5.2 data into `data/srd.db` |
| `db.py` | SQLite helpers |
| `data/campaign.db` | Your characters, homebrew creatures and the current encounter. Back this file up. |
| `static/index.html`, `static/style.css` | The page and its styles |
| `static/js/` | The interface, one module per job (see below) |

The front end is split into plain JavaScript modules (no build step):

| Module | Job |
|---|---|
| `main.js` | Starts the app, loads saved state, keyboard shortcuts |
| `store.js` | Shared state, server calls, saving for the encounter, characters and homebrew |
| `combat.js` | Combat rules: turns, damage, temp HP, concentration, death saves, conditions |
| `dice.js` | Dice expressions |
| `autosave.js` | Debounced saving that keeps saves to one thing in order |
| `forms.js` | Connects form fields to data (`data-path`, `data-type`, `data-list`) |
| `tracker.js`, `party.js`, `bestiary.js` | The three views |
| `statblock.js`, `sheetview.js` | Stat blocks, spells, items, and computed character stats |
| `ui.js`, `nav.js`, `util.js` | Roll log, view switching, small helpers |

## Tests

```
python -m unittest test_rules test_homebrew test_server   # rules, homebrew, server and importer
node --test "js_tests/*.test.js"                          # combat rules, dice, saving, forms (needs Node 18+)
```

The app itself needs only Python; Node is only for running the JavaScript tests. When something looks wrong in the browser, open the developer console and type `ledger.S` to see the app's state.

## Limits for now

- Content is SRD 5.2 only, not the full 2024 Monster Manual. Build anything else in the Bestiary.
- Characters are single-class.
- Spells known or prepared per character aren't tracked yet, only slots.

## Data source

Game data comes from Open5e (<https://open5e.com>), filtered to the System Reference Document 5.2. SRD 5.2 is by Wizards of the Coast LLC and is licensed under the Creative Commons Attribution 4.0 International License.
