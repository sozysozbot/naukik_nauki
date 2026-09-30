const { useState, useEffect, useMemo, createElement: h } = React;

// ==========================================================================
// ナウキ運び - README.md 準拠 実装
// ==========================================================================

const GOODS = {
  tea: { name: '茶', icon: '🍵', chip: 'chip-tea', card: 'card-tea' },
  rice: { name: '米', icon: '🌾', chip: 'chip-rice', card: 'card-rice' },
  cloth: { name: '布', icon: '🧵', chip: 'chip-cloth', card: 'card-cloth' },
};

// 1・5等級は塩2個、2–4等級は塩1個
const CARD_TEMPLATES = {
  tea: [
    { num: 1, salt: 2 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 2 },
  ],
  rice: [
    { num: 1, salt: 2 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 2 },
  ],
  cloth: [
    { num: 1, salt: 2 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 2 },
  ]
};

// ルートボード6枚（直線配置：往路0–5、復路6–10 / 10=0地元）
// 0:地元, 1:街道, 2:会所, 3:問屋, 4:街道, 5:港, 6:街道, 7:問屋, 8:会所, 9:街道
const TILES = [
  { pos: 0, boardId: 0, name: '地元', icon: '🏡', isFacility: true, short: '換金', costText: '着地時：塩を手元へ' },
  { pos: 1, boardId: 1, name: '街道', icon: '🛣️', isFacility: false, short: '街道', costText: '' },
  { pos: 2, boardId: 2, name: '会所', icon: '🏛️', isFacility: true, short: '大箱化', costText: '2塩：木箱を大箱へ' },
  { pos: 3, boardId: 3, name: '問屋', icon: '🏬', isFacility: true, short: '仕入れ', costText: '仕入れ（+1枚、塩1で追加）' },
  { pos: 4, boardId: 4, name: '街道', icon: '🛣️', isFacility: false, short: '街道', costText: '' },
  { pos: 5, boardId: 5, name: '港',   icon: '⚓', isFacility: true, short: '出荷', costText: '塩獲得・流行判定' },
  { pos: 6, boardId: 4, name: '街道', icon: '🛣️', isFacility: false, short: '街道', costText: '' },
  { pos: 7, boardId: 3, name: '問屋', icon: '🏬', isFacility: true, short: '仕入れ', costText: '仕入れ（+1枚、塩1で追加）' },
  { pos: 8, boardId: 2, name: '会所', icon: '🏛️', isFacility: true, short: '大箱化', costText: '2塩：木箱を大箱へ' },
  { pos: 9, boardId: 1, name: '街道', icon: '🛣️', isFacility: false, short: '街道', costText: '' },
];

// 市場スペース（全6エリア）
// 0:地元(0), 1:街道A(1,9), 2:会所(2,8), 3:問屋(3,7), 4:街道B(4,6), 5:港(5)
const MARKET_NAMES = [
  '地元市場',
  '街道市場A',
  '会所市場',
  '問屋市場',
  '街道市場B',
  '港市場'
];

function getMarketIndex(pos) {
  if (pos === 0) return 0;
  if (pos === 1 || pos === 9) return 1;
  if (pos === 2 || pos === 8) return 2;
  if (pos === 3 || pos === 7) return 3;
  if (pos === 4 || pos === 6) return 4;
  if (pos === 5) return 5;
  return 0;
}

const PLAYERS_DEF = [
  { name: 'あなた', color: '#c53030', isHuman: true },
  { name: 'BOT1', color: '#2b6cb0', isHuman: false },
  { name: 'BOT2', color: '#2f855a', isHuman: false },
  { name: 'BOT3', color: '#6b46c1', isHuman: false }
];

const WIN_SCORE = 20;          // 手元の塩20点以上で最終手番へ
const BIG_BOX_COST = 2;        // 大箱化コスト: 木箱の塩2個
const BIG_BOX_BONUS = 3;       // 大箱ボーナス: +3塩
const SET_BONUS = 2;           // セット（同数字3枚）ボーナス: +2塩
const TREND_BONUS = 2;         // 流行一致ボーナス: +2塩
const CARD_COPIES = 4;         // 3色×5数字×各4枚 = 60枚

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const deck = [];
  let id = 1;
  ['tea', 'rice', 'cloth'].forEach(t => {
    CARD_TEMPLATES[t].forEach(tpl => {
      for (let i = 0; i < CARD_COPIES; i++) {
        deck.push({ id: id++, type: t, num: tpl.num, salt: tpl.salt });
      }
    });
  });
  return shuffle(deck);
}

// 山札ドロー（尽きたら捨て札シャッフル、それもなければ全市場シャッフル）
function drawSafe(count, currentDeck, currentDiscard, road = null) {
  let d = [...currentDeck];
  let disc = [...currentDiscard];
  let newRoad = road ? road.map(arr => [...arr]) : null;
  const drawn = [];

  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (disc.length > 0) {
        d = shuffle(disc);
        disc = [];
      } else if (newRoad) {
        const recycled = [];
        newRoad.forEach((arr, pos) => {
          if (arr.length > 0) {
            recycled.push(...arr);
            newRoad[pos] = [];
          }
        });
        if (recycled.length > 0) {
          d = shuffle(recycled);
        } else {
          break;
        }
      } else {
        break;
      }
    }
    if (d.length > 0) drawn.push(d.shift());
  }
  return { drawn, newDeck: d, newDiscard: disc, newRoad: newRoad || road };
}

// 役の判定:
// 連番：同じ品目で連続する3数字（例: 布2-3-4）
// セット：同じ品目で同じ3数字（例: 茶3-3-3）
function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const types = cards.map(c => c.type);
  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  if (types[0] === types[1] && types[1] === types[2]) {
    const t = types[0];
    const g = GOODS[t];
    // セット (同数字3枚)
    if (nums[0] === nums[1] && nums[1] === nums[2]) {
      return {
        name: `${g.icon}${g.name} ${nums[0]}×3 (セット)`,
        shortName: `${g.icon}${nums[0]}×3`,
        salt: baseSalt,
        isTriplet: true,
        cards,
        type: t,
        nums
      };
    }
    // 連番 (連続する3数字)
    if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
      return {
        name: `${g.icon}${g.name} ${nums[0]}-${nums[2]} (連番)`,
        shortName: `${g.icon}${nums[0]}-${nums[2]}`,
        salt: baseSalt,
        isTriplet: false,
        cards,
        type: t,
        nums
      };
    }
  }

  return null;
}

function findSets(hand) {
  const list = [];
  if (!hand || hand.length < 3) return list;
  const n = hand.length;
  const seenPatterns = new Set();

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio);
        if (r) {
          const patternKey = `${r.name}:s${r.salt}`;
          if (!seenPatterns.has(patternKey)) {
            seenPatterns.add(patternKey);
            const key = trio.map(c => c.id).sort().join('-');
            list.push({ trio, info: r, key });
          }
        }
      }
    }
  }
  return list;
}

// プレイヤーの木箱の上にある塩の合計（支払いに使用可能）
function getPlayerBoxSalt(player) {
  if (!player || !player.boxes) return 0;
  return player.boxes.reduce((sum, b) => sum + (b.salt || 0), 0);
}

// 木箱の上の塩から支払う（手元の塩は使用不可）
function deductBoxSalt(player, cost) {
  const total = getPlayerBoxSalt(player);
  if (total < cost) return { newBoxes: player.boxes, success: false };

  let remaining = cost;
  const newBoxes = player.boxes.map(b => {
    if (remaining > 0 && b.salt > 0) {
      if (b.salt >= remaining) {
        const updated = b.salt - remaining;
        remaining = 0;
        return { ...b, salt: updated };
      } else {
        remaining -= b.salt;
        return { ...b, salt: 0 };
      }
    }
    return b;
  });

  return { newBoxes, success: true };
}

