# Scientist RPG / Pokemon Auto Battle - Stage 6

Pokemon Anil V4.13 원본 자료를 Source of Truth로 삼고, HTML Canvas 자동전투 런타임에서 해석하는 구조입니다.

## 실행

```text
C:\Users\User\Documents\New project\html-monster-resonance-game
http://127.0.0.1:8787/
```

## 원본 데이터 위치

- Species / Base Stats / Learnset / Evolution: `Pokemon Anil V4.13/PBS/pokemon.txt`
- Move Type / Category / Power / Accuracy / Flags: `Pokemon Anil V4.13/PBS/moves.txt`
- Ability 이름 / 설명: `Pokemon Anil V4.13/PBS/abilities.txt`
- 18 Type 방어 상성: `Pokemon Anil V4.13/PBS/types.txt`
- Menu UI 참고: `Pokemon Anil V4.13/Graphics/Pictures/DP Pause Menu`
- Menu Icon: `Pokemon Anil V4.13/Graphics/Icons/menu*.png`
- Sprite / Icon: `Pokemon Anil V4.13/Graphics/Characters/Followers/*.png`

## Adapter 구조

`js/data/anilAdapter.js`가 원본 스냅샷과 런타임 API를 제공합니다.

```text
getSpeciesData(speciesId)
getMoveData(moveId)
getAbilityData(abilityId)
getEvolutionData(speciesId)
getLearnset(speciesId)
getTMLearnset(speciesId)
getHiddenAbilities(speciesId)
getPokedexEntry(speciesId)
getPokemonSprite(speciesId)
getPokemonIcon(speciesId)
typeMultiplier(moveType, defenderTypes)
validate()
```

`js/data/moveData.js`는 원본 Move 정보에 우리 게임용 Runtime Override를 합칩니다.

```text
baseCooldown
behavior
range
width
projectileSpeed
piercing
```

## 6단계 구현

- 18타입 방어 상성 적용
- 이중 타입 배율 곱 적용
- 0배 무효 적용
- STAB 1.5배 적용
- Physical / Special Damage 분리 유지
- Damage Modifier Pipeline 추가
- 전투 Floating Text: 굉장함 / 별로 / 효과 없음
- Ability Runtime Handler 추가
- 현재 지원: 심록, 맹화, 급류, 저수, 타오르는불꽃, 옹골참 일부, 의욕
- 미지원 Ability는 PENDING으로 안전 fallback
- Pokemon Instance에 `abilityId` 저장
- Hidden Ability / TM Learnset 조회 API 준비
- Data Validation 경고 구조 추가
- Trainer Mode 메뉴 추가: `Esc`, `Enter`, 모바일 `MENU`
- Main Menu: Pokédex / Pokémon / Report-Save / 닫기
- Pokémon Party Menu
- Pokémon Summary
- Party 순서 변경
- Pokédex Seen / Caught / Count
- Report / Save / Load
- Save Data Version: `1`

## 저장 구조

브라우저 `localStorage` 키:

```text
scientistRpgSave
```

저장 항목:

```text
version
savedAt
trainer position
balls
pokedex
ownedPokemon
partyIds
reserveIds
selectedId
```

## 조작

- 이동: `WASD` 또는 방향키
- 출전/회수: `Z`
- 파티 변경/빠른 교체: `X`
- 몬스터볼: Trainer Mode에서 `C`
- 메뉴: Trainer Mode에서 `Esc` 또는 `Enter`
- 모바일 메뉴: `MENU`
- 전체화면: 오른쪽 위 버튼
- 디버그: `F2`
- 디버그 EXP: `F2` 후 `F3`

## 검증

- 전체 JavaScript `node --check` 통과
- 로컬 서버 `200 OK`
- 브라우저 Stage 6 로딩 확인
- Main Menu / Pokémon Menu / Summary / Report Save 화면 확인
- Save 버튼 동작 확인
- Type 테스트:
  - Electric vs Water = x2
  - Electric vs Ground = x0
  - Grass vs Water/Ground = x4
  - Normal vs Ghost = x0
- STAB 테스트:
  - Pikachu Electric Move = x1.5
  - Pikachu Normal Move = x1
- Ability 테스트:
  - Overgrow normal HP = x1
  - Overgrow low HP Grass Move = x1.5

## 알려진 제한

- 전체 Anil PBS를 브라우저에서 즉시 파싱하지는 않고, 현재 지원 범위는 원본 PBS에서 추출한 스냅샷 + Adapter API로 연결했습니다.
- 모든 Ability 효과를 구현하지 않았습니다. 현재 실시간 전투에 자연스럽게 맞는 일부만 SUPPORTED/ADAPTED입니다.
- 30분 장시간 플레이 테스트는 수행하지 못했습니다.
