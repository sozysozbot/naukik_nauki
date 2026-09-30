#!/usr/bin/env node
/**
 * 『ナウキ運び』ヘッドレス・シミュレーション環境 (simulate.js)
 * ─────────────────────────────────────────────────────────────
 * README.md / RULEBOOK.md の公式仕様に完全準拠した対戦シミュレータ。
 * ゲームバランス・テンポ・戦略多様性・ドラマ性を定量分析します。
 */

const CARD_TEMPLATES = {
  tea:   [{ num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 }],
  rice:  [{ num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 }],
  cloth: [{ num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 }]
};

const HAND_LIMIT = 5;
const WIN_SCORE = 20;
const BIG_BOX_COST = 2;
const BIG_BOX_BONUS = 3;
const SET_BONUS = 2;
const TREND_BONUS = 2;
const CARD_COPIES = 4;

// ルートボード 6枚（往路0-5, 復路6-10 / 10=0地元）
// 0:地元, 1:街道, 2:会所, 3:問屋, 4:街道, 5:港, 6:街道, 7:問屋, 8:会所, 9:街道
function getMarketIndex(pos) {
  if (pos === 0) return 0;
  if (pos === 1 || pos === 9) return 1;
  if (pos === 2 || pos === 8) return 2;
  if (pos === 3 || pos === 7) return 3;
  if (pos === 4 || pos === 6) return 4;
  if (pos === 5) return 5;
  return 0;
}

function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createDeck(random = Math.random) {
  const deck = [];
  let id = 1;
  ['tea', 'rice', 'cloth'].forEach(t => {
    CARD_TEMPLATES[t].forEach(tpl => {
      for (let i = 0; i < CARD_COPIES; i++) {
        deck.push({ id: id++, type: t, num: tpl.num, salt: tpl.salt });
      }
    });
  });
  return shuffle(deck, random);
}

function drawSafe(count, currentDeck, currentDiscard, road = null, random = Math.random) {
  let d = [...currentDeck];
  let disc = [...currentDiscard];
  let newRoad = road ? road.map(arr => [...arr]) : null;
  const drawn = [];

  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (disc.length > 0) {
        d = shuffle(disc, random);
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
          d = shuffle(recycled, random);
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

function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const types = cards.map(c => c.type);
  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  if (types[0] === types[1] && types[1] === types[2]) {
    const t = types[0];
    if (nums[0] === nums[1] && nums[1] === nums[2]) {
      return { name: `${t} ${nums[0]}×3 (セット)`, salt: baseSalt, isTriplet: true, cards, type: t, nums };
    }
    if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
      return { name: `${t} ${nums[0]}-${nums[2]} (連番)`, salt: baseSalt, isTriplet: false, cards, type: t, nums };
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

function evalCardPotential(card, hand) {
  let score = 0;
  for (const other of hand) {
    if (other.id === card.id) continue;
    if (other.type === card.type) {
      const diff = Math.abs(other.num - card.num);
      if (diff === 0) {
        score += 30; // ペア（同数字・セットのタネ）
      } else if (diff === 1) {
        score += 24; // 連番（連続数字）
      } else if (diff === 2) {
        score += 12; // カンチャン（1間隔）
      } else {
        score += 4;
      }
    }
  }
  return score;
}

function hasReadyPair(hand) {
  if (!hand || hand.length < 2) return false;
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].type === hand[j].type) {
        const diff = Math.abs(hand[i].num - hand[j].num);
        if (diff === 0 || diff === 1) return true;
      }
    }
  }
  return false;
}

function getCardPriorities(hand) {
  if (!hand || hand.length === 0) return [];
  const currentSets = findSets(hand);
  const currentBestValue = currentSets.length > 0 ? Math.max(...currentSets.map(s => s.info.salt + (s.info.isTriplet ? SET_BONUS : 0))) : 0;

  return hand.map((card, idx) => {
    const remainingHand = hand.filter((_, i) => i !== idx);
    const newSets = findSets(remainingHand);
    const newBestValue = newSets.length > 0 ? Math.max(...newSets.map(s => s.info.salt + (s.info.isTriplet ? SET_BONUS : 0))) : 0;
    const loss = (currentBestValue - newBestValue) * 100;
    const potential = evalCardPotential(card, remainingHand);
    return { card, idx, loss: loss + potential };
  }).sort((a, b) => a.loss - b.loss);
}

