# 최신 재개 체크포인트 - 2026-09-18

## 현재 목표

Stage 8 스토리모드를 Pokemon Anil V4.13 원본의 맵/이벤트/대사/NPC/트레이너 데이터를 이용해 3번째 체육관까지 완성한다. 기존 샌드박스는 Battle Mode로 그대로 보존하고, 전투는 현재의 실시간 자동전투 방식을 유지한다. 3관장까지 실제 진행과 저장/불러오기 검증이 끝난 뒤에만 관련 파일을 커밋하고 `origin/main`에 푸시한다.

## 이번 작업에서 이미 완료된 내용

- `js/story/` 기반 스토리 런타임과 원본 추출 구조는 이미 존재한다.
- 원본 Anil 데이터는 `build/anil-story-source/`에 추출되어 있다.
- `tools/build-story-battle-data.cjs`가 PBS의 포켓몬/기술/아이템/트레이너/인카운터/트레이너 타입을 파싱하고 `assets/story/battle-data.json`과 필요한 그래픽을 만든다.
- 스토리 인터프리터는 대사, 선택지, 조건분기, 루프, 라벨/점프, 스위치, 변수, 셀프스위치, 대기, 맵 이동, 공통 이벤트, Ruby 스크립트 위임을 이미 지원한다.
- `storyEventContains(event,x,y)`를 추가해 RPG Maker 이벤트명의 `size(w,h)`를 반영한다.
- 다중 타일 이벤트의 충돌/터치/실행 판정이 수정되었다.
- `setBattleRule()`가 무관한 규칙 처리 중 `canLoseBattle`을 잘못 초기화하지 않도록 수정되었고, 전투 종료 뒤에는 정상 초기화된다.
- 스토리 전투 중 NPC 대화 중첩을 막았다.
- 스토리 이벤트 실행 시 전투 상태와 트레이너/포켓몬 모드를 확인한다.
- 저장 불러오기 순서를 스토리/인터프리터 상태 복원 후 `transferStory()`가 실행되도록 수정했다.
- `mapRenderer.draw()`에 이동된 이벤트 위치와 삭제된 이벤트 상태를 전달한다.
- 이동된 NPC는 현재 위치/방향으로 렌더링되고 삭제 이벤트는 더 이상 렌더링되지 않는다.

## 마지막 검증 결과

`tests/story-opening-browser.cjs` PASS.

검증된 흐름: 원본식 오프닝 -> 집/태초마을 이동 -> 연구소 -> 스타터 선택 -> 스토리 저장 -> 새로고침/불러오기.

## 이미 확인한 사실 - 다시 조사하지 말 것

- 원본 루트: `C:/Users/User/Downloads/POKEMON ANIL V4.13/Pokemon Anil V4.13`
- 1관장: Map 42, `:lider1`, badge 0, TM39, Rock Smash 키 아이템.
- 2관장: Map 57, `:lider2`, badge 1, TM51.
- 3관장: Map 56, `:lider3`, badge 2, TM73, Light Ball.
- 관장 파티는 원본 스위치 666, 64 등에 따라 분기하므로 임의의 한 파티를 고정하면 안 된다.
- Common Event 13은 Nurse Joy/포켓몬센터 회복 흐름, Common Event 14는 PC다.
- 학습장치와 다중 출전 시스템은 샌드박스에 이미 구현되어 있으므로 중복 구현 금지.
- `js/game.js`에 `items.expShare`, `items.expShareEnabled`, `items.doubleBattle`, `items.tripleBattle`, reserve EXP 처리, 저장 복원, `partyBattle.sync(this)`가 이미 있다.
- `js/systems/partyBattleSystem.js`의 `partyBattle.members`가 동시 출전 포켓몬을 관리한다.
- `js/ui/uiManager.js`에 학습장치 메뉴/상점/상태 표시가 이미 있다.
- `js/story/storyState.js`에 `keyItems`, `gymRewards`, `expShareEnabled`, `activeCount`가 있고, 1관장 학습장치 해금 상태 검증도 이미 들어 있다.

사용자 지정 추가 보상은 원본 보상에 덧붙인다.
- 1관장: 학습장치 해금, ON/OFF, 비참여 포켓몬 경험치 70%.
- 2관장: 동시 출전 최대 2마리 해금.
- 3관장: 동시 출전 최대 3마리 해금.

