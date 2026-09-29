(function () {
  "use strict";

  const HOLIDAYS = new Set(["2026-10-12", "2026-11-03", "2026-11-23", "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21"]);
  const CITY_ORDER = ["厚木市", "海老名市", "座間市", "綾瀬市", "大和市", "相模原市", "伊勢原市", "愛川町", "清川村"];
  const AGE_LABEL = { baby: "0〜2歳", kinder: "3〜6歳", school: "小学生" };
  const RESERVE = {
    none: { label: "予約不要", cls: "free" },
    ticket: { label: "当日整理券", cls: "" },
    partial: { label: "一部要予約", cls: "warn" },
    required: { label: "要予約", cls: "warn" },
    closed: { label: "受付終了", cls: "closed" },
    check: { label: "予約は要確認", cls: "" },
  };
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const FAV_KEY = "atsugi-kids-events:favs";

  // トップの写真（すべて Wikimedia Commons の自由に使える写真。縮小して使用）
  const PHOTOS = [
    { src: "images/atsugi.jpg", place: "あつぎ鮎まつりの花火", cities: ["厚木市"], pos: "50% 45%",
      artist: "YANSANSEI", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:Kanagawa-A_fireworks_display_in_Atsugi_City-xl.jpg" },
    { src: "images/isehara.jpg", place: "田んぼの向こうに大山と富士山", cities: ["伊勢原市"], pos: "50% 55%",
      artist: "Mzaki", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      page: "https://commons.wikimedia.org/wiki/File:Mount_Oyama_viewed_from_Kamiya,_Isehara.jpg" },
    { src: "images/miyagase.jpg", place: "宮ヶ瀬ダム", cities: ["愛川町", "清川村"], pos: "50% 45%",
      artist: "Dandy1022", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:Miyagase_Dam,_Aikawa,_Kanagawa.jpg" },
    { src: "images/zama.jpg", place: "座間のひまわり畑", cities: ["座間市"], pos: "50% 40%",
      artist: "Kakidai", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:Sunflowers_in_Zama.jpg" },
    { src: "images/ebina.jpg", place: "海老名中央公園の七重の塔", cities: ["海老名市"], pos: "50% 40%",
      artist: "Nesnad", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:Seven-story_Pagoda_Monument_in_Ebina_Central_Park_2026_May_28.jpg" },
    { src: "images/yamato.jpg", place: "泉の森の水車小屋", cities: ["大和市"], pos: "50% 50%",
      artist: "Aimaimyi", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      page: "https://commons.wikimedia.org/wiki/File:Izuminomori_-02.jpg" },
    { src: "images/ayase.jpg", place: "風の公園", cities: ["綾瀬市"], pos: "50% 55%",
      artist: "Haya4", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      page: "https://commons.wikimedia.org/wiki/File:Park_Ayase,Kanagawa%27%E9%A2%A8%E3%81%AE%E5%85%AC%E5%9C%92%27.jpg" },
    { src: "images/sagamihara.jpg", place: "相模湖", cities: ["相模原市"], pos: "50% 55%",
      artist: "Σ64", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      page: "https://commons.wikimedia.org/wiki/File:Lake_Sagami_03.jpg" },
  ];
  let heroPhoto = null;

  const state = { range: "month", cities: new Set(), ages: new Set(), free: false, walkin: false, fav: false, q: "" };
  let events = [];
  let meta = null;
  let loaded = false;
  let favs = loadFavs();

  // ---------- 日付まわり ----------
  function toKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function fromKey(k) {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function today() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }
  function md(k) {
    const d = fromKey(k);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function wdOf(k) { return WD[fromKey(k).getDay()]; }
  function isSunLike(k) { return fromKey(k).getDay() === 0 || HOLIDAYS.has(k); }

  function windowFor(range) {
    const t = today();
    if (range === "weekend") {
      const dow = t.getDay();
      if (dow === 0) return [toKey(t), toKey(t)];
      const sat = addDays(t, (6 - dow + 7) % 7);
      return [toKey(sat), toKey(addDays(sat, 1))];
    }
    const days = { "2w": 13, month: 30, all: 3650 }[range];
    return [toKey(t), toKey(addDays(t, days))];
  }

  function relLabel(k) {
    const diff = Math.round((fromKey(k) - today()) / 86400000);
    if (diff === 0) return "今日";
    if (diff === 1) return "明日";
    if (diff === 2) return "あさって";
    return `${diff}日後`;
  }

  // ---------- お気に入り（このブラウザだけに保存） ----------
  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch {}
  }

  // ---------- 絞り込み ----------
  function matches(ev) {
    if (state.cities.size && !state.cities.has(ev.city)) return false;
    if (state.ages.size && !(ev.ages || []).some((a) => state.ages.has(a))) return false;
    if (state.free && ev.free !== true) return false;
    if (state.walkin && !["none", "ticket", "partial"].includes(ev.reserve)) return false;
    if (state.fav && !favs.has(ev.id)) return false;
    if (state.q) {
      const hay = [ev.title, ev.venue, ev.city, ev.category, ev.summary, ev.tip, ev.age].join(" ").toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  // ---------- 描画 ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function safeUrl(u) {
    return typeof u === "string" && /^https:\/\//.test(u) ? u : null;
  }

  function mdw(k) {
    return `${md(k)}（${HOLIDAYS.has(k) ? wdOf(k) + "・祝" : wdOf(k)}）`;
  }

  // 「いつ」の表示：日付 → 時間 → 補足 の順
  function whenText(ev, groupKey) {
    const parts = [];
    if (groupKey) {
      parts.push(mdw(groupKey));
    } else if (ev.dates && ev.dates.length) {
      parts.push(ev.dates.map(mdw).join("・"));
    } else {
      parts.push(`${mdw(ev.start)}〜${mdw(ev.end)}`);
    }
    if (ev.time) parts.push(ev.time);
    if (groupKey && ev.dates && ev.dates.length > 1) {
      parts.push(`（ほかに ${ev.dates.filter((d) => d !== groupKey).map(md).join("・")} も開催）`);
    }
    if (ev.dateNote) parts.push(ev.dateNote);
    return parts.join("　");
  }

  function card(ev, groupKey) {
    const faved = favs.has(ev.id);
    const star = h("button", {
      type: "button",
      class: "star",
      "aria-pressed": String(faved),
      "aria-label": faved ? "行きたいリストから外す" : "行きたいリストに入れる",
      onclick: () => {
        if (favs.has(ev.id)) favs.delete(ev.id);
        else favs.add(ev.id);
        saveFavs();
        render();
      },
    }, faved ? "★" : "☆");

    const badges = [];
    if (ev.free === true) badges.push(h("span", { class: "badge free" }, ev.fee || "無料"));
    else if (ev.fee) badges.push(h("span", { class: "badge" }, ev.fee));
    const r = RESERVE[ev.reserve] || RESERVE.check;
    badges.push(h("span", { class: "badge " + r.cls }, r.label));
    for (const a of ev.ages || []) if (AGE_LABEL[a]) badges.push(h("span", { class: "badge" }, AGE_LABEL[a]));

    const links = [];
    const url = safeUrl(ev.url);
    if (url) links.push(h("a", { href: url, target: "_blank", rel: "noopener" }, `詳しく見る（${ev.source || "公式"}）↗`));
    const sns = safeUrl(ev.snsUrl);
    if (sns) links.push(h("a", { href: sns, target: "_blank", rel: "noopener" }, "SNSの投稿 ↗"));

    return h("article", { class: "ev" },
      h("div", { class: "ev-top" }, h("span", { class: "cat" }, ev.category || "イベント"), h("span", null, ev.city), star),
      h("h3", null, ev.title),
      h("p", { class: "line" }, h("span", { class: "k" }, "いつ"), h("span", null, whenText(ev, groupKey))),
      h("p", { class: "line" }, h("span", { class: "k" }, "場所"), h("span", null, ev.venue)),
      ev.age ? h("p", { class: "line" }, h("span", { class: "k" }, "対象"), h("span", null, ev.age)) : null,
      h("div", { class: "badges" }, badges),
      ev.tip ? h("p", { class: "tip" }, h("b", null, "子連れポイント"), ev.tip) : null,
      ev.summary ? h("p", { class: "sum" }, ev.summary) : null,
      ev.reserveNote ? h("p", { class: "sum" }, "申込み：" + ev.reserveNote) : null,
      links.length ? h("div", { class: "links" }, links) : null,
    );
  }

  function render() {
    updateFilterCount();
    const list = document.getElementById("list");
    list.replaceChildren();

    if (!loaded) {
      list.append(h("div", { class: "notice" }, "イベントを読み込んでいます…"));
      return;
    }

    const [from, to] = windowFor(state.range);
    const byDay = new Map();
    const periods = [];
    let total = 0;

    for (const ev of events) {
      if (!matches(ev)) continue;
      if (ev.dates && ev.dates.length) {
        const hits = ev.dates.filter((d) => d >= from && d <= to);
        if (!hits.length) continue;
        total++;
        for (const d of hits) {
          if (!byDay.has(d)) byDay.set(d, []);
          byDay.get(d).push(ev);
        }
      } else if (ev.start && ev.end && ev.end >= from && ev.start <= to) {
        total++;
        periods.push(ev);
      }
    }

    list.append(h("p", { class: "count" }, total ? `${total}件のイベント` : ""));

    if (!total) {
      list.append(h("div", { class: "notice" }, "条件に合うイベントが見つかりませんでした。期間を広げるか、条件を外してみてください。"));
      return;
    }

    for (const d of [...byDay.keys()].sort()) {
      const cls = isSunLike(d) ? "day sun" : fromKey(d).getDay() === 6 ? "day sat" : "day";
      const wd = HOLIDAYS.has(d) ? `${wdOf(d)}・祝` : wdOf(d);
      list.append(h("section", { class: "group" },
        h("h2", { class: cls }, h("span", { class: "md" }, md(d)), h("span", { class: "wd" }, wd), h("span", { class: "rel" }, relLabel(d))),
        h("div", { class: "cards" }, byDay.get(d).map((ev) => card(ev, d))),
      ));
    }

    if (periods.length) {
      periods.sort((a, b) => a.start.localeCompare(b.start));
      list.append(h("section", { class: "group" },
        h("h2", { class: "group-title" }, "期間中いつでも"),
        h("div", { class: "cards" }, periods.map((ev) => card(ev, null))),
      ));
    }
  }

  function renderCities() {
    const row = document.getElementById("cityRow");
    row.querySelectorAll(".chip").forEach((c) => c.remove());
    const present = new Set(events.map((e) => e.city));
    const cities = CITY_ORDER.filter((c) => present.has(c)).concat([...present].filter((c) => !CITY_ORDER.includes(c)));
    cities.forEach((c, i) => {
      row.append(h("button", {
        type: "button",
        class: "chip",
        id: "c-" + i,
        "aria-pressed": String(state.cities.has(c)),
        onclick: (e) => {
          if (state.cities.has(c)) state.cities.delete(c);
          else state.cities.add(c);
          e.currentTarget.setAttribute("aria-pressed", String(state.cities.has(c)));
          updateHero();
          render();
        },
      }, c));
    });
  }

  function renderMeta() {
    const el = document.getElementById("meta");
    const upcoming = events.filter((e) => e.end >= toKey(today())).length;
    const parts = [];
    if (meta && meta.updatedAt) parts.push(`${md(meta.updatedAt)} 更新`);
    if (meta && meta.rangeEnd) parts.push(`${md(meta.rangeEnd)}までの情報`);
    parts.push(`${upcoming}件掲載`);
    el.textContent = parts.join("　・　");
  }

  // ---------- Google 向けのイベント情報（構造化データ） ----------
  function isoTime(date, hhmm) {
    return hhmm ? `${date}T${hhmm.padStart(5, "0")}:00+09:00` : date;
  }
  function addStructuredData() {
    const todayKey = toKey(today());
    const items = [];
    for (const ev of events) {
      if (!ev.end || ev.end < todayKey) continue;
      const m = /^(\d{1,2}:\d{2})\s*〜\s*(\d{1,2}:\d{2})/.exec(ev.time || "");
      const base = {
        "@context": "https://schema.org",
        "@type": "Event",
        name: ev.title,
        description: [ev.summary, ev.tip].filter(Boolean).join(" "),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: /^【中止】/.test(ev.title) ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
        location: {
          "@type": "Place",
          name: ev.venue,
          address: { "@type": "PostalAddress", addressLocality: ev.city, addressRegion: "神奈川県", addressCountry: "JP" },
        },
        isAccessibleForFree: ev.free === true,
      };
      if (safeUrl(ev.url)) base.url = ev.url;
      if (ev.free === true) {
        base.offers = { "@type": "Offer", price: 0, priceCurrency: "JPY", availability: "https://schema.org/InStock", url: safeUrl(ev.url) || location.href };
      }
      const days = ev.dates && ev.dates.length ? ev.dates.filter((d) => d >= todayKey) : null;
      if (days) {
        for (const d of days) items.push({ ...base, startDate: isoTime(d, m && m[1]), endDate: isoTime(d, m && m[2]) });
      } else {
        items.push({ ...base, startDate: ev.start, endDate: ev.end });
      }
    }
    if (!items.length) return;
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(items.slice(0, 100));
    document.head.append(s);
  }

  // ---------- トップの写真（スライドショー） ----------
  const HERO_INTERVAL = 6000;
  const heroImgs = [document.getElementById("hero-a"), document.getElementById("hero-b")];
  const heroDots = document.getElementById("hero-dots");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let heroFront = 0;
  let heroToken = 0;
  let heroTimer = null;

  PHOTOS.forEach((p) => {
    heroDots.append(h("button", {
      type: "button",
      "aria-label": `${p.place}（${p.cities.join("・")}）の写真を表示`,
      onclick: () => {
        showHero(p);
        restartHeroTimer();
      },
    }));
  });

  function showHero(photo) {
    if (!photo || photo === heroPhoto) return;
    heroPhoto = photo;
    const token = ++heroToken;
    const back = heroImgs[1 - heroFront];
    let done = false;
    back.onload = () => {
      if (done || token !== heroToken) return;
      done = true;
      back.classList.add("show");
      heroImgs[heroFront].classList.remove("show");
      heroFront = 1 - heroFront;
    };
    back.style.objectPosition = photo.pos;
    back.alt = `${photo.place}（${photo.cities.join("・")}）`;
    back.src = photo.src;
    if (back.complete && back.naturalWidth) back.onload();

    document.getElementById("hero-place").textContent = `${photo.place}｜${photo.cities.join("・")}`;
    document.getElementById("hero-credit").replaceChildren(
      "写真: ",
      h("a", { href: photo.page, target: "_blank", rel: "noopener" }, photo.artist),
      " / ",
      h("a", { href: photo.licenseUrl, target: "_blank", rel: "noopener" }, photo.license),
    );
    const idx = PHOTOS.indexOf(photo);
    heroDots.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-current", String(i === idx)));

    // 次の写真を先に読み込んでおく
    const next = PHOTOS[(idx + 1) % PHOTOS.length];
    new Image().src = next.src;
  }

  function cityPhoto() {
    if (state.cities.size !== 1) return null;
    const city = [...state.cities][0];
    return PHOTOS.find((p) => p.cities.includes(city)) || null;
  }

  function nextHero() {
    if (document.hidden || cityPhoto()) return;
    const idx = PHOTOS.indexOf(heroPhoto);
    showHero(PHOTOS[(idx + 1) % PHOTOS.length]);
  }

  function restartHeroTimer() {
    clearInterval(heroTimer);
    if (!reduceMotion) heroTimer = setInterval(nextHero, HERO_INTERVAL);
  }

  function updateHero() {
    const match = cityPhoto();
    if (match) showHero(match);
    else if (!heroPhoto) showHero(PHOTOS[Math.floor(Math.random() * PHOTOS.length)]);
    restartHeroTimer();
  }
  updateHero();

  // ---------- 操作 ----------
  document.querySelectorAll(".seg button").forEach((b) => {
    b.addEventListener("click", () => {
      state.range = b.dataset.range;
      document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    });
  });
  document.querySelectorAll("#ageRow .chip").forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.age;
      if (state.ages.has(a)) state.ages.delete(a);
      else state.ages.add(a);
      b.setAttribute("aria-pressed", String(state.ages.has(a)));
      render();
    });
  });
  [["f-free", "free"], ["f-walkin", "walkin"], ["f-fav", "fav"]].forEach(([id, key]) => {
    const b = document.getElementById(id);
    b.addEventListener("click", () => {
      state[key] = !state[key];
      b.setAttribute("aria-pressed", String(state[key]));
      render();
    });
  });
  document.getElementById("q").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    render();
  });

  // 絞り込みパネルの開け閉め
  const filtersEl = document.getElementById("filters");
  const panel = document.getElementById("panel");
  const toggle = document.getElementById("toggle");
  function setPanel(open) {
    panel.hidden = !open;
    filtersEl.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", () => setPanel(panel.hidden));
  document.getElementById("done").addEventListener("click", () => {
    setPanel(false);
    filtersEl.scrollIntoView({ block: "start" });
  });
  document.getElementById("clear").addEventListener("click", () => {
    state.cities.clear();
    state.ages.clear();
    state.free = state.walkin = state.fav = false;
    state.q = "";
    document.getElementById("q").value = "";
    panel.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    render();
  });

  function updateFilterCount() {
    const n = state.cities.size + state.ages.size + [state.free, state.walkin, state.fav, !!state.q].filter(Boolean).length;
    const el = document.getElementById("fcount");
    el.hidden = n === 0;
    el.textContent = String(n);
  }

  render();

  // ---------- データ読み込み ----------
  Promise.all([
    fetch("data/events.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }),
    fetch("data/meta.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
    .then(([evs, m]) => {
      events = Array.isArray(evs) ? evs : [];
      meta = m;
      loaded = true;
      renderCities();
      renderMeta();
      render();
      addStructuredData();
    })
    .catch(() => {
      loaded = true;
      document.getElementById("meta").textContent = "";
      document.getElementById("list").replaceChildren(
        h("div", { class: "notice" }, "イベント情報を読み込めませんでした。時間をおいてページを開き直してください。"),
      );
    });
})();
