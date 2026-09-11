# Scientist RPG / Pokemon Auto Battle - Stage 3

Pokemon Anil 내부 이미지와 사운드만 사용해서 만든 HTML, CSS, Vanilla JavaScript, Canvas 기반 자동전투 생존 RPG입니다.

## 실행

`index.html`을 브라우저에서 열거나 `node local-server.js`로 로컬 서버를 실행합니다. 현재 테스트 주소는 `http://127.0.0.1:8787/`입니다.

## 핵심 루프

1. Trainer Mode에서 트레이너로 필드를 탐색합니다.
2. 야생 포켓몬은 트레이너를 공격하지 않습니다.
3. `Z`로 이상해씨를 출전시켜 Pokemon Mode로 전환합니다.
4. Pokemon Mode에서 기존 자동전투, EXP, 레벨업, 성장 선택지가 작동합니다.
5. 야생 포켓몬을 쓰러뜨리기 전에 `Z`로 이상해씨를 회수합니다.
6. 약화된 야생 포켓몬은 현재 위치와 HP를 유지한 채 멈춥니다.
7. Trainer Mode에서 `C` 또는 `BALL` 버튼으로 몬스터볼을 던져 포획합니다.

## 현재 구현

- 1280 x 720 기준 가로형 Canvas 화면
- 2500 x 1600 타일 필드
- Pokemon Anil 내부 리소스만 사용
- 트레이너 직접 이동
- 이상해씨 출전/회수
- Trainer/Pokemon/Transition/Level Up/Game Over 모드 분리
- WASD/방향키 8방향 이동
- 모바일 가상 조이스틱
- 모바일 `Z / 출전·회수`, `BALL` 버튼
- 꼬렛/구구 야생 포켓몬 스폰
- Trainer Mode의 야생 포켓몬은 배회하거나 포획 대기
- Pokemon Mode의 야생 포켓몬은 이상해씨를 추적/공격
- 이상해씨 자동 몸통박치기
- HP, EXP, 레벨업
- 3장 성장 선택지
- common/rare 성장 구조
- 몸통박치기 I-IV 강화
- 몬스터볼 10개 지급
- 포획 대상 자동 선택
- 포획 성공/실패 연출
- 성공 시 `ownedPokemon`에 개체 저장
- 동일 species 여러 마리 포획 가능
- 오른쪽 위 전체화면 버튼
- Game Over 및 다시 시작

## 포획 공식

`CaptureSystem.calculateCaptureChance(wildPokemon, ball)`에서 계산합니다.

반영 요소:

- 현재 HP 비율
- 포켓몬 고유 `catchRate`
- Ball `catchModifier`

현재 공식:

```text
speciesFactor = catchRate / 255
hpFactor = 0.22 + (1 - hpRatio) * 0.68
chance = clamp(speciesFactor * ballModifier * hpFactor, 0.03, 0.95)
```

HP가 낮을수록 성공률이 높아지지만, 낮은 HP가 무조건 성공을 보장하지는 않습니다.

## 소유 포켓몬 데이터

포획 성공 시 `ownedPokemon`에 다음 형태로 저장합니다.

```text
uniqueId
species
name
level
currentHp
maxHp
stats
types
exp
moves
moveUpgradeLevels
growthBonuses
ability
```

3단계에서는 포획한 포켓몬을 조작하거나 교체하지 않습니다. 4단계에서 파티/교체 시스템을 연결하기 위한 기반만 둡니다.

## 조작

- 이동: `WASD` 또는 방향키
- 출전/회수: `Z`
- 몬스터볼: Trainer Mode에서 `C`
- 모바일 이동: 왼쪽 아래 가상 조이스틱
- 모바일 출전/회수: 오른쪽 `Z` 버튼
- 모바일 몬스터볼: 오른쪽 `BALL` 버튼
- 전체화면: 오른쪽 위 `전체화면` 버튼
- 디버그 패널: `F2`
- 디버그 EXP 테스트: `F2` 후 `F3`
- 다음 레벨업 rare 강제: `F2` 후 `F4`
- 가까운 포획 대상 HP 20% 설정: `F2` 후 `F5`

## 구조

```text
index.html
style.css
local-server.js
js/
  main.js
  game.js
  input.js
  camera.js
  assets.js
  data/
    pokemonData.js
    moveData.js
    ballData.js
    upgradeData.js
    mapData.js
  entities/
    entity.js
    trainer.js
    playerPokemon.js
    wildPokemon.js
  systems/
    combatSystem.js
    captureSystem.js
    spawnSystem.js
    movementSystem.js
    statSystem.js
    upgradeSystem.js
  ui/
    uiManager.js
```

## 4단계 확장 지점

- `ownedPokemon`: 포획한 포켓몬 개체 목록
- `activePokemon`: 현재 필드에서 싸우는 포켓몬
- `selectedPokemon`: 트레이너가 다음에 출전시킬 포켓몬
- `equippedMoves`: 포켓몬별 최대 4개 기술 확장
- `moveUpgradeLevels`: 기술별 성장 상태 확장
- `BallData`: Great Ball, Ultra Ball 등 추가 가능
- `CaptureSystem`: 상태이상, 볼 종류, 종족별 난이도 보정 추가 가능
