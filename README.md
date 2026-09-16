# Scientist RPG / Pokemon Auto Battle - Stage 8

Pokemon Anil V4.13 source data and assets are used as the local source-of-truth layer for this HTML Canvas auto-battle RPG.

## Run

```text
C:\Users\User\Documents\New project\html-monster-resonance-game
http://127.0.0.1:8787/
```

## Survival Mode

- Talk to Brock with Z and select the 15-minute survival area. The selected healthy Pokemon deploys at the arena center.
- Enemies approach from four directions. Encounters advance from Lv.3-7 to Lv.46-50, with a maximum of 44 active enemies.
- The timer counts active Pokemon combat only. Trainer mode, capture sequences, menus and level-up choices pause the challenge clock and new waves.
- Z still recalls/deploys Pokemon; X still throws a ball in trainer mode. Captures and party growth persist when returning to the hub.
- The nurse is north of the arena center. Walk within interaction range and press Z to heal the party. Treatment has a 25-second combat-time cooldown; it is not an automatic safe zone.
- Survival rewards use a dedicated growth-progress adjustment over the native species growth table. A simulated kill every three seconds takes a Lv.5 starter to approximately Lv.49 in 15 minutes. Actual growth depends on combat and participation; survival reward growth stops at Lv.50.
- The HUD shows remaining time, encounter levels, kills and the direction/readiness of the nurse. Clearing or voluntarily returning preserves the collection. Defeat/restart now begins a new journey at Oak, as described below. Active-run elapsed time and treatment cooldown are saved with the existing report.
- Guide, healer and shop roles use the original Anil Brock, nurse and clerk field sheets, including directional facing and original alpha transparency.

Validation: `node --test tests/combat.test.cjs tests/survival.test.cjs`.
Browser checks (Playwright/Chrome): `node tests/browser-check.cjs` and `node tests/survival-browser.cjs`.

## Stage 7 Features

- Level-up choices now roll all four rarities independently per card: common 70%, rare 20%, hero 8%, legendary 2%.
- Common cards grant stat growth.
- Rare cards upgrade one of the Pokemon's current four moves.
- Hero cards can replace the current ability with a supported/adapted Hidden Ability.
- Hero cards can grant a permanent Tera Type. Base types are preserved, while active battle typing becomes the single Tera Type.
- Legendary cards can teach one compatible damaging TM move through the existing move learn/replace UI.
- Save data is now version 2 and persists ability, base types, Tera Type, and Tera state.
- Summary and debug panels show Base Type, Tera Type, Active Type, Hidden Ability, and compatible TM candidates.
- The battle HUD shows four independent move cooldown rows in the bottom-right.
- UI font files are loaded from the user-provided Korean patch font archive.

## Adapter API

`js/data/anilAdapter.js` exposes the current source-compatible interface:

```text
getSpeciesData(speciesId)
getMoveData(moveId)
getAbilityData(abilityId)
getEvolutionData(speciesId)
getLearnset(speciesId)
getTMLearnset(speciesId)
getCompatibleTMMoves(speciesId)
getHiddenAbilities(speciesId)
getPokedexEntry(speciesId)
getPokemonSprite(speciesId)
getPokemonIcon(speciesId)
getTypeData(typeId)
getAllTypes()
getActiveTypes(entity)
typeMultiplier(moveType, defenderTypes)
validate()
```

## Controls

- Move: `WASD` or arrow keys
- Deploy / recall: `Z`
- Party select / quick switch: `X`
- Poke Ball: `C` in Trainer Mode
- Menu: `Esc`, `Enter`, or mobile `MENU`
- Fullscreen: top-right button
- Debug: `F2`
- Debug EXP: `F3`
- Force next rarity: `F4` rare, `F6` common, `F7` hero, `F8` legendary
- Debug weaken capture target: `F5`

## Save

Browser `localStorage` key:

```text
scientistRpgSave
```

Save version: `4` (new starter/formation fields are optional for older saves)

## Verification

- All JavaScript files pass `node --check`.
- Rarity distribution test is close to 70/20/8/2.
- Hero choices can produce Hidden Ability or Tera Type choices.
- Legendary choices can produce compatible damaging TM moves.
- Tera Type changes active battle type while preserving base type.

## Stage 8 Features

- The whole game surface is locked to a 1280x720 coordinate layout and only scales up/down to preserve the same ratio.
- The move cooldown HUD is compact and background-free, showing only move names and cooldown gauges.
- Game Boy-style controls use a left d-pad, right Z/X buttons, and SELECT/START menu buttons.
- `Z` is the primary yes/interact/deploy button. `X` is no/back, Poke Ball in Trainer Mode, and quick switch in Pokemon Mode.
- Deploy and quick switch now happen instantly at the same position with a short Poke Ball flash effect.
- Switching resets every move cooldown as a penalty.
- Player Pokemon movement speed is calculated from the Pokemon Speed stat.
- Item-based evolutions are converted to level evolutions for the current no-item evolution phase.
- Catching wild Pokemon grants money, starting at 20 won.
- Poke Mart menu sells Poke Balls, Potions, and Exp Share. Exp Share costs 500 won and grants 70% EXP to non-participants.
- Field overhead labels show level, type markers, and name for all Pokemon. The active player Pokemon has a red inverted triangle marker.

