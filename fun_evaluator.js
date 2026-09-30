/**
 * 『ナウキ運び』面白さ8軸評価システム (Enhanced Fun Evaluator)
 * ─────────────────────────────────────────────────────
 * README.md / RULEBOOK.md の公式仕様に完全準拠したヘッドレス評価エンジン。
 *
 * 【8軸評価】
 *  1. 🔥 接戦度 (Closeness)        — 1-2位差、逆転率、同時リーチ率
 *  2. ⚖️ 戦略多様性 (Diversity)    — 勝率ジニ係数、全戦略の実効性
 *  3. ⚡ テンポ (Pacing)           — 決着ラウンド分布、安定性
 *  4. 📦 成長・達成感 (Growth)     — 大箱化率、荷積み達成率
 *  5. 🧠 悩ましさ (Dilemma)        — 手番あたりの有効選択肢数、次善手との差
 *  6. 📈 ドラマ性 (Drama)          — リードチェンジ回数、終盤の逆転劇
 *  7. 🤝 相互作用 (Interaction)    — 市場カード争奪、経路競合
 *  8. 🎯 公平性 (Fairness)         — 手番順（座順）バイアスの少なさ
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

function getMarketIndex(pos) {
  if (pos === 0) return 0;
  if (pos === 1 || pos === 9) return 1;
  if (pos === 2 || pos === 8) return 2;
  if (pos === 3 || pos === 7) return 3;
  if (pos === 4 || pos === 6) return 4;
  if (pos === 5) return 5;
  return 0;
}

function createSeededRandom(seed) {
  let value = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
        if (recycled.length > 0) d = shuffle(recycled, random);
        else break;
      } else break;
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
  const seen = new Set();
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio);
        if (r) {
          const pk = `${r.name}:${r.salt}`;
          if (!seen.has(pk)) {
            seen.add(pk);
            list.push({ trio, info: r });
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
        score += 30;
      } else if (diff === 1) {
        score += 24;
      } else if (diff === 2) {
        score += 12;
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
    const rem = hand.filter((_, i) => i !== idx);
    const ns = findSets(rem);
    const nv = ns.length > 0 ? Math.max(...ns.map(s => s.info.salt + (s.info.isTriplet ? SET_BONUS : 0))) : 0;
    const loss = (currentBestValue - nv) * 100;
    const potential = evalCardPotential(card, rem);
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

// ── 4大戦略 ──────────────────────────────────────
const STRATEGIES = {
  adaptive: {
    name: '適応商人 (Adaptive)',
    upgradePreference: 1.0,
    wholesalePreference: 1.0
  },
  bigBox: {
    name: '大箱特化 (Big Box)',
    upgradePreference: 2.2,
    wholesalePreference: 0.5
  },
  wholesale: {
    name: '問屋仕入れ (Wholesale)',
    upgradePreference: 0.8,
    wholesalePreference: 1.8
  },
  fastFerry: {
    name: '快速ピストン (Fast Ferry)',
    upgradePreference: 0.0,
    wholesalePreference: 0.0
  }
};

// ── トラッキング付きマッチシミュレーション ──────
function runTrackedMatch(stratKeys = ['adaptive', 'bigBox', 'wholesale', 'fastFerry'], random = Math.random, options = {}) {
  let deck = createDeck(random);
  let discard = [];
  let road = Array(6).fill(null).map(() => [deck.shift()]);

  const players = stratKeys.map((k, i) => ({
    id: i,
    stratKey: k,
    strat: STRATEGIES[k],
    pos: 0,
    hand: deck.splice(0, HAND_LIMIT),
    boxes: [
      { isBig: false, cargo: null, salt: 2 },
      { isBig: false, cargo: null, salt: 0 }
    ],
    score: 0
  }));

  const tracking = {
    scoreHistory: players.map(() => [0]),
    leadChanges: 0,
    lastLeader: -1,
    dilemmaEvents: 0,
    viableOptionsCount: 0,
    decisionTurns: 0,
    cardContention: 0,
    pathCollisions: 0,
    setsFormed: players.map(() => 0),
    portVisits: players.map(() => 0),
    homeVisits: players.map(() => 0),
    bigBoxUpgrades: players.map(() => 0),
    wholesaleUses: players.map(() => 0),
    trendHits: players.map(() => 0)
  };

  let turn = 0;
  let rounds = 0;
  let finalRoundTriggered = false;
  let gameOver = false;
  const maxRounds = 80;

  while (!gameOver && rounds < maxRounds) {
    const pIdx = turn % 4;
    if (pIdx === 0) rounds++;
    const p = players[pIdx];
    const strat = p.strat;
    const botSalt = getPlayerBoxSalt(p);
    const hList = p.hand;

    if (hList.length > 0) {
      tracking.decisionTurns++;
      const priorities = getCardPriorities(hList);
      let bestMoveIdx = 0;
      let bestScore = -99999;
      let secondBestScore = -99999;

      const loadedBoxes = p.boxes.filter(b => b.cargo).length;
      const smallBoxes = p.boxes.filter(b => !b.isBig).length;

      hList.forEach((c, idx) => {
        const nextPos = (p.pos + c.num) % 10;
        const pInfo = priorities.find(item => item.idx === idx);
        const loss = pInfo ? pInfo.loss : 50;
        let score = 100 - loss;

        // 競合・相互作用の検出
        const othersAtNext = players.filter(pl => pl.id !== p.id && pl.pos === nextPos).length;
        if (othersAtNext > 0) tracking.pathCollisions += othersAtNext;

        if (nextPos === 0) {
          if (botSalt > 0) {
            score += 550 + botSalt * 90;
            if (p.stratKey === 'fastFerry') score += 350;
            if (p.score + botSalt >= WIN_SCORE) score += 50000;
          } else score -= 100;
        } else if (nextPos === 5) {
          if (loadedBoxes > 0) {
            score += 650 + loadedBoxes * 350;
            if (p.stratKey === 'fastFerry') {
              score += 400;
            } else if (loadedBoxes === 2) {
              score += 300;
            } else if (loadedBoxes === 1 && p.stratKey === 'adaptive') {
              // バランス型: 手札にリーチがあるなら問屋経由で2箱目を狙う、バラバラなら即出荷
              const hasPair = hasReadyPair(hList);
              const opponentUrgent = players.some(pl => pl.id !== p.id && (pl.score + getPlayerBoxSalt(pl) >= 16));
              if (opponentUrgent || !hasPair) score += 200; // レース切迫または手札悪なら急ぎ出荷
              else score -= 150; // もう1箱待つ余裕がある
            }
          } else score -= 180;
        } else if (nextPos === 2 || nextPos === 8) {
          const isNearWin = (p.score + botSalt >= WIN_SCORE);
          const alreadyHasBig = p.boxes.some(b => b.isBig);
          const isLateGame = (p.score + botSalt >= 14 && alreadyHasBig);
          if (botSalt >= BIG_BOX_COST && smallBoxes > 0 && !isNearWin && !isLateGame && strat.upgradePreference > 0) {
            score += 450 * strat.upgradePreference;
          }
        } else if (nextPos === 3 || nextPos === 7) {
          const setsCount = findSets(hList).length;
          const needCards = (hList.length < 5 || (setsCount < 2 && loadedBoxes < 2));
          if (loadedBoxes === 2) score += 50;
          else {
            let pref = strat.wholesalePreference;
            if (p.stratKey === 'adaptive' && loadedBoxes === 1) {
              if (hasReadyPair(hList)) pref *= 1.4; // 1箱積載時、手札にペアがあれば問屋の価値上昇
            }
            score += (needCards ? 380 : 180) * pref;
          }
        }

        if (p.stratKey === 'fastFerry') {
          score += c.num * 15;
        }

        const mIdx = getMarketIndex(nextPos);
        const mCards = road[mIdx] || [];
        score += mCards.length * 25;

        if (score > bestScore) {
          secondBestScore = bestScore;
          bestScore = score;
          bestMoveIdx = idx;
        } else if (score > secondBestScore) {
          secondBestScore = score;
        }
      });

      // 悩ましさの測定（最善手と次善手が接近している場合）
      if (hList.length >= 2 && Math.abs(bestScore - secondBestScore) < 40) {
        tracking.dilemmaEvents++;
      }
      tracking.viableOptionsCount += hList.length;

      const moveCard = hList[bestMoveIdx];
      const oldPos = p.pos;
      const nextPos = (oldPos + moveCard.num) % 10;
      const passedHome = (oldPos + moveCard.num >= 10);

      let newHand = hList.filter((_, idx) => idx !== bestMoveIdx);
      const originMarket = getMarketIndex(oldPos);
      road[originMarket].push(moveCard);

      // Step 1: 補充
      const destMarket = getMarketIndex(nextPos);
      const mCards = road[destMarket] || [];
      if (mCards.length > 0) {
        const picked = pickBestMarketCard(mCards, newHand);
        newHand.push(picked);
        road[destMarket] = road[destMarket].filter(c => c.id !== picked.id);
        tracking.cardContention++;
      } else {
        const res = drawSafe(1, deck, discard, road, random);
        deck = res.newDeck;
        discard = res.newDiscard;
        road = res.newRoad || road;
        newHand.push(...res.drawn);
      }

      // Step 1: 地元通過手札整理
      if (passedHome && newHand.length > 5) {
        const excess = newHand.length - 5;
        const pri = getCardPriorities(newHand);
        const discardIds = pri.slice(0, excess).map(item => item.card.id);
        const discarded = newHand.filter(c => discardIds.includes(c.id));
        newHand = newHand.filter(c => !discardIds.includes(c.id));
        discard.push(...discarded);
      }

      // Step 2: 荷積み
      let setsInHand = findSets(newHand);
      while (setsInHand.length > 0 && p.boxes.some(b => !b.cargo && b.salt === 0)) {
        const emptyBigIdx = p.boxes.findIndex(b => b.isBig && !b.cargo && b.salt === 0);
        const emptyIdx = emptyBigIdx !== -1 ? emptyBigIdx : p.boxes.findIndex(b => !b.cargo && b.salt === 0);

        setsInHand.sort((a, b) => (b.info.salt + (b.info.isTriplet ? SET_BONUS : 0)) - (a.info.salt + (a.info.isTriplet ? SET_BONUS : 0)));
        const targetSet = setsInHand[0];
        const trioIds = targetSet.trio.map(c => c.id);
        newHand = newHand.filter(c => !trioIds.includes(c.id));
        p.boxes[emptyIdx] = { ...p.boxes[emptyIdx], cargo: targetSet.info };
        tracking.setsFormed[p.id]++;

        // 3枚補充
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

      // Step 2: 施設利用
      if (nextPos === 0) {
        tracking.homeVisits[p.id]++;
        const s = getPlayerBoxSalt(p);
        if (s > 0) {
          p.score += s;
          p.boxes = p.boxes.map(b => ({ ...b, salt: 0 }));
        }
      } else if (nextPos === 2 || nextPos === 8) {
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
            tracking.bigBoxUpgrades[p.id]++;
          }
        }
      } else if (nextPos === 3 || nextPos === 7) {
        tracking.wholesaleUses[p.id]++;
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

        // 問屋で仕入れた直後の荷積み判定（ルール上、荷積みと施設利用は任意順序）
        let afterWholesaleSets = findSets(newHand);
        while (afterWholesaleSets.length > 0 && p.boxes.some(b => !b.cargo && b.salt === 0)) {
          const emptyBigIdx = p.boxes.findIndex(b => b.isBig && !b.cargo && b.salt === 0);
          const emptyIdx = emptyBigIdx !== -1 ? emptyBigIdx : p.boxes.findIndex(b => !b.cargo && b.salt === 0);
          afterWholesaleSets.sort((a, b) => (b.info.salt + (b.info.isTriplet ? SET_BONUS : 0)) - (a.info.salt + (a.info.isTriplet ? SET_BONUS : 0)));
          const targetSet = afterWholesaleSets[0];
          const trioIds = targetSet.trio.map(c => c.id);
          newHand = newHand.filter(c => !trioIds.includes(c.id));
          p.boxes[emptyIdx] = { ...p.boxes[emptyIdx], cargo: targetSet.info };
          tracking.setsFormed[p.id]++;
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
      } else if (nextPos === 5) {
        tracking.portVisits[p.id]++;
        const boxesToSell = p.boxes.filter(b => b.cargo);
        if (boxesToSell.length > 0) {
          const shippedNums = [];
          const discardedCards = [];
          boxesToSell.forEach(b => {
            if (b.cargo.nums) shippedNums.push(...b.cargo.nums);
            if (b.cargo.cards) discardedCards.push(...b.cargo.cards);
          });
          discard.push(...discardedCards);

          if (deck.length === 0 && discard.length > 0) {
            deck = shuffle(discard, random);
            discard = [];
          }
          let trendHit = false;
          if (deck.length > 0) {
            const tCard = deck.shift();
            discard.push(tCard);
            trendHit = shippedNums.includes(tCard.num);
            if (trendHit) tracking.trendHits[p.id]++;
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

      if (p.score >= WIN_SCORE) finalRoundTriggered = true;
    }

    // スコア推移とリーダーチェンジのトラッキング
    players.forEach(pl => tracking.scoreHistory[pl.id].push(pl.score));
    const currentScores = players.map(pl => pl.score);
    const maxScore = Math.max(...currentScores);
    const currentLeader = currentScores.indexOf(maxScore);
    if (tracking.lastLeader !== -1 && currentLeader !== tracking.lastLeader && maxScore > 0) {
      tracking.leadChanges++;
    }
    tracking.lastLeader = currentLeader;

    turn++;
    if (options.suddenDeath && finalRoundTriggered) {
      gameOver = true;
    } else if (finalRoundTriggered && (turn % 4 === 0)) {
      gameOver = true;
    }
  }

  // 最終精算
  const finalResults = players.map(pl => {
    const remSalt = getPlayerBoxSalt(pl);
    const saltBonus = Math.floor(remSalt / 2);
    const totalScore = pl.score + saltBonus;
    const potentialScore = pl.score + remSalt; // 木箱の塩を満額換金できていたら何点だったか
    const distToHome = (10 - pl.pos) % 10;
    return { ...pl, remSalt, saltBonus, totalScore, potentialScore, distToHome };
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
    winnerStrat: winners[0].stratKey,
    topScore,
    margin1st2nd: rawMargin,
    potentialMargin,
    isEffectiveClose,
    tracking
  };
}

// ── 8軸評価計算 ──────────────────────────────────
function evaluateAll(gameCount = 3000, options = {}) {
  const { seed, silent } = options;
  const random = seed ? createSeededRandom(seed) : Math.random;
  const startTime = Date.now();

  const originalLog = console.log;
  if (silent) console.log = () => {};

  const stratKeys = Object.keys(STRATEGIES);
  const winCounts = { adaptive: 0, bigBox: 0, wholesale: 0, fastFerry: 0 };
  const seatWins = [0, 0, 0, 0];

  let totalRounds = 0;
  let totalMargin = 0;
  let totalPotentialMargin = 0;
  let totalLeadChanges = 0;
  let totalDilemmas = 0;
  let totalViableOptions = 0;
  let totalDecisionTurns = 0;
  let totalCardContention = 0;
  let totalPathCollisions = 0;
  let totalBigBoxes = 0;
  let totalSetsFormed = 0;
  let totalPortVisits = 0;
  let totalHomeVisits = 0;
  let totalTrendHits = 0;

  let comebackWins = 0;
  let closeMatches = 0;
  let effectiveCloseMatches = 0;
  const roundList = [];

  for (let i = 0; i < gameCount; i++) {
    // 席順を均等にローテーション
    const seatStrats = stratKeys.map((_, idx) => stratKeys[(idx + i) % stratKeys.length]);
    const res = runTrackedMatch(seatStrats, random);

    totalRounds += res.rounds;
    roundList.push(res.rounds);
    totalMargin += res.margin1st2nd;
    totalPotentialMargin += res.potentialMargin;
    if (res.margin1st2nd <= 2) closeMatches++;
    if (res.isEffectiveClose) effectiveCloseMatches++;

    res.winners.forEach(w => {
      winCounts[w.stratKey] += 1 / res.winners.length;
      seatWins[w.id] += 1 / res.winners.length;
    });

    const tr = res.tracking;
    totalLeadChanges += tr.leadChanges;
    totalDilemmas += tr.dilemmaEvents;
    totalViableOptions += tr.viableOptionsCount;
    totalDecisionTurns += tr.decisionTurns;
    totalCardContention += tr.cardContention;
    totalPathCollisions += tr.pathCollisions;

    res.players.forEach(pl => {
      totalBigBoxes += tr.bigBoxUpgrades[pl.id];
      totalSetsFormed += tr.setsFormed[pl.id];
      totalPortVisits += tr.portVisits[pl.id];
      totalHomeVisits += tr.homeVisits[pl.id];
      totalTrendHits += tr.trendHits[pl.id];
    });

    // 逆転勝利の判定（前半でトップでなかったプレイヤーの勝利）
    const midIdx = Math.floor(tr.scoreHistory[0].length / 2);
    if (midIdx > 0) {
      const midScores = res.players.map(pl => tr.scoreHistory[pl.id][midIdx] || 0);
      const midLeader = midScores.indexOf(Math.max(...midScores));
      if (!res.winners.some(w => w.id === midLeader)) comebackWins++;
    }
  }

  const avgRounds = totalRounds / gameCount;
  const avgMargin = totalMargin / gameCount;
  const avgPotentialMargin = totalPotentialMargin / gameCount;
  const comebackRate = (comebackWins / gameCount) * 100;
  const closeMatchRate = (closeMatches / gameCount) * 100;
  const effectiveCloseRate = (effectiveCloseMatches / gameCount) * 100;

  const roundVariance = roundList.reduce((acc, r) => acc + Math.pow(r - avgRounds, 2), 0) / gameCount;
  const roundStdDev = Math.sqrt(roundVariance);

  const winRates = {};
  stratKeys.forEach(k => {
    winRates[k] = (winCounts[k] / gameCount) * 100;
  });

  const seatWinRates = seatWins.map(w => (w / gameCount) * 100);
  const seatBias = Math.max(...seatWinRates) - Math.min(...seatWinRates);

  // ジニ係数
  const rates = Object.values(winRates).map(r => r / 100);
  let giniNumerator = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      giniNumerator += Math.abs(rates[i] - rates[j]);
    }
  }
  const gini = giniNumerator / (2 * 4 * 1.0);

  // ── 8軸スコアリング (各12.5点 = 100点満点) ──────
  // 1. 接戦度 (Closeness)
  // ※最終精算の半減ルールにより表面点差は見かけ上開くため、実質僅差率（1手番差で20点到達）を重視
  let scoreCloseness = 0;
  if (avgPotentialMargin <= 3.5) scoreCloseness += 5.0;
  else if (avgPotentialMargin <= 5.5) scoreCloseness += 4.0;
  else if (avgPotentialMargin <= 7.5) scoreCloseness += 2.5;
  else scoreCloseness += 1.0;

  if (effectiveCloseRate >= 35) scoreCloseness += 4.5;
  else if (effectiveCloseRate >= 25) scoreCloseness += 3.5;
  else if (effectiveCloseRate >= 15) scoreCloseness += 2.0;
  else scoreCloseness += 1.0;

  if (comebackRate >= 35 && comebackRate <= 75) scoreCloseness += 3.0;
  else if (comebackRate >= 20) scoreCloseness += 2.0;
  else scoreCloseness += 1.0;

  // 2. 戦略多様性 (Diversity)
  let scoreDiversity = 12.5;
  if (gini <= 0.10) scoreDiversity = 12.5;
  else if (gini <= 0.15) scoreDiversity = 10.5;
  else if (gini <= 0.22) scoreDiversity = 8.0;
  else scoreDiversity = Math.max(2.0, 12.5 - (gini - 0.22) * 40);

  // 3. テンポ (Pacing)
  let scorePacing = 0;
  if (avgRounds >= 11 && avgRounds <= 16) scorePacing += 7.5;
  else if (avgRounds >= 9 && avgRounds <= 20) scorePacing += 5.5;
  else scorePacing += 3.0;
  if (roundStdDev <= 2.8) scorePacing += 5.0;
  else if (roundStdDev <= 3.8) scorePacing += 3.5;
  else scorePacing += 2.0;

  // 4. 成長・達成感 (Growth) - 4人全員計での適正水準
  const avgBigBoxesPerGame = totalBigBoxes / gameCount;
  const avgSetsPerGame = totalSetsFormed / gameCount;
  let scoreGrowth = 0;
  if (avgBigBoxesPerGame >= 3.5) scoreGrowth += 6.5;
  else if (avgBigBoxesPerGame >= 2.5) scoreGrowth += 5.0;
  else if (avgBigBoxesPerGame >= 1.5) scoreGrowth += 3.5;
  else scoreGrowth += 2.0;

  if (avgSetsPerGame >= 9.5) scoreGrowth += 6.0;
  else if (avgSetsPerGame >= 7.0) scoreGrowth += 4.5;
  else if (avgSetsPerGame >= 4.0) scoreGrowth += 3.0;
  else scoreGrowth += 1.5;

  // 5. 悩ましさ (Dilemma) - 48手番中での実効選択肢・ジレンマ数
  const avgDilemmas = totalDilemmas / gameCount;
  const avgOptions = totalDecisionTurns > 0 ? (totalViableOptions / totalDecisionTurns) : 0;
  let scoreDilemma = 0;
  if (avgDilemmas >= 22.0) scoreDilemma += 6.5;
  else if (avgDilemmas >= 14.0) scoreDilemma += 5.0;
  else if (avgDilemmas >= 8.0) scoreDilemma += 3.5;
  else scoreDilemma += 2.0;

  if (avgOptions >= 4.5) scoreDilemma += 6.0;
  else if (avgOptions >= 3.5) scoreDilemma += 4.5;
  else if (avgOptions >= 2.5) scoreDilemma += 3.0;
  else scoreDilemma += 1.5;

  // 6. ドラマ性 (Drama)
  const avgLeadChanges = totalLeadChanges / gameCount;
  let scoreDrama = 0;
  if (avgLeadChanges >= 3.5) scoreDrama += 6.5;
  else if (avgLeadChanges >= 2.5) scoreDrama += 5.0;
  else if (avgLeadChanges >= 1.5) scoreDrama += 3.0;
  else scoreDrama += 1.5;

  if (comebackRate >= 45) scoreDrama += 6.0;
  else if (comebackRate >= 30) scoreDrama += 4.5;
  else if (comebackRate >= 15) scoreDrama += 3.0;
  else scoreDrama += 1.5;

  // 7. 相互作用 (Interaction) - 周回レースにおける実際の競合・交錯水準
  const avgCardContention = totalCardContention / gameCount;
  const avgCollisions = totalPathCollisions / gameCount;
  let scoreInteraction = 0;
  if (avgCardContention >= 30.0) scoreInteraction += 6.5;
  else if (avgCardContention >= 18.0) scoreInteraction += 5.0;
  else if (avgCardContention >= 10.0) scoreInteraction += 3.5;
  else scoreInteraction += 2.0;

  if (avgCollisions >= 60.0) scoreInteraction += 6.0;
  else if (avgCollisions >= 35.0) scoreInteraction += 4.5;
  else if (avgCollisions >= 15.0) scoreInteraction += 3.0;
  else scoreInteraction += 1.5;

  // 8. 公平性 (Fairness)
  let scoreFairness = 0;
  if (seatBias <= 4.0) scoreFairness = 12.5;
  else if (seatBias <= 8.0) scoreFairness = 10.5;
  else if (seatBias <= 12.0) scoreFairness = 8.0;
  else scoreFairness = Math.max(2.0, 12.5 - (seatBias - 12.0) * 0.8);

  const totalFunScore = Math.round(
    scoreCloseness + scoreDiversity + scorePacing + scoreGrowth +
    scoreDilemma + scoreDrama + scoreInteraction + scoreFairness
  );

  let grade = 'C';
  if (totalFunScore >= 88) grade = 'S (神ゲー領域)';
  else if (totalFunScore >= 78) grade = 'A (極めて高評価・良作)';
  else if (totalFunScore >= 68) grade = 'B (良好・バランス成立)';

  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`\n═══════════════════════════════════════════════════════════════════════`);
  console.log(`  🎮 『ナウキ運び』面白さ8軸評価レポート (${gameCount.toLocaleString()} 試合 / ${elapsed.toFixed(2)}s)`);
  console.log(`  🏆 【総合面白さスコア】: ${totalFunScore} / 100 点  [ ランク: ${grade} ]`);
  console.log(`═══════════════════════════════════════════════════════════════════════\n`);

  // ── 同レベル真剣勝負（全員適応商人 Mirror Match）のサブ検証 ──────
  const mirrorCount = Math.min(300, Math.max(100, Math.round(gameCount * 0.2)));
  let mRounds = 0;
  let mEffectiveClose = 0;
  const mSeatWins = [0, 0, 0, 0];
  for (let m = 0; m < mirrorCount; m++) {
    const mRes = runTrackedMatch(['adaptive', 'adaptive', 'adaptive', 'adaptive'], random);
    mRounds += mRes.rounds;
    if (mRes.isEffectiveClose) mEffectiveClose++;
    mRes.winners.forEach(w => { mSeatWins[w.id] += 1 / mRes.winners.length; });
  }
  const mAvgRounds = mRounds / mirrorCount;
  const mCloseRate = (mEffectiveClose / mirrorCount) * 100;
  const mSeatRates = mSeatWins.map(w => (w / mirrorCount) * 100);

  const bar = val => '█'.repeat(Math.round(val * 1.6)).padEnd(20, '░');

  console.log(`  1. 🔥 接戦度     : ${scoreCloseness.toFixed(1).padStart(4)} / 12.5  ${bar(scoreCloseness)} (表面点差: ${avgMargin.toFixed(1)}点 / 実質僅差率: ${effectiveCloseRate.toFixed(1)}% [1手番差圏内])`);
  console.log(`  2. ⚖️ 戦略多様性 : ${scoreDiversity.toFixed(1).padStart(4)} / 12.5  ${bar(scoreDiversity)} (ジニ係数: ${gini.toFixed(3)})`);
  console.log(`  3. ⚡ テンポ     : ${scorePacing.toFixed(1).padStart(4)} / 12.5  ${bar(scorePacing)} (平均: ${avgRounds.toFixed(1)}巡 / 偏差: ±${roundStdDev.toFixed(2)})`);
  console.log(`  4. 📦 成長感     : ${scoreGrowth.toFixed(1).padStart(4)} / 12.5  ${bar(scoreGrowth)} (大箱化: ${(totalBigBoxes / gameCount).toFixed(1)}箱 / 役完成: ${(totalSetsFormed / gameCount).toFixed(1)}組)`);
  console.log(`  5. 🧠 悩ましさ   : ${scoreDilemma.toFixed(1).padStart(4)} / 12.5  ${bar(scoreDilemma)} (選択肢平均: ${avgOptions.toFixed(1)}手 / ジレンマ手番: ${avgDilemmas.toFixed(1)}回)`);
  console.log(`  6. 📈 ドラマ性   : ${scoreDrama.toFixed(1).padStart(4)} / 12.5  ${bar(scoreDrama)} (逆転率: ${comebackRate.toFixed(1)}% / 首位交代: ${avgLeadChanges.toFixed(1)}回)`);
  console.log(`  7. 🤝 相互作用   : ${scoreInteraction.toFixed(1).padStart(4)} / 12.5  ${bar(scoreInteraction)} (市場争奪: ${avgCardContention.toFixed(1)}回 / マス交錯: ${avgCollisions.toFixed(1)}回)`);
  console.log(`  8. 🎯 公平性     : ${scoreFairness.toFixed(1).padStart(4)} / 12.5  ${bar(scoreFairness)} (座順バイアス: ${seatBias.toFixed(1)}%)`);

  console.log(`\n───────────────────────────────────────────────────────────────────────`);
  console.log(`  📊 【4大戦略 勝率分布（カモ枠混在・環境戦）】`);
  stratKeys.forEach(k => {
    const rate = winRates[k];
    console.log(`    * ${STRATEGIES[k].name.padEnd(26)}: ${rate.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(rate / 1.5))}`);
  });

  console.log(`\n  📍 【座順別 勝率】`);
  seatWinRates.forEach((rate, i) => {
    console.log(`    P${i + 1} (${i === 0 ? '先手' : i === 3 ? '後手' : `${i + 1}番手`}): ${rate.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(rate / 1.5))}`);
  });

  console.log(`\n───────────────────────────────────────────────────────────────────────`);
  console.log(`  ⚔️ 【同レベル真剣勝負 (全員「適応商人」ミラーマッチ ${mirrorCount}試合)】`);
  console.log(`    * 平均決着テンポ: ${mAvgRounds.toFixed(1)}巡 | 実質僅差率: ${mCloseRate.toFixed(1)}% (1手番差で20点到達目前レース)`);
  console.log(`    * 先手後手勝率  : P1(先手) ${mSeatRates[0].toFixed(1)}% | P2 ${mSeatRates[1].toFixed(1)}% | P3 ${mSeatRates[2].toFixed(1)}% | P4(後手) ${mSeatRates[3].toFixed(1)}%`);
  const mBias = Math.max(...mSeatRates) - Math.min(...mSeatRates);
  if (mSeatRates[0] < 22) {
    console.log(`    * 構造的課題診断: 先手(P1)が不利傾向 (座順差 ${mBias.toFixed(1)}% / 後手の市場選択肢・終了手番猶予の恩恵)`);
  } else {
    console.log(`    * 構造的課題診断: 先後バイアスは許容範囲内 (${mBias.toFixed(1)}%)`);
  }
  console.log(`═══════════════════════════════════════════════════════════════════════\n`);

  if (silent) console.log = originalLog;

  const axes = [
    { label: '接戦度', score: scoreCloseness, detail: `実質僅差率: ${effectiveCloseRate.toFixed(1)}% (表面点差: ${avgMargin.toFixed(1)}点)` },
    { label: '戦略多様性', score: scoreDiversity, detail: `ジニ係数: ${gini.toFixed(3)}` },
    { label: 'テンポ', score: scorePacing, detail: `平均: ${avgRounds.toFixed(1)}巡 / 偏差: ±${roundStdDev.toFixed(2)}` },
    { label: '成長感', score: scoreGrowth, detail: `大箱化: ${(totalBigBoxes / gameCount).toFixed(1)}箱 / 役完成: ${(totalSetsFormed / gameCount).toFixed(1)}組` },
    { label: '悩ましさ', score: scoreDilemma, detail: `選択肢平均: ${avgOptions.toFixed(1)}手 / ジレンマ手番: ${avgDilemmas.toFixed(1)}回` },
    { label: 'ドラマ性', score: scoreDrama, detail: `逆転率: ${comebackRate.toFixed(1)}% / 首位交代: ${avgLeadChanges.toFixed(1)}回` },
    { label: '相互作用', score: scoreInteraction, detail: `市場争奪: ${avgCardContention.toFixed(1)}回 / マス交錯: ${avgCollisions.toFixed(1)}回` },
    { label: '公平性', score: scoreFairness, detail: `座順バイアス: ${seatBias.toFixed(1)}%` }
  ];

  return {
    totalFunScore,
    grade,
    axes,
    winRates,
    seatWinRates,
    avgRounds,
    roundStdDev,
    gini,
    avgMargin,
    comebackRate,
    seatBias,
    elapsed,
    gameCount
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    CARD_TEMPLATES,
    STRATEGIES,
    createDeck,
    evalSet,
    findSets,
    runTrackedMatch,
    evaluateAll,
    createSeededRandom
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
  };
  const count = Number(getArg('--games', '3000'));
  const seed = getArg('--seed', undefined);
  evaluateAll(count, { seed });
}