// 役作成への寄与度に基づく手札優先度（AIおよび手札整理用）
function getCardPriorities(hand) {
  if (!hand || hand.length === 0) return [];
  const currentSets = findSets(hand);
  const currentBestValue = currentSets.length > 0 ? Math.max(...currentSets.map(s => s.info.salt + (s.info.isTriplet ? SET_BONUS : 0))) : 0;

  return hand.map((card, idx) => {
    const remainingHand = hand.filter((_, i) => i !== idx);
    const newSets = findSets(remainingHand);
    const newBestValue = newSets.length > 0 ? Math.max(...newSets.map(s => s.info.salt + (s.info.isTriplet ? SET_BONUS : 0))) : 0;
    const loss = currentBestValue - newBestValue;
    return { card, idx, loss };
  }).sort((a, b) => a.loss - b.loss);
}

function initGame() {
  const d = createDeck();
  const players = PLAYERS_DEF.map((def, i) => ({
    id: i,
    name: def.name,
    color: def.color,
    pos: 0,
    hand: d.splice(0, 5), // 初期手札5枚
    boxes: [
      { isBig: false, cargo: null, salt: 2 }, // 片方に初期塩2個
      { isBig: false, cargo: null, salt: 0 }  // もう片方は空
    ],
    score: 0 // 手元の塩（換金後の塩・得点）
  }));

  // 各マスの市場スペースに山札からカードを1枚ずつ表向きで置く（全6市場）
  const road = Array(6).fill(null).map(() => [d.shift()]);

  return {
    deck: d,
    discard: [],
    road,
    players,
    turn: 0,
    // ステップ定義:
    // 1: ステップ1 - 移動 (手札から1枚選んで移動元市場へ置き、数字分進む)
    // 2: ステップ1 - 補充 (着地マス市場から1枚選ぶ、なければ山札)
    // 3: ステップ1 - 地元手札整理 (地元通過/着地時、手札6枚以上なら5枚になるまで捨てる)
    // 4: ステップ2 - アクション (荷積み / 施設利用 / 手番終了)
    // 5: 荷積み補充 (市場・山札から3枚選んで補充)
    // 6: 問屋仕入れ補充 (市場・山札から指定枚数補充)
    step: 1,
    facilityUsed: false,         // この手番で施設を利用したか（1回まで）
    passedHomeInMove: false,     // 移動で地元を通過または着地したか
    refillRemaining: 0,          // 補充残り枚数
    trendNotice: null,           // 港町の流行通知
    trendCheckedInTurn: false,   // 手番内で流行判定を行ったか
    gameOver: false,
    finalRoundTriggered: false,
    finalRoundStartPlayer: 0,
    finalScores: null
  };
}

