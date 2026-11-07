# Initiative Ledger

## What this is
A local D&D battle tracker and DM tool. The user is the DM of a running campaign that plays
the 2024 rules ("5.5e", SRD 5.2). Everything must follow the 2024 rules, not 2014.
It runs on the user's computer: a small Python server plus a browser UI at http://127.0.0.1:8765.
Desktop-first (wide screens, three columns). No phone layout needed.

## Run and test
```
python import_srd.py      # once: downloads SRD 5.2 from Open5e into data/srd.db, ends with a sanity check
python server.py --open   # starts the app (start.bat / start.sh do both)

python -m unittest test_rules test_homebrew test_server test_subclasses test_wiki   # Python tests
node --test "js_tests/*.test.js"                          # front-end tests (Node is only needed for tests)
```
Python 3.9+, standard library only. No pip packages, no build step.
In the browser console, `ledger.S` shows the app state and `ledger.combat` the combat rules.

## Features
- Combat view: SRD and homebrew monster library, initiative tracker, inspector with full 2024
  stat blocks and clickable rolls, roll log.
- Fights (combat library tab): prepare fights in advance. New opens the fight planner in the inspector
  (`fights.js`): monsters (search, or "Prepare" on a stat block) and custom creatures, counts, foe/ally, notes,
  difficulty against the whole party; saved as you go, the tracker isn't touched until Add to combat.
  "From tracker" saves the tracker's foes and allies as a fight.
- Party view: character sheets. The server calculates AC (with breakdown), attacks, saves,
  skills and spell DC from ability scores, proficiencies and equipped gear.
- Bestiary view: homebrew creature editor (new, or copied from an SRD monster), live stat block,
  auto-written 2024-style attack text.
- PCs in combat share HP, slots and Exhaustion with their sheet.
- Wiki view: campaign notes for the DM only (players never see the app). Markdown pages in categories
  (Unsorted is the inbox), `[[Page title]]` / `[[Page title|text]]` links, "Linked from", renaming rewrites
  links, search, a trash (nothing is erased). One campaign. Images: uploaded (button, paste, drag and drop),
  written as `![Caption|small|medium](file)`, a full-screen viewer with zoom, one portrait per page.
  Info boxes per category (`wiki.FIELDS`; "page" fields are links), tags, pages inside pages (`parent_id`,
  breadcrumbs, a foldable tree). Game links `[[char:Name]]` / `[[monster:Name]]` / `[[fight:Name]]` and char /
  monster info box fields ("In the game" with Add to combat; sheets and the combat inspector show "In the wiki").
  An image gallery (delete only unused images) and a Markdown zip export.

## Layout
Python (the server owns storage and all rules math for sheets and homebrew):
- `server.py`: http.server JSON API + static files; routes are a list at the bottom. `check_caller()` refuses
  requests whose Host isn't 127.0.0.1/localhost (DNS rebinding) or whose Origin is another site; request bodies
  must be JSON objects
