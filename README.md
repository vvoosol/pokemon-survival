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
- Hero cards teach an unknown, compatible damaging TM move through the four-slot learn/replace UI. Eligibility intersects original TM items with each species' TutorMoves, not its level-up list.
- Ability-change rewards are disabled. Existing abilities remain intact.
- Legendary cards offer permanent single-type Terastallization or one-step early evolution; terminal species can receive Mega Evolution. Matching Tera STAB is 1.8, normal STAB is 1.5, and previous types no longer grant STAB after Terastallization.
- Saves persist ability, base types, Tera state and an optional megaFormId without breaking older reports.
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

## World and Sandbox Polish

- Feedback 2 is deliberately excluded: existing UI font sizes, 1280x720 layout, controls and uniform letterboxing are unchanged. The world camera alone uses a fixed **1.5x zoom**, centered on the controlled actor except at map edges. Pointer capture targeting converts through the same camera transform.
- Town facilities, forest barriers and cave scenery use complete original Anil atlas objects, not isolated decoration tiles. Buildings, tree trunks and rocks block movement and projectiles. Movement slides along scenery; enemies/companions steer around obstacles. All NPC approaches and encounter zones have tested connected routes.
- Each grass spawn zone supports at most **4** live monsters (elite zones retain their smaller cap of 2). From **2** occupants, the timer advances at **1/2.5 speed**; it speeds up again below 2. Ordinary respawn intervals remain NORMAL 9-15, SWARM 6-10 and ELITE 14-22 seconds before this occupancy multiplier. Survival is a separate wave system, not a grass zone.
- Choice, result and message frames reuse original pause-menu graphics. Menu selection is retained per screen; replacing an upgraded move requires confirmation. Player/enemy attack effects have different emphasis. Damage numbers are combined over short bursts; solid rectangular hit overlays remain disabled.
- Enemy roles: close pursuit, directional charge (0.9-second locked preparation), ranged retreat during cooldown, and ground-target artillery (1-second preparation). Casts have visible direction/progress and recovery windows; moving out of the locked path avoids hits. Already-fired attacks still advance during party switching.
- New runs begin with 150 currency and 10 balls. Defeats grant `max(5, floor(level/2))`; capture grants `20 + 3 * max(0, level-5)`. The first capture of each species adds 100 research currency once, and the first five lifetime defeats add 50 once. Existing reports keep their money. Shop prices remain 50 ball / 30 potion / 200 double / 300 triple / 500 EXP Share.
- Trainer mode can lock a capture target by tapping it; SELECT/Tab/V cycles nearby targets. Repeated failure against that particular monster adds 6 percentage points per failure, capped at 95%. Oak provides 3 emergency balls only when no balls remain and money is below 50.
- Survival has milestone elites at 3, 6, 10 and 14 minutes, with quieter 20-second windows 35 seconds after the first three milestones. Elite rewards guarantee one hero candidate (final elite: legendary), with normal fallback when its candidate pool is exhausted. These are bonus choices, not extra levels. Unfinished elites respawn after loading; rewarded elites do not. The 15-minute win grants 150, with earnings, captures, damage per party member and rewards in the result. Zoom does not shorten the opening wave's approach distance.
- Anil BGM changes between town, field, cave, survival and danger/final wave. Settings independently control BGM/SFX and reduce hit flashes. At most eight SFX voices play together; repeat sounds are throttled. Sound starts after user interaction. Losing window focus pauses updates/audio and clears held controls.
- Stable checkpoints save every 60 active update seconds, on backgrounding, after capture, travel, purchase, healing, starter selection and completed growth choices. A partially resolved reward is not checkpointed. The previous valid report is retained in `scientistRpgSave.backup`, and a corrupt primary recovers from it. Report menus export/import JSON with validation; malformed imports leave current progress intact. Loading restores the current field position, relocating it only if new scenery blocks it.
- `scientistRpgResearch` preserves discovered/caught species and one-time research milestones across defeat or an Oak reset, but the party, run inventory, purchases and currency reset. Pending starter selection also survives reload. `scientistRpgSettings` stores audio/effect preferences separately. Browser storage is local to the current origin; exported JSON is a run report, not a full browser profile backup.
- Verification: `node --test tests/*.test.cjs` and all browser suites, including `tests/polish-browser.cjs`. Tests use isolated saves. Desktop/mobile viewport emulation is covered; physical phone performance and subjective audio mix still need device playtesting.

## Verification

- All JavaScript files pass `node --check`.
- Rarity distribution test is close to 70/20/8/2.
- Hero choices produce only compatible damaging TM moves.
- Legendary choices produce Tera, early evolution or Mega choices, never ability changes.
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

## Rewards and Generation Expansion

- Added exactly 30 Gen 2 and 30 Gen 3 representatives, bringing the playable roster to 96 species. Each added generation covers all 18 types using Anil's own (sometimes modified) typing. This is a curated selection, not a measured popularity ranking. See [POKEMON_ROSTER.md](POKEMON_ROSTER.md).
- All 60 use unmodified Anil follower/icon/front images, original base stats, catch rates, growth rates and abilities. Only supported damaging learnset entries are enabled; a basic Tackle is supplied when no implemented early attack exists. Missing later-generation evolutions are not falsely treated as fully evolved for Mega rewards.
- Original level evolutions are preserved; non-level requirements within the roster become Lv.28. Early evolution advances one available stage and preserves level, learned moves/upgrades and Tera typing.
- Added Lv.31-40 and Lv.41-50 hunting areas. All 60 species appear in level-appropriate weighted encounters and survival pools. Existing slower spawn timers and enemy caps stay unchanged.
- Added 42 original damaging TM moves with delayed real-time attacks and collision. Original power/type/category are retained; cooldown, range and motion are adapted. Secondary turn-based effects, recoil, weather and status changes are not claimed to be implemented.
- Source Mega forms use original front strips, types and stats. Their abilities remain unchanged. Final species without a native Mega retain their existing art and get a one-time 20% increase to non-HP base stats, explicitly described as an adapted Mega in the choice. Mega/Tera state survives saves and level growth.
- Common/rare/hero/legendary text is white/yellow/purple/red; legendary cards also have red borders. Reward copy is enlarged within the fixed aspect-ratio viewport. Base rarity weights remain 70/20/8/2 per card; exhausted reward pools fall back to lower rarities.
- Regenerate imports with `node tools/import-battle-rewards.cjs "C:\Users\User\Downloads\POKEMON ANIL V4.13\Pokemon Anil V4.13"`. Roster selection is in `tools/expansion-roster.cjs`.
- Regression tests: `node --test tests/rewards-expansion.test.cjs`, and `node tests/rewards-browser.cjs` with Playwright/Chrome. These check all 60 sprites, every new TM's delayed hit, source compatibility, reward routes, Tera defense/STAB, Mega save round trips and desktop/mobile menus.
