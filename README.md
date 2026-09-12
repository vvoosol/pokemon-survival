# Scientist RPG / Pokemon Auto Battle - Stage 8

Pokemon Anil V4.13 source data and assets are used as the local source-of-truth layer for this HTML Canvas auto-battle RPG.

## Run

```text
C:\Users\User\Documents\New project\html-monster-resonance-game
http://127.0.0.1:8787/
```

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

Save version: `3`

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