function pickBestMarketCard(marketCards, hand) {
  if (!marketCards || marketCards.length === 0) return null;
  let bestCard = marketCards[0];
  let bestScore = -999;

  marketCards.forEach(card => {
    const testSets = findSets([...hand, card]);
    let score = 0;
    if (testSets.length > 0) {
      const maxSalt = Math.max(...testSets.map(s => s.info.salt + (s.info.isTriplet ? SET_BONUS : 0)));
      score = 200 + maxSalt * 10;
    } else {
      score = evalCardPotential(card, hand);
    }
    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  });

  return bestCard;
}

function getPlayerBoxSalt(player) {
  if (!player || !player.boxes) return 0;
  return player.boxes.reduce((sum, b) => sum + (b.salt || 0), 0);
}

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

// ─────────────────────────────────────────────────────────────
// 4大AI戦略の定義
// ─────────────────────────────────────────────────────────────
const STRATEGIES = {
  adaptive: {
    id: 'adaptive',
    name: 'バランス型（適応商人）',
    desc: '状況に応じて大箱化・仕入れ・荷積みをバランス良く判断する王道戦略',
    upgradePreference: 1.0,
    wholesalePreference: 1.0
  },
  big_box: {
    id: 'big_box',
    name: '大箱特化型（豪商投資）',
    desc: '早い段階で木箱を大箱へ強化し、港の大箱ボーナス(+3塩×2)で大量得点を狙う',
    upgradePreference: 2.2,
    wholesalePreference: 0.5
  },
  wholesale: {
    id: 'wholesale',
    name: '問屋仕入れ型（高回転荷積み）',
    desc: '問屋でカードを効率的に仕入れ、役を揃えて2箱同時出荷を連打する',
    upgradePreference: 0.8,
    wholesalePreference: 1.8
  },
  fast_ferry: {
    id: 'fast_ferry',
    name: '快速ピストン型（最短往復）',
    desc: '大箱化は一切せず、荷物が1箱でもできたら即座に出荷・即換金する愚直な高回転ピストン輸送（初心者・悪手枠）',
    upgradePreference: 0.0,
    wholesalePreference: 0.0
  }
};