- `rules.py`: character sheet math; `derive(sheet)`, `item_from_srd()`
- `homebrew.py`: homebrew creatures; `normalize()` fills mods, saves, PB/XP from CR, attacks, auto text
- `wiki.py`: wiki pages (`wiki_pages`), their links as normalized titles (`wiki_links`, so links to pages
  that don't exist yet are kept), rename rewriting, search, soft delete (`deleted` column); info box values
  per category in `fields` JSON (`{"npc": {...}}`, so switching category loses nothing; page fields are links,
  stored with the linked page's exact title), `tags` JSON (normalized `act-2`), `parent_id` (no loops); game links
  in `wiki_refs` (kind + normalized name, matched by name in `resolve_refs`; titles can't start with `char:`
  etc.); `export_zip()`; images in
  `data/wiki_images/` named `<16 hex of SHA-256>.<ext>` (same picture = same file), recognized by their bytes
  (PNG/JPEG/GIF/WebP only, never SVG), listed in `wiki_images`; served by `GET /api/wiki/images/<file>`.
  Pages only ever show uploaded files, never web addresses.
- `common.py`: shared constants and formatting, served to the browser as `GET /api/meta`
- `subclasses.py` + `subclass_data/`: the subclass engine and catalog; `summons.py`: summoned creatures
- `import_srd.py`: Open5e importer; downloads everything before writing, never empties a category,
  prints a sanity check; `--save-dir` / `--from-dir` for offline copies
- `db.py`: SQLite. `data/srd.db` = reference data (safe to rebuild).
  `data/campaign.db` = the user's characters, homebrew, saved encounters (prepared fights), the wiki and the
  current encounter (wiki images live next to it in `data/wiki_images/`). New tables are added with
  CREATE TABLE IF NOT EXISTS; new columns on existing tables go in `db.CAMPAIGN_COLUMNS` (added, never dropped).
  **Never touch campaign.db destructively.**

Front end, `static/js/` (plain ES modules, no framework):
- `main.js`: boot. `store.js`: shared state `S`, `api()`, autosavers, `ctx` for combat rules
- `combat.js`: combat rules, DOM-free and tested (turns, damage, temp HP, concentration,
  death saves, conditions, exhaustion, group naming)
- `dice.js`, `autosave.js`, `forms.js`: dice parsing, ordered debounced saving, form binding
- `history.js`: undo/redo stack used by the combat view
- `tracker.js`, `party.js`, `bestiary.js`, `wiki.js`: the four views; `fights.js`: the fight planner (combat inspector)
- `markdown.js`: wiki page Markdown to HTML (escapes everything; link syntax matches `wiki.LINK`)
- `statblock.js`, `sheetview.js`: stat blocks, spells, items, computed character stats
- `ui.js`, `nav.js`, `util.js`: roll log, view switching, helpers (`esc`, `signed`, `setPath`, `toast`)

## Conventions
- SRD monsters and homebrew creatures share one shape (Open5e v2 SRD 5.2 creature JSON),
  so one renderer, search and combat path serves both. Keep it that way.
- Rules logic lives in testable code (`rules.py`, `homebrew.py`, `combat.js`), never in UI code.
  Add a test with every rules change.
- Forms use `data-path` / `data-type` (num, numnull, opt) / `data-required` / `data-list` / `data-commit`
  (text saved on change, not while typing: for values with side effects like a wiki title) and
  `bindForm()` from `forms.js`. No new ad-hoc input handlers.
- Saving goes through the autosavers in `store.js` (they keep saves to one thing in order).
- Every combat action calls `remember(label)` in `tracker.js` right before it changes the fight, so Ctrl+Z can undo it.
- Every user string goes through `esc()` before `innerHTML`.
- UI-only state lives in `S`, never in saved data.
- Negative numbers display with a typographic minus (`signed()`); dice expressions use "-".
- Skill keys use underscores (`sleight_of_hand`); `common.skill_key()` normalizes.
- One stylesheet; colors only as tokens on `:root` with dark-mode overrides (shadows too: `--shadow`, `--backdrop`).
  Its sections follow the layout comment at the top; numbers use lining figures (Alegreya's default 0 looks like o).

## Things learned the hard way
- Open5e labels the plain Shield as "heavy" armor with `ac_base` 2. `rules.is_shield()` recognizes
  shields by name plus base AC under 10; `_repair_shield()` fixes shields saved before that fix.
  Magic shields can come with no armor block.
- Open5e's `?name=` filter is ignored; `document__key=srd-2024` works. Conditions carry
  per-edition text (`descriptions[].gamesystem == "5e-2024"`).
- The importer was built from documented shapes and a few live records. It has NOT been run
  against the full live data yet. If the sanity check shows "!", start there.
- 2024 rules already implemented: class proficiencies (Rogue: martial with Finesse or Light;
  Monk: martial with Light), Paladin/Ranger slots from level 1, Weapon Mastery, Exhaustion
  (−2 per level to d20 Tests, −5 ft speed, 6 = death), concentration DC capped at 30,
  death saves (nat 20 = 1 HP, nat 1 = two failures, crit at 0 HP = two failures),
  monster initiative from the stat block, damage order (half on a save, then resistance, then
  vulnerability), condition timers that count down on another creature's turn, reactions and legendary actions
  regained at the start of the creature's turn, Recharge rolled (d6) at the start of its turn,
  Legendary Resistance per day (never resets mid-fight), attack rolls (nat 20 crits, nat 1 misses),
  concentration ends at 0 HP, on a failed Con save or when Incapacitated, and takes its linked
  effects with it; repeated saves are asked at the end (or start) of the bearer's turn,
  encounter difficulty from the 2024 XP budgets (Low/Moderate/High per character level, no multiplier),
  death (damage at 0 HP >= HP max kills, damage ends Stable, the dead can't be healed),
  one concentration spell at a time, monster resistances/immunities/condition immunities from the
  stat block (qualified 2014-style text is left to the DM), Paralyzed/Petrified/Stunned/Unconscious
  auto-fail Str and Dex saves and Restrained has Disadvantage on Dex saves, a Shield gives AC only
  with Shield training, Monk Martial Arts, Unarmed Strike for everyone, Weapon Mastery by level,
  Short Rest (Hit Dice + Con, Warlock pact slots, short-rest resources) and Long Rest (all Hit Dice back)
  in rules.py, class resources per level (RESOURCES), Jack of All Trades (skills only), Rage (damage,
  B/P/S resistance via the Raging condition, ends concentration), Petrified resistances, Sneak Attack,
  Divine Smite (+1d8 vs Fiend/Undead), Great Weapon / Thrown / Two-Weapon / Unarmed Fighting.
- Subclasses: 123 (PHB 2024, PHB 2014, Tasha's, Forge of the Artificer) in `subclass_data/` (one module per book), turned into
  effects by `subclasses.py` (see its docstring for the effect keys) and applied in `rules.derive`.
  Summaries are in our own words, never the books' text. Summoned creatures (Wildfire Spirit, Steel
  Defender, Eldritch Cannon, Primal Companion) are built by `summons.py` as monster-shaped stat blocks.
  `test_subclasses.py` evaluates every catalog entry at several levels.
- Class features: every 2024 class (and the Tasha's Artificer) level 1–20 in `subclass_data/classes.py`,
  through the same engine: Divine Order, Primal Order, Blessed Strikes, Elemental Fury, Pact of the Blade
  choices; Aura of Protection, Radiant Strikes, Brutal Strike, Disciplined Survivor, Slippery Mind, Roving,
  Indomitable, Primal Champion / Body and Mind (scores to 25), Foe Slayer.
- Spell effects in combat (`SPELL_EFFECTS` in combat.js): Hunter's Mark, Hex (marks add damage to the
  caster's hits and can be moved), Bless, Bane, Shield of Faith, Haste, Shield, Divine Favor.
- Artificer: the class features follow Eberron: Forge of the Artificer (2024 rules), and its subclasses
  are in `subclass_data/forge.py` (Armorer with Dreadnaught/Guardian/Infiltrator, Battle Smith with the
  2024 Steel Defender, Alchemist, Artillerist, Cartographer). Built from online summaries without the
  book: entries marked "(verify)" need checking. The Tasha's versions stay as "older versions".
- Species, backgrounds and feats (2024 PHB) in `subclass_data/origins.py`, through the same engine. Ability
  score increases from backgrounds and feats are typed into the scores, never added automatically.
- Multiclassing: `sheet.multiclass` = extra classes [{class_name, level, subclass}]; `class_list()` in
  rules.py. Proficiency bonus, cantrips and species use the total level; class features, resources and
  subclasses their class's level; 2024 multiclass spell slot table (+ Pact slots); Hit Dice pools.
- Combat statuses (`STATUS`), auras, cover, Weapon Mastery (`MASTERY`), Cunning Strike (`CUNNING`) and
  Stunning Strike are in combat.js; spells on the sheet (`spell_rows` in rules.py) with cantrip scaling.
- Not modeled: subclasses from books other than PHB 2014/2024 and Tasha's.

## Next steps, in order
1. Run `python import_srd.py` on the live data and fix whatever the sanity check reports.
2. Ideas not chosen yet: a desktop window (Tauri or Electron around the same code).

Limits: SRD 5.2 monsters only (not the full Monster Manual).
