/* 東坡穿越記・黃州一〇八二 —— 主程式（純前端，無後端、無 AI） */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const LS_KEY = "dongpo1082_v1";

  /* ---------- 工具 ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  /* ---------- 存檔 ---------- */
  function defaultState() {
    return {
      node: null, logStart: 0, snap: null, lastEnding: null,
      bond: 0, joy: 0, flags: {}, log: [],
      seals: {}, endings: {}, kitchen: false, kitchenSeen: false,
      chatCount: 0, spoilers: [], speed: 1,
      kBest: null, qBest: null, fortuneDay: null, fortuneIdx: null
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* 無痕模式等情況 */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ }
  }
  let S = load();

  /* ---------- Toast / Modal ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }
  function modal(title, bodyNodes, buttons) {
    return new Promise((resolve) => {
      const m = $("#modal"), c = $("#modalCard");
      c.innerHTML = "";
      c.appendChild(el("h3", null, title));
      (Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes]).forEach((n) =>
        c.appendChild(typeof n === "string" ? el("p", null, n) : n));
      const row = el("div", "row");
      buttons.forEach((b) => {
        const btn = el("button", "btn " + (b.cls || "ghost"), b.t);
        btn.onclick = () => { m.hidden = true; resolve(b.v); };
        row.appendChild(btn);
      });
      c.appendChild(row);
      m.hidden = false;
    });
  }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").hidden = true; });

  /* ---------- 印章 ---------- */
  function grantSeal(id) {
    if (S.seals[id]) return;
    S.seals[id] = true;
    save();
    const s = SEALS.find((x) => x.id === id);
    if (s) toast("🔴 獲得印章「" + s.name + "」");
    renderBag();
  }

  /* =========================================================
     對話引擎
     ========================================================= */
  const logEl = $("#log");
  const choicesEl = $("#choices");
  let playToken = 0;
  let skipWait = null;

  function scrollDown() { logEl.scrollTop = logEl.scrollHeight; }

  function renderMsg(m) {
    let node;
    if (m.w === "su") {
      node = el("div", "msg su");
      node.appendChild(el("span", "avatar", "軾"));
      const b = el("div", "bubble");
      if (m.kw) b.appendChild(el("span", "tag kw", "關鍵字應答"));
      const tagCls = m.tag === "史" ? "shi" : "chuang";
      b.appendChild(el("span", "tag " + tagCls, m.tag || "創"));
      b.appendChild(document.createTextNode(m.t));
      if (m.src) {
        b.classList.add("has-src");
        b.appendChild(el("span", "src", "出處／說明：" + m.src));
        b.title = "點一下看出處";
        b.addEventListener("click", (e) => { e.stopPropagation(); b.classList.toggle("open"); });
      }
      node.appendChild(b);
    } else if (m.w === "me") {
      node = el("div", "msg me");
      node.appendChild(el("div", "bubble", m.t));
    } else if (m.w === "nar") {
      node = el("div", "msg nar", m.t);
    } else if (m.w === "title") {
      node = el("div", "msg title");
      node.appendChild(el("span", null, m.t));
    } else if (m.w === "sys") {
      node = el("div", "msg sys");
      node.appendChild(el("span", null, m.t));
    } else if (m.w === "note") {
      node = el("div", "msg note");
      const c = el("div", "notecard");
      c.appendChild(el("span", "tag note", "箋"));
      c.appendChild(el("b", null, "史實小箋　"));
      c.appendChild(document.createTextNode(m.t));
      if (m.src) c.appendChild(el("span", "src", "出處：" + m.src));
      node.appendChild(c);
    }
    return node;
  }

  function addMsg(m, record) {
    const n = renderMsg(m);
    if (n) logEl.appendChild(n);
    if (record) { S.log.push(m); save(); }
    scrollDown();
  }

  function delayFor(m) {
    if (S.speed === 0) return 0;
    const len = (m.t || "").length;
    const base = m.w === "title" ? 500 : Math.min(1700, 380 + len * 22);
    return base * S.speed;
  }

  let typingEl = null;
  function showTyping(isSu) {
    hideTyping();
    typingEl = el("div", "typing");
    if (isSu) typingEl.appendChild(el("span", null, "蘇軾正在研墨"));
    const d = el("span", "dots");
    d.append(el("span"), el("span"), el("span"));
    typingEl.appendChild(d);
    logEl.appendChild(typingEl);
    scrollDown();
  }
  function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

  function wait(ms) {
    return new Promise((r) => {
      const t = setTimeout(() => { skipWait = null; r(); }, ms);
      skipWait = () => { clearTimeout(t); skipWait = null; r(); };
    });
  }
  // 點對話區可跳過等待
  logEl.addEventListener("click", () => { if (skipWait) skipWait(); });

  async function play(list, token) {
    for (const m of list) {
      if (token !== playToken) return false;
      const d = delayFor(m);
      if (d > 0) {
        showTyping(m.w === "su");
        await wait(d);
        hideTyping();
      }
      if (token !== playToken) return false;
      addMsg(m, true);
    }
    return true;
  }

  function setChapter(ch) {
    $("#chapterLabel").textContent = CHAPTERS[ch] || ch || "序章";
  }
  function setNight(on) { document.body.classList.toggle("night", !!on); }

  function updateMeters(bump) {
    $("#mBond").textContent = S.bond;
    $("#mJoy").textContent = S.joy;
    if (bump) {
      bump.forEach((id) => {
        const m = $(id).parentElement;
        m.classList.remove("bump"); void m.offsetWidth; m.classList.add("bump");
      });
    }
  }

  async function runNode(id) {
    const token = ++playToken;
    choicesEl.innerHTML = "";
    if (id === "END") return finishStory(token);
    const n = SCRIPT[id];
    S.node = id;
    S.logStart = S.log.length;
    S.snap = { bond: S.bond, joy: S.joy, flags: Object.assign({}, S.flags) };
    save();
    setChapter(n.ch);
    setNight(n.night);
    const ok = await play(n.msgs, token);
    if (!ok) return;
    if (n.unlock === "kitchen") unlockKitchen();
    if (n.seal) grantSeal(n.seal);
    if (n.choices) showChoices(n, token);
    else if (n.next) runNode(n.next);
  }

  function showChoices(n, token) {
    choicesEl.innerHTML = "";
    if (n.quiz) choicesEl.appendChild(el("div", "label", "✦ 接詞挑戰：選出東坡的下一句 ✦"));
    const list = n.quiz ? shuffle(n.choices) : n.choices;
    let used = false; // 防止快速連點兩個選項造成劇情分岔
    list.forEach((c) => {
      const b = el("button", "choice", c.t);
      b.type = "button";
      b.onclick = () => { if (used) return; used = true; choose(c, token); };
      choicesEl.appendChild(b);
    });
    scrollDown();
  }

  async function choose(c, token) {
    if (token !== playToken) return;
    choicesEl.innerHTML = "";
    addMsg({ w: "me", t: c.t }, true);
    const bumps = [];
    const parts = [];
    if (c.bond) { S.bond += c.bond; bumps.push("#mBond"); parts.push("知己 " + (c.bond > 0 ? "+" : "") + c.bond); }
    if (c.joy) { S.joy += c.joy; bumps.push("#mJoy"); parts.push("樂觀 " + (c.joy > 0 ? "+" : "") + c.joy); }
    updateMeters(bumps);
    if (parts.length) toast(parts.join("　"));
    if (c.flag) {
      S.flags[c.flag] = true;
      if (c.flag === "umbrella") grantSeal("umbrella");
      if (c.flag === "poem") grantSeal("poem");
    }
    save();
    if (c.reply) {
      const ok = await play(c.reply, token);
      if (!ok) return;
    }
    runNode(c.next);
  }

  async function finishStory(token) {
    const end = ENDINGS.find((e) => e.test(S));
    const ok = await play(end.msgs, token);
    if (!ok) return;
    S.node = "END";
    S.lastEnding = end.id;
    const isNew = !S.endings[end.id];
    S.endings[end.id] = true;
    save();
    renderEndingCard(end, isNew);
    if (ENDINGS.every((e) => S.endings[e.id])) grantSeal("allend");
    renderBag();
  }

  function renderEndingCard(end, isNew) {
    const card = el("div", "ending-card");
    card.appendChild(el("div", "big-icon", end.icon));
    card.appendChild(el("div", "muted", isNew ? "✦ 新結局解鎖 ✦" : "結局"));
    card.appendChild(el("h4", null, end.name));
    card.appendChild(el("p", null, end.desc));
    card.appendChild(el("p", "stats", "知己值 " + S.bond + "　樂觀值 " + S.joy));
    const got = ENDINGS.filter((e) => S.endings[e.id]).length;
    card.appendChild(el("p", "stats", "已解鎖結局 " + got + " / " + ENDINGS.length));
    const missing = ENDINGS.find((e) => !S.endings[e.id]);
    if (missing) card.appendChild(el("p", "stats", "提示：還有結局等你發現——" + missing.hint));
    const row = el("div", "row");
    const again = el("button", "btn primary", "再穿越一次");
    again.onclick = () => restartStory(false);
    const bag = el("button", "btn ghost", "看看行囊");
    bag.onclick = () => switchTab("bag");
    row.append(again, bag);
    card.appendChild(row);
    logEl.appendChild(card);
    scrollDown();
  }

  function restoreLog() {
    logEl.innerHTML = "";
    S.log.forEach((m) => { const n = renderMsg(m); if (n) logEl.appendChild(n); });
    scrollDown();
  }

  function continueStory() {
    showMain();
    if (S.node === "END") {
      restoreLog();
      const end = ENDINGS.find((e) => e.id === S.lastEnding) || ENDINGS[ENDINGS.length - 1];
      setChapter("fin");
      renderEndingCard(end, false);
      return;
    }
    // 回到該段落開頭重播，數值還原到該段落開始時
    S.log = S.log.slice(0, S.logStart);
    if (S.snap) { S.bond = S.snap.bond; S.joy = S.snap.joy; S.flags = Object.assign({}, S.snap.flags); }
    restoreLog();
    updateMeters();
    runNode(S.node);
  }

  async function restartStory(ask) {
    if (ask) {
      const ok = await modal("重新穿越？", "目前的劇情進度與知己值會歸零，但已收集的結局、印章與成績都會保留。",
        [{ t: "取消", v: false }, { t: "重新穿越", v: true, cls: "primary" }]);
      if (!ok) return;
    }
    playToken++;
    hideTyping();
    S.node = null; S.bond = 0; S.joy = 0; S.flags = {}; S.log = []; S.lastEnding = null;
    save();
    logEl.innerHTML = "";
    choicesEl.innerHTML = "";
    updateMeters();
    showMain();
    switchTab("chat");
    runNode("start");
  }

  /* ---------- 自由提問（關鍵字比對） ---------- */
  function findKeyword(text) {
    const lower = text.toLowerCase();
    let best = null, bestLen = 0;
    KEYWORDS.forEach((entry) => {
      entry.k.forEach((w) => {
        const lw = w.toLowerCase();
        // 英文關鍵字需完整單字比對，避免「this」誤中「hi」
        const hit = /^[a-z]+$/.test(lw)
          ? new RegExp("(^|[^a-z])" + lw + "([^a-z]|$)").test(lower)
          : lower.includes(lw);
        if (hit && lw.length > bestLen) { best = entry; bestLen = lw.length; }
      });
    });
    return best;
  }

  function ask(text) {
    text = text.trim();
    if (!text) return;
    addMsg({ w: "me", t: text }, true);
    S.chatCount++;
    const hit = findKeyword(text);
    let m;
    if (hit) {
      m = { w: "su", t: pick(hit.r), tag: hit.tag, src: hit.src, kw: true };
      if (hit.spoiler) {
        const key = hit.k[0];
        if (!S.spoilers.includes(key)) S.spoilers.push(key);
        if (S.spoilers.length >= 3) grantSeal("spoiler");
      }
    } else {
      m = { w: "su", t: pick(FALLBACK), tag: "創", kw: true };
    }
    save();
    if (S.chatCount >= 10) grantSeal("chatter");
    showTyping(true);
    setTimeout(() => { hideTyping(); addMsg(m, true); }, S.speed === 0 ? 150 : 650);
  }

  $("#askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#askInput");
    ask(inp.value);
    inp.value = "";
  });

  $("#btnKeys").onclick = () => {
    const wrap = el("div", "kw-list");
    KEYWORDS.forEach((k) => {
      const c = el("button", "chip", k.k[0]);
      c.type = "button";
      c.onclick = () => { $("#modal").hidden = true; ask(k.k[0]); };
      wrap.appendChild(c);
    });
    modal("可以問東坡什麼？",
      ["這裡的回答是「看到關鍵字就給出事先寫好的回覆」，不是 AI。點下面的字詞直接發問，或自己輸入句子試試看。有幾個關鍵字藏著「未來」的彩蛋……", wrap],
      [{ t: "關閉", v: null }]);
  };

  const SPEEDS = [[1, "一般"], [0.45, "快"], [0, "瞬間"]];
  function renderSpeed() {
    const cur = SPEEDS.find((s) => s[0] === S.speed) || SPEEDS[0];
    $("#btnSpeed").textContent = "速度：" + cur[1];
  }
  $("#btnSpeed").onclick = () => {
    const i = SPEEDS.findIndex((s) => s[0] === S.speed);
    S.speed = SPEEDS[(i + 1) % SPEEDS.length][0];
    save();
    renderSpeed();
    if (skipWait) skipWait();
  };
  $("#btnRestart").onclick = () => restartStory(true);

  /* =========================================================
     東坡廚房
     ========================================================= */
  const WATER = [
    { id: "little", name: "少著水", score: 40, h: 34, tip: "少著水——正合〈豬肉頌〉。" },
    { id: "half", name: "半鍋水", score: 22, h: 58, tip: "水稍多，味道淡了些。" },
    { id: "full", name: "滿鍋水", score: 6, h: 86, tip: "水太多，變成豬肉湯了。" }
  ];
  const FIRE = [
    { id: "slow", name: "文火慢燉", score: 30, sec: 14, zone: [76, 92], flames: 2, tip: "慢火，「柴頭罨煙焰不起」。" },
    { id: "mid", name: "中火", score: 18, sec: 9, zone: [79, 90], flames: 4, tip: "中火，還算穩當。" },
    { id: "high", name: "武火猛燒", score: 4, sec: 5, zone: [82, 88], flames: 7, tip: "猛火太急，外焦內硬。" }
  ];
  const COOK_LINES = [
    "鍋裡咕嘟咕嘟，肉香慢慢飄出來……",
    "蘇軾在旁邊念：「待他自熟莫催他……」",
    "隔壁鄰居探頭：「子瞻兄，煮什麼這麼香？」",
    "鍋蓋蓋得緊緊的，看不見裡面了。用鼻子聞聞看？",
    "蘇軾吞了吞口水，假裝在看書。",
    "柴火輕輕地燒著，沒有冒起大火焰。"
  ];
  const K = { water: null, fire: null, peeks: 0, prog: 0, timer: null, lineTimer: null, sneak: false };

  function kButtons(list) {
    const box = $("#kButtons");
    box.innerHTML = "";
    list.forEach((b) => {
      const btn = el("button", "btn " + (b.cls || ""), b.t);
      btn.type = "button";
      btn.onclick = b.on;
      if (b.id) btn.id = b.id;
      box.appendChild(btn);
    });
  }
  function setFlames(n) {
    const f = $("#fire");
    f.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const s = el("i");
      s.style.height = (10 + Math.random() * 14) + "px";
      s.style.animationDelay = (Math.random() * .4) + "s";
      f.appendChild(s);
    }
  }
  function waterColor(p) {
    // 由淡粉到醬紅到焦黑
    const stops = [[217, 163, 138], [168, 82, 40], [110, 40, 16], [40, 20, 10]];
    const t = Math.min(p, 100) / 100 * (stops.length - 1);
    const i = Math.min(Math.floor(t), stops.length - 2), f = t - i;
    const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
    return "rgb(" + c.join(",") + ")";
  }

  function kitchenReset() {
    clearInterval(K.timer); clearInterval(K.lineTimer);
    Object.assign(K, { water: null, fire: null, peeks: 0, prog: 0 });
    $("#potWater").style.height = "0";
    $("#potWater").style.background = "";
    $("#steam").classList.remove("on");
    $("#gaugeWrap").hidden = true;
    $("#kResult").innerHTML = "";
    $("#lid").classList.remove("peek");
    setFlames(0);
    $("#kStep").textContent = "第一步：淨洗鍋，然後加多少水？";
    kButtons(WATER.map((w) => ({ t: w.name, on: () => kitchenWater(w) })));
  }
  function kitchenWater(w) {
    K.water = w;
    $("#potWater").style.height = w.h + "%";
    $("#potWater").style.background = waterColor(0);
    $("#kStep").textContent = "第二步：用什麼火？";
    kButtons(FIRE.map((f) => ({ t: f.name, on: () => kitchenFire(f) })));
  }
  function kitchenFire(f) {
    K.fire = f;
    setFlames(f.flames);
    $("#gaugeWrap").hidden = false;
    $("#zone").style.left = f.zone[0] + "%";
    $("#zone").style.width = (f.zone[1] - f.zone[0]) + "%";
    $("#gaugeFill").style.opacity = ".8";
    $("#kStep").textContent = "第三步：蓋上鍋蓋慢慢燉。火候到了（綠色區間）就起鍋！";
    kButtons([
      { t: "掀蓋偷看（扣分）", on: kitchenPeek, cls: "ghost" },
      { t: "起鍋！", on: () => kitchenServe(false), cls: "primary" }
    ]);
    const step = 100 / (f.sec * 10);
    K.timer = setInterval(() => {
      K.prog += step;
      $("#gaugeFill").style.width = Math.min(K.prog, 100) + "%";
      $("#potWater").style.background = waterColor(K.prog);
      if (K.prog > 15) $("#steam").classList.add("on");
      // 超過三成後鍋蓋蓋上，看不到進度
      if (K.prog > 30 && !$("#lid").classList.contains("peek")) $("#gaugeFill").style.opacity = "0";
      if (K.prog >= 100) kitchenServe(true);
    }, 100);
    K.lineTimer = setInterval(() => { $("#kStep").textContent = pick(COOK_LINES); }, 2600);
  }
  function kitchenPeek() {
    K.peeks++;
    $("#lid").classList.add("peek");
    $("#gaugeFill").style.opacity = ".8";
    toast("掀蓋偷看 −8 分。蘇軾瞪了你一眼：「莫催他！」");
    setTimeout(() => { $("#lid").classList.remove("peek"); }, 1100);
  }
  function kitchenServe(burnt) {
    clearInterval(K.timer); clearInterval(K.lineTimer);
    $("#gaugeFill").style.opacity = ".8";
    $("#steam").classList.remove("on");
    setFlames(0);
    const f = K.fire, p = Math.min(K.prog, 100);
    let timing = 0, verdict;
    if (burnt) verdict = "燒焦了！一股焦味飄滿臨皋亭。";
    else if (p >= f.zone[0] && p <= f.zone[1]) { timing = 30; verdict = "火候剛好！肉色紅亮，入口即化。"; }
    else if (p >= f.zone[0] - 8 && p < f.zone[0]) { timing = 14; verdict = "差一點點，肉還有點硬。"; }
    else if (p > f.zone[1]) { timing = 12; verdict = "燉過頭了，有點乾柴。"; }
    else verdict = "還沒熟就起鍋了！你太心急了。";
    let score = K.water.score + f.score + timing - K.peeks * 8;
    if (burnt) score = Math.round(score / 4);
    score = Math.max(0, Math.min(100, score));

    let say;
    if (score >= 90) say = "蘇軾吃了一口，拍桌大叫：「火候足時他自美！」";
    else if (score >= 70) say = "蘇軾連吃兩碗：「早晨起來打兩碗，飽得自家君莫管。」";
    else if (score >= 45) say = "蘇軾客氣地說：「嗯……別有風味。」";
    else say = "蘇軾沉默了很久，然後說：「沒關係，黃州豬肉便宜，再買一塊。」";

    const card = el("div", "result-card");
    card.appendChild(el("div", "score", score + " 分"));
    card.appendChild(el("p", null, verdict));
    card.appendChild(el("p", null, say));
    const ul = el("ul", "list small");
    ul.style.textAlign = "left";
    [K.water.tip, f.tip, K.peeks ? "掀蓋 " + K.peeks + " 次（−" + K.peeks * 8 + "）" : "全程沒掀蓋，有耐心！"]
      .forEach((t) => ul.appendChild(el("li", null, t)));
    card.appendChild(ul);
    $("#kResult").innerHTML = "";
    $("#kResult").appendChild(card);
    $("#kStep").textContent = burnt ? "焦了……" : "起鍋！";
    kButtons([{ t: "再燉一鍋", on: kitchenReset, cls: "primary" }]);

    if (S.kBest == null || score > S.kBest) { S.kBest = score; save(); }
    $("#kBest").textContent = S.kBest + " 分";
    if (score >= 90) grantSeal("chef");
    if (burnt) grantSeal("burnt");
  }

  function unlockKitchen() {
    if (!S.kitchen) { S.kitchen = true; save(); }
    renderKitchenLock();
  }
  function renderKitchenLock() {
    const open = S.kitchen || K.sneak;
    $("#kitchenLock").hidden = open;
    $("#kitchen").style.display = open ? "" : "none";
    document.querySelector('[data-tab="kitchen"]').classList.toggle("dot", S.kitchen && !S.kitchenSeen);
  }
  $("#btnSneak").onclick = () => { K.sneak = true; renderKitchenLock(); toast("噓——別讓東坡發現。"); };

  /* =========================================================
     詩詞拾句
     ========================================================= */
  let Q = null;
  function quizIntro() {
    const box = $("#quizBox");
    box.innerHTML = "";
    const card = el("div", "q-card center");
    card.appendChild(el("p", null, "題庫共 " + QUIZ.length + " 題，有黃州時期的作品，也有東坡一生其他名句。"));
    const b = el("button", "btn primary big", "開始一輪");
    b.onclick = quizStart;
    card.appendChild(b);
    box.appendChild(card);
  }
  function quizStart() {
    Q = { list: shuffle(QUIZ).slice(0, 5), i: 0, score: 0 };
    renderQ();
  }
  function renderQ() {
    const box = $("#quizBox");
    box.innerHTML = "";
    const item = Q.list[Q.i];
    const card = el("div", "q-card");
    const prog = el("div", "q-progress");
    prog.append(el("span", null, "第 " + (Q.i + 1) + " / " + Q.list.length + " 題"), el("span", null, "答對 " + Q.score));
    card.appendChild(prog);
    card.appendChild(el("div", "q-text", item.q));
    const opts = el("div", "q-opts");
    const order = shuffle(item.o.map((t, idx) => ({ t, idx })));
    const btns = [];
    order.forEach((o) => {
      const b = el("button", "q-opt", o.t);
      b.type = "button";
      b.onclick = () => {
        btns.forEach((x) => { x.disabled = true; });
        const right = o.idx === item.a;
        if (right) Q.score++;
        btns.forEach((x, k) => { if (order[k].idx === item.a) x.classList.add("right"); });
        if (!right) b.classList.add("wrong");
        const ex = el("div", "q-explain");
        ex.appendChild(el("b", null, right ? "✔ 答對了！" : "✘ 正解：" + item.o[item.a]));
        ex.appendChild(el("div", null, "出處：" + item.src));
        card.appendChild(ex);
        const next = el("button", "btn primary", Q.i + 1 < Q.list.length ? "下一題" : "看成績");
        next.style.marginTop = "12px";
        next.onclick = () => { Q.i++; Q.i < Q.list.length ? renderQ() : quizEnd(); };
        card.appendChild(next);
        prog.lastChild.textContent = "答對 " + Q.score;
      };
      btns.push(b);
      opts.appendChild(b);
    });
    card.appendChild(opts);
    box.appendChild(card);
  }
  function quizEnd() {
    const box = $("#quizBox");
    box.innerHTML = "";
    const card = el("div", "q-card center");
    card.appendChild(el("div", "score-big", ""));
    const s = Q.score;
    card.appendChild(el("h3", null, "答對 " + s + " / 5"));
    const words = ["蘇軾：「沒關係，我當年也背得很辛苦。」", "蘇軾：「有進步的空間，好事。」", "蘇軾：「還不錯，再來一輪？」",
      "蘇軾：「不錯不錯！」", "蘇軾：「差一點就全對了，可惜可惜！」", "蘇軾：「小友莫非是我肚子裡的蛔蟲？」"];
    card.appendChild(el("p", null, words[s]));
    const b = el("button", "btn primary", "再來一輪");
    b.onclick = quizStart;
    card.appendChild(b);
    box.appendChild(card);
    if (S.qBest == null || s > S.qBest) { S.qBest = s; save(); }
    $("#qBest").textContent = S.qBest + " / 5";
    if (s === 5) grantSeal("scholar");
  }

  /* =========================================================
     行囊
     ========================================================= */
  function renderBag() {
    const eg = $("#endGrid");
    eg.innerHTML = "";
    ENDINGS.forEach((e) => {
      const got = !!S.endings[e.id];
      const d = el("div", "end-item" + (got ? "" : " locked"));
      d.appendChild(el("div", "ic", e.icon));
      d.appendChild(el("b", null, got ? e.name : "？？？"));
      d.appendChild(el("small", null, got ? e.desc : "提示：" + e.hint));
      eg.appendChild(d);
    });
    $("#endCount").textContent = ENDINGS.filter((e) => S.endings[e.id]).length + " / " + ENDINGS.length;

    const sg = $("#sealGrid");
    sg.innerHTML = "";
    SEALS.forEach((s) => {
      const got = !!S.seals[s.id];
      const b = el("button", "seal" + (got ? "" : " locked"));
      b.type = "button";
      b.appendChild(el("div", "stamp", got ? s.name : "？"));
      b.appendChild(el("small", null, got ? s.name : "未獲得"));
      b.onclick = () => toast((got ? "「" + s.name + "」：" : "解鎖條件：") + s.hint);
      sg.appendChild(b);
    });
    $("#sealCount").textContent = Object.keys(S.seals).filter((k) => S.seals[k]).length + " / " + SEALS.length;
    renderFortune();
  }

  function renderFortune(anim) {
    const box = $("#fortuneBox");
    box.innerHTML = "";
    if (S.fortuneDay === todayKey() && S.fortuneIdx != null) {
      const f = FORTUNES[S.fortuneIdx];
      box.appendChild(el("div", "lv", f.lv));
      box.appendChild(el("div", "line", f.s));
      box.appendChild(el("div", "src", "蘇軾" + f.src));
      const j = el("div", "jie");
      j.appendChild(el("span", "tag chuang", "創"));
      j.appendChild(document.createTextNode("解籤：" + f.jie));
      box.appendChild(j);
      box.appendChild(el("p", "muted", "明天再來抽新的一支。"));
      if (anim) box.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], 500);
    } else {
      const stick = el("div", "stick", "🎋");
      box.appendChild(stick);
      box.appendChild(el("p", "muted", "每天一支，籤詩皆為蘇軾原句，解籤為本作的趣味解讀。"));
      const b = el("button", "btn primary", "搖一支籤");
      b.onclick = () => {
        b.disabled = true;
        stick.classList.add("shake");
        setTimeout(() => {
          S.fortuneDay = todayKey();
          S.fortuneIdx = Math.floor(Math.random() * FORTUNES.length);
          save();
          grantSeal("fortune");
          renderFortune(true);
        }, 900);
      };
      box.appendChild(b);
    }
  }

  $("#btnShare").onclick = async () => {
    const ends = ENDINGS.filter((e) => S.endings[e.id]).map((e) => e.name);
    const seals = Object.keys(S.seals).filter((k) => S.seals[k]).length;
    const text = "我在《東坡穿越記・黃州一〇八二》和蘇軾聊了天！\n解鎖結局：" + (ends.length ? ends.join("、") : "尚未") +
      "\n收集印章：" + seals + " / " + SEALS.length + "\n" + location.href;
    try {
      if (navigator.share) { await navigator.share({ title: "東坡穿越記", text }); return; }
      await navigator.clipboard.writeText(text);
      toast("已複製到剪貼簿，可以貼給朋友了！");
    } catch (e) {
      modal("分享文字", [text], [{ t: "關閉", v: null }]);
    }
  };

  $("#btnReset").onclick = async () => {
    const ok = await modal("清除所有紀錄？", "所有劇情進度、結局、印章、成績都會刪除，無法復原。",
      [{ t: "取消", v: false }, { t: "全部清除", v: true, cls: "danger" }]);
    if (!ok) return;
    playToken++;
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* 忽略 */ }
    S = defaultState();
    logEl.innerHTML = "";
    choicesEl.innerHTML = "";
    K.sneak = false;
    kitchenReset();
    $("#kBest").textContent = "—";
    $("#qBest").textContent = "—";
    updateMeters();
    renderSpeed();
    renderKitchenLock();
    renderBag();
    setNight(false);
    showSplash();
    toast("紀錄已清除");
  };

  /* =========================================================
     畫面切換
     ========================================================= */
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
    document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $("#meters").style.visibility = name === "chat" ? "visible" : "hidden";
    if (name === "kitchen" && S.kitchen && !S.kitchenSeen) { S.kitchenSeen = true; save(); renderKitchenLock(); }
    if (name === "bag") renderBag();
    if (name === "chat") scrollDown();
  }
  document.querySelectorAll(".tabbar button").forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });

  function showMain() {
    $("#splash").classList.remove("active");
    $("#main").classList.add("active");
  }
  function showSplash() {
    $("#main").classList.remove("active");
    $("#splash").classList.add("active");
    $("#btnContinue").hidden = !S.node;
  }

  $("#btnStart").onclick = () => {
    if (S.node) restartStory(false);
    else { showMain(); switchTab("chat"); runNode("start"); }
  };
  $("#btnContinue").onclick = continueStory;

  // 彩蛋：連點月亮三下
  let moonClicks = 0;
  $("#moon").onclick = () => {
    moonClicks++;
    $("#moon").classList.toggle("lit", moonClicks % 2 === 1);
    if (moonClicks === 3) {
      grantSeal("moon");
      setTimeout(() => toast("「明月幾時有？把酒問青天。」——東坡在九百年前也看著同一個月亮。"), 1200);
    }
  };

  /* ---------- 初始化 ---------- */
  function init() {
    const tl = $("#timeline");
    TIMELINE.forEach(([y, t, hl]) => {
      const li = el("li", hl ? "hl" : "");
      li.appendChild(el("b", null, y));
      li.appendChild(document.createTextNode(t));
      tl.appendChild(li);
    });
    updateMeters();
    renderSpeed();
    renderKitchenLock();
    kitchenReset();
    if (S.kBest != null) $("#kBest").textContent = S.kBest + " 分";
    if (S.qBest != null) $("#qBest").textContent = S.qBest + " / 5";
    quizIntro();
    renderBag();
    showSplash();
  }
  init();
})();