## 다음 토큰에서 바로 시작할 정확한 작업

1. 저장소 전체를 다시 훑지 말고 `js/game.js`, `js/ui/uiManager.js`, `js/systems/partyBattleSystem.js`에서 `showGameMenu`, `expShare`, `expShareEnabled`, `partyBattle.sync`, `partyBattle.members`, `doubleBattle`, `tripleBattle`, 저장/불러오기 부분만 좁게 확인한다.
2. 1/2/3관장 승리 보상을 기존 샌드박스 시스템에 연결한다.
3. 3관장까지 실제 진행에 필요한 이벤트 명령만 추가한다. 우선순위: 이동 루트 209/509, 이벤트 삭제, 이벤트 위치/방향 변경, 전체 회복 314, 진행을 막는 화면/사운드 명령.
4. Ruby 어댑터도 필요한 호출만 추가한다: `pbReceiveItem`, `pbItemBall`, `pbGetKeyItem`, `pbAddPokemon`, `Pokemon.play_cry`, `FollowingPkmn.*`, `pbSetSelfSwitch`, 포켓몬센터 회복 관련 호출.
5. Map 42 -> Map 57 -> Map 56 관장 승리 E2E 테스트를 추가하고 원본 보상 + 사용자 지정 해금을 검증한다.
6. 배지, 셀프스위치, 이동 이벤트, 아이템, gymRewards, 학습장치 상태, activeCount 저장/불러오기를 검증한다.
7. 관련 테스트가 모두 통과하고 3관장까지 실제 진행이 끝난 뒤에만 관련 파일을 커밋하고 `origin/main`에 푸시한다.

## Git/작업 상태

현재 Stage 8 관련 수정/추가 파일에는 `index.html`, `style.css`, `js/game.js`, `js/main.js`, `js/systems/saveStore.js`, `js/ui/uiManager.js`, `js/story/`, `assets/story/`, `story-preview.html`, `tests/story-opening-browser.cjs`, `tests/story-runtime.test.cjs`, `tools/build-story-battle-data.cjs`, 스토리 스크린샷 등이 포함된다. 이 변경은 되돌리지 않는다.

Stage 8 최종 커밋/푸시는 아직 하지 않았다. 이유는 3관장까지의 요청 범위가 아직 미완성이기 때문이다.

## 앞으로의 토큰 종료 규칙

컨텍스트 한계가 가까워지면 이 파일 상단 체크포인트를 갱신한다. 반드시 완료 내용, 수정 파일, 테스트 결과, 미완료 항목, 다음 첫 작업, 재조사 금지 사실, 커밋/푸시 상태를 남긴 뒤 턴을 종료한다.

---

# 8단계 작업 상태

## 완료 범위

8단계 전체 완료 보고서가 아니다. 현재 실행 가능한 변경은 레벨업 규칙과 알림이며,
스토리 쪽은 원본 데이터의 재현 가능한 추출 도구까지 구현했다.
플레이할 수 없는 STORY MODE 버튼이나 원본을 축약한 대체 스토리는 추가하지 않았다.

- 각 포켓몬의 도달 레벨이 5의 배수일 때만 성장 보상 3택이 열린다.
- 일반 레벨의 능력치 성장, 기술 습득, 진화 판정은 그대로 동작한다.
- 모든 레벨업에 해당 포켓몬 이름과 이전/다음 레벨을 표시한다.
- 기술을 실제로 습득하거나 교체했을 때 별도의 습득 알림을 표시한다.
- 여러 포켓몬/여러 레벨의 알림은 순서대로 표시하며 메뉴가 덮으면 시간을 보존한다.
- 서바이벌 정예의 별도 보상은 레벨의 배수 여부와 무관하게 유지한다.
- 기존 저장 키와 샌드박스 시작 흐름은 변경하지 않았다.

## 원본 확인 결과

원본 루트: `C:/Users/User/Downloads/POKEMON ANIL V4.13/Pokemon Anil V4.13`

