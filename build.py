"""data/ のイベント情報から、検索エンジン向けの静的ページを作る。

作るもの:
  area/<市町村>.html    市町村ごとのイベント一覧
  event/<id>.html       イベントごとのページ
  feature/<slug>.html   特集ページ（data/features.json で定義）
  sitemap.xml
  index.html の「エリア・特集から探す」の部分（BUILD:EXPLORE の印の間）

使い方: python build.py   （Python 3.8 以上、追加のライブラリは不要）
"""

import html
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent
SITE = "https://kfukuzumi1119-debug.github.io/atsugi-kids/"
SITE_NAME = "週末子連れカレンダー 県央版"
JST = timezone(timedelta(hours=9))

CITIES = [
    ("厚木市", "atsugi"), ("海老名市", "ebina"), ("座間市", "zama"), ("綾瀬市", "ayase"),
    ("大和市", "yamato"), ("相模原市", "sagamihara"), ("伊勢原市", "isehara"),
    ("愛川町", "aikawa"), ("清川村", "kiyokawa"),
]
CITY_SLUG = dict(CITIES)

# 市町村ページの上に出す写真（app.js の PHOTOS と同じもの）
PHOTOS = {
    "atsugi": ("atsugi.jpg", "あつぎ鮎まつりの花火", "YANSANSEI", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/", "https://commons.wikimedia.org/wiki/File:Kanagawa-A_fireworks_display_in_Atsugi_City-xl.jpg", "50% 45%"),
    "isehara": ("isehara.jpg", "田んぼの向こうに大山と富士山", "Mzaki", "CC0", "https://creativecommons.org/publicdomain/zero/1.0/", "https://commons.wikimedia.org/wiki/File:Mount_Oyama_viewed_from_Kamiya,_Isehara.jpg", "50% 55%"),
    "miyagase": ("miyagase.jpg", "宮ヶ瀬ダム", "Dandy1022", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "https://commons.wikimedia.org/wiki/File:Miyagase_Dam,_Aikawa,_Kanagawa.jpg", "50% 45%"),
    "zama": ("zama.jpg", "座間のひまわり畑", "Kakidai", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "https://commons.wikimedia.org/wiki/File:Sunflowers_in_Zama.jpg", "50% 40%"),
    "ebina": ("ebina.jpg", "海老名中央公園の七重の塔", "Nesnad", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/", "https://commons.wikimedia.org/wiki/File:Seven-story_Pagoda_Monument_in_Ebina_Central_Park_2026_May_28.jpg", "50% 40%"),
    "yamato": ("yamato.jpg", "泉の森の水車小屋", "Aimaimyi", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/", "https://commons.wikimedia.org/wiki/File:Izuminomori_-02.jpg", "50% 50%"),
    "ayase": ("ayase.jpg", "風の公園", "Haya4", "CC0", "https://creativecommons.org/publicdomain/zero/1.0/", "https://commons.wikimedia.org/wiki/File:Park_Ayase,Kanagawa%27%E9%A2%A8%E3%81%AE%E5%85%AC%E5%9C%92%27.jpg", "50% 55%"),
    "sagamihara": ("sagamihara.jpg", "相模湖", "Σ64", "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/", "https://commons.wikimedia.org/wiki/File:Lake_Sagami_03.jpg", "50% 55%"),
}
CITY_PHOTO = {"atsugi": "atsugi", "ebina": "ebina", "zama": "zama", "ayase": "ayase", "yamato": "yamato",
              "sagamihara": "sagamihara", "isehara": "isehara", "aikawa": "miyagase", "kiyokawa": "miyagase"}

HOLIDAYS = {
    "2026-10-12", "2026-11-03", "2026-11-23", "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23",
    "2027-03-21", "2027-03-22", "2027-04-29", "2027-05-03", "2027-05-04", "2027-05-05",
}
WD = "月火水木金土日"
AGE_LABEL = {"baby": "0〜2歳", "kinder": "3〜6歳", "school": "小学生"}
RESERVE = {
    "none": ("予約不要", "free"), "ticket": ("当日整理券", ""), "partial": ("一部要予約", "warn"),
    "required": ("要予約", "warn"), "closed": ("受付終了", "closed"), "check": ("予約は要確認", ""),
}

e = html.escape
updated_global = [""]


# ---------- 日付 ----------

def d_of(k):
    return date.fromisoformat(k)


def md(k):
    d = d_of(k)
    return f"{d.month}/{d.day}"


def wd(k):
    w = WD[d_of(k).weekday()]
    return f"{w}・祝" if k in HOLIDAYS else w


def mdw(k):
    return f"{md(k)}（{wd(k)}）"


def is_holiday_like(k):
    return d_of(k).weekday() == 6 or k in HOLIDAYS


def day_class(k):
    if is_holiday_like(k):
        return "day sun"
    if d_of(k).weekday() == 5:
        return "day sat"
    return "day"


def event_days(ev, today):
    """今日以降の開催日（dates があるとき）。期間イベントは None。"""
    if ev.get("dates"):
        return [d for d in ev["dates"] if d >= today]
    return None


def is_upcoming(ev, today):
    return ev.get("end", "") >= today


def first_day(ev, today):
    days = event_days(ev, today)
    if days:
        return days[0]
    return max(ev.get("start", today), today)


def when_full(ev, today):
    days = event_days(ev, today)
    if days:
        text = "・".join(mdw(d) for d in days)
    else:
        text = f"{mdw(ev['start'])}〜{mdw(ev['end'])}"
    if ev.get("dateNote"):
        text += f"　{ev['dateNote']}"
    return text


# ---------- 部品 ----------

def safe_url(u):
    return u if isinstance(u, str) and u.startswith("https://") else None


def file_id(ev):
    return re.sub(r"[^a-z0-9-]", "-", ev["id"].lower()).strip("-") or "event"


def event_href(ev, prefix):
    return f"{prefix}event/{file_id(ev)}.html"


def badges(ev):
    out = []
    if ev.get("free") is True:
        out.append(f'<span class="badge free">{e(ev.get("fee") or "無料")}</span>')
    elif ev.get("fee"):
        out.append(f'<span class="badge">{e(ev["fee"])}</span>')
    label, cls = RESERVE.get(ev.get("reserve"), RESERVE["check"])
    out.append(f'<span class="badge {cls}">{label}</span>')
    for a in ev.get("ages") or []:
        if a in AGE_LABEL:
            out.append(f'<span class="badge">{AGE_LABEL[a]}</span>')
    return "".join(out)


def card(ev, prefix, day=None, today=None):
    if day:
        when = mdw(day)
        if ev.get("time"):
            when += f"　{ev['time']}"
        others = [d for d in (ev.get("dates") or []) if d != day and d >= today]
        if others:
            when += f"　（ほかに {'・'.join(md(d) for d in others)} も開催）"
    else:
        when = when_full(ev, today)
        if ev.get("time"):
            when += f"　{ev['time']}"
    tip = f'<p class="tip"><b>子連れポイント</b>{e(ev["tip"])}</p>' if ev.get("tip") else ""
    age = f'<p class="line"><span class="k">対象</span><span>{e(ev["age"])}</span></p>' if ev.get("age") else ""
    summary = f'<p class="sum">{e(ev["summary"])}</p>' if ev.get("summary") else ""
    links = [f'<a href="{event_href(ev, prefix)}">詳しく見る →</a>']
    if safe_url(ev.get("url")):
        links.append(f'<a href="{e(ev["url"])}" target="_blank" rel="noopener">公式ページ（{e(ev.get("source") or "公式")}）↗</a>')
    links_html = "".join(links)
    return f"""<article class="ev">
  <div class="ev-top"><span class="cat">{e(ev.get("category") or "イベント")}</span><span>{e(ev["city"])}</span></div>
  <h3><a class="ev-link" href="{event_href(ev, prefix)}">{e(ev["title"])}</a></h3>
  <p class="line"><span class="k">いつ</span><span>{e(when)}</span></p>
  <p class="line"><span class="k">場所</span><span>{e(ev.get("venue") or "")}</span></p>
  {age}
  <div class="badges">{badges(ev)}</div>
  {tip}
  {summary}
  <div class="links">{links_html}</div>
</article>"""


def hero(photo_key, prefix, place_suffix=""):
    src, place, artist, lic, lic_url, page, pos = PHOTOS[photo_key]
    return f"""<figure class="hero hero-static">
    <div class="hero-frame"><img src="{prefix}images/{src}" alt="{e(place)}{e(place_suffix)}" width="1200" height="525" style="object-position:{pos}"></div>
    <figcaption>
      <span class="hero-place">{e(place)}{e(place_suffix)}</span>
      <span class="hero-credit">写真: <a href="{page}" target="_blank" rel="noopener">{e(artist)}</a> / <a href="{lic_url}" target="_blank" rel="noopener">{lic}</a></span>
    </figcaption>
  </figure>"""


def page(*, title, description, path, body, prefix, og_type="article", jsonld=None, crumbs=None):
    url = SITE + path
    ld = []
    if crumbs:
        ld.append({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": name, "item": SITE + href}
                for i, (name, href) in enumerate(crumbs)
            ],
        })
    if jsonld:
        ld.extend(jsonld)
    ld_html = ""
    for x in ld:
        data = json.dumps(x, ensure_ascii=False).replace("</", "<\\/")
        ld_html += '<script type="application/ld+json">' + data + "</script>\n"
    crumb_html = ""
    if crumbs:
        parts = [f'<a href="{prefix}{href}">{e(name)}</a>' for name, href in crumbs[:-1]]
        parts.append(f"<span>{e(crumbs[-1][0])}</span>")
        crumb_html = f'<nav class="crumbs" aria-label="現在地">{" › ".join(parts)}</nav>'
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="{SITE}og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#00704a">
<link rel="icon" href="{prefix}favicon.svg" type="image/svg+xml">
<link rel="icon" href="{prefix}favicon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="{prefix}apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Dela+Gothic+One&display=swap">
<link rel="stylesheet" href="{prefix}style.css">
{ld_html}</head>
<body>
<div class="wrap">
  <header class="masthead masthead-sm">
    <div class="mast-bar">
      <span>神奈川県央の子連れおでかけ情報</span>
      <span class="issue">{md(updated_global[0])}更新　毎週金曜更新</span>
    </div>
    <p class="mast-title"><a href="{prefix}">週末子連れカレンダー<span class="ed">県央版</span></a></p>
    <nav class="mast-nav" aria-label="サイト">
      <a href="{prefix}">イベント一覧</a>
      <a href="{prefix}#explore">エリア別</a>
      <a href="{prefix}#tokushu">特集</a>
      <a href="{prefix}about.html">このサイトについて</a>
    </nav>
  </header>
  {crumb_html}
{body}
  <footer class="site-footer">
    <div class="colophon">
      <p class="colo-title">{SITE_NAME}</p>
      <dl>
        <dt>発行</dt><dd>毎週金曜日更新</dd>
        <dt>編集</dt><dd>けんつ</dd>
        <dt>エリア</dt><dd>厚木・海老名・座間・綾瀬・大和・相模原・伊勢原・愛川・清川</dd>
      </dl>
    </div>
    <nav aria-label="サイト情報">
      <a href="{prefix}">イベント一覧</a>
      <a href="{prefix}about.html">このサイトについて・お問い合わせ</a>
      <a href="{prefix}privacy.html">プライバシーポリシー</a>
    </nav>
    <p>掲載内容は変わることがあります。お出かけ前に、各イベントの公式ページで最新情報を確認してください。</p>
    <p>&copy; {SITE_NAME}</p>
  </footer>
</div>
</body>
</html>
"""


AGGREGATORS = ("いこーよ", "厚木らぼ", "Yahoo", "X", "Instagram", "ことさが", "ウォーカー")


def organizer_name(ev):
    src = (ev.get("source") or "").strip()
    if src and not any(a in src for a in AGGREGATORS):
        return re.sub(r"(の)?公式(サイト|HP|ホームページ|X|Instagram)?$", "", src) or src
    return ev.get("venue") or ev["city"]


def lowest_yen(fee):
    """料金の文から いちばん安い金額（円）を取り出す。「無料」があれば 0、金額がなければ None。"""
    if not fee:
        return None
    nums = [int(n.replace(",", "")) for n in re.findall(r"(\d[\d,]*)\s*円", fee)]
    if "無料" in fee:
        nums.append(0)
    return min(nums) if nums else None


def event_jsonld(ev, today):
    m = re.match(r"^(\d{1,2}:\d{2})\s*〜\s*(\d{1,2}:\d{2})", ev.get("time") or "")

    def iso(d, hm):
        return f"{d}T{hm.zfill(5)}:00+09:00" if hm else d

    base = {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": ev["title"],
        "description": " ".join(x for x in [ev.get("summary"), ev.get("tip")] if x),
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": "https://schema.org/EventCancelled" if ev["title"].startswith("【中止】") else "https://schema.org/EventScheduled",
        "location": {
            "@type": "Place",
            "name": ev.get("venue") or ev["city"],
            "address": {"@type": "PostalAddress", "addressLocality": ev["city"], "addressRegion": "神奈川県", "addressCountry": "JP"},
        },
        "isAccessibleForFree": ev.get("free") is True,
        "url": SITE + f"event/{file_id(ev)}.html",
        "image": [SITE + "og-image.jpg"],
    }
    # 主催者: 出典が「○○公式」ならその名前、情報サイト（いこーよ など）のときは会場。出演者は決まっていないことが多いので主催者と同じにする
    org = {"@type": "Organization", "name": organizer_name(ev), "url": ev.get("url") or base["url"]}
    base["organizer"] = org
    base["performer"] = {"@type": "Organization", "name": org["name"]}
    offer = {"@type": "Offer", "priceCurrency": "JPY", "url": ev.get("url") or base["url"], "validFrom": today,
             "availability": "https://schema.org/SoldOut" if ev.get("reserve") == "closed" else "https://schema.org/InStock"}
    price = 0 if ev.get("free") is True else lowest_yen(ev.get("fee"))
    if price is not None:
        offer["price"] = price
    base["offers"] = offer
    days = event_days(ev, today)
    if days:
        return [dict(base, startDate=iso(d, m and m.group(1)), endDate=iso(d, m and m.group(2))) for d in days[:8]]
    return [dict(base, startDate=ev["start"], endDate=ev["end"])]


def section_by_day(events, today, until, prefix):
    """日付ごとの見出しつき一覧と、期間中ずっと開かれているイベントの一覧を返す。"""
    by_day, periods = {}, []
    for ev in events:
        days = event_days(ev, today)
        if days is None:
            periods.append(ev)
            continue
        for d in days:
            if d <= until:
                by_day.setdefault(d, []).append(ev)
    parts = []
    for d in sorted(by_day):
        cards = "\n".join(card(ev, prefix, day=d, today=today) for ev in by_day[d])
        parts.append(f"""<section class="group">
  <h2 class="{day_class(d)}"><span class="md">{d_of(d).month}月<b>{d_of(d).day}</b></span><span class="wd">{wd(d)}</span></h2>
  <div class="cards">{cards}</div>
</section>""")
    if periods:
        periods.sort(key=lambda x: x["start"])
        cards = "\n".join(card(ev, prefix, today=today) for ev in periods)
        parts.append(f"""<section class="group">
  <h2 class="group-title">期間中いつでも</h2>
  <div class="cards">{cards}</div>
</section>""")
    return "\n".join(parts)


def weekend_of(today):
    t = d_of(today)
    if t.weekday() == 6:
        return [today]
    sat = t + timedelta(days=(5 - t.weekday()) % 7)
    return [sat.isoformat(), (sat + timedelta(days=1)).isoformat()]


# ---------- 各ページ ----------

def build_event_page(ev, events, today, updated):
    prefix = "../"
    slug = CITY_SLUG.get(ev["city"])
    rows = [("いつ", when_full(ev, today))]
    if ev.get("time"):
        rows.append(("時間", ev["time"]))
    rows.append(("場所", ev.get("venue") or ""))
    rows.append(("市町村", ev["city"]))
    if ev.get("age"):
        rows.append(("対象", ev["age"]))
    if ev.get("fee"):
        rows.append(("料金", ev["fee"]))
    rows.append(("予約", RESERVE.get(ev.get("reserve"), RESERVE["check"])[0]))
    if ev.get("reserveNote"):
        rows.append(("申込み", ev["reserveNote"]))
    table = "\n".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in rows)

    links = []
    if safe_url(ev.get("url")):
        links.append(f'<a class="official" href="{e(ev["url"])}" target="_blank" rel="noopener">公式ページで詳しく見る（{e(ev.get("source") or "公式")}）↗</a>')
    if safe_url(ev.get("snsUrl")):
        links.append(f'<a href="{e(ev["snsUrl"])}" target="_blank" rel="noopener">SNSの投稿を見る ↗</a>')

    related = [x for x in events if x["city"] == ev["city"] and x["id"] != ev["id"]]
    related.sort(key=lambda x: first_day(x, today))
    related_html = ""
    if related:
        items = "\n".join(
            f'<li><a href="{event_href(x, prefix)}">{e(x["title"])}</a><span class="when">{e(mdw(first_day(x, today)))}〜</span></li>'
            if not x.get("dates") else
            f'<li><a href="{event_href(x, prefix)}">{e(x["title"])}</a><span class="when">{e(mdw(first_day(x, today)))}</span></li>'
            for x in related[:8]
        )
        more = f'<p class="more"><a href="{prefix}area/{slug}.html">{e(ev["city"])}のイベントをすべて見る →</a></p>' if slug else ""
        related_html = f"""<section class="related">
    <h2>{e(ev["city"])}のほかの子連れイベント</h2>
    <ul>{items}</ul>
    {more}
  </section>"""

    body = f"""  <main class="page event-page">
    <p class="eyebrow">{e(ev.get("category") or "イベント")}｜{e(ev["city"])}</p>
    <h1>{e(ev["title"])}</h1>
    <div class="badges">{badges(ev)}</div>
    {f'<p class="tip"><b>子連れポイント</b>{e(ev["tip"])}</p>' if ev.get("tip") else ""}
    {f'<p class="lead">{e(ev["summary"])}</p>' if ev.get("summary") else ""}
    <table class="info">{table}</table>
    <div class="links">{"".join(links)}</div>
    <p class="note">{md(updated)} 時点の情報です。日時や内容は変わることがあるので、お出かけ前に公式ページで確認してください。</p>
  </main>
  {related_html}"""

    first = first_day(ev, today)
    title = f"{ev['title']}（{md(first)}・{ev['city']}）｜{SITE_NAME}"
    desc_src = " ".join(x for x in [f"{ev['city']}で{when_full(ev, today)}に開かれる子連れ向けイベント。", ev.get("summary"), ev.get("tip")] if x)
    crumbs = [("トップ", "")]
    if slug:
        crumbs.append((f"{ev['city']}のイベント", f"area/{slug}.html"))
    crumbs.append((ev["title"], f"event/{file_id(ev)}.html"))
    return page(title=title, description=desc_src[:120], path=f"event/{file_id(ev)}.html", body=body,
                prefix=prefix, jsonld=event_jsonld(ev, today), crumbs=crumbs)


def build_area_page(city, slug, events, today, updated, range_end):
    prefix = "../"
    mine = [x for x in events if x["city"] == city]
    weekend = weekend_of(today)
    wk = [x for x in mine if any(
        (d in weekend) for d in (event_days(x, today) or [])
    ) or (not x.get("dates") and x["start"] <= weekend[-1] and x["end"] >= weekend[0])]
    wk_label = "・".join(mdw(d) for d in weekend)

    if wk:
        wk_cards = "\n".join(card(x, prefix, today=today) for x in wk)
        wk_html = f"""<section class="group">
  <h2 class="group-title">今週末（{e(wk_label)}）のイベント</h2>
  <div class="cards">{wk_cards}</div>
</section>"""
    else:
        wk_html = f'<p class="notice">今週末（{e(wk_label)}）に{e(city)}で開かれる子連れイベントは、いまのところ見つかっていません。</p>'

    if mine:
        list_html = section_by_day(mine, today, range_end, prefix)
    else:
        list_html = f'<p class="notice">いまのところ、{e(city)}の子連れイベントは見つかっていません。ほかの市町村のイベントもご覧ください。</p>'

    other = " ".join(
        f'<a class="chip-link" href="{s}.html">{e(c)}</a>' for c, s in CITIES if c != city
    )
    body = f"""  {hero(CITY_PHOTO[slug], prefix, "（" + city + "）")}
  <header class="cover">
    <p class="eyebrow">エリア別</p>
    <h1>{e(city)}の子連れイベント<span class="h1-sub">今週末と、これからのおでかけ先</span></h1>
    <p class="intro">{e(city)}で開かれる子ども・親子向けのイベントを、日付順にまとめています。お祭りや工作体験、公園の自然観察、図書館のおはなし会など、{e(city)}周辺で子どもと出かける先を探すときにどうぞ。</p>
    <p class="meta">{md(updated)} 更新　／　{md(range_end)}までの情報　／　{len(mine)}件掲載</p>
  </header>
  <main class="list-page">
{wk_html}
<h2 class="list-heading">これからのイベント</h2>
{list_html}
  </main>
  <section class="explore">
    <h2>ほかの市町村からさがす</h2>
    <div class="chip-links">{other}</div>
  </section>"""
    title = f"{city}の子連れイベント・子ども向けイベント（今週末・{d_of(today).month}月〜）｜{SITE_NAME}"
    desc = f"{city}で開かれる子連れ向け・子ども向けイベントを毎週更新。今週末のおでかけ先が探せます。{len(mine)}件掲載（{md(updated)}更新）。"
    crumbs = [("トップ", ""), (f"{city}のイベント", f"area/{slug}.html")]
    return page(title=title, description=desc, path=f"area/{slug}.html", body=body, prefix=prefix,
                og_type="website", crumbs=crumbs)


def feature_match(ev, rule):
    text = " ".join(str(ev.get(k) or "") for k in ("title", "summary", "tip", "venue", "category"))
    if rule.get("keywords") and not any(k in text for k in rule["keywords"]):
        return False
    if rule.get("categories") and ev.get("category") not in rule["categories"]:
        return False
    if rule.get("ages") and not set(rule["ages"]) & set(ev.get("ages") or []):
        return False
    if rule.get("free") and ev.get("free") is not True:
        return False
    return True


def build_feature_page(ft, events, today, updated, range_end):
    prefix = "../"
    matched = [x for x in events if feature_match(x, ft.get("match", {}))]
    if matched:
        list_html = section_by_day(matched, today, range_end, prefix)
    else:
        list_html = f'<p class="notice">{e(ft.get("empty") or "いまのところ、当てはまるイベントは見つかっていません。")}</p>'
    tips = ""
    if ft.get("points"):
        items = "".join(f"<li>{e(p)}</li>" for p in ft["points"])
        tips = f'<section class="feature-points"><h2>{e(ft.get("pointsTitle") or "子連れで行くときのポイント")}</h2><ul>{items}</ul></section>'
    body = f"""  <header class="cover">
    <p class="eyebrow">特集</p>
    <h1>{e(ft["h1"])}</h1>
    <p class="intro">{e(ft["intro"])}</p>
    <p class="meta">{md(updated)} 更新　／　{len(matched)}件掲載</p>
  </header>
  {tips}
  <main class="list-page">
{list_html}
  </main>"""
    crumbs = [("トップ", ""), (ft["h1"], f"feature/{ft['slug']}.html")]
    return page(title=f"{ft['title']}｜{SITE_NAME}", description=ft["description"],
                path=f"feature/{ft['slug']}.html", body=body, prefix=prefix, og_type="website", crumbs=crumbs), len(matched)


def build_explore(events, feature_counts):
    city_links = " ".join(
        f'<a class="chip-link" href="area/{s}.html">{e(c)}<span class="n">{sum(1 for x in events if x["city"] == c)}</span></a>'
        for c, s in CITIES
    )
    feats = " ".join(
        f'<a class="chip-link" href="feature/{slug}.html">{e(label)}<span class="n">{n}</span></a>'
        for slug, label, n, show in feature_counts if show
    )
    return f"""<section class="explore" id="explore">
      <h2>エリアからさがす</h2>
      <div class="chip-links">{city_links}</div>
      <h2 id="tokushu">特集からさがす</h2>
      <div class="chip-links">{feats}</div>
    </section>"""


# ---------- 実行 ----------

def main():
    today = datetime.now(JST).date().isoformat()
    events = json.loads((ROOT / "data/events.json").read_text(encoding="utf-8"))
    meta = json.loads((ROOT / "data/meta.json").read_text(encoding="utf-8"))
    features = json.loads((ROOT / "data/features.json").read_text(encoding="utf-8"))
    updated = meta.get("updatedAt") or today
    updated_global[0] = updated
    range_end = meta.get("rangeEnd") or (d_of(today) + timedelta(days=35)).isoformat()

    events = [x for x in events if x.get("id") and x.get("title") and x.get("start") and x.get("end") and is_upcoming(x, today)]
    events.sort(key=lambda x: (first_day(x, today), x["id"]))

    # 前回作ったページを消してから作り直す（終わったイベントのページを残さないため）
    for sub in ("area", "event", "feature"):
        (ROOT / sub).mkdir(exist_ok=True)
        for old in (ROOT / sub).glob("*.html"):
            old.unlink()

    urls = ["", "about.html", "privacy.html"]

    for ev in events:
        (ROOT / "event" / f"{file_id(ev)}.html").write_text(build_event_page(ev, events, today, updated), encoding="utf-8")
        urls.append(f"event/{file_id(ev)}.html")

    for city, slug in CITIES:
        (ROOT / "area" / f"{slug}.html").write_text(build_area_page(city, slug, events, today, updated, range_end), encoding="utf-8")
        urls.append(f"area/{slug}.html")

    feature_counts = []
    for ft in features:
        text, n = build_feature_page(ft, events, today, updated, range_end)
        (ROOT / "feature" / f"{ft['slug']}.html").write_text(text, encoding="utf-8")
        urls.append(f"feature/{ft['slug']}.html")
        feature_counts.append((ft["slug"], ft["label"], n, n > 0 or not ft.get("hideWhenEmpty")))

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    new_index = re.sub(r"(<!-- BUILD:EXPLORE -->).*?(<!-- /BUILD:EXPLORE -->)",
                       lambda m: m.group(1) + "\n    " + build_explore(events, feature_counts) + "\n    " + m.group(2),
                       index, flags=re.S)
    index_path.write_text(new_index, encoding="utf-8")

    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sitemap.append(f"  <url><loc>{SITE}{u}</loc><lastmod>{updated}</lastmod></url>")
    sitemap.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    print(f"イベント {len(events)} ページ、市町村 {len(CITIES)} ページ、特集 {len(features)} ページを作りました（{today}）")


if __name__ == "__main__":
    main()