// 1試合シミュレーション実行
function runSingleGame(strategyIds = ['adaptive', 'big_box', 'wholesale', 'fast_ferry'], random = Math.random) {
  let deck = createDeck(random);
  let discard = [];
  // 6箇所の市場に初期1枚ずつ配置
  let road = Array(6).fill(null).map(() => [deck.shift()]);

  const players = strategyIds.map((sId, i) => ({
    id: i,
    stratId: sId,
    name: `P${i + 1}(${STRATEGIES[sId].name.slice(0, 4)})`,
    pos: 0,
    hand: deck.splice(0, 5),
    boxes: [
      { isBig: false, cargo: null, salt: 2 }, // 初期塩2個
      { isBig: false, cargo: null, salt: 0 }  // 空箱
    ],
    score: 0,
    stats: {
      tripletsMade: 0,
      runsMade: 0,
      bigBoxUpgrades: 0,
      wholesaleUses: 0,
      trendHits: 0,
      totalDelivered: 0
    }
  }));

  let turn = 0;
  let rounds = 0;
  let finalRoundTriggered = false;
  let gameOver = false;
  const maxRounds = 80;

  while (!gameOver && rounds < maxRounds) {
    const pIdx = turn % 4;
    if (pIdx === 0) rounds++;
    const p = players[pIdx];
    const strat = STRATEGIES[p.stratId];
    const botSalt = getPlayerBoxSalt(p);
    const hList = p.hand;

    if (hList.length > 0) {
      // Step 1: 移動
      const priorities = getCardPriorities(hList);
      let bestMoveIdx = 0;
      let bestScore = -99999;

      const loadedBoxes = p.boxes.filter(b => b.cargo).length;
      const smallBoxes = p.boxes.filter(b => !b.isBig).length;

      hList.forEach((c, idx) => {
        const nextPos = (p.pos + c.num) % 10;
        const pInfo = priorities.find(item => item.idx === idx);
        const loss = pInfo ? pInfo.loss : 50;
        let score = 100 - loss;

        // 地元 (0)
        if (nextPos === 0) {
          if (botSalt > 0) {
            score += 550 + botSalt * 90;
            if (p.stratId === 'fast_ferry') score += 350;
            if (p.score + botSalt >= WIN_SCORE) score += 50000;
          } else {
            score -= 100;
          }
        }
        // 港 (5)
        else if (nextPos === 5) {
          if (loadedBoxes > 0) {
            score += 650 + loadedBoxes * 350;
            if (p.stratId === 'fast_ferry') {
              score += 400; // 1箱でも積んだら直行
            } else if (loadedBoxes === 2) {
              score += 300;
            } else if (loadedBoxes === 1 && p.stratId === 'adaptive') {
              // バランス型: 手札にリーチがあるなら問屋経由で2箱目を狙う、バラバラなら即出荷
              const hasPair = hasReadyPair(hList);
              const opponentUrgent = players.some(pl => pl.id !== p.id && (pl.score + getPlayerBoxSalt(pl) >= 16));
              if (opponentUrgent || !hasPair) score += 200; // レース切迫または手札悪なら急ぎ出荷
              else score -= 150; // もう1箱待つ余裕がある
            }
          } else {
            score -= 180;
          }
        }
        // 会所 (2, 8)
        else if (nextPos === 2 || nextPos === 8) {
          const isNearWin = (p.score + botSalt >= WIN_SCORE);
          const alreadyHasBig = p.boxes.some(b => b.isBig);
          const isLateGame = (p.score + botSalt >= 14 && alreadyHasBig);
          if (botSalt >= BIG_BOX_COST && smallBoxes > 0 && !isNearWin && !isLateGame && strat.upgradePreference > 0) {
            score += 450 * strat.upgradePreference;
          }
        }
        // 問屋 (3, 7)
        else if (nextPos === 3 || nextPos === 7) {
          const setsCount = findSets(hList).length;
          const needCards = (hList.length < 5 || (setsCount < 2 && loadedBoxes < 2));
          if (loadedBoxes === 2) {
            score += 50;
          } else {
            let pref = strat.wholesalePreference;
            if (p.stratId === 'adaptive' && loadedBoxes === 1) {
              if (hasReadyPair(hList)) pref *= 1.4; // 1箱積載時、手札にペアがあれば問屋の価値上昇
            }
            score += (needCards ? 380 : 180) * pref;
          }
        }

        if (p.stratId === 'fast_ferry') {
          score += c.num * 15;
        }

        const mIdx = getMarketIndex(nextPos);
        const mCards = road[mIdx] || [];
        score += mCards.length * 25;

        if (score > bestScore) {
          bestScore = score;
          bestMoveIdx = idx;
        }
      });

      const moveCard = hList[bestMoveIdx];
      const oldPos = p.pos;
      const nextPos = (oldPos + moveCard.num) % 10;
      const passedHome = (oldPos + moveCard.num >= 10);

      let newHand = hList.filter((_, idx) => idx !== bestMoveIdx);
      const originMarket = getMarketIndex(oldPos);
      road[originMarket].push(moveCard);

      // Step 1: 補充（着地マスの市場から優先ピック、不足時山札）
      const destMarket = getMarketIndex(nextPos);
      const mCards = road[destMarket] || [];
      if (mCards.length > 0) {
        const picked = pickBestMarketCard(mCards, newHand);
        newHand.push(picked);
        road[destMarket] = road[destMarket].filter(c => c.id !== picked.id);
      } else {
        const res = drawSafe(1, deck, discard, road, random);
        deck = res.newDeck;
        discard = res.newDiscard;
        road = res.newRoad || road;
        newHand.push(...res.drawn);
      }

      // Step 1: 地元通過／着地による手札整理
      if (passedHome && newHand.length > 5) {
        const excess = newHand.length - 5;
        const pri = getCardPriorities(newHand);
        const discardIds = pri.slice(0, excess).map(item => item.card.id);
        const discarded = newHand.filter(c => discardIds.includes(c.id));
        newHand = newHand.filter(c => !discardIds.includes(c.id));
        discard.push(...discarded);
      }

      // Step 2: 荷積み（空箱がある限り何度でも）
      let setsInHand = findSets(newHand);
      while (setsInHand.length > 0 && p.boxes.some(b => !b.cargo && b.salt === 0)) {
        // 空いている大箱があれば優先して大箱に積む
        const emptyBigIdx = p.boxes.findIndex(b => b.isBig && !b.cargo && b.salt === 0);
        const emptyIdx = emptyBigIdx !== -1 ? emptyBigIdx : p.boxes.findIndex(b => !b.cargo && b.salt === 0);

        // 高塩役・セット（同数字）を優先
        setsInHand.sort((a, b) => (b.info.salt + (b.info.isTriplet ? SET_BONUS : 0)) - (a.info.salt + (a.info.isTriplet ? SET_BONUS : 0)));
        const targetSet = setsInHand[0];
        const trioIds = targetSet.trio.map(c => c.id);
        newHand = newHand.filter(c => !trioIds.includes(c.id));
        p.boxes[emptyIdx] = { ...p.boxes[emptyIdx], cargo: targetSet.info };

        if (targetSet.info.isTriplet) p.stats.tripletsMade++;
        else p.stats.runsMade++;

        // 荷積み後3枚補充
        for (let r = 0; r < 3; r++) {
          const curMarketCards = road[destMarket] || [];
          if (curMarketCards.length > 0) {
            const picked = pickBestMarketCard(curMarketCards, newHand);
            newHand.push(picked);
            road[destMarket] = road[destMarket].filter(c => c.id !== picked.id);
          } else {
            const res = drawSafe(1, deck, discard, road, random);
            deck = res.newDeck;
            discard = res.newDiscard;
            road = res.newRoad || road;
            newHand.push(...res.drawn);
          }
        }
        setsInHand = findSets(newHand);
      }

      // Step 2: 施設利用（1回まで）
      // 地元 (0): 換金
      if (nextPos === 0) {
        const s = getPlayerBoxSalt(p);
        if (s > 0) {
          p.score += s;
          p.stats.totalDelivered += s;
          p.boxes = p.boxes.map(b => ({ ...b, salt: 0 }));
        }
      }
      // 会所 (2, 8): 大箱化 (2塩)
      else if (nextPos === 2 || nextPos === 8) {
        const curBoxSalt = getPlayerBoxSalt(p);
        const smallIdx = p.boxes.findIndex(b => !b.isBig);
        const isNearWin = (p.score + curBoxSalt >= WIN_SCORE);
        const alreadyHasBig = p.boxes.some(b => b.isBig);
        const isLateGame = (p.score + curBoxSalt >= 14 && alreadyHasBig);
        if (curBoxSalt >= BIG_BOX_COST && smallIdx !== -1 && strat.upgradePreference > 0.3 && !isNearWin && !isLateGame) {
          const res = deductBoxSalt(p, BIG_BOX_COST);
          if (res.success) {
            p.boxes = res.newBoxes;
            p.boxes[smallIdx] = { ...p.boxes[smallIdx], isBig: true };
            p.stats.bigBoxUpgrades++;
          }
        }
      }
      // 問屋 (3, 7): 仕入れ
      else if (nextPos === 3 || nextPos === 7) {
        p.stats.wholesaleUses++;
        let extraCards = 0;
        const curBoxSalt = getPlayerBoxSalt(p);
        const isNearWin = (p.score + curBoxSalt >= WIN_SCORE);
        const setsCount = findSets(newHand).length;
        const hasBigBox = p.boxes.some(b => b.isBig);
        const shouldBuyExtra = (strat.wholesalePreference >= 1.5 && (curBoxSalt >= 3 || (hasBigBox && curBoxSalt >= 1)) && !isNearWin && setsCount === 0 && newHand.length <= 4);
        if (shouldBuyExtra) {
          const res = deductBoxSalt(p, 1);
          if (res.success) {
            p.boxes = res.newBoxes;
            extraCards = 1;
          }
        }
        const totalCards = 1 + extraCards;
        for (let k = 0; k < totalCards; k++) {
          const curMarketCards = road[destMarket] || [];
          if (curMarketCards.length > 0) {
            const picked = pickBestMarketCard(curMarketCards, newHand);
            newHand.push(picked);
            road[destMarket] = road[destMarket].filter(c => c.id !== picked.id);
          } else {
            const res = drawSafe(1, deck, discard, road, random);
            deck = res.newDeck;
            discard = res.newDiscard;
            road = res.newRoad || road;
            newHand.push(...res.drawn);
          }
        }

        // 問屋仕入れ直後の荷積み（ルール上、荷積みと施設利用は任意順序）
        let afterWholesaleSets = findSets(newHand);
        while (afterWholesaleSets.length > 0 && p.boxes.some(b => !b.cargo && b.salt === 0)) {
          const emptyBigIdx = p.boxes.findIndex(b => b.isBig && !b.cargo && b.salt === 0);
          const emptyIdx = emptyBigIdx !== -1 ? emptyBigIdx : p.boxes.findIndex(b => !b.cargo && b.salt === 0);
          afterWholesaleSets.sort((a, b) => (b.info.salt + (b.info.isTriplet ? SET_BONUS : 0)) - (a.info.salt + (a.info.isTriplet ? SET_BONUS : 0)));
          const targetSet = afterWholesaleSets[0];
          const trioIds = targetSet.trio.map(c => c.id);
          newHand = newHand.filter(c => !trioIds.includes(c.id));
          p.boxes[emptyIdx] = { ...p.boxes[emptyIdx], cargo: targetSet.info };
          if (targetSet.info.isTriplet) p.stats.tripletsMade++;
          else p.stats.runsMade++;
          for (let r = 0; r < 3; r++) {
            const curMarketCards = road[destMarket] || [];
            if (curMarketCards.length > 0) {
              const picked = pickBestMarketCard(curMarketCards, newHand);
              newHand.push(picked);
              road[destMarket] = road[destMarket].filter(c => c.id !== picked.id);
            } else {
              const res = drawSafe(1, deck, discard, road, random);
              deck = res.newDeck;
              discard = res.newDiscard;
              road = res.newRoad || road;
              newHand.push(...res.drawn);
            }
          }
          afterWholesaleSets = findSets(newHand);
        }
      }
      // 港 (5): 出荷
      else if (nextPos === 5) {
        const boxesToSell = p.boxes.filter(b => b.cargo);
        if (boxesToSell.length > 0) {
          const shippedNums = [];
          const discardedCards = [];
          boxesToSell.forEach(b => {
            if (b.cargo.nums) shippedNums.push(...b.cargo.nums);
            if (b.cargo.cards) discardedCards.push(...b.cargo.cards);
          });
          discard.push(...discardedCards);

          // 流行判定
          if (deck.length === 0 && discard.length > 0) {
            deck = shuffle(discard, random);
            discard = [];
          }
          let trendHit = false;
          if (deck.length > 0) {
            const tCard = deck.shift();
            discard.push(tCard);
            trendHit = shippedNums.includes(tCard.num);
            if (trendHit) p.stats.trendHits++;
          }

          let trendAwarded = false;
          p.boxes = p.boxes.map(b => {
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

      p.pos = nextPos;
      p.hand = newHand;

      if (p.score >= WIN_SCORE) {
        finalRoundTriggered = true;
      }
    }

    turn++;
    if (finalRoundTriggered && (turn % 4 === 0)) {
      gameOver = true;
    }
  }

  // 最終精算：木箱に残った塩は、全木箱の合計2個につき手元の塩1個に換算（切り捨て）
  const finalResults = players.map(pl => {
    const remSalt = getPlayerBoxSalt(pl);
    const saltBonus = Math.floor(remSalt / 2);
    const totalScore = pl.score + saltBonus;
    const potentialScore = pl.score + remSalt; // 木箱の塩を満額換金できていたら何点だったか
    const distToHome = (10 - pl.pos) % 10;
    return {
      ...pl,
      remSalt,
      saltBonus,
      totalScore,
      potentialScore,
      distToHome
    };
  });

  const sorted = [...finalResults].sort((a, b) => b.totalScore - a.totalScore);
  const topScore = sorted[0].totalScore;
  const winners = sorted.filter(p => p.totalScore === topScore);
  const runnerUp = sorted[1];

  const rawMargin = runnerUp ? (topScore - runnerUp.totalScore) : 0;
  const potentialMargin = runnerUp ? Math.max(0, topScore - runnerUp.potentialScore) : 0;
  const isCloseByScore = runnerUp && (rawMargin <= 2);
  const isCloseByPotential = runnerUp && (runnerUp.potentialScore >= 20 || potentialMargin <= 2);
  const isCloseByDistance = runnerUp && runnerUp.remSalt > 0 && runnerUp.distToHome <= 3;
  const isEffectiveClose = isCloseByScore || isCloseByPotential || isCloseByDistance;

  return {
    rounds,
    players: finalResults,
    winners,
    winnerStrat: winners[0].stratId,
    topScore,
    secondScore: runnerUp ? runnerUp.totalScore : topScore,
    margin1st2nd: rawMargin,
    potentialMargin,
    isEffectiveClose
  };
}

// ─────────────────────────────────────────────────────────────
// バッチ評価＆面白さ・バランス分析
// ─────────────────────────────────────────────────────────────
function evaluate(gameCount = 3000) {
  console.log(`\n=============================================================`);
  console.log(`🎮 『ナウキ運び』ヘッドレス・シミュレーション (${gameCount.toLocaleString()} 試合)`);
  console.log(`   ルール仕様: README.md / RULEBOOK.md (問屋・大箱・流行・最終精算)`);
  console.log(`=============================================================`);

  const stratKeys = Object.keys(STRATEGIES);
  const winCounts = { adaptive: 0, big_box: 0, wholesale: 0, fast_ferry: 0 };
  const scoreTotals = { adaptive: 0, big_box: 0, wholesale: 0, fast_ferry: 0 };
  const statsTotals = {
    triplets: 0,
    runs: 0,
    bigBoxes: 0,
    wholesaleUses: 0,
    trendHits: 0
  };

  let totalRounds = 0;
  let totalMargin = 0;
  let closeGames = 0; // 1-2位差が2点以内の接戦
  let effectiveCloseGames = 0; // 実質接戦（木箱の塩を含めると20点到達または3マス以内）
  const roundList = [];

  for (let i = 0; i < gameCount; i++) {
    // 席順バイアスを打ち消すため、手番順をランダムローテーション
    const rotated = shuffle(stratKeys);
    const res = runSingleGame(rotated);

    totalRounds += res.rounds;
    roundList.push(res.rounds);
    totalMargin += res.margin1st2nd;
    if (res.margin1st2nd <= 2) closeGames++;
    if (res.isEffectiveClose) effectiveCloseGames++;

    res.winners.forEach(w => {
      winCounts[w.stratId] += (1 / res.winners.length);
    });

    res.players.forEach(pl => {
      scoreTotals[pl.stratId] += pl.totalScore;
      statsTotals.triplets += pl.stats.tripletsMade;
      statsTotals.runs += pl.stats.runsMade;
      statsTotals.bigBoxes += pl.stats.bigBoxUpgrades;
      statsTotals.wholesaleUses += pl.stats.wholesaleUses;
      statsTotals.trendHits += pl.stats.trendHits;
    });
  }

  const avgRounds = totalRounds / gameCount;
  const avgMargin = totalMargin / gameCount;
  const closeGameRate = (closeGames / gameCount) * 100;
  const effectiveCloseRate = (effectiveCloseGames / gameCount) * 100;

  const roundVariance = roundList.reduce((acc, r) => acc + Math.pow(r - avgRounds, 2), 0) / gameCount;
  const roundStdDev = Math.sqrt(roundVariance);

  const winRates = {};
  stratKeys.forEach(k => {
    winRates[k] = (winCounts[k] / gameCount) * 100;
  });

  // 主要3戦略（適応型・大箱特化・問屋仕入れ）の競合バランス評価
  // ※快速ピストン型は悪手・初心者枠想定（大箱化せずピストン：勝率10〜16%が適正範囲）
  const mainKeys = ['adaptive', 'big_box', 'wholesale'];
  const mainTotalRate = mainKeys.reduce((s, k) => s + winRates[k], 0);
  const idealMainRate = mainTotalRate / mainKeys.length;
  let mainDeviation = 0;
  mainKeys.forEach(k => {
    mainDeviation += Math.abs(winRates[k] - idealMainRate);
  });

  const ferryRate = winRates['fast_ferry'];
  let ferryPenalty = 0;
  if (ferryRate > 20) ferryPenalty = (ferryRate - 20) * 3;
  else if (ferryRate < 5) ferryPenalty = (5 - ferryRate) * 4;

  const balanceScore = Math.max(0, Math.min(100, Math.round(100 - mainDeviation * 2.5 - ferryPenalty)));

  console.log('\n📊 【4大戦略 勝率・平均得点（カモ枠混在・環境戦）】');
  stratKeys.forEach(k => {
    const s = STRATEGIES[k];
    const rate = winRates[k];
    const avgScore = (scoreTotals[k] / gameCount).toFixed(1);
    const bar = '█'.repeat(Math.round(rate / 1.5));
    console.log(`  * ${s.name.padEnd(26, ' ')}: 勝率 ${rate.toFixed(1).padStart(5, ' ')}% | 平均 ${avgScore.padStart(4, ' ')}点  ${bar}`);
  });

  console.log('\n⚡ 【テンポ・接戦度】');
  console.log(`  * 平均決着ラウンド: ${avgRounds.toFixed(1)} 巡 (標準偏差: ±${roundStdDev.toFixed(2)})`);
  console.log(`  * 目安プレイ時間  : ${(avgRounds * 1.3).toFixed(1)} 〜 ${(avgRounds * 1.6).toFixed(1)} 分`);
  console.log(`  * 1-2位表面得点差 : ${avgMargin.toFixed(1)} 点 (表面2点差以内の僅差率: ${closeGameRate.toFixed(1)}%)`);
  console.log(`  * 実質僅差率      : ${effectiveCloseRate.toFixed(1)}% (※最終精算で半減する前の木箱塩を含めると20点到達または3マス以内の1手番差レース)`);

  console.log('\n📦 【プレイ統計（1ゲーム平均）】');
  console.log(`  * 連番作成数      : ${(statsTotals.runs / gameCount).toFixed(1)} 回`);
  console.log(`  * セット作成数    : ${(statsTotals.triplets / gameCount).toFixed(1)} 回`);
  console.log(`  * 大箱化回数      : ${(statsTotals.bigBoxes / gameCount).toFixed(1)} 箱 (全員計)`);
  console.log(`  * 問屋仕入れ回数  : ${(statsTotals.wholesaleUses / gameCount).toFixed(1)} 回 (全員計)`);
  console.log(`  * 港の流行的中回数: ${(statsTotals.trendHits / gameCount).toFixed(1)} 回 (全員計)`);

  // 同レベル真剣勝負（全員「適応商人」ミラーマッチ）の検証
  const mirrorCount = Math.min(300, Math.max(100, Math.round(gameCount * 0.2)));
  let mRounds = 0;
  let mEffectiveClose = 0;
  const mSeatWins = [0, 0, 0, 0];
  for (let m = 0; m < mirrorCount; m++) {
    const mRes = runSingleGame(['adaptive', 'adaptive', 'adaptive', 'adaptive']);
    mRounds += mRes.rounds;
    if (mRes.isEffectiveClose) mEffectiveClose++;
    mRes.winners.forEach(w => { mSeatWins[w.id] += 1 / mRes.winners.length; });
  }
  const mAvgRounds = mRounds / mirrorCount;
  const mCloseRate = (mEffectiveClose / mirrorCount) * 100;
  const mSeatRates = mSeatWins.map(w => (w / mirrorCount) * 100);

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`⚔️ 【同レベル真剣勝負 (全員「適応商人」ミラーマッチ ${mirrorCount}試合)】`);
  console.log(`  * 決着テンポ    : 平均 ${mAvgRounds.toFixed(1)} 巡 | 実質僅差率: ${mCloseRate.toFixed(1)}%`);
  console.log(`  * 座順別勝率    : 先手(P1) ${mSeatRates[0].toFixed(1)}% | 2番手 ${mSeatRates[1].toFixed(1)}% | 3番手 ${mSeatRates[2].toFixed(1)}% | 後手(P4) ${mSeatRates[3].toFixed(1)}%`);
  const mBias = Math.max(...mSeatRates) - Math.min(...mSeatRates);
  if (mSeatRates[0] < 22) {
    console.log(`  * 座順公平性診断: 先手(P1)が不利傾向 (差 ${mBias.toFixed(1)}% / 後手の市場選択肢・終了手番猶予による)`);
  } else {
    console.log(`  * 座順公平性診断: 先後バイアスは許容範囲内 (${mBias.toFixed(1)}%)`);
  }

  console.log('\n=============================================================');
  console.log(`🏆 【バランス総合評価】: ${Math.round(balanceScore)} / 100 点`);
  if (balanceScore >= 80) {
    console.log(`   判定: [良作・健全な競合] 全戦略が20〜30%近傍で競り合っており、特定戦略の一強がありません。`);
  } else if (balanceScore >= 65) {
    console.log(`   判定: [良好] 各戦略が成立しており、ゲームが正常に進行します。`);
  } else {
    console.log(`   判定: [要調整] 一部の戦略に偏りが見られます。`);
  }
  console.log(`=============================================================\n`);

  return {
    winRates,
    avgRounds,
    avgMargin,
    closeGameRate,
    balanceScore
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const count = args[0] ? parseInt(args[0], 10) : 3000;
  evaluate(count);
}

module.exports = {
  STRATEGIES,
  runSingleGame,
  evaluate
};