| 항목 | 원본 위치 / 확인 결과 |
|---|---|
| 시작점 | `Data/System.rxdata`: Map 1, (9, 7) |
| 맵 목록 | `Data/MapInfos.rxdata` |
| 맵/타일/이벤트/대사/조건 | `Data/MapNNN.rxdata`, `Data/Tilesets.rxdata` |
| 공통 이벤트 | `Data/CommonEvents.rxdata` |
| 트레이너 파티 | `PBS/trainers.txt`, `PBS/trainer_types.txt` |
| 지역 연결/야생 출현 | `PBS/map_connections.txt`, `PBS/encounters.txt` |
| 초기 설정 | `PBS/metadata.txt`: StartMoney=3000, StartItemStorage=POTION |
| 맵 이벤트 전체 | 219맵, 7,220이벤트, 9,710페이지, 7,183개 스크립트 블록 |

위 개수는 전체 원본 맵에 대한 것이며, 3관장까지 필요한 이벤트 수라는 의미가 아니다.

| 관장 | 맵 / 이벤트 / 최초 페이지 | 원본 전투 타입 | 배지 / 클리어 스위치 | 원본 TM |
|---|---|---|---|---|
| Brock | 42 / 16 / 0 | LIDER1 | badges[0] / 184 | TM39 |
| Misty | 57 / 11 / 0 | LIDER2 | badges[1] / 185 | TM51 |
| Teniente Surge | 56 / 7 / 0 | LIDER3 | badges[2] / 186 | TM73 |

관장마다 0/1/2 버전의 파티 분기가 존재한다. 원본 스위치 666과 64에 따른 분기를
무시하고 한 파티를 임의로 선택하면 안 된다. 배지/TM 이외의 아이템·보조 스위치·
조건부 보상도 원본 명령 목록에 보존했다. 예를 들어 첫 관장은 바위깨기 키 아이템도 준다.

## 추출 재실행

프로젝트 루트에서:

```powershell
node tools/import-story-source.cjs "C:\Users\User\Downloads\POKEMON ANIL V4.13\Pokemon Anil V4.13"
```

출력: `build/anil-story-source/`

- `maps/<id>.json`: 타일 테이블, 이벤트 페이지 조건, 그래픽, 대사와 명령 순서 원형.
- `system.json`, `map-info.json`, `tilesets.json`, `common-events.json`.
- `PBS/`: 관련 원문 파일의 바이트 그대로 복사.
- `audit.json`: 입력 SHA-256, 명령별 개수, 전송 명령, 관장 이벤트/분기/보상.

Ruby 코드는 실행하지 않는다. 지원하지 않는 Marshal 형식은 오류로 중단한다.
추출물은 개발용이며 Git 업로드 및 게임 런타임 로딩에서 제외한다.

## 아직 미구현인 8단계 요구사항

1. Anil 타일/오토타일/상단 레이어/통행 정보를 사용하는 스토리 맵 렌더러.
2. 원본 이벤트 페이지 우선순위, 조건, 분기, 대사, 이동, 공통 이벤트 실행기.
3. Ruby 호출별 명시적 어댑터. 알 수 없는 명령을 무시하고 진행시키면 안 된다.
4. 시작/스타터/라이벌/로켓단/길막/체육관 퍼즐 등 3관장까지의 필수 진행 그래프.
5. 원본 트레이너 파티, 아이템/기술/특성의 기존 실시간 엔진 연결.
6. STORY/BATTLE 선택 UI, 독립 저장 키/저널/가져오기/새 게임/기존 저장 이전.
7. 원본 보상을 처리한 뒤 1관장 학습장치, 2관장 2마리, 3관장 3마리 해금.
8. 처음부터 3관장까지 연속 플레이, 패배 복구, 중간 저장/불러오기 검증.

현재 보유한 학습장치·동료 전투 기능은 샌드박스 기능이다. 스토리 해금이 완료된 것으로
간주하면 안 된다. 스토리 진행을 테스트하거나 원본과 동일하다고 검증한 상태도 아니다.
9단계는 시작하지 않았다.

## 검증

- `node --test tests/*.test.cjs`: 71개 통과.
- `tests/level-milestones-browser.cjs`: 실제 브라우저에서 6레벨 무선택/10레벨 3택,
  기술 습득 알림, 1280x720 / 844x390 / 390x844 화면 안 배치 통과.
- 원본 219개 맵과 시스템/타일셋/공통 이벤트 파일 추출 성공.
- 브라우저 테스트 8개 파일 통과: 기존 메뉴/조작/전투/서바이벌/동료/보상/저장 회귀 포함.
- 스토리 연속 플레이 및 실제 30분 샌드박스 플레이 테스트는 실시하지 않았다.
