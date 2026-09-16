window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.ItemData = {
  doubleBattle: { id: "doubleBattle", name: "더블 배틀", category: "key", price: 200, icon: "assets/items/pokeball.png", description: "포켓몬 2마리 동시 출전" },
  tripleBattle: { id: "tripleBattle", name: "트리플 배틀", category: "key", price: 300, icon: "assets/items/pokeball.png", description: "포켓몬 3마리 동시 출전" },
  pokeBall: {
    id: "pokeBall",
    name: "몬스터볼",
    category: "ball",
    price: 50,
    icon: "assets/items/pokeball.png",
    description: "야생 포켓몬을 포획할 때 사용합니다.",
    catchModifier: 1.0
  },
  potion: {
    id: "potion",
    name: "상처약",
    category: "medicine",
    price: 30,
    icon: "assets/items/potion.png",
    healAmount: 20,
    description: "포켓몬 1마리의 HP를 20 회복합니다."
  },
  expShare: {
    id: "expShare",
    name: "학습장치",
    category: "key",
    price: 500,
    icon: "assets/items/exp-share.png",
    description: "전투에 참여하지 않은 파티 포켓몬도 경험치 70%를 얻습니다."
  }
};