## Stage 7.5 Sandbox Loop

- Added a data-driven hub map with three NPCs: hunting guide, healer, and shop.
- Added three selectable hunting areas:
  - `hunting_01`: Lv.1~10
  - `hunting_02`: Lv.11~20
  - `hunting_03`: Lv.21~30
- Each hunting area has four separate spawn zones with different spawn tables.
- Spawn zones support `NORMAL`, `SWARM`, and `ELITE` styles.
- Wild Pokemon now spawn with zone-specific level ranges and scaled stats.
- Hunting areas include a return NPC for going back to the hub.
- Party healing is available through the hub healer NPC.
- Mart uses shared `ItemData`.
- Bag menu was added and can use Potion on party Pokemon in Trainer Mode.
- Save data stores current map, current hunting area, money, and inventory.
- Added `MoveVisualAdapter` as the separation layer for original Anil move animations and generic type fallback effects.

## Starters and Party Battles

- All unupgraded moves use one attack lane, including Razor Leaf and Bubble. Upgrade +2 adds the existing delayed 60% echo in the same lane; +4 unlocks two side lanes.
- Professor Oak stands south of the hub start (800, 790). Approach and press Z for starter change or a confirmed new game.
- Starter choices are Bulbasaur, Charmander and Squirtle. Changing the original starter preserves its identity, level, EXP, growth bonuses and HP ratio, plus the rest of the collection and currency. Moves/upgrades, ability and typing reset to the new species. The six fire/water starter evolution forms have original Anil sprites and level evolutions.
- A confirmed new game removes this game's saved report and resets progress, then opens starter selection. Cancelling the confirmation changes nothing.
- Poke Mart sells permanent Double Battle (200 won) and Triple Battle (300 won) unlocks. Buying one enables it; duplicate purchases are blocked. Menu > Battle Mode selects OFF, Double or Triple, exclusively.
- Pokemon mode deploys up to 2/3 healthy party members in cyclic party order after the controlled Pokemon, staggered by 0.18 seconds. Companions follow, attack on their own move cooldowns, take damage, faint and earn participation EXP. Fainted members are skipped; reserves do not deploy.
- Z recalls the whole formation. X rotates the leader without pausing combat and resets the newly deployed Pokemon's cooldowns. Owned field Pokemon all have the red marker. Switching back to OFF leaves only the controlled Pokemon.
- Reports preserve purchased modes, enabled formation and starter identity. Legacy reports default to single mode and infer the starter from the first owned Pokemon.

Verification: `node --test tests/combat.test.cjs tests/survival.test.cjs`, plus
`node tests/party-browser.cjs`, `node tests/browser-check.cjs`, and `node tests/survival-browser.cjs`
with Playwright and Chrome available. Browser tests use isolated contexts and never modify the player's save.

## Native UI and Progression Update

- Pause menus now use Anil's original DP Pause Menu icons, translucent gray frame and orange selection border. Party and summary screens keep the original 512x384 layout, uniformly scaled inside the fixed 16:9 game surface with black side margins.
- The party screen has all six staggered slots, original occupied/empty/selected/fainted panels, HP graphics and cancel button. The summary shows the front sprite, type icons, four moves, native page icons and party-order controls. Cooldown replaces PP because combat is real-time. Info/Stats pages remain available.
- `growthData.js` copies all six original Anil level 1-100 experience tables. Old saves retain level and fractional EXP progress; new saves include per-Pokemon `growthVersion: 1`. Maximum level is 100.
- Normal hunting EXP is base yield x defeated level / 7, adjusted by encounter style, with a 1.5x early reward bonus through wild Lv.10. These rewards are real-time balance adjustments, not an exact recreation of Anil's turn-based EXP modifiers. A normal Lv.5 Rattata grants 54 EXP; a Lv.5 Parabolic starter needs 44 EXP for Lv.6.
- Per-zone respawns: NORMAL 9-15 seconds (was 4-8), SWARM 6-10 (was 2.5-5), ELITE 14-22 (was 6-10). Initial encounters wait 2.5-6 seconds. Full zones do not bank an instant replacement spawn. Survival waves now run every 4.0 to 2.2 seconds instead of 2.6 to 1.4; the four-sided opener and 15-minute goal remain.
- Restarting after defeat, including survival defeat, clears the current run/report and starts at Oak with no owned Pokemon. Choose and confirm a Lv.5 Bulbasaur, Charmander or Squirtle to receive a full-health partner. Play/save/closing the choice stays blocked until selection. Regular launch still preserves the existing default flow; this restart change does not silently delete existing browser saves on page load.
- Checks: `node --test tests/combat.test.cjs tests/survival.test.cjs tests/progression.test.cjs` and `node tests/anil-ui-browser.cjs` in addition to the existing browser suites.