function App() {
  const [state, setState] = useState(initGame);
  const [selectedHandIds, setSelectedHandIds] = useState([]);
  const [discardSelectedIds, setDiscardSelectedIds] = useState([]);

  const p = state.players[state.turn];
  const isHuman = (state.turn === 0);
  const me = state.players[0];

  const myBoxSalt = useMemo(() => getPlayerBoxSalt(me), [me]);
  const mySets = useMemo(() => findSets(me.hand), [me.hand]);

  const emptyBoxesCount = useMemo(() => me.boxes.filter(b => !b.cargo && b.salt === 0).length, [me.boxes]);
  const loadedBoxesCount = useMemo(() => me.boxes.filter(b => b.cargo).length, [me.boxes]);
  const smallBoxesCount = useMemo(() => me.boxes.filter(b => !b.isBig).length, [me.boxes]);

  const selectedCards = useMemo(() => {
    return me.hand.filter(c => selectedHandIds.includes(c.id));
  }, [me.hand, selectedHandIds]);

  const selectedSetInfo = useMemo(() => {
    if (selectedCards.length !== 3) return null;
    return evalSet(selectedCards);
  }, [selectedCards]);

  // ==========================================================================
  // ステップ1: 移動
  // ==========================================================================
  const handleMove = (cardIdx) => {
    if (!isHuman || state.step !== 1) return;
    const card = me.hand[cardIdx];
    const oldPos = p.pos;
    const stepVal = card.num;
    const nextPos = (oldPos + stepVal) % 10;
    // 地元（0）に着地または通過したかの判定
    const passedHome = (oldPos + stepVal >= 10);

    const handAfterMove = me.hand.filter((_, idx) => idx !== cardIdx);

    // 移動元の市場へカードを表向きで置く
    const currMarket = getMarketIndex(oldPos);
    const newRoad = state.road.map((arr, i) => i === currMarket ? [...arr, card] : arr);

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      pos: nextPos,
      hand: handAfterMove
    } : pl);

    setSelectedHandIds([]);

    // 移動後は着地マス市場からの補充（ステップ2）へ
    // もし着地マスの市場にカードが1枚もなければ、自動的に山札から1枚引く
    const destMarket = getMarketIndex(nextPos);
    const marketCards = newRoad[destMarket] || [];

    if (marketCards.length === 0) {
      // 山札から自動で1枚補充
      const res = drawSafe(1, state.deck, state.discard, newRoad);
      const playerWithDraw = newPlayers.map((pl, i) => i === 0 ? {
        ...pl,
        hand: [...pl.hand, ...res.drawn]
      } : pl);

      // 手札整理判定: 地元を着地または通過した際、手札が6枚以上あれば5枚になるまで捨てる
      const finalHand = playerWithDraw[0].hand;
      if (passedHome && finalHand.length > 5) {
        setState(prev => ({
          ...prev,
          deck: res.newDeck,
          discard: res.newDiscard,
          road: res.newRoad || newRoad,
          players: playerWithDraw,
          passedHomeInMove: passedHome,
          step: 3
        }));
      } else {
        setState(prev => ({
          ...prev,
          deck: res.newDeck,
          discard: res.newDiscard,
          road: res.newRoad || newRoad,
          players: playerWithDraw,
          passedHomeInMove: false,
          facilityUsed: false,
          step: 4
        }));
      }
    } else {
      // 市場から1枚選ぶ
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        passedHomeInMove: passedHome,
        refillRemaining: 1,
        step: 2
      }));
    }
  };

  // ==========================================================================
  // ステップ1: 補充（着地マスの市場から選ぶ、または山札から引く）
  // ==========================================================================
  const handlePickMarketCardForStep1 = (cardId) => {
    if (!isHuman || state.step !== 2) return;
    const destMarket = getMarketIndex(p.pos);
    const marketCards = state.road[destMarket] || [];
    const picked = marketCards.find(c => c.id === cardId);
    if (!picked) return;

    const newRoad = state.road.map((arr, i) => i === destMarket ? arr.filter(c => c.id !== cardId) : arr);
    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: [...pl.hand, picked]
    } : pl);

    const finalHand = newPlayers[0].hand;
    if (state.passedHomeInMove && finalHand.length > 5) {
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        step: 3
      }));
    } else {
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        passedHomeInMove: false,
        facilityUsed: false,
        step: 4
      }));
    }
  };

  const handleDrawDeckForStep1 = () => {
    if (!isHuman || state.step !== 2) return;
    const res = drawSafe(1, state.deck, state.discard, state.road);
    if (res.drawn.length === 0) return;

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: [...pl.hand, ...res.drawn]
    } : pl);

    const finalHand = newPlayers[0].hand;
    if (state.passedHomeInMove && finalHand.length > 5) {
      setState(prev => ({
        ...prev,
        deck: res.newDeck,
        discard: res.newDiscard,
        road: res.newRoad || prev.road,
        players: newPlayers,
        step: 3
      }));
    } else {
      setState(prev => ({
        ...prev,
        deck: res.newDeck,
        discard: res.newDiscard,
        road: res.newRoad || prev.road,
        players: newPlayers,
        passedHomeInMove: false,
        facilityUsed: false,
        step: 4
      }));
    }
  };

  // ==========================================================================
  // ステップ1: 地元の手札整理（5枚になるまで捨てる）
  // ==========================================================================
  const handleConfirmDiscard = () => {
    if (!isHuman || state.step !== 3) return;
    const excess = me.hand.length - 5;
    if (discardSelectedIds.length !== excess) return;

    const discarded = me.hand.filter(c => discardSelectedIds.includes(c.id));
    const remainingHand = me.hand.filter(c => !discardSelectedIds.includes(c.id));

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: remainingHand
    } : pl);

    setDiscardSelectedIds([]);
    setState(prev => ({
      ...prev,
      discard: [...prev.discard, ...discarded],
      players: newPlayers,
      passedHomeInMove: false,
      facilityUsed: false,
      step: 4
    }));
  };

  // ==========================================================================
  // ステップ2: 荷積み（空箱がある限り何度でも）
  // ==========================================================================
  const handlePackSelectedCargo = () => {
    if (!isHuman || state.step !== 4 || !selectedSetInfo) return;
    const emptyIdx = me.boxes.findIndex(b => !b.cargo && b.salt === 0);
    if (emptyIdx === -1) return;

    const ids = selectedCards.map(c => c.id);
    const remainingHand = me.hand.filter(c => !ids.includes(c.id));

    const newBoxes = me.boxes.map((b, idx) => idx === emptyIdx ? { ...b, cargo: selectedSetInfo } : b);
    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: remainingHand,
      boxes: newBoxes
    } : pl);

    setSelectedHandIds([]);

    // 荷積み後、着地マスの市場（不足時は山札）から手札を3枚補充する
    setState(prev => ({
      ...prev,
      players: newPlayers,
      refillRemaining: 3,
      step: 5
    }));
  };

  // 荷積み補充 or 問屋仕入れ補充のカードピック
  const handlePickMarketCardForRefill = (cardId, isWholesale = false) => {
    if (!isHuman || (state.step !== 5 && state.step !== 6)) return;
    const marketIdx = getMarketIndex(p.pos);
    const marketCards = state.road[marketIdx] || [];
    const picked = marketCards.find(c => c.id === cardId);
    if (!picked) return;

    const newRoad = state.road.map((arr, i) => i === marketIdx ? arr.filter(c => c.id !== cardId) : arr);
    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: [...pl.hand, picked]
    } : pl);

    const nextRemaining = state.refillRemaining - 1;
    if (nextRemaining <= 0) {
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        refillRemaining: 0,
        step: 4
      }));
    } else {
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        refillRemaining: nextRemaining
      }));
    }
  };

  const handleDrawDeckForRefill = (isWholesale = false) => {
    if (!isHuman || (state.step !== 5 && state.step !== 6)) return;
    const res = drawSafe(1, state.deck, state.discard, state.road);
    if (res.drawn.length === 0) {
      setState(prev => ({ ...prev, refillRemaining: 0, step: 4 }));
      return;
    }

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: [...pl.hand, ...res.drawn]
    } : pl);

    const nextRemaining = state.refillRemaining - 1;
    if (nextRemaining <= 0) {
      setState(prev => ({
        ...prev,
        deck: res.newDeck,
        discard: res.newDiscard,
        road: res.newRoad || prev.road,
        players: newPlayers,
        refillRemaining: 0,
        step: 4
      }));
    } else {
      setState(prev => ({
        ...prev,
        deck: res.newDeck,
        discard: res.newDiscard,
        road: res.newRoad || prev.road,
        players: newPlayers,
        refillRemaining: nextRemaining
      }));
    }
  };

  // ==========================================================================
  // ステップ2: 施設利用（1回まで）
  // ==========================================================================

  // 地元 (0): 換金（木箱の塩を手元に移す）
  const handleDeliverBox = (boxIdx) => {
    if (!isHuman || state.step !== 4 || p.pos !== 0) return;
    const box = me.boxes[boxIdx];
    if (!box || box.salt <= 0) return;

    const gain = box.salt;
    const newBoxes = me.boxes.map((b, idx) => idx === boxIdx ? { ...b, salt: 0 } : b);
    const newScore = me.score + gain;

    const isTargetReached = newScore >= WIN_SCORE;
    setState(prev => ({
      ...prev,
      finalRoundTriggered: prev.finalRoundTriggered || isTargetReached,
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, score: newScore, boxes: newBoxes } : pl)
    }));
  };

  const handleDeliverAll = () => {
    if (!isHuman || state.step !== 4 || p.pos !== 0 || myBoxSalt <= 0) return;
    const gain = myBoxSalt;
    const newBoxes = me.boxes.map(b => ({ ...b, salt: 0 }));
    const newScore = me.score + gain;

    const isTargetReached = newScore >= WIN_SCORE;
    setState(prev => ({
      ...prev,
      finalRoundTriggered: prev.finalRoundTriggered || isTargetReached,
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, score: newScore, boxes: newBoxes } : pl)
    }));
  };

  // 会所 (2, 8): 木箱の塩2個を支払い、木箱1枚を裏返して「大箱」にする
  const handleUpgradeBigBox = () => {
    if (!isHuman || state.step !== 4 || (p.pos !== 2 && p.pos !== 8) || state.facilityUsed) return;
    if (myBoxSalt < BIG_BOX_COST || smallBoxesCount === 0) return;

    const { newBoxes, success } = deductBoxSalt(me, BIG_BOX_COST);
    if (!success) return;

    // まだ大箱でない木箱を1つ大箱にする
    let upgraded = false;
    const updatedBoxes = newBoxes.map(b => {
      if (!upgraded && !b.isBig) {
        upgraded = true;
        return { ...b, isBig: true };
      }
      return b;
    });

    setState(prev => ({
      ...prev,
      facilityUsed: true,
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: updatedBoxes } : pl)
    }));
  };

  // 問屋 (3, 7): 仕入れ
  // 基本で+1枚。さらに木箱の塩1個を支払うごとに追加で1枚獲得。着地マス市場（不足時山札）から引く。
  const handleWholesale = (extraSaltCost = 0) => {
    if (!isHuman || state.step !== 4 || (p.pos !== 3 && p.pos !== 7) || state.facilityUsed) return;
    if (extraSaltCost > 0) {
      if (myBoxSalt < extraSaltCost) return;
    }

    let updatedBoxes = me.boxes;
    if (extraSaltCost > 0) {
      const res = deductBoxSalt(me, extraSaltCost);
      if (!res.success) return;
      updatedBoxes = res.newBoxes;
    }

    const totalCardsToGet = 1 + extraSaltCost;

    setState(prev => ({
      ...prev,
      facilityUsed: true,
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: updatedBoxes } : pl),
      refillRemaining: totalCardsToGet,
      step: 6
    }));
  };

  // 港 (5): 出荷
  // 木箱のカードを捨て札にし、その木箱に塩を獲得する（2箱同時可）。
  // 基本点: カードの塩アイコン合計
  // 役ボーナス: セット（同数字3枚）なら +2塩
  // 大箱ボーナス: 大箱なら +3塩
  // 流行判定: 山札を1枚めくる（手番に1回）。出荷品と同数字が含まれれば +2塩。めくったカードは捨てる。
  const handleSellPort = (sellAll = true, targetBoxIdx = -1) => {
    if (!isHuman || state.step !== 4 || p.pos !== 5) return;

    const boxesToSell = me.boxes.map((b, idx) => {
      if (b.cargo && (sellAll || idx === targetBoxIdx)) {
        return { ...b, shouldSell: true };
      }
      return { ...b, shouldSell: false };
    });

    const activeSellBoxes = boxesToSell.filter(b => b.shouldSell);
    if (activeSellBoxes.length === 0) return;

    // 出荷品の全数字
    const shippedNums = [];
    activeSellBoxes.forEach(b => {
      if (b.cargo && b.cargo.nums) shippedNums.push(...b.cargo.nums);
    });

    // 捨て札に送るカード
    const discardedCards = [];
    activeSellBoxes.forEach(b => {
      if (b.cargo && b.cargo.cards) discardedCards.push(...b.cargo.cards);
    });

    // 流行判定（手番に1回）
    let curDeck = [...state.deck];
    let curDisc = [...state.discard, ...discardedCards];
    let trendCard = null;
    let trendHit = false;
    let trendNotice = null;

    if (!state.trendCheckedInTurn) {
      if (curDeck.length === 0 && curDisc.length > 0) {
        curDeck = shuffle(curDisc);
        curDisc = [];
      }
      if (curDeck.length > 0) {
        trendCard = curDeck.shift();
        curDisc.push(trendCard); // めくったカードは捨てる
        trendHit = shippedNums.includes(trendCard.num);
        trendNotice = {
          playerName: me.name,
          card: trendCard,
          hit: trendHit,
          bonus: trendHit ? TREND_BONUS : 0
        };
      }
    }

    // 塩の計算（各箱に乗せる）
    // 流行ボーナスは最初の出荷箱に乗せる
    let trendAwarded = false;
    const finalBoxes = me.boxes.map((b, idx) => {
      if (boxesToSell[idx].shouldSell) {
        const c = b.cargo;
        let gain = c.salt;
        if (c.isTriplet) gain += SET_BONUS;
        if (b.isBig) gain += BIG_BOX_BONUS;
        if (trendHit && !trendAwarded) {
          gain += TREND_BONUS;
          trendAwarded = true;
        }
        return {
          ...b,
          cargo: null,
          salt: (b.salt || 0) + gain
        };
      }
      return b;
    });

    setState(prev => ({
      ...prev,
      deck: curDeck,
      discard: curDisc,
      trendNotice: trendNotice || prev.trendNotice,
      trendCheckedInTurn: true,
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: finalBoxes } : pl)
    }));
  };

  // 手番終了
  const handleEndTurn = () => {
    if (!isHuman || state.step !== 4) return;
    advanceTurn();
  };

  const advanceTurn = () => {
    const nextTurn = (state.turn + 1) % 4;

    // ゲーム終了判定
    // 誰かの手元の塩が20個以上に達した場合、スタートプレイヤーの右隣（プレイヤー3）まで手番を行い終了
    const isRoundEnd = (nextTurn === 0);
    if (state.finalRoundTriggered && isRoundEnd) {
      // 最終精算：木箱に残った塩は、全木箱の合計2個につき手元の塩1個に換算する（切り捨て）
      const finalScores = state.players.map(pl => {
        const remainingBoxSalt = getPlayerBoxSalt(pl);
        const bonusSalt = Math.floor(remainingBoxSalt / 2);
        const total = pl.score + bonusSalt;
        return { ...pl, finalSaltBonus: bonusSalt, finalScore: total };
      });

      setState(prev => ({
        ...prev,
        gameOver: true,
        finalScores
      }));
      return;
    }

    setSelectedHandIds([]);
    setDiscardSelectedIds([]);
    setState(prev => ({
      ...prev,
      turn: nextTurn,
      step: 1,
      facilityUsed: false,
      passedHomeInMove: false,
      trendCheckedInTurn: false
    }));
  };

  // ==========================================================================
  // BOT AI 思考ルーチン (README準拠)
  // ==========================================================================
  useEffect(() => {
    if (state.gameOver || state.turn === 0) return;

    const timer = setTimeout(() => {
      const curr = state.players[state.turn];
      const botSalt = getPlayerBoxSalt(curr);
      const hList = curr.hand;

      if (!hList || hList.length === 0) {
        advanceTurn();
        return;
      }

      // Step 1: 移動先選定
      const priorities = getCardPriorities(hList);
      let bestMoveIdx = 0;
      let bestScore = -99999;

      const emptyBoxes = curr.boxes.filter(b => !b.cargo && b.salt === 0).length;
      const loadedBoxes = curr.boxes.filter(b => b.cargo).length;
      const smallBoxes = curr.boxes.filter(b => !b.isBig).length;

      hList.forEach((c, idx) => {
        const nextPos = (curr.pos + c.num) % 10;
        const pInfo = priorities.find(p => p.idx === idx);
        const loss = pInfo ? pInfo.loss : 50;
        let score = 100 - loss;

        // 地元 (0)
        if (nextPos === 0) {
          if (botSalt > 0) {
            score += 500 + botSalt * 60;
            if (curr.score + botSalt >= WIN_SCORE) score += 30000;
          } else {
            score -= 40;
          }
        }
        // 港 (5)
        else if (nextPos === 5) {
          if (loadedBoxes > 0) {
            score += 600 + loadedBoxes * 300;
          } else {
            score -= 100;
          }
        }
        // 会所 (2, 8)
        else if (nextPos === 2 || nextPos === 8) {
          if (botSalt >= BIG_BOX_COST && smallBoxes > 0) {
            score += 700;
          }
        }
        // 問屋 (3, 7)
        else if (nextPos === 3 || nextPos === 7) {
          score += 350;
        }

        // 市場のカード数
        const marketIdx = getMarketIndex(nextPos);
        const mCards = state.road[marketIdx] || [];
        score += mCards.length * 30;

        if (score > bestScore) {
          bestScore = score;
          bestMoveIdx = idx;
        }
      });

      const moveCard = hList[bestMoveIdx];
      const oldPos = curr.pos;
      const nextPos = (oldPos + moveCard.num) % 10;
      const passedHome = (oldPos + moveCard.num >= 10);

      let newHand = hList.filter((_, idx) => idx !== bestMoveIdx);
      let newRoad = state.road.map((arr, i) => i === getMarketIndex(oldPos) ? [...arr, moveCard] : arr);
      let newDeck = [...state.deck];
      let newDiscard = [...state.discard];

      // 補充: 着地マス市場からピック（役候補になるカードを優先、なければ山札）
      const destMarket = getMarketIndex(nextPos);
      const mCards = newRoad[destMarket] || [];
      if (mCards.length > 0) {
        // 最も手札の役に寄与するカードを探す
        let bestPickId = mCards[0].id;
        let bestVal = -1;
        mCards.forEach(c => {
          const testSets = findSets([...newHand, c]);
          if (testSets.length > bestVal) {
            bestVal = testSets.length;
            bestPickId = c.id;
          }
        });
        const picked = mCards.find(c => c.id === bestPickId);
        newHand.push(picked);
        newRoad = newRoad.map((arr, i) => i === destMarket ? arr.filter(c => c.id !== bestPickId) : arr);
      } else {
        const res = drawSafe(1, newDeck, newDiscard, newRoad);
        newDeck = res.newDeck;
        newDiscard = res.newDiscard;
        newRoad = res.newRoad || newRoad;
        newHand.push(...res.drawn);
      }

      // 手札整理: 地元通過/着地で手札が6枚以上なら5枚になるまで捨てる
      if (passedHome && newHand.length > 5) {
        const excess = newHand.length - 5;
        const pri = getCardPriorities(newHand);
        const discardIds = pri.slice(0, excess).map(item => item.card.id);
        const discarded = newHand.filter(c => discardIds.includes(c.id));
        newHand = newHand.filter(c => !discardIds.includes(c.id));
        newDiscard.push(...discarded);
      }

      // ステップ2: 荷積み (空箱がある限り役を作って積む)
      let curBoxes = curr.boxes.map(b => ({ ...b }));
      let setsInHand = findSets(newHand);

      while (setsInHand.length > 0 && curBoxes.some(b => !b.cargo && b.salt === 0)) {
        const emptyIdx = curBoxes.findIndex(b => !b.cargo && b.salt === 0);
        const targetSet = setsInHand[0];
        const trioIds = targetSet.trio.map(c => c.id);
        newHand = newHand.filter(c => !trioIds.includes(c.id));
        curBoxes[emptyIdx] = { ...curBoxes[emptyIdx], cargo: targetSet.info };

        // 荷積み補充 (市場から3枚、不足時は山札)
        for (let r = 0; r < 3; r++) {
          const curMarketCards = newRoad[destMarket] || [];
          if (curMarketCards.length > 0) {
            const picked = curMarketCards[0];
            newHand.push(picked);
            newRoad = newRoad.map((arr, i) => i === destMarket ? arr.filter(c => c.id !== picked.id) : arr);
          } else {
            const res = drawSafe(1, newDeck, newDiscard, newRoad);
            newDeck = res.newDeck;
            newDiscard = res.newDiscard;
            newRoad = res.newRoad || newRoad;
            newHand.push(...res.drawn);
          }
        }
        setsInHand = findSets(newHand);
      }

      // ステップ2: 施設利用 (1回まで)
      let newScore = curr.score;
      let botTrendNotice = null;

      // 地元 (0): 換金
      if (nextPos === 0) {
        const s = curBoxes.reduce((sum, b) => sum + (b.salt || 0), 0);
        if (s > 0) {
          newScore += s;
          curBoxes = curBoxes.map(b => ({ ...b, salt: 0 }));
        }
      }
      // 会所 (2, 8): 大箱化 (2塩)
      else if (nextPos === 2 || nextPos === 8) {
        const curBoxSalt = curBoxes.reduce((sum, b) => sum + (b.salt || 0), 0);
        const smallIdx = curBoxes.findIndex(b => !b.isBig);
        if (curBoxSalt >= BIG_BOX_COST && smallIdx !== -1) {
          let rem = BIG_BOX_COST;
          curBoxes = curBoxes.map((b, idx) => {
            let s = b.salt;
            if (rem > 0 && s > 0) {
              if (s >= rem) { s -= rem; rem = 0; }
              else { rem -= s; s = 0; }
            }
            if (idx === smallIdx) return { ...b, salt: s, isBig: true };
            return { ...b, salt: s };
          });
        }
      }
      // 問屋 (3, 7): 仕入れ
      else if (nextPos === 3 || nextPos === 7) {
        // 無料1枚仕入れ
        const curMarketCards = newRoad[destMarket] || [];
        if (curMarketCards.length > 0) {
          const picked = curMarketCards[0];
          newHand.push(picked);
          newRoad = newRoad.map((arr, i) => i === destMarket ? arr.filter(c => c.id !== picked.id) : arr);
        } else {
          const res = drawSafe(1, newDeck, newDiscard, newRoad);
          newDeck = res.newDeck;
          newDiscard = res.newDiscard;
          newRoad = res.newRoad || newRoad;
          newHand.push(...res.drawn);
        }
      }
      // 港 (5): 出荷
      else if (nextPos === 5) {
        const boxesToSell = curBoxes.filter(b => b.cargo);
        if (boxesToSell.length > 0) {
          const shippedNums = [];
          const discardedCards = [];
          boxesToSell.forEach(b => {
            if (b.cargo.nums) shippedNums.push(...b.cargo.nums);
            if (b.cargo.cards) discardedCards.push(...b.cargo.cards);
          });
          newDiscard.push(...discardedCards);

          // 流行判定
          if (newDeck.length === 0 && newDiscard.length > 0) {
            newDeck = shuffle(newDiscard);
            newDiscard = [];
          }
          let trendHit = false;
          if (newDeck.length > 0) {
            const tCard = newDeck.shift();
            newDiscard.push(tCard);
            trendHit = shippedNums.includes(tCard.num);
            botTrendNotice = {
              playerName: curr.name,
              card: tCard,
              hit: trendHit,
              bonus: trendHit ? TREND_BONUS : 0
            };
          }

          let trendAwarded = false;
          curBoxes = curBoxes.map(b => {
            if (b.cargo) {
              let gain = b.cargo.salt;
              if (b.cargo.isTriplet) gain += SET_BONUS;
              if (b.isBig) gain += BIG_BOX_BONUS;
              if (trendHit && !trendAwarded) {
                gain += TREND_BONUS;
                trendAwarded = true;
              }
              return { ...b, cargo: null, salt: (b.salt || 0) + gain };
            }
            return b;
          });
        }
      }

      const reachedGoal = newScore >= WIN_SCORE;
      const finalRoundTriggered = state.finalRoundTriggered || reachedGoal;

      const newPlayers = state.players.map((pl, i) => i === state.turn ? {
        ...pl,
        pos: nextPos,
        hand: newHand,
        boxes: curBoxes,
        score: newScore
      } : pl);

      const nextTurn = (state.turn + 1) % 4;
      const isRoundEnd = (nextTurn === 0);

      if (finalRoundTriggered && isRoundEnd) {
        const finalScores = newPlayers.map(pl => {
          const remainingBoxSalt = getPlayerBoxSalt(pl);
          const bonusSalt = Math.floor(remainingBoxSalt / 2);
          const total = pl.score + bonusSalt;
          return { ...pl, finalSaltBonus: bonusSalt, finalScore: total };
        });

        setState(prev => ({
          ...prev,
          deck: newDeck,
          discard: newDiscard,
          road: newRoad,
          players: newPlayers,
          gameOver: true,
          finalScores,
          trendNotice: botTrendNotice || prev.trendNotice
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        deck: newDeck,
        discard: newDiscard,
        road: newRoad,
        players: newPlayers,
        finalRoundTriggered,
        turn: nextTurn,
        step: 1,
        facilityUsed: false,
        passedHomeInMove: false,
        trendNotice: botTrendNotice || prev.trendNotice,
        trendCheckedInTurn: false
      }));

    }, 500);

    return () => clearTimeout(timer);
  }, [state.turn, state.step, state.gameOver]);

  // ==========================================================================
  // UI 描画
  // ==========================================================================

  // カード描画
  const renderCard = (card, onClick, isSelected = false, isDiscard = false) => {
    const g = GOODS[card.type] || GOODS.tea;
    return h('div', {
      key: card.id,
      onClick,
      className: `card ${g.card} ${isSelected ? 'selected' : ''} ${isDiscard ? 'overflow-selected' : ''}`
    }, [
      h('div', { className: 'card-num' }, card.num),
      h('div', { className: 'card-icon' }, g.icon),
      h('div', { className: 'card-badges-pill' }, [
        h('span', { className: 'badge-pill' }, `🧂${card.salt}`)
      ])
    ]);
  };

  // 拠点タイル描画（0:地元 または 5:港）
  const renderHubTile = (pos) => {
    const tile = TILES[pos];
    const occupants = state.players.filter(pl => pl.pos === pos);
    const isCurrentPos = (p.pos === pos);
    const marketIdx = getMarketIndex(pos);
    const cardsAtHub = state.road[marketIdx] || [];
    const isHome = (pos === 0);

    // 補充ターゲット判定
    const isRefillActive = isHuman && (state.step === 2 || state.step === 5 || state.step === 6) && p.pos === pos;

    return h('div', {
      key: `hub-${pos}`,
      className: `tile hub-tile hub-${pos} ${isHome ? 'tile-home' : 'tile-port'} ${isCurrentPos ? 'current-tile' : ''}`
    }, [
      h('div', { className: 'hub-header' }, [
        h('div', { className: 'tile-num-badge' }, pos),
        h('div', { className: 'tile-name' }, `${tile.icon} ${tile.name}`)
      ]),
      isCurrentPos && h('div', { className: 'current-pos-indicator' }, '現在地'),
      h('div', { className: 'tile-occupants' },
        occupants.map(pl => h('span', {
          key: pl.id,
          className: 'occupant-badge',
          style: { backgroundColor: pl.color }
        }, pl.id === 0 ? '自' : `B${pl.id}`))
      ),
      cardsAtHub.length > 0 && h('div', { className: 'hub-market-area' }, [
        h('div', { style: { fontSize: '10px', color: '#64748b', fontWeight: 'bold', marginBottom: '2px', textAlign: 'center' } }, '市場:'),
        h('div', { className: 'hub-market-chips' },
          cardsAtHub.map(c => h('span', {
            key: c.id,
            title: `${GOODS[c.type].name} ${c.num} (塩${c.salt})`,
            onClick: isRefillActive ? () => {
              if (state.step === 2) handlePickMarketCardForStep1(c.id);
              else handlePickMarketCardForRefill(c.id, state.step === 6);
            } : undefined,
            className: `tile-card-chip chip-${c.type} ${isRefillActive ? 'clickable-chip' : ''}`
          }, `${GOODS[c.type].icon}${c.num}`))
        )
      ])
    ]);
  };

  // ルート上のマス描画（1〜4: 往路、6〜9: 復路）
  const renderRouteTile = (tile) => {
    const occupants = state.players.filter(pl => pl.pos === tile.pos);
    const isCurrentPos = (p.pos === tile.pos);

    return h('div', {
      key: `tile-${tile.pos}`,
      className: `tile route-tile tile-${tile.pos} ${tile.isFacility ? 'facility-tile' : ''} ${isCurrentPos ? 'current-tile' : ''}`
    }, [
      h('div', { className: 'tile-header' }, [
        h('span', { className: 'tile-num-badge' }, tile.pos),
        h('span', { className: 'tile-name' }, `${tile.icon} ${tile.name}`)
      ]),
      tile.costText && h('div', { className: 'tile-cost-tag' }, tile.costText),
      isCurrentPos && h('div', { className: 'current-pos-indicator' }, '現在地'),
      h('div', { className: 'tile-occupants' },
        occupants.map(pl => h('span', {
          key: pl.id,
          className: 'occupant-badge',
          style: { backgroundColor: pl.color }
        }, pl.id === 0 ? '自' : `B${pl.id}`))
      )
    ]);
  };

  // 共有市場スロット描画（中央に配置される市場カードチップ）
  const renderMarketSlot = (marketIdx) => {
    const cards = state.road[marketIdx] || [];
    const currentMarket = getMarketIndex(p.pos);
    const isTarget = isHuman && (state.step === 2 || state.step === 5 || state.step === 6) && currentMarket === marketIdx;

    return h('div', {
      key: `market-${marketIdx}`,
      className: `market-slot market-pos-${marketIdx} ${isTarget ? 'active-market-target' : ''}`
    }, [
      cards.length > 0 ? h('div', { className: 'market-cards' },
        cards.map(c => h('span', {
          key: c.id,
          title: `${GOODS[c.type].name} ${c.num} (塩${c.salt})`,
          onClick: isTarget ? () => {
            if (state.step === 2) handlePickMarketCardForStep1(c.id);
            else handlePickMarketCardForRefill(c.id, state.step === 6);
          } : undefined,
          className: `tile-card-chip chip-${c.type} ${isTarget ? 'clickable-chip' : ''}`
        }, `${GOODS[c.type].icon}${c.num}`))
      ) : h('span', { className: 'market-empty-dot' }, '・')
    ]);
  };

  // ボード全体描画
  const renderBoard = () => {
    return h('div', { className: 'board-container' }, [
      h('div', { className: 'board-h-grid' }, [
        renderHubTile(0),                 // 0: 地元 (hub)
        renderRouteTile(TILES[1]),        // 1: 街道
        renderRouteTile(TILES[2]),        // 2: 会所
        renderRouteTile(TILES[3]),        // 3: 問屋
        renderRouteTile(TILES[4]),        // 4: 街道
        renderHubTile(5),                 // 5: 港 (hub)
        renderMarketSlot(1),              // 街道A市場
        renderMarketSlot(2),              // 会所市場
        renderMarketSlot(3),              // 問屋市場
        renderMarketSlot(4),              // 街道B市場
        renderRouteTile(TILES[9]),        // 9: 街道
        renderRouteTile(TILES[8]),        // 8: 会所
        renderRouteTile(TILES[7]),        // 7: 問屋
        renderRouteTile(TILES[6])         // 6: 街道
      ])
    ]);
  };

  // 手番アクションバー
  const renderActionHub = () => {
    if (!isHuman) {
      return h('div', { className: 'action-bar bot-turn' }, [
        h('div', { className: 'spinner-sm' }),
        h('span', { style: { fontWeight: '700', color: p.color } }, `🤖 ${p.name} 思考中...`)
      ]);
    }

    // ステップ1: 移動
    if (state.step === 1) {
      return h('div', { className: 'action-bar step-1' }, [
        h('span', { className: 'action-bar-label' }, '🚶 手札からカードを1枚選んで進む（数字分前進、手札は移動元市場へ配置）')
      ]);
    }

    // ステップ1: 補充（移動後）
    if (state.step === 2) {
      const destMarket = getMarketIndex(p.pos);
      const marketCards = state.road[destMarket] || [];
      return h('div', { className: 'action-bar step-5' }, [
        h('div', { className: 'action-bar-left' }, [
          h('span', { className: 'action-bar-label' }, '🎴 補充：着地マスの市場から1枚選ぶか、山札から引く'),
          h('button', {
            onClick: handleDrawDeckForStep1,
            className: 'btn btn-primary btn-sm'
          }, '🂠 山札から引く')
        ]),
        marketCards.length > 0 && h('div', { className: 'action-bar-chips' }, [
          h('span', { className: 'action-bar-sub' }, '市場から選択:'),
          marketCards.map(c => h('button', {
            key: c.id,
            onClick: () => handlePickMarketCardForStep1(c.id),
            className: `tile-card-chip chip-${c.type} clickable-chip`,
            style: { padding: '3px 8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', border: '1.5px solid' }
          }, `${GOODS[c.type].icon} ${c.num}`))
        ])
      ]);
    }

    // ステップ1: 地元手札整理
    if (state.step === 3) {
      const needed = me.hand.length - 5;
      const current = discardSelectedIds.length;
      return h('div', { className: 'action-bar step-4' }, [
        h('span', { className: 'action-bar-label' }, `🏡 地元通過／着地による手札整理：5枚になるまで ${needed} 枚選んで捨てる`),
        h('button', {
          disabled: current !== needed,
          onClick: handleConfirmDiscard,
          className: 'btn btn-purple btn-sm'
        }, `捨てる (${current}/${needed})`)
      ]);
    }

    // 荷積み補充 (Step 5) または 問屋仕入れ補充 (Step 6)
    if (state.step === 5 || state.step === 6) {
      const isPacking = (state.step === 5);
      const destMarket = getMarketIndex(p.pos);
      const marketCards = state.road[destMarket] || [];
      const title = isPacking ? '📦 荷積み補充' : '🏬 問屋仕入れ';

      return h('div', { className: 'action-bar step-5' }, [
        h('div', { className: 'action-bar-left' }, [
          h('span', { className: 'action-bar-label' }, `${title}（残り ${state.refillRemaining} 枚）:`),
          h('button', {
            onClick: () => handleDrawDeckForRefill(state.step === 6),
            className: 'btn btn-primary btn-sm'
          }, '🂠 山札から引く')
        ]),
        marketCards.length > 0 && h('div', { className: 'action-bar-chips' }, [
          h('span', { className: 'action-bar-sub' }, '市場から選択:'),
          marketCards.map(c => h('button', {
            key: c.id,
            onClick: () => handlePickMarketCardForRefill(c.id, state.step === 6),
            className: `tile-card-chip chip-${c.type} clickable-chip`,
            style: { padding: '3px 8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', border: '1.5px solid' }
          }, `${GOODS[c.type].icon} ${c.num}`))
        ])
      ]);
    }

    // ステップ2: アクション (荷積み / 施設利用 / 手番終了)
    if (state.step === 4) {
      const pos = p.pos;
      const isHome = (pos === 0);
      const isGuild = (pos === 2 || pos === 8);
      const isWholesalePlace = (pos === 3 || pos === 7);
      const isPort = (pos === 5);

      return h('div', { className: 'action-bar step-3' }, [
        h('div', { className: 'action-bar-left' }, [
          h('span', { className: 'action-bar-label' }, `⚡ ${TILES[pos].name}（着地マス）:`),

          // 地元(0): 換金
          isHome && (
            myBoxSalt > 0 ? (
              h('div', { style: { display: 'flex', gap: '6px' } }, [
                h('button', {
                  onClick: handleDeliverAll,
                  className: 'btn btn-success btn-sm'
                }, `🏡 全換金 (+${myBoxSalt} 🏆)`),
                me.boxes.map((b, idx) => b.salt > 0 ? (
                  h('button', {
                    key: idx,
                    onClick: () => handleDeliverBox(idx),
                    className: 'btn btn-primary btn-sm'
                  }, `箱${idx + 1}換金 (+${b.salt} 🏆)`)
                ) : null)
              ])
            ) : h('span', { className: 'action-bar-sub' }, '換金可能な塩なし')
          ),

          // 会所(2, 8): 大箱化 (2塩)
          isGuild && (
            state.facilityUsed ? (
              h('span', { className: 'action-bar-sub' }, '施設利用済み')
            ) : smallBoxesCount === 0 ? (
              h('span', { className: 'action-bar-sub' }, 'すべて大箱')
            ) : (
              h('button', {
                disabled: myBoxSalt < BIG_BOX_COST,
                onClick: handleUpgradeBigBox,
                className: 'btn btn-success btn-sm'
              }, `🏛️ 木箱を大箱へ裏返し (${BIG_BOX_COST}塩)`)
            )
          ),

          // 問屋(3, 7): 仕入れ
          isWholesalePlace && (
            state.facilityUsed ? (
              h('span', { className: 'action-bar-sub' }, '施設利用済み')
            ) : (
              h('div', { style: { display: 'flex', gap: '6px' } }, [
                h('button', {
                  onClick: () => handleWholesale(0),
                  className: 'btn btn-purple btn-sm'
                }, '🏬 仕入れ (無料: 1枚)'),
                myBoxSalt >= 1 && h('button', {
                  onClick: () => handleWholesale(1),
                  className: 'btn btn-purple btn-sm'
                }, '🏬 仕入れ (+1塩: 計2枚)'),
                myBoxSalt >= 2 && h('button', {
                  onClick: () => handleWholesale(2),
                  className: 'btn btn-purple btn-sm'
                }, '🏬 仕入れ (+2塩: 計3枚)')
              ])
            )
          ),

          // 港(5): 出荷
          isPort && (
            loadedBoxesCount > 0 ? (
              h('div', { style: { display: 'flex', gap: '6px' } }, [
                h('button', {
                  onClick: () => handleSellPort(true),
                  className: 'btn btn-primary btn-sm'
                }, `⚓ 2箱一括出荷 (塩獲得＆流行判定)`),
                me.boxes.map((b, idx) => b.cargo ? (
                  h('button', {
                    key: idx,
                    onClick: () => handleSellPort(false, idx),
                    className: 'btn btn-secondary btn-sm'
                  }, `箱${idx + 1}出荷 (${b.cargo.shortName})`)
                ) : null)
              ])
            ) : h('span', { className: 'action-bar-sub' }, '出荷可能な荷物なし')
          )
        ]),

        // 手番終了
        h('button', {
          onClick: handleEndTurn,
          className: 'btn btn-dark btn-sm'
        }, '🏁 手番終了')
      ]);
    }

    return null;
  };

  // ゲーム終了画面
  if (state.gameOver && state.finalScores) {
    const sorted = [...state.finalScores].sort((a, b) => b.finalScore - a.finalScore);
    const topScore = sorted[0].finalScore;
    const winners = sorted.filter(p => p.finalScore === topScore);
    const winnerLabel = winners.map(p => p.name).join('・');

    return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '16px', textAlign: 'center' } }, [
      h('h1', { style: { fontSize: '24px', color: '#0f172a' } },
        winners.length > 1 ? `🤝 ${winnerLabel} の引き分け！` : `👑 ${winnerLabel} の勝利！`
      ),
      h('p', { style: { color: '#475569', fontSize: '15px' } }, `目標20点達成によるゲーム終了`),

      // 最終結果テーブル
      h('div', { style: { background: '#ffffff', border: '1px solid #cbd5e1', padding: '12px 20px', minWidth: '320px' } }, [
        h('h3', { style: { fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' } }, '【最終結果＆精算】'),
        sorted.map((pl, idx) => h('div', {
          key: pl.id,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            fontWeight: idx === 0 ? 'bold' : 'normal',
            color: idx === 0 ? '#b91c1c' : '#1e293b'
          }
        }, [
          h('span', null, `${idx + 1}位: ${pl.name}`),
          h('span', null, `${pl.score}点 + 残塩換算${pl.finalSaltBonus}点 ＝ 計 ${pl.finalScore} 点`)
        ])),
        h('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '8px', textAlign: 'left' } },
          '※最終精算：木箱に残った塩は、全木箱の合計2個につき手元の塩1個に換算'
        )
      ]),

      h('button', {
        onClick: () => setState(initGame()),
        className: 'btn btn-primary',
        style: { padding: '10px 24px', fontSize: '15px' }
      }, '🔄 もう一度遊ぶ')
    ]);
  }

  return h('div', { className: 'app' }, [

    // ヘッダー
    h('header', { className: 'header' }, [
      h('div', { className: 'header-title' }, [
        h('span', null, '🏮 ナウキ運び')
      ]),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        h('span', { style: { color: '#64748b', fontSize: '12px', fontWeight: '600' } }, `🎴 山札: ${state.deck.length}枚 / 捨札: ${state.discard.length}枚`),
        h('span', { className: 'header-badge' }, `🏆 勝利条件: 手元${WIN_SCORE}点`),
        state.finalRoundTriggered && h('span', { className: 'header-badge', style: { background: '#fee2e2', color: '#b91c1c', borderColor: '#f87171' } }, '⚠️ 最終手番（P4まで）'),
        h('a', {
          href: 'README.md',
          target: '_blank',
          className: 'btn btn-secondary',
          style: { textDecoration: 'none', fontSize: '11px', padding: '3px 8px' }
        }, '📖 ルール確認')
      ])
    ]),

    // プレイヤー状況スコアボード
    h('div', { className: 'players-bar' },
      state.players.map(pl => {
        const isCurrentTurn = state.turn === pl.id;
        const isMe = pl.id === 0;
        const plBoxSalt = getPlayerBoxSalt(pl);

        return h('div', {
          key: pl.id,
          className: `player-card ${isCurrentTurn ? 'active-turn' : ''} ${isMe ? 'is-me' : ''}`
        }, [
          h('div', { className: 'player-card-header' }, [
            h('div', { className: 'player-card-name' }, [
              h('span', { className: 'player-avatar', style: { backgroundColor: pl.color } }, isMe ? '自' : `B${pl.id}`),
              h('span', { className: 'player-name-text' }, pl.name)
            ]),
            isCurrentTurn && h('span', { className: 'turn-badge' }, '手番')
          ]),
          h('div', { className: 'player-card-body' }, [
            h('div', { className: 'player-score' }, [
              h('span', { className: 'score-icon' }, '🏆'),
              h('span', { className: 'score-val' }, pl.score),
              h('span', { className: 'score-unit' }, '点')
            ]),
            h('div', { className: 'player-info-sub' }, [
              h('span', { style: { fontWeight: 'bold', color: plBoxSalt > 0 ? '#0d9488' : '#64748b' } }, `箱の塩: 🧂${plBoxSalt}`),
              h('span', { style: { fontSize: '11px', color: '#64748b' } }, `手札: ${pl.hand.length}枚`)
            ])
          ]),
          // 木箱2枚の中身
          h('div', { className: 'player-boxes-row', style: { gridTemplateColumns: 'repeat(2, 1fr)' } }, [
            pl.boxes.map((b, bIdx) => {
              const boxLabel = b.isBig ? '大箱' : '木箱';

              if (b.salt > 0) {
                return h('div', {
                  key: bIdx,
                  className: `mini-box mini-box-salt ${b.isBig ? 'mini-box-flipped' : ''}`,
                  title: `${boxLabel}${bIdx + 1}: 🧂${b.salt}塩`
                }, [
                  h('span', null, b.isBig ? '✨' : ''),
                  h('span', null, `🧂${b.salt}`)
                ]);
              }

              if (b.cargo) {
                return h('div', {
                  key: bIdx,
                  className: `mini-box mini-box-cargo chip-${b.cargo.type} ${b.isBig ? 'mini-box-flipped' : ''}`,
                  title: `${boxLabel}${bIdx + 1}: ${b.cargo.name} (素点${b.cargo.salt})`
                }, [
                  h('span', null, GOODS[b.cargo.type]?.icon || '📦'),
                  h('span', null, b.cargo.shortName)
                ]);
              }

              return h('div', {
                key: bIdx,
                className: `mini-box mini-box-empty ${b.isBig ? 'mini-box-flipped' : ''}`,
                title: `${boxLabel}${bIdx + 1}: 空き`
              }, b.isBig ? '✨大箱(空)' : '空');
            })
          ])
        ]);
      })
    ),

    // 流行通知バナー
    state.trendNotice && h('div', {
      className: 'trend-banner',
      style: {
        background: state.trendNotice.hit ? '#f0fdf4' : '#fffbeb',
        border: `1px solid ${state.trendNotice.hit ? '#86efac' : '#fcd34d'}`,
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        fontSize: '12px'
      }
    }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
        h('span', { style: { fontSize: '16px' } }, '🌟'),
        h('strong', { style: { color: state.trendNotice.hit ? '#166534' : '#92400e' } }, '港の流行判定:'),
        h('span', null, `${state.trendNotice.playerName} の出荷！めくったカード:`),
        h('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            fontWeight: 'bold',
            fontSize: '12px'
          }
        }, [
          GOODS[state.trendNotice.card.type]?.icon || '',
          `${GOODS[state.trendNotice.card.type]?.name} ${state.trendNotice.card.num}`
        ]),
        h('span', { style: { fontWeight: 'bold', color: state.trendNotice.hit ? '#15803d' : '#64748b' } },
          state.trendNotice.hit ? '🎉 出荷品と同数字が一致！流行ボーナス ＋2塩 獲得！' : '一致なし（流行ボーナスなし）'
        ),
        h('span', { style: { color: '#64748b', fontSize: '11px' } }, '（めくったカードは捨て札へ）')
      ]),
      h('button', {
        style: {
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#64748b',
          fontSize: '14px',
          fontWeight: 'bold',
          padding: '0 4px'
        },
        onClick: () => setState(prev => ({ ...prev, trendNotice: null }))
      }, '×')
    ]),

    // ルートボード
    renderBoard(),

    // アクションバー
    renderActionHub(),

    // プレイヤードック（手札 ＆ 木箱）
    h('div', { className: 'player-dock' }, [

      // 左側：手札
      h('div', { className: 'dock-panel dock-hand' }, [
        h('div', { className: 'dock-header' }, [
          h('span', { className: 'dock-title' }, `🎴 あなたの手札 (${me.hand.length}枚)`),
          isHuman && state.step === 4 && (
            selectedSetInfo ? (
              emptyBoxesCount > 0 ? (
                h('button', {
                  onClick: handlePackSelectedCargo,
                  className: 'btn btn-success btn-sm',
                  style: { padding: '2px 8px', fontSize: '11px' }
                }, `📦 ${selectedSetInfo.name} を木箱に積載（+3枚補充）`)
              ) : (
                h('span', { style: { color: '#d97706', fontSize: '11px' } }, '空き箱なし')
              )
            ) : selectedHandIds.length === 3 ? (
              h('span', { style: { color: '#c92a2a', fontSize: '11px' } }, '連番またはセット不成立')
            ) : (
              selectedHandIds.length > 0 && h('span', { style: { color: '#64748b', fontSize: '11px' } }, `${selectedHandIds.length}/3枚選択中`)
            )
          ),
          isHuman && state.step === 3 && h('span', { style: { color: '#6b46c1', fontWeight: 'bold', fontSize: '11px' } },
            `捨てるカード (${discardSelectedIds.length}/${me.hand.length - 5})`
          )
        ]),
        h('div', { className: 'card-row' },
          me.hand.map((c, idx) => renderCard(
            c,
            () => {
              if (isHuman && state.step === 1) {
                handleMove(idx);
              } else if (isHuman && state.step === 4) {
                if (selectedHandIds.includes(c.id)) {
                  setSelectedHandIds(selectedHandIds.filter(id => id !== c.id));
                } else if (selectedHandIds.length < 3) {
                  setSelectedHandIds([...selectedHandIds, c.id]);
                }
              } else if (isHuman && state.step === 3) {
                const targetCount = me.hand.length - 5;
                if (discardSelectedIds.includes(c.id)) {
                  setDiscardSelectedIds(discardSelectedIds.filter(id => id !== c.id));
                } else if (discardSelectedIds.length < targetCount) {
                  setDiscardSelectedIds([...discardSelectedIds, c.id]);
                }
              }
            },
            selectedHandIds.includes(c.id),
            discardSelectedIds.includes(c.id)
          ))
        )
      ]),

      // 右側：木箱タイル2枚（裏面は大箱）
      h('div', { className: 'dock-panel dock-cargo' }, [
        h('div', { className: 'dock-header' }, [
          h('span', { className: 'dock-title' }, '📦 木箱タイル（各自2枚 / 裏面は大箱）'),
          h('span', { style: { fontSize: '11px', color: '#0d9488', fontWeight: 'bold' } }, `木箱の塩合計: 🧂${myBoxSalt}`)
        ]),

        h('div', { className: 'cargo-boxes-grid', style: { gridTemplateColumns: 'repeat(2, 1fr)' } },
          me.boxes.map((b, idx) => {
            const isBig = b.isBig;
            const boxTitle = isBig ? `大箱 ${idx + 1}` : `木箱 ${idx + 1}`;
            const boxBadge = isBig ? '大箱 (+3塩ボーナス)' : '通常木箱';
            const badgeClass = isBig ? 'cargo-badge-flipped' : 'cargo-badge-normal';
            const cardClass = b.salt > 0
              ? 'box-salt-filled'
              : (isBig ? 'box-flipped' : 'box-normal');

            // ① 塩が乗っている場合
            if (b.salt > 0) {
              const isHomeNow = (isHuman && state.step === 4 && p.pos === 0);
              return h('div', {
                key: idx,
                className: `cargo-box-card ${cardClass}`,
                style: {
                  borderColor: isHomeNow ? '#10b981' : (isBig ? '#9333ea' : '#0d9488'),
                  borderWidth: isHomeNow ? '2px' : '1px',
                  cursor: isHomeNow ? 'pointer' : 'default'
                },
                onClick: () => {
                  if (isHomeNow) handleDeliverBox(idx);
                }
              }, [
                h('div', { className: 'cargo-box-header' }, [
                  h('span', { className: 'cargo-box-num' }, boxTitle),
                  h('span', { className: 'cargo-badge-salt-filled' }, `🧂 ${b.salt}塩`)
                ]),
                h('div', { style: { fontSize: '11px', color: '#0f766e', fontWeight: '600' } },
                  isHomeNow ? '🏡 着地中：クリックで換金可能' : '地元で換金すると得点に'
                ),
                isHomeNow && h('button', {
                  onClick: (e) => { e.stopPropagation(); handleDeliverBox(idx); },
                  className: 'btn btn-success',
                  style: { width: '100%', fontSize: '12px', padding: '4px', fontWeight: 'bold', marginTop: '4px' }
                }, `🏡 換金 ➔ +${b.salt}点 🏆`)
              ]);
            }

            // ② 荷物が乗っている場合
            if (b.cargo) {
              const isPort = (isHuman && state.step === 4 && p.pos === 5);
              const setBonus = b.cargo.isTriplet ? SET_BONUS : 0;
              const bigBonus = isBig ? BIG_BOX_BONUS : 0;
              const expectedSalt = b.cargo.salt + setBonus + bigBonus;

              return h('div', {
                key: idx,
                className: `cargo-box-card ${cardClass}`
              }, [
                h('div', { className: 'cargo-box-header' }, [
                  h('span', { className: 'cargo-box-num' }, boxTitle),
                  h('span', { className: badgeClass }, boxBadge)
                ]),
                h('div', { className: 'cargo-box-name', style: { fontWeight: 'bold', color: '#0f172a', fontSize: '13px' } }, b.cargo.name),
                h('div', { className: 'cargo-box-vals', style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, [
                  h('span', { className: 'cargo-val-pill' }, `出荷で 🧂${expectedSalt}塩`),
                  b.cargo.isTriplet && h('span', { className: 'cargo-val-pill', style: { background: '#fef3c7', color: '#b45309' } }, 'セット+2'),
                  isBig && h('span', { className: 'cargo-val-pill', style: { background: '#f3e8ff', color: '#6b21a8' } }, '大箱+3')
                ]),
                isPort && h('button', {
                  onClick: (e) => { e.stopPropagation(); handleSellPort(false, idx); },
                  className: 'btn btn-primary',
                  style: { marginTop: '4px', fontSize: '12px', padding: '4px', fontWeight: 'bold' }
                }, `⚓ 荷下ろし ➔ 🧂${expectedSalt}塩（＋流行判定）`)
              ]);
            }

            // ③ 空き箱の場合
            return h('div', { key: idx, className: `cargo-box-card ${cardClass} box-empty` }, [
              h('div', { className: 'cargo-box-header' }, [
                h('span', { className: 'cargo-box-num' }, boxTitle),
                h('span', { className: badgeClass }, boxBadge)
              ]),
              h('div', { className: 'cargo-box-empty-text' }, isBig ? '大箱（空き）' : '木箱（空き）')
            ]);
          })
        )
      ])
    ])
  ]);
}

ReactDOM.render(h(App), document.getElementById('root'));
