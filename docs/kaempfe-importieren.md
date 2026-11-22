# Anleitung: Kämpfe für den Import in den Initiative Ledger schreiben

*Diesen ganzen Text in die Claude-Session einfügen, in der die Kämpfe vorbereitet werden.*

---

Ich leite eine D&D-Kampagne nach den **Regeln von 2024 (SRD 5.2)**. Meine Kämpfe verwalte ich in einem
Kampf-Tracker, dem „Initiative Ledger“. Er kann vorbereitete Kämpfe als Text importieren. Bitte gib mir jeden
Kampf, den wir vorbereiten, **genau in diesem Format** aus, damit ich ihn einfach kopieren und einfügen kann.

## Das Format

```
# Hinterhalt im Sumpf
3 Goblin Warrior
1 Goblin Boss
Ally: 2 Guard
Sumpfhexe Morra (HP 45, AC 13, XP 700, Init +2)
Notes:
Die Goblins liegen im Schilf auf beiden Seiten des Stegs (Bereich mit schwierigem Gelände).
Morra bleibt hinten und flieht, wenn sie unter 15 TP fällt.
Beute: 40 GM, ein Heiltrank.
```

Zeile für Zeile:

- **`# Name des Kampfes`**: Jeder Kampf beginnt mit einer Überschrift mit `#`. Mehrere Kämpfe einfach
  untereinander schreiben, jeder mit eigener `#`-Überschrift.
- **Eine Kreatur pro Zeile, die Anzahl zuerst:** `3 Goblin Warrior`. Eine einzelne Kreatur bekommt `1`.
  Höchstens 50 pro Zeile.
- **Verbündete** der Gruppe bekommen `Ally:` davor: `Ally: 2 Guard`. Ohne `Ally:` ist eine Kreatur ein Gegner.
  Die Spielercharaktere selbst gehören **nicht** in die Liste.
- **Kreaturen, die es im SRD 5.2 nicht gibt** (eigene NSCs, eigene Monster), bekommen ihre Werte in Klammern:
  `Sumpfhexe Morra (HP 45, AC 13, XP 700, Init +2)`. Nötig ist mindestens `HP`. `AC`, `XP` und `Init`
  (Initiative-Bonus) bitte immer mitgeben, denn ohne XP kann der Tracker die Schwierigkeit nicht berechnen.
- **`Notes:`** kommt **zuletzt**. Alles nach `Notes:` bis zur nächsten `#`-Überschrift sind meine Notizen
  als Spielleiter: Ort, Ausgangslage, Gelände, Taktik, Beute, was die Gegner wissen. Die Notizen dürfen
  deutsch sein und mehrere Zeilen und Aufzählungen haben.

## Wichtig bei den Monsternamen

Der Tracker sucht jede Kreatur in seiner Monsterbibliothek, also dem **englischen SRD 5.2** und meinen
eigenen Kreaturen. Damit er sie findet:

- **Immer den exakten englischen Namen aus dem SRD 5.2 (2024) verwenden**, auch wenn wir sonst deutsch
  schreiben. Also `Goblin Warrior`, nicht „Goblin-Krieger“.
- **Die Namen von 2024 verwenden, nicht die von 2014.** Einige Monster heißen im SRD 5.2 anders als früher,
  zum Beispiel `Goblin Warrior` und `Goblin Boss` (statt „Goblin“), `Bugbear Warrior`, `Hobgoblin Warrior`,
  `Gnoll Warrior`. Andere heißen gleich wie früher, zum Beispiel `Wolf`, `Guard`, `Bandit Captain`, `Ogre`,
  `Troll`, `Zombie` und `Skeleton`.
- **Bist du nicht sicher**, ob ein Monster unter genau diesem Namen im SRD 5.2 steht? Dann **schreib die Werte
  in Klammern dazu**. Findet der Tracker den Namen, nimmt er den offiziellen Werteblock und ignoriert die
  Klammer. Findet er ihn nicht, legt er die Kreatur mit deinen Werten an. So geht nichts verloren.
- **Abgewandelte SRD-Monster** (zum Beispiel ein stärkerer Oger) brauchen einen **eigenen Namen** und Werte in
  Klammern: `Oger-Häuptling Grukk (HP 85, AC 13, XP 1100, Init −1)`. Hieße die Kreatur einfach `Ogre`, würde
  der Tracker den normalen Oger nehmen.
- Nicht zweimal dieselbe Kreatur in getrennten Zeilen aufführen. Besser eine Zeile mit der Gesamtzahl.

## Ausgabe

- **Alle Kämpfe zusammen in einen einzigen Codeblock** (mit drei Backticks ``` davor und danach). Text
  außerhalb des Codeblocks ignoriert der Tracker. Erklärungen und Rückfragen gehören also nach draußen.
- **Innerhalb des Codeblocks** nichts anderes als die Kämpfe. Keine Tabellen, keine zusätzlichen
  `#`-Überschriften innerhalb der Notizen, denn jede Zeile, die mit `#` beginnt, startet einen neuen Kampf.
  Für Zwischentitel in den Notizen einfach eine normale Zeile mit Doppelpunkt nehmen, zum Beispiel `Taktik:`.
- Jedem Kampf einen **eindeutigen, kurzen Namen** geben. Über diesen Namen verlinke ich ihn in meinem Wiki.
- Wenn ich einen Kampf ändern lasse, gib ihn bitte **vollständig neu** im selben Format aus.

## Ein vollständiges Beispiel mit zwei Kämpfen

```
# Hinterhalt im Sumpf
3 Goblin Warrior
1 Goblin Boss
Ally: 2 Guard
Sumpfhexe Morra (HP 45, AC 13, XP 700, Init +2)
Notes:
Die Goblins liegen im Schilf auf beiden Seiten des Stegs (schwieriges Gelände).
Taktik: Erst Fernkampf, dann Rückzug ins Schilf.
Beute: 40 GM, ein Heiltrank.

# Die morsche Brücke
1 Troll
2 Wolf
Notes:
Die Brücke trägt höchstens zwei Personen gleichzeitig.
Der Troll greift erst an, wenn jemand die Mitte erreicht.
```
