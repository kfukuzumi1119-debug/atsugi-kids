# あつぎ子連れイベント帳（公開サイト）

厚木市周辺の子連れ向けイベントをまとめた Web サイトです。GitHub Pages で無料で公開しています。

公開URL: https://kfukuzumi1119-debug.github.io/atsugi-kids/

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | トップページ（イベント一覧） |
| `app.js` | イベントの表示・絞り込みと、Google 向けのイベント情報（構造化データ）の出力 |
| `style.css` | 見た目の設定 |
| `about.html` | このサイトについて（運営者情報・お問い合わせ） |
| `privacy.html` | プライバシーポリシー |
| `sitemap.xml` | 検索エンジンにページの一覧を伝えるファイル |
| `data/events.json` | イベントのデータ（毎週 Claude が自動で書き換えます） |
| `data/meta.json` | 最終更新日など |
| `.nojekyll` | GitHub Pages でそのまま公開するための空ファイル |

## 公開の手順

### 1. リポジトリ名を変える
1. https://github.com/kfukuzumi1119-debug/cautious-spork を開く
2. **Settings** の一番上「Repository name」を `atsugi-kids` にして「Rename」

### 2. ファイルをアップロードする
1. リポジトリの画面で「Add file → Upload files」
2. このフォルダの中身（`index.html` `app.js` `style.css` `about.html` `privacy.html` `sitemap.xml` `README.md` と、`data` フォルダごと）をドラッグして「Commit changes」
3. `.nojekyll` は隠しファイル扱いでアップロードから漏れやすいので、「Add file → Create new file」でファイル名に `.nojekyll` と入力し、中身は空のまま「Commit changes」

### 3. GitHub Pages を有効にする
1. **Settings → Pages**
2. 「Source」を **Deploy from a branch**、「Branch」を **main** と **/(root)** にして「Save」
3. 数分後、https://kfukuzumi1119-debug.github.io/atsugi-kids/ で公開されます

### 4. 運営者情報を書き換える
`about.html` の「【ここに運営者名…】」「【ここにお問い合わせ先…】」を書き換える（GitHub の画面でファイルを開き、鉛筆マークから編集できます）。

### 5. Google Search Console に登録する
1. https://search.google.com/search-console を開き、「URL プレフィックス」に `https://kfukuzumi1119-debug.github.io/atsugi-kids/` を入力
2. 確認方法で「HTML ファイル」を選び、渡される `google〇〇〇.html` をリポジトリにアップロードして「確認」
3. 左メニュー「サイトマップ」で `sitemap.xml` を送信

## このあとの流れ
- 毎週の自動更新の書き込み先を、このリポジトリの `data/events.json` に切り替える（Claude が設定します）
- 見てくれる人が増えてきたら、独自ドメインを取得して AdSense に申し込む（AdSense は `github.io` のアドレスでは申し込めません）
