(function () {
  "use strict";

  const HOLIDAYS = new Set(["2026-10-12", "2026-11-03", "2026-11-23", "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21"]);
  const CITY_ORDER = ["厚木市", "海老名市", "伊勢原市", "愛川町", "座間市"];
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

  function whenText(ev, groupKey) {
    const parts = [];
    if (!groupKey) {
      if (ev.dates && ev.dates.length) parts.push(ev.dates.map(md).join("・"));
      else parts.push(`${md(ev.start)}〜${md(ev.end)}`);
    } else if (ev.dates && ev.dates.length > 1) {
      parts.push(`ほかに ${ev.dates.filter((d) => d !== groupKey).map(md).join("・")} も開催`);
    }
    if (ev.dateNote) parts.push(ev.dateNote);
    if (ev.time) parts.unshift(ev.time);
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
