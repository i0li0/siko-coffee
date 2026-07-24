# ブレンド共創プラットフォーム構想 — 計画書（正本）

> 現行の Sikō Coffee ショップを、ユーザーがコーヒー豆のブレンドを共創し、複数の焙煎者をコラボさせて購入できるプラットフォームへ拡張する構想の、全体設計をまとめた正本。
> 最終更新: 2026-07-21 ／ ブランチ: `claude/shop-platform-marketplace`
> 対になる記憶: `memory/blend-platform-plan.md`（ポインタ）。詳細はこのファイルが正本。

---

## 1. 構想の骨子

- ユーザーがコーヒー豆のブレンドを**数値比率で自由に作成**し、**命名・作成意図（ストーリー）**を付与できる。
- **複数の焙煎者を自由に混ぜてコラボレーション**できる。
- ブレンドに使う豆は、Sikō が参加焙煎者から**一般小売価格（定価）で仕入れて**、自社商品として再販する。
- Sikō 自身もユーザー／出品者としてプラットフォームに参加する。

この「再販型」を選んだことで、仲介型マーケットプレイスに伴う重い法規制・決済要件の大半を回避できている（後述）。

---

## 2. ビジネスモデル（確定）

| 項目 | 決定 |
|---|---|
| 取引形態 | **再販型**（Sikō が買い取って自社商品として販売。仲介ではない） |
| 収益源 | **参加焙煎者のサブスクリプション（＝広告料）**。豆のマージンでは稼がない |
| 焙煎者の受取 | **自分で決めた価格**で売れる（金銭的不利ゼロ）。サブスク会員の**期間だけ**参加可 |
| 価格 | **焙煎者が豆ごとに設定した価格が、そのまま購入者価格に直結（Sikōは無マージンのパススルー再販）**。ブレンドは構成豆の価格×比率の加重合算。収益はサブスクで確保 → §6.1.2 |
| 在庫 | **在庫先行型（A型）**。廃棄リスクは許容。鮮度（焙煎後2〜4週）管理が運用の核心 |

**損益分岐**：`収益 = Σ サブスク料(実質0.957n) −（廃棄・在庫コスト ＋ 運用費 ＋ 返金失注の決済手数料）`
→ サブスク価格の根拠は「想定廃棄率」。1〜2社ぶんの在庫量・廃棄率を試算してから価格決定する。

**サブスク料 n（2026-07-21確定・段階制）**
- **創業メンバー価格＝¥3,000/月（税込）でスタート**。最初の数社の立ち上げ用。ほぼ原価だが摩擦を最小化して参加を促す（設計原則「昇格を容易に」）。**実数値（実廃棄率・GMV・失注率）を見て判断・再調整していく**方針。
- 参考の標準水準＝約¥6,000/月（実測で原価確認後の移行先イメージ、確定ではない）。
- 試算根拠（G＝¥40,000/月・廃棄≒GMVの5%想定時）：1焙煎者あたり現金コスト≒¥3,650/月（廃棄¥2,000＋上り送料¥1,000＋資材¥500＋失注手数料¥150、店主労務は現金外）。原価分岐 n≒¥3,800。**最大の変数は廃棄率**＝n精度は廃棄率精度。
- Sikōの収益構造：**他焙煎者のサブスクのみが収益源**（自分の豆はパススルー±0、自己サブスク非計上§4）。純益は焙煎者数に比例（例 n=¥6,000で10社≒¥21,000/月）＝規模を増やす方が効く。
- 将来分岐：販売量のバラつきが大きいと固定 n は「多売ほど廃棄コスト大なのに同額」の固定vs変動の弱点（Stripe手数料と同型）。兆候が出たら**parランク連動のティア制**へ移行の含み。

**焙煎者にとっての価値**：いつもの定価で売れて、新規顧客にリーチできる「広告枠」。解約を防ぐため、**焙煎者向けダッシュボード**で「自分の豆が使われたブレンド数・販売量・売上・閲覧数」を可視化する（広告効果の見える化）。

---

## 3. 法規制（調査済み・根拠リンクは末尾）

### 3.1 取引デジタルプラットフォーム（DPF）消費者保護法 → **対象外**
- 同法の対象は「プラットフォーム・販売業者・消費者の**三者**が登場する仲介型（モール／オークション）」。
- Sikō は買い取って再販する**二者取引（直販）**なので対象外。
- **維持条件**：消費者向けに「**販売者＝Sikō**」を明確化すること。取り次ぎ構造にすると仲介＝対象化するので、規約・表記で常に販売者を Sikō に固定する。

### 3.2 決済 → **Stripe Connect 不要**
- 消費者からの決済は今の単一 Stripe アカウントのまま。
- 焙煎者への支払いは**仕入れ（買掛）**として別処理。売上分配・資金移動業の論点は発生しない。

### 3.3 食品衛生法 → 焙煎の**営業届出**で概ねカバー
- コーヒーの焙煎・ブレンド・粉砕・小分け・密封包装・通販は「**コーヒー製造・加工業（飲料の製造を除く）**」の**営業届出**に区分（許可ではない）。別途「小分け業」届出も原則不要。
- 焙煎コーヒー豆は令和5年1月19日改正で「密封包装食品製造業（許可業種）」の**対象から除外** → 袋詰めしても許可不要、届出で足りる。
- 「通販専用の届出」は存在しない。製造・加工の届出があれば販路（ネット／店頭／卸）は問わない。
- **唯一の変数＝加工を行う施設（場所）**。届出は施設単位。→ Sikō 側で確認（後述 §10）。
- 届出以外の要整備：**食品衛生責任者**（施設ごと）、**HACCP に沿った衛生管理**、**食品表示（一括表示ラベル）**、**特商法表記**。

### 3.4 食品表示法 → ブレンドごとに**一括表示ラベルの自動生成**が必要
各ブレンド袋に以下を表示：
- 名称（原材料100%コーヒー豆なら「レギュラーコーヒー」）
- 原材料名＝**生豆生産国**（重量順。3か国以上は上位2か国＋「その他」）
- **原料原産地表示**（2022年4月義務化。重量1位の原材料の原産地）
- 内容量／賞味期限／保存方法／**製造者（Sikō）**、挽いた場合は挽き方
- 業界の**公正競争規約**にも準拠
- → **データモデル要件**：ブレンドは「焙煎者名＋比率」だけでなく、**各豆の生豆生産国＋重量比**まで保持しないとラベルを自動生成できない。

### 3.5 インボイス制度 → 免税焙煎者からの仕入れはコスト増
- Sikō は豆を仕入れて再販するので**仕入税額控除**を使う立場。相手が**免税事業者**だと控除が段階縮小：〜2026/9=80%、2026/10〜=70%、以後 50%→30%→2031/10 に 0%。
- **対策**：オンボーディングで**適格請求書発行事業者の登録番号を取得**（実コスト認識用。免税焙煎者を排除する必要はない）。会計方針とは別問題。

---

## 4. 会計（確定）

- **Sikō 自身のサブスク**：支払う扱いにするが**帳簿計上しない**（同一事業者内の付け替えのため）。→ **法人分離はしない**。
- 公平性は「会計」ではなく「**運用ルール＋開示**」で担保：システム上は Sikō も一参加者として同一ルールを通し、画面で「Sikō Coffee も同条件で参加」と開示する。
- 具体的な仕訳・消費税・インボイスの処理は**税理士に確認**（自己サブスク＝計上しない、法人分離＝しない、の方針は確定済み）。

---

## 5. 同意設計（確定）

個別確認は非現実的 → **参加登録（販売者昇格）時の規約同意**で取得。**選択式オプトイン**で以下を明示取得：
- ブレンド利用の可否（他社混合を許可 ／ **シングルオリジンのみ**）
- 名称・ストーリーへの掲載可否
- 退会後の在庫売り切り継続への同意（買取済み在庫を退会後も名称表示のうえ売り切る）
- 適格請求書発行事業者の登録番号（**任意・保持のみ**。SikO免税のため現状は価格に非連動 → §6.1.1）
- 焙煎届出／許可の情報（許可管理台帳へ。**業種＝製造・加工の確認が資格判定の核** → §6.1.1）

**運用**：規約変更時は再同意。参加者レコードに「**規約バージョン＋同意日時**」を保存。消費者向けページでは「販売者＝Sikō」を明確化（§3.1 の維持条件）。

---

## 6. アカウントモデル & 注文フロー（確定・ルート）

### 6.1 アカウント
- 全員まず**購入者アカウント（一般）**で新規登録。
- 販売希望者だけ**規約同意＋昇格 → 販売者アカウント**（販売者も購入可）。
- 昇格＝ミニ・オンボーディング：焙煎届出/許可・インボイス登録番号・規約オプトインをまとめて取得。

#### 6.1.1 販売者昇格（オンボーディング）の確定事項（2026-07-21）

**設計原則：焙煎者にとって分かりやすく、昇格（サブスク登録）を容易に。** 摩擦を最小化し、正規の焙煎者がつまずかず参加できることを最優先する。ゲートは「厳格さ」ではなく「正規の焙煎者だけを通す最小限の関門」として設計する。

**参加資格の判定基準（＝“正規に豆を焙煎している事業者か”のみを見る）**
- 判定の中心は業種：**「コーヒー製造・加工業」等の製造・加工の営業届出／許可**を持つこと。**飲食店営業許可のみ（自家焙煎しないカフェ）は不可**。店舗の有無・規模・課税/免税は問わない。
- **免税事業者OK・店舗を持たない自宅焙煎者OK**（製造・加工の届出があれば可）。
- 手動レビューの拠り所（提出＝営業許可証／届出書の控えの写真・PDF）：①業種＝製造・加工系か ②許可/届出番号 ③施設名称・所在地が申請者と一致 ④交付保健所／自治体 ⑤（許可の場合）有効期限。迷う場合（オープンデータ未掲載の自宅焙煎等）は焙煎機・焙煎風景・販売実績等の傍証で補完（法的要件ではない）。
- **なぜゲートするか**：販売者＝Sikō（法的責任主体）。仕入れる焙煎豆は正規登録された製造者が焙煎したものである必要があるため（Sikō自身の届出はブレンド・小分けをカバー、素材焙煎の資格は焙煎者側の届出が担保）。

**検証の自動化方針＝半自動ゲート**
- 厚労省「食品衛生申請等システム」オープンデータ（令和3年6月以降・自治体別CSV・業種/番号/施設名/所在地/申請者名等を含む・月次更新）を取り込み、番号・名称・所在地で自動突合し**業種が製造・加工なら自動グリーン**。
- 完全自動は不可（①開示は事業者オプトインで非公開だと空欄 ②月次のタイムラグ ③自治体別ダウンロードでリアルタイムAPIではない ④令和3年6月以降のみ）。→ **自動一次判定＋漏れは手動レビュー**で運用。昇格は時間シビアでないためバッチ取込で足りる。

**インボイス（登録番号）の現状扱い**
- **Sikō は現在“免税事業者”（売上1000万円未満）** → 消費税を納めないため**仕入税額控除が発生せず、焙煎者の免税/課税はSikOのコストに一切影響しない**。よって免税焙煎者を無条件・無ペナルティで受け入れる。
- データは **T番号／課税・免税フラグを保持のみ**（入力は任意）。**価格・サブスクへの転嫁ロジックは組まない（現状）**。
- **再検討トリガー**：SikOの売上が1000万円へ近づき課税事業者へ転換したとき。かつ**原則課税**を選んだ場合のみ経過措置（〜2026/9=80%、2026/10〜=70%、以降段階縮小）が効く。**簡易課税**（売上5000万以下で選択可）を選べば転換後も焙煎者のT番号は無関係のまま。
- 留意：SikOも免税の間は顧客へ適格請求書を発行できない（B2C中心なら実害なし。将来の法人卸のみ意識）。

#### 6.1.2 掲載と価格の確定事項（2026-07-21）

**価格決定権は焙煎者。豆ごとに設定でき、その価格がそのまま購入者価格に直結する（Sikōは価格を決めない・無マージンのパススルー再販）。**
- 旧叩き台「Sikōが定価を決定／店舗基準 1000円/100g」は**撤回**。Sikō店舗の価格基準は本プラットフォームに持ち込まない。
- Sikō自身も一参加焙煎者として同じ仕組みで自分の豆の価格を設定する（§4 の同一ルール開示と整合）。
- **コールドスタート**：新規豆は掲載時に自動で**ランク0＝受注生産のみ**から開始（§7、確定・実装詳細）。

**この決定が生む付随論点（叩き台つき・要確定）**
- 価格の単位：**円/100g で保持**。ブレンド価格＝Σ(構成豆の円/100g × その豆のg数)。→ 加重合算はデータモデル §11 の派生値。
- 税込/税抜：SikO免税＋総額表示義務 → 焙煎者は**税込の消費者価格/100g を入力**し、それを棚価格とする（叩き台）。
- SikO運用コストの回収：無マージンのため、ブレンド小分け・廃棄・上り送料は**サブスク**、下り送料は**購入者負担**で回収。
- **決済手数料の帰属（2026-07-21確定・B方式）**：**通常注文のStripe手数料（3.6%）は購入者が負担**（棚価格にグロスアップ内包＝焙煎者は満額・SikO無傷でGMVに自動追従）。ただし**「即課金→発注失敗→全額返金」の失注ぶんの手数料はStripeが返さない**ため**SikOがサブスクで負担**（自社都合の失敗を購入者に転嫁しない）。失注頻度は自動承認＋受注上限＋コールドスタート受注生産で抑制。補助レバー＝銀行振込(1.5%)等の低料率手段。※手数料は税込等で実効3.6〜4%で見込む（SikO免税ゆえ控除不可）。サブスク課金自体はStripe Billingで+0.7%（実効4.3%）。
- 価格変更のガバナンス（**2026-07-21確定**）：**掲載中ブレンドの表示価格は常に最新へ自動再計算**（`blends` は価格を保持せず、閲覧時に各構成豆の現行 `pricePer100g` から Σ で導出＝§11.4 の forward Get・blend無状態と整合）。ただし**注文が成立した時点で価格スナップショットを固定**（`orders` に確定額を保存＝発注後の価格変動は当該注文に影響しない）。つまり「閲覧＝常に最新／確定注文＝固定」の二段構え。退会・停止時のブレンド再計算はコラボ依存論点（§6.2/§6.3）と同根。

### 6.2 履行フロー（分岐込み）
1. **ブレンド作成**：比率を数値設定・命名・ストーリー付与／複数販売者をコラボ。
2. **在庫取得＆状態表示**：豆ごとの購入者向け表示は**焙煎者の供給申告＋Sikō在庫から自動計算**（2層モデル → §6.2.1）。`Sikō在庫あり→「在庫あり・最短出荷」`／`在庫なし＆受付中＆枠内→「受注生産・N日」`／`停止 or 枠超過→「一時停止／入荷待ち」`。
3. **購入確定**：在庫を再取得 → **最も遅い豆を基準に ETA 確定** → **即課金**。
4. **判定：在庫を一括確保**（`TransactWriteItems` で reserve）。豆単位で分岐：
   - 在庫足りる → **SikO 在庫から引当** → 合流(6)
   - 足りない → **発注ルート**へ
5. **発注ルート：判定＝販売者ステータス**（事前設定に照らし自動判定）：
   - 受注上限内 → **自動承認** → 焙煎 → 用意 → **上り配送（潮新町ハブ着）** → 合流(6)
   - 例外（上限超過／一時停止／生豆不足）→ **手動対応 or タイムアウト（例48h）**：
     - 承認 → 焙煎 → 用意 → 上り配送 → 合流(6)
     - 辞退／時間切れ → **即課金分を返金**、または購入者へ「**待つ／別の豆に変更**」を提示 → 終了
6. **合流：全構成豆が揃う** → 計量・調合 → **法定表示ラベル自動生成**。
7. **下り発送（購入者負担）→ 配送追跡 → 到着**。

**重要な設計原則**：
- 遅延は「初回だから」ではなく「**その時点で在庫が足りるか**」で決まる（stock-driven）。ETA は注文ごとに動的算出。
- 課金は**購入時に即課金 ＋ 発注失敗時に返金**。焙煎開始後はキャンセル不可を購入者規約に明記。前払いを原資に発注するため Sikō の資金持ち出しがない。
- 承認は**事前設定＋自動承認（例外のみ手動）**。「承認ボトルネック」と「販売者の生豆不足」を、販売者の**豆ごとのステータス面**に集約して同一機構で吸収する。

#### 6.2.1 焙煎者の在庫ステータス設定（コントロール面・2026-07-21確定）

**2層モデル**：焙煎者が申告するのは「供給能力」のみ。**購入者向け表示は申告＋Sikō在庫から自動計算**（在庫あり＝Sikōハブの事実であり焙煎者は名乗らない）。

**焙煎者が決める5項目（豆ごと。＋⑤はアカウント全体）**
1. **どの豆を売れるか**：掲載（新規は§7のコールドスタート＝ランク0・受注生産から自動開始）。
2. **受注上限**：**週あたりの受注量（kg/週）＝期間スループット**で確定。自動承認の入力源＝残枠内は自動承認、超過は§6.2の例外（手動 or 48hタイムアウト）へ。「1注文あたり上限」は補助として任意追加可。
3. **価格**：円/100g（税込入力・§6.1.2）。
4. **リードタイム**：在庫がない場合にSikō発注から用意できるまでの日数（受注生産時のETA基準）。
5. **受注受付ON/OFF（一時停止）＋休止モード**：豆ごとの受付停止と、アカウント全体の一括停止（旅行・体調・生豆切れ用のワンタッチ）。

**遡及しないルール**：設定変更（価格・ステータス・上限）は**新規注文にのみ反映／進行中（焙煎中・発注済）はスナップショット固定**（§6.1.2の価格スナップショットと統一）。

**UX原則**：焙煎者向けに極力シンプル・**モバイル前提**。**「購入者にはこう見える」プレビューを常時表示**して誤設定を防ぐ。要対応の発注件数をベル表示。

### 6.3 コラボ依存の解決（確定・2026-07-21）

**問題の本質**：ブレンドは複数焙煎者の豆の **AND 結合**。購入者から見れば1商品・1価格・1発送だが、構成豆が1つでも欠けると商品全体が不成立になる。可用性は**最も弱い供給者に律速**され、コラボ相手が増えるほど脆い。この「1つ欠ける」は §6.2-4/-5 の**④受注時**（週上限超過／休止／生豆不足）と §7 の**⑦退会**（恒久離脱）で別々に現れるが、**「構成豆の1つが手に入らない」という一点で同根**として同一機構で扱う。

**設計の2軸**：軸1＝回復見込み（一時／不定／恒久）、軸2＝購入者が金を預けているか（課金前／即課金後）。恒久欠け(T3)は極力**課金前に倒す**（購入導線で退会・在庫消化中を先に潰す）のが最重要。

| 欠け方 | 課金前（レシピ閲覧・購入確定ボタン前） | 即課金後（reserve失敗→発注で例外化・焙煎前） |
|---|---|---|
| **T1 一時**（週上限超過・復帰日あり＝ETA算出可） | ETAに+N日を織り込み**購入可**。選択を出さない | **自動で待つ**＋ETA再計算を通知。遅延が閾値超のときのみ選択肢提示 |
| **T2 不定**（休止・復帰未定／生豆不足で目処なし） | バッジ「一部の豆が停止中」→ **待つ(ウォッチ)／差替** を選ばないと確定不可 | 発注タイムアウト（48h）→ 復帰しなければ **差替／全額返金** |
| **T3 恒久**（退会・在庫消化中） | レシピは「要・再構成」表示、そのままは注文不可。**差替**で新版として注文（在庫が残れば残数限り注文可） | **待つは出さない**。即 **差替／全額返金** |

**確定した主要決定：**
- **「抜く」は v1 で禁止 ＝ 差替／返金の2択**。理由（重い順）：①ブレンドは購入者が比率設定・命名・ストーリー付与した"作品"。豆を抜いて再配分すると意図した味・比率でなくなり**同一性が崩れる**（差替なら"その比率・3社コラボ"の意図を保てる）。②比率で香味が決まるコーヒーで再配分は**予測不能な味**が届き、販売者＝Sikō の再販責任で受けるクレーム源。③「1商品1価格」に**部分返金**の概念を持ち込み実装が重い（差替は商品が成立したまま1価格を保てる）。④購入者の意図と違う原材料構成の出荷で**法定ラベルの正しさ**がぶれる。
- **「抜く」の逃げ道**：既定は差替/返金だが、**作成時に購入者が「欠けたら抜いてOK」に明示オプトイン**した場合のみ将来解禁。v1では実装せず、**フラグの置き場所だけデータモデルに確保**（§11）。
- **差替の候補選定 ＝ Sikō推薦＋購入者承認**：Sikō が同系統（生豆生産国・焙煎度が近い）の代替候補を1〜2件推薦 → 購入者が承認。全部購入者任せは味がブレ、全部Sikō任せは同一性の帰属が揺らぐ。推薦＋承認が中間。
- **「待つ」は回復ETAが出せるときだけ提示**（T3では出さない＝待っても無駄で購入者を欺くため）。

**差替に伴う副作用（実装要件）：**
1. **法定ラベル再生成**：比率・生豆生産国が変わるため §3.4 の一括表示ラベルを作り直す。
2. **価格差調整**：各焙煎者が価格決定権（§6.1.2）＝代替豆は別価格。差額は購入者承認を挟んで追加課金／返金（即課金 §6.2-3 との整合）。
3. **同一性の記録**：差替は元レシピの**新バージョン**として扱い、命名・ストーリーの帰属は購入者に残す。
4. **巻き添え・在庫の後始末**：欠けた1社以外（A・C）は健全なのに出荷不能になる巻き添えが起きる。買取済み在庫は §5 の売り切り同意で単品消化に回す（ブレンド部品としては出せなくても単品では売れる）。

**運用パラメータ（暫定既定・要再調整・2026-07-21）**
数値はハードコードせず**設定値として外出し**する。ローンチ前で実データがないため、下記を launch default として置き、**ローンチ後に実測（差替頻度・失注率・鮮度廃棄）で再調整**する（サブスク料¥3,000スタートと同じ扱い）。

- **① T1課金後の遅延閾値**（測定＝購入確定時に約束したETAからの追加遅延 Δ。§6.2-3のETAが基準）：
  - `Δ ≤ 3日` … サイレント（ETA更新を通知のみ、選択肢を出さず待つ）。焙煎・発送の通常変動幅。
  - `3日 < Δ ≤ 7日` … 選択肢を提示するが注文は継続（待つ=既定／差替／全額返金、無操作でも進む）。
  - `Δ > 7日、または A/C 同時確保ロットが鮮度切れになる待ち` … サイレントの「待つ」を出さず**購入者の能動選択（差替 or 返金）を必須**。実質 T2 として扱う。
  - **7日の根拠＝鮮度天井**：待てる上限 = min（購入者の我慢, 同時確保した他ロットの鮮度 §7）。Bを長く待つと A/C が老化し仕上がりが2〜4週窓を割る。再プロンプトはしない（Tier Bで通知済みなら Tier C 突入時のみ1回エスカレーション）。
- **② 差替の価格差承認ライン**（原則＝購入者の支払額は §6.1.2 スナップショットで固定、Δ はSikō側の問題）：
  - **推薦バンド**：Sikō は元豆と同系統かつ**±¥100/100g 圏**の代替のみ推薦（味の方向性＋Δの上限を設計で有界化）。
  - **吸収バンド `|Δ| ≤ ¥100/100g`（≒ブレンド価格の3〜5%）**：Sikōが飲む＝購入者に聞かず価格据え置き（値上がりはSikO負担、値下がり僅少はSikO側に残す）。摩擦ゼロの主経路。
  - **吸収バンド超**：必ず明示承認。値上がりは新価格を提示し承認（未承認なら差替せず返金/キャンセル）、値下がり超は軽い部分返金承認を挟む。
  - **絶対ルール**：吸収バンドを超える増額を購入者の同意なしに請求しない。
- **再調整トリガー**：差替頻度／失注率／鮮度廃棄の実測。値はコード改修なしに設定変更でチューニング可能に保つ。

---

## 7. 在庫・鮮度ポリシー（確定）

- **需要連動の適正在庫（par level）**：週次売上で発注ランクを **100g 単位**で上下（人気豆は厚く・不人気豆は薄く自動調整）。
- **3つのガードレール**：
  1. **鮮度で上限**：鮮度期限（2〜4週）内に売り切れる量を超えて積まない。
  2. **リードタイムを覆う下限**：発注中に切れないよう、リードタイム中の想定販売量以上を確保。
  3. **コールドスタート**：売上履歴のない新規豆・新規販売者は**ランク0＝受注生産のみ**から開始。
- ランク＝在庫目標（100g刻み）、**実発注は販売者の最小ロット（例1kg）に切り上げ**。
- 在庫は「**販売者 × 焙煎日**」のロット単位で保持。鮮度で自動的に販売停止／値引き／廃棄フラグ。1ブレンド内で古／新ロットを混ぜてよいかの鮮度ポリシーは要定義。

---

## 8. 配送（確定）

| 区間 | 内容 | 負担 |
|---|---|---|
| 上り（販売者 → Sikō） | 仕入れの発送 | **Sikō 負担／サブスクに内包**。**発注をバッチ化**して回数を削減 |
| 下り（Sikō → 購入者） | 商品お届け | **購入者負担**。配送追跡あり |

---

## 9. 同時実行（在庫）の技術方針

- 在庫は `onHand` / `reserved` の2値。`available = onHand − reserved`。ロット単位＝「販売者×焙煎日」。
- **確保（reserve）は決済開始時**：`UpdateItem` の `ConditionExpression`（`reserved + qty <= onHand`）で原子的に加算。条件不成立＝在庫割れ → その豆だけ発注ルートへ。
- ブレンドは複数ロットにまたがるので **`TransactWriteItems` で全構成豆を一括確保**（1つでも足りなければ全体失敗 → 失敗豆を発注へ振り分け）。ロック不要の楽観的同時実行。
- 確保レコードに **TTL**。決済未完了は自動失効。成功時は `onHand` と `reserved` を確定減算、失敗/失効時は `reserved` を戻す。失効の戻しは **expireAt の GSI を Query**（`ScanCommand` は使わない ← 既存方針）。

---

## 10. Sikō の営業登録状況

| 業態 | 区分 | 場所 | 有効期限 | 状態 |
|---|---|---|---|---|
| カフェ | 飲食店営業**許可** | 潮新町 | あり（更新要） | 有効 |
| 屋台 | 飲食店営業**許可** | 潮新町 | あり（更新要） | 有効 |
| 焙煎 | コーヒー製造・加工業 **届出** | 北新田町 → **潮新町へ訂正申請中** | なし | 有効 |

- 管轄＝高知市保健所。
- **物理ハブ**：全仕入れが Sikō 施設（潮新町ハブ想定）に集約。焙煎届出の住所を自宅（北新田町）→ カフェ（潮新町）へ**訂正申請中**。これで「加工場所＝届出施設」の整合が取れる。
- 移った懸念：潮新町カフェが**複数販売者ぶんの豆の保管キャパ・計量/ブレンド作業スペース**を賄えるか（§7 の在庫ランク上限と連動）。
- ※ 詳細（施設番号・連絡先等）は `許可営業施設一覧` / `届出営業施設一覧` の xlsm を参照。個人連絡先を含むため本書には転記しない。

---

## 11. データモデル設計（確定・2026-07-21）

### 11.0 全体方針
- **既存慣習に完全準拠**（`src/lib/db.ts`）：1エンティティ1テーブルの**複数テーブル方式**。GSI は `list-index`（`gsiPk`＝固定/カテゴリ値 ＋ `gsiSk`＝`createdAt` で新着降順 Query）。`PAY_PER_REQUEST`・region `ap-northeast-1`・prefix `siko-coffee-`（preview は `siko-coffee-preview-`）。
- **`ScanCommand` 禁止**（[[feedback-dynamodb-scan]]）：全アクセスパターンを `GetCommand` か GSI `QueryCommand` で満たすようキー設計する（§11.3 で検証）。
- 元の5テーブル素案を、この慣習に合わせ **8テーブル**に精緻化（対応は §11.1）。既存の `blends`/`orders` は**拡張（GSI追加＝非破壊）**、`roasters`/`beans`/`lots`/`reservations`/`roaster_metrics`/`subscriptions` を**新設**。
- **AWS実機照合済み（ap-northeast-1・2026-07-21）**：新設6テーブルは未存在（衝突なし）。`blends`/`orders` は PK `id` で設計と一致。**既存 `inventory` は PK `beanId`(HASH)のみ＝現行ショップの単一SKU在庫（currentStock/alertThreshold）**で、ロット（beanId×焙煎日の複合キー）へは主キー変更不可のため**触らず温存**し、プラットフォームのロットは新テーブル `lots` に作る。

### 11.1 テーブル一覧（素案5 → 実装8）
| # | テーブル | 素案の対応 | 新設/拡張 |
|---|---|---|---|
| 1 | `blends` | ①ブレンド | 拡張 |
| 2 | `roasters` | ②販売者 | 新設 |
| 3 | `beans` | ②に内包していた掲載豆（§6.2.1の申告5項目）を独立 | 新設 |
| 4 | `lots` | ③在庫ロット | 新設（既存`inventory`はPK`beanId`のみで複合キーに拡張不可＝現行ショップ在庫として温存） |
| 5 | `reservations` | ③の§9予約（TTL失効） | 新設 |
| 6 | `orders` | ④注文＋発注 | 拡張 |
| 7 | `roaster_metrics` | 計測ロールアップ（実廃棄率/GMV/失注率） | 新設 |
| 8 | `subscriptions` | ⑤サブスク | 新設 |

> **なぜ `beans` を独立させたか**：価格決定権（§6.1.2）・受注上限・リードタイム・受注ON/OFF は**豆ごと**の属性で、`blends` は `beanId` を参照する。焙煎者に内包すると豆単位のGSI/更新ができないため独立テーブルにする。

### 11.2 各テーブルの PK / SK / GSI / 主要属性

**1. `blends`（拡張）** — レシピ定義（購入者作成 or Sikōキュレーション、再利用可）
- PK `id`（blendId）※実機一致
- 属性：`name`・`story`・`createdBy`(userId|"siko")・`visibility`("public"|"private")・`version`(N)・`parentBlendId`(差替派生の親)・`allowDrop`(BOOL 既定false・§6.3逃げ道)・`status`("active"|"archived")・`components`=[{`roasterId`,`beanId`,`ratioPct`,`greenOrigin`,`roastLevel`}]・`createdAt`
- GSI `list-index`（**新規追加**：現状GSIなし。公開ブレンド一覧の既存Scanを置換）：`gsiPk`=`"BLEND#PUBLIC"`（公開カタログ）or `"BLEND#USER#<uid>"`（自分のブレンド）、`gsiSk`=`createdAt`

**2. `roasters`（新設）** — 販売者昇格レコード（アカウント統一のため `roasterId` = `userId`）
- PK `roasterId`
- 属性：`displayName`・`status`("active"|"paused"|"withdrawn"|"selling_out")・`pausedUntil`(nullable ISO ← **有ればT1/無ければT2**の判定源)・`license`{no,expiry}・`notification`{no}（許可＝期限監視要／届出＝期限なし、別カラム）・`invoiceRegNo`(T番号・保持のみ)・`termsVersion`・`termsAgreedAt`・`optIns`{allowBlend,allowNameStory,allowSelloutAfterExit}・`createdAt`・`updatedAt`
- GSI `by-status`：`gsiPk`=`status`、`gsiSk`=`updatedAt`（運用：休止/退会一覧）
- GSI `license-expiry`：`gsiPk`=`"LICENSE"`、`gsiSk`=`license.expiry`（許可の期限監視）

**3. `beans`（新設）** — 掲載豆＝§6.2.1 の焙煎者申告5項目
- PK `beanId`
- 属性：`roasterId`・`name`・`greenOrigin`・`roastLevel`・`pricePer100g`(N ← 価格決定権)・`weeklyCapKg`(N ← 受注上限＝自動承認の入力源)・`leadTimeDays`(N)・`orderStatus`("on"|"off"|"paused")・`createdAt`・`updatedAt`
- GSI `by-roaster`：`gsiPk`=`roasterId`、`gsiSk`=`createdAt`（焙煎者の豆一覧・状態波及）
- GSI `list-index`：`gsiPk`=`"BEAN#PUBLIC"`、`gsiSk`=`createdAt`（豆カタログ）

**4. `lots`（新設）** — 在庫ロット＝販売者×焙煎日（既存 `inventory` は現行ショップ単一SKU在庫として別に温存）
- PK `beanId`・SK `roastDate`（yyyy-mm-dd）＝ロット
- 属性：`onHandG`・`reservedG`・**`availableG`**（`= onHandG − reservedG` を**実体として保持**・下記）・`roasterId`（豆のownerを非正規化＝ロット単体で所有者判定）・`parRankG`(100g刻み)・`freshBy`(ISO 鮮度期限)・`status`("fresh"|"discount"|"expired")・**計測**`purchasedG`・`soldG`・`wastedG`
- **なぜ `availableG` を実体で持つか（実装制約・2026-07-23 に判明）**：DynamoDB の `ConditionExpression` は**算術式を書けない**ため、本書が §11.2⑤/§13.3 で書いていた `reservedG + qty <= onHandG` は**そのままでは表現できない**。派生値を属性化すれば `availableG >= :qty` の単純比較で条件付き更新でき、`TransactWriteItems` の all-or-nothing 確保もそのまま実装できる。→ **lots へのあらゆる書き込みで `availableG = onHandG − reservedG` を維持する**（実装③で導入済み。§13.3 の確保条件は `availableG >= :qty` ＋ `ADD availableG :-qty, reservedG :qty` に読み替える）。
- GSI `by-freshBy`：`gsiPk`=`"LOT"`、`gsiSk`=`freshBy`（鮮度切れ間近ロットを Query＝廃棄/値引き判定。Scanを使わない）

**5. `reservations`（新設）** — 決済中の在庫確保（§9・TTL失効）
- PK `orderId`・SK `beanId#roastDate`（確保したロット）
- 属性：`qtyG`・`state`("held"|"committed"|"released")・`expireAt`(N epoch ← **DynamoDB ネイティブTTL**)
- GSI `by-expire`：`gsiPk`=`"RSV"`、`gsiSk`=`expireAt`（cron が失効ぶんを Query して `reservedG` を戻す。TTLはバックストップ、確実な戻しはこのGSI）
- 確保＝`lots` を `UpdateItem` の `ConditionExpression`（**`availableG >= :qty`** ※算術式は書けないため §11.2④ の派生属性を使う）で原子加算（`ADD reservedG :qty, availableG :-qty`）。ブレンドは複数ロットを `TransactWriteItems` で一括確保（1つでも不成立なら全体失敗→失敗豆を発注へ）。

**6. `orders`（拡張）** — 注文＋発注＋差替（既存 PK `id` 維持）
- 既存：`items`・`status`・`createdAt`・`userId`
- 追加：`blendId`・`blendVersion`・`etaPromised`(ISO ← 遅延Δの基準 §6.3)・`etaCurrent`・`charge`{paymentIntentId,amount,state("authorized"|"paid"|"refunded"|"partial_refund")}・`procurement`=[{roasterId,beanId,mode("stock"|"po"),poStatus("auto_approved"|"pending"|"declined"|"timeout"),timeoutAt(48h),uplinkTracking}]・`exception`{type("T1"|"T2"|"T3"|null),phase("pre_charge"|"post_charge")}・`substitution`=[{fromBeanId,toBeanId,deltaYen,absorbedBySiko(BOOL),approvedByBuyerAt}]・`downlinkTracking`・`labelSnapshot`(生豆生産国/重量比を発注時固定＝法定ラベル §3.4)
- GSI（**実機に既存**）：`userId-index`(HASH `userId`)・`customerEmail-index`(HASH `customerEmail`)。購入者の注文履歴はこれで足りる。**createdAt降順が要るなら** range key 付き GSI（`userId`+`createdAt`）を新規追加、当面は `userId-index` Query＋クライアント側ソートで可。

**7. `roaster_metrics`（新設）** — 計測ロールアップ（n再調整の根拠・Scan回避）
- PK `roasterId`・SK `yyyy-mm`（月次）
- 属性：`gmvYen`・`orderCount`・`lostCount`（失注＝差替辞退/返金）・`purchasedG`・`soldG`・`wastedG` → **実廃棄率**=wasted/purchased・**失注率**=lost/(orders+lost)・**月次GMV**=gmvYen
- 更新：注文paid/ロット廃棄/返金の各イベントで原子 `ADD`（集計Scan不要）。§6.3の運用パラメータ再調整もこの表を見る。

**9. `pos`（新設・2026-07-23 追加）** — 発注（Purchase Order）＝ `orders.procurement[]` の焙煎者向け逆引き
- PK `roasterId`・SK `poKey`（=`<orderId>#<beanId>`）
- 属性：`orderId`・`beanId`・`beanName`・`qtyG`・`poStatus`("auto_approved"|"pending"|"accepted"|"declined"|"timeout")・`timeoutAt`・`leadTimeDays`・`respondedAt`・`comment`
- GSI `by-status`：`gsiPk`=`"PO#<poStatus>"`、`gsiSk`=`timeoutAt ?? createdAt`（cron は `PO#pending` × `timeoutAt<=now` を Query／admin は任意ステータスを Query）
- **なぜ独立テーブルにしたか**：焙煎者が自分宛の発注を引くには逆引きが要るが、`procurement` は**リスト属性で GSI キーにできず**、`orders` の Scan は禁止（[[feedback-dynamodb-scan]]）。§11.4 の「逆引きは必要になってから後付け」を実装⑤で実行した。真実は `orders.procurement[]` 側に置き、`pos` は表示・抽出用の非正規化として**両方を同期**する（`syncOrderProcurement()`）。

**8. `subscriptions`（新設）** — 焙煎者サブスク
- PK `roasterId`・SK `"sub"`（1焙煎者1サブスク）
- 属性：`stripeSubId`・`plan`("founding"|"standard")・`priceYen`(3000)・`status`("active"|"past_due"|"canceled")・`currentPeriodEnd`・`createdAt`
- GSI `by-status`：`gsiPk`=`status`、`gsiSk`=`currentPeriodEnd`（延滞/失効の運用）

### 11.3 主要アクセスパターン → キーの対応（Scanゼロの検証）
| アクセスパターン | 方法 |
|---|---|
| ブレンド表示・注文時に構成豆の可否判定 | `components` の各 `roasterId`→`roasters` Get、各 `beanId`→`beans` Get（**forward・Getのみ**） |
| 在庫確保（原子・複数ロット） | `lots` の `ConditionExpression` ＋ `TransactWriteItems`（§9） |
| 失効予約の戻し | `reservations` GSI `by-expire` Query（＋ネイティブTTL） |
| 鮮度切れロット抽出 | `lots` GSI `by-freshBy` Query |
| 焙煎者の豆一覧・状態波及 | `beans` GSI `by-roaster` Query |
| 休止/退会/許可期限の運用一覧 | `roasters` GSI `by-status` / `license-expiry` Query |
| 購入者の注文履歴 | `orders` GSI `userId-index` Query（既存） |
| n再調整の実廃棄率/GMV/失注率 | `roaster_metrics` Get（月次PK/SK直引き） |

### 11.4 参照整合性（§6.3 の実装根拠）
- ブレンドは `roasterId`/`beanId` を**前方参照**するだけ。可否判定は**注文時・レシピ閲覧時**に各参照先を Get して評価する（`blends` 側に状態を持たせない＝常に最新の焙煎者/豆状態を反映）。
- 焙煎者が `withdrawn`/`paused`（`beans.orderStatus`≠"on"）に落ちた瞬間、その豆を含む注文/閲覧は §6.3 の T2/T3 判定に入る。**"どのブレンドが影響するか"を先に列挙する逆引き（roaster→blends）は v1 では作らない**（forward Get で足りる）。将来「退会で壊れた保存ブレンドを購入者へ一斉通知」が必要になったら、`blend_components` エッジテーブル（PK `roasterId`・SK `blendId`）を後付けする（Scan回避のため）。

### 11.5 メモ
- 参加焙煎者の許可管理台帳（`roasters.license`/`notification`）は、既存の xlsm の列構成をそのまま流用可能。個人連絡先は本DB外（§10）。
- テーブル作成は既存の `scripts/create-*-table.sh` と同じ AWS CLI パターンで用意する。

### 11.6 テーブル作成スクリプトとGSIキー属性名の確定（2026-07-21）
§11.2 は設計スケッチのため、実 create-table に落とす際に **DynamoDB制約** で以下を調整した（正本＝スクリプトは `scripts/create-*-table.sh`）。
- **制約1：GSIキーはトップレベルのスカラー属性のみ**。§11.2② の `license-expiry` GSI キー `license.expiry`（ネスト）は使えないため、GSI用に **`licenseExpiry`（トップレベル）** を非正規化して持つ（表示用 `license{no,expiry}` とは別属性）。**許可の item だけ** `licenseGsiPk="LICENSE"`＋`licenseExpiry` を書く＝**sparse index**（届出は載らない＝監視対象外で正しい）。
- **制約2：1テーブル内で複数GSIが別キーなら別属性名**。同一 `gsiPk`/`gsiSk` は共用できない。汎用「新着降順」用途にだけ `gsiPk`/`gsiSk` を使い、その他は用途別の実属性を直接キーにする。
- 確定した各テーブルのキー/GSI属性名（スクリプト実体）：
  | テーブル | PK / SK | GSI（IndexName：HASH属性 + RANGE属性） |
  |---|---|---|
  | `roasters` | `roasterId` | `by-status`：`status`+`updatedAt` ／ `license-expiry`：`licenseGsiPk`+`licenseExpiry`（sparse） |
  | `beans` | `beanId` | `by-roaster`：`roasterId`+`createdAt` ／ `list-index`：`gsiPk`+`gsiSk` |
  | `lots` | `beanId` + `roastDate` | `by-freshBy`：`gsiPk`(定数"LOT")+`gsiSk`(=freshBy) |
  | `reservations` | `orderId` + `lotKey`(=`beanId#roastDate`) | `by-expire`：`gsiPk`(定数"RSV")+`expireAt`(N,epoch秒)。TTL=`expireAt` |
  | `roaster_metrics` | `roasterId` + `month`(yyyy-mm) | なし |
  | `subscriptions` | `roasterId` + `sk`(定数"sub") | `by-status`：`status`+`currentPeriodEnd` |
- `reservations` の TTL は `update-time-to-live`（`expireAt`＝**epoch秒**）を create 後に有効化する（スクリプトが `wait table-exists` 後に実行）。
- 既存 `blends` は `add-blends-list-index.sh` で GSI `list-index`（`gsiPk`/`gsiSk`）を**非破壊追加**。ただし既存アイテムは両属性が無いため**バックフィル（公開ブレンドに `gsiPk="BLEND#PUBLIC"`・`gsiSk=createdAt` を書く）が別途必要**、済むまで旧 Scan 経路を残す（§13.6）。
- 既存 `orders` の range key 付き GSI（`userId`+`createdAt`）は当面不要（§11.2⑥）＝スクリプト化せず、既存 `userId-index`＋クライアントソートで運用。
- 一括実行は `scripts/create-platform-tables.sh [preview]`（新設6＋blends GSI）。冪等ではない（既存テーブルは `ResourceInUseException`）。

---

## 12. 残タスク・確認事項

- [ ] **焙煎届出の住所訂正**（北新田町 → 潮新町）の完了確認（申請中）。
- [ ] **保健所へ確認**：複数焙煎者の豆をブレンド小分け・通販する場合も、現行の焙煎（コーヒー製造・加工業）届出でカバーされるか。
- [ ] **税理士へ確認**：自己サブスクの会計処理・免税仕入れの消費税影響（方針は確定済み、処理の裏取り）。※現状SikOは免税＝焙煎者のインボイス状態は無関係（§6.1.1）。課税転換時に原則課税/簡易課税の選択とあわせ再確認。
- [ ] **オープンデータ取込の実装調査**：対象自治体（潮新町＝所在自治体ほか）のCSV公開有無・列構成・更新運用を確認し、昇格の自動一次判定パイプラインを設計（§6.1.1）。
- [ ] **サブスク価格**：**創業¥3,000/月でスタート確定**（§2）。実廃棄率・GMV・失注率の実数値を1〜2社×1〜2鮮度サイクルで実測 → 標準水準（≒¥6,000目安）へ再調整を判断。
- [x] **コラボ依存の解決**（§6.3）：欠け方×課金前後の決定表、抜く禁止（差替/返金2択）＋オプトイン逃げ道、差替=Sikō推薦＋購入者承認、**運用パラメータ（遅延閾値3/7日＋鮮度天井・価格吸収バンド±¥100/100g）を暫定既定として確定**、まで確定（2026-07-21）。数値は設定値外出し・ローンチ後に実測で再調整。
- [x] **データモデル設計**（§11）：8テーブルの PK/SK/GSI 確定（2026-07-21）。参照整合性=forward Get・差替バージョニング・計測ロールアップ・Scanゼロ検証まで反映。
- [x] **AWS実機照合**（§11.0）：ap-northeast-1 のテーブル現状を確認（2026-07-21）。新設6は未存在、`blends`/`orders` はPK一致、`inventory` は複合キー拡張不可のためロットは新テーブル `lots` に分離、と設計へ反映済み。
- [x] **API/ルート設計**（§13）：アクター別エンドポイント・認可レイヤ・主要フローのシーケンス・冪等/トランザクション・追加Zodスキーマまで確定（2026-07-21）。既存Route Handler慣習に準拠。
- [x] **テーブル作成スクリプト**（§11.6）：新設6テーブル（`create-{roasters,beans,lots,reservations,roaster-metrics,subscriptions}-table.sh`）＋既存 `blends` への GSI 追加（`add-blends-list-index.sh`）＋一括実行（`create-platform-tables.sh`）を作成（2026-07-21・構文/JSON検証済み）。GSIキー属性名を実装制約に合わせ確定（§11.6）。
- [x] **preview 環境へ適用**（2026-07-21）：`create-platform-tables.sh preview` を実行。新設6テーブルは全 ACTIVE（各GSIも ACTIVE、`reservations` の TTL=`expireAt` ENABLED）。`blends` の GSI `list-index` 追加も実行済み（構築完了後にバックフィル）。
- [x] **`src/lib/db.ts` の `TABLE` に6テーブル追加**（2026-07-21）：`ROASTERS`/`BEANS`/`LOTS`/`RESERVATIONS`/`ROASTER_METRICS`/`SUBSCRIPTIONS`。tsc/eslint クリーン。
- [x] **本番環境へ適用**（2026-07-21）：`create-platform-tables.sh`（prefix無し）を実行。新設6テーブルは全 ACTIVE（各GSIも ACTIVE、`reservations` の TTL=`expireAt` ENABLED）。`blends` の GSI `list-index` は非同期構築中（本番実データのバックフィルに時間を要するが非破壊・未使用のため非ブロッキング）。
- [x] **API実装①：焙煎者昇格オンボーディング**（§13.7・2026-07-21）：型/バリデーション/認可基盤（`requireRoaster` 都度Get）＋4ルート（`roaster/apply`・`account/roaster`・`admin/roasters` GET/PATCH）。tsc/eslintクリーン、401/403/CSRF検証済み。status enum に `pending` 追加。
- [x] **API実装②：掲載豆 CRUD**（§13.7・2026-07-21）：`BeanRecord` 型＋`bean{Create,Update}Schema`＋3ルート（`roaster/beans` GET/POST・`[beanId]` PATCH 所有者チェック）。公開カタログ GSI `list-index` は sparse（off で外す）。tsc/eslint クリーン、preview 実テーブル結合テスト 5/5。
- [x] **API実装③：在庫ロット CRUD**（§13.7・2026-07-23）：`LotRecord` 型＋`lot{Create,Update}Schema`＋3ルート（`roaster/lots` GET/POST・`[beanId]/[roastDate]` PATCH）。数量操作は receivedG/wasteG/onHandG の排他3通り、`reservedG` との競合は **CAS＋409**。計測ロールアップ（`roaster_metrics` 原子 ADD）も接続。**`ConditionExpression` に算術式が書けないため派生属性 `availableG` を導入**（§11.2④・§13.3 の確保条件を読み替え）。tsc/eslint クリーン、vitest 15ケース追加（全139 passed）。preview 実テーブル検証は AWS 資格情報失効のため未実施。
- [x] **API実装④：注文→確保→発注（§13.3）**（2026-07-23）：`reservations` の hold/commit/release（`TransactWriteItems`・all-or-nothing）＋`checkout/blend` のプラットフォーム対応（サーバ側で価格/可否を解決・不足は `mode="po"`）＋Stripe webhook での確定と計測ロールアップ（`claim` で二重計上防止）＋`cron/release-reservations`（10分毎・`vercel.json` 登録済み）。vitest 19ケース追加（全158 passed）、`next build` 通過。週上限の判定は「注文単体 vs 週上限」の近似（実績集計は未実装）。**preview 実テーブル結合テスト 12/12 パス**（実装③ぶんの確認も同梱・`scripts/integration/platform-flow.test.ts`）。
- [x] **API実装⑤：発注応答＋タイムアウト＋差替/返金**（§6.2・§6.3・2026-07-23）：**新テーブル `pos`（§11.2⑨）を preview／本番に作成**（GSI `by-status` ACTIVE）。`roaster/pos` GET・`respond`（`pending` からのみ遷移）・`cron/po-timeouts`（毎時5分・`vercel.json` 登録済み）・`admin/pos`・差替の推薦（admin）と承認/辞退（購入者）。例外は T1/T2/T3 × pre/post_charge で自動分類。差替は同系統＋±¥100/100g 圏に限定し吸収バンド内は支払額据え置き、辞退は全額返金＋`lostCount` 計上。運用パラメータは env 外出し（`src/lib/platformParams.ts`）。poStatus enum に `accepted` を追加。vitest 21ケース追加（全179 passed）、preview 実テーブル結合テスト 15/15、`next build` 通過。
- [ ] 次工程：公開カタログ読取（`GET /api/beans`）＋焙煎者 active 絞り込みも後続。UI（焙煎者昇格フォーム／`account/roaster` 出し分け／豆・ロット管理／カタログからのブレンド作成）は API と並行。`blends` GSI は構築完了＋バックフィル後に旧 Scan を Query へ置換。逆引き（roaster→blends）は必要になってから後付け（§11.4）。
- [ ] **`/shop` の表示は全てテストデータ**（オーナー確認・2026-07-23）：`src/components/shop/blend/data.ts` の `BEANS`（豆3種）・`PRESETS`（定番ブレンド4件）・`COMMUNITY`（みんなのブレンド5件）は産地/味/購入数/作者名すべて架空。**今は消さず**、将来削除して **SikŌ Coffee 自身の豆3種を実物として掲載する**。DynamoDB の `blends` は本番/preview とも0件＝削除対象はコードのみ。差し替え時の連動先：`/shop/product/[key]`・`src/app/sitemap.ts`・Stripe webhook の在庫減算（豆名マッチ）・比率配列が長さ3固定である前提。※ 焙煎者の掲載豆（`beans` テーブル）とは別枠。
- [ ] **週上限（`weeklyCapKg`）の判定を実績ベースへ**：現状は「注文単体 vs 週上限」の近似。`roaster_metrics` の週次化か受注ログの追加が必要（実装④で顕在化）。

---

## 13. API/ルート設計（確定・2026-07-21）

### 13.0 全体方針
- **既存慣習に完全準拠**（`src/app/api/**/route.ts`）：**Route Handlers 一本**（Server Actions は現状不使用のため導入しない）。各ファイル冒頭に `export const dynamic = 'force-dynamic'` と `export const preferredRegion = ['hnd1']`。
- **DBは §11 のキー設計どおり Get/GSI Query のみ**（[[feedback-dynamodb-scan]]）。在庫確保は `TransactWriteItems`＋`ConditionExpression`（§9・§11.2⑤）。
- **検証は Zod**（`@/lib/validation` にスキーマ追加、§13.5）。エラーは既存様式 `NextResponse.json({ error }, { status })`、例外は `Sentry.captureException(err, { tags: { route } })`。
- **レート制限**：状態変更系（POST/PATCH/DELETE）は `checkGeneralRateLimit(ip, { prefix, maxAttempts, windowMs })`（既存 `checkout/blend` に倣う）。
- **決済は既存パターン踏襲**：注文は Stripe Checkout で作成、`pending` で事前保存 → **Stripe webhook で `paid` 化＆在庫コミット**（§13.3）。クライアントから在庫を確定させない。

### 13.1 認可レイヤ（4層）
| 層 | 判定 | 用途 | 実装 |
|---|---|---|---|
| **buyer** | `auth()` のセッション | 購入者（ログイン必須の操作） | 既存 `@/lib/auth` |
| **roaster** | `auth()` ＋ `roasters` Get で `status==="active"` | 販売者専用操作 | **新設 `verifyRoaster()`**（`@/lib/roasterAuth`）。`roasterId = userId`（§11.2②）で自レコードGet |
| **admin** | `verifyAdminToken()` | 昇格承認・発注ダッシュボード等 | 既存 `@/lib/adminAuth` |
| **cron/webhook** | `verifyBearer(CRON_SECRET)` / Stripe署名検証 | 定期・非同期 | 既存 `@/lib/safeCompare` / `webhooks/stripe` |

> **セッション拡張が必要**：現行セッションに role/roaster 情報は無い（`src/lib/auth.ts` 未保持）。`verifyRoaster()` は**都度 `roasters` を Get**して判定する（セッションに焼き込むと昇格取消/休止が即時反映されない）。UIの出し分け用に軽量な `GET /api/account/roaster`（自分の焙煎者状態）を別途用意。

### 13.2 エンドポイント一覧（アクター別）

**購入者（buyer）**
| Method・Path | 認可 | 用途 | 主なテーブル操作 | 参照 |
|---|---|---|---|---|
| `GET /api/blends` | public | 公開ブレンド一覧 | `blends` GSI `list-index`(`BLEND#PUBLIC`) Query ※既存Scanを置換 | §11.2① |
| `GET /api/blends/[id]` | public | ブレンド詳細＋**構成豆の可否判定** | `blends` Get →各 `roasterId`/`beanId` を forward Get | §11.4 |
| `POST /api/blends` | buyer | 自作ブレンド保存 | `blends` Put（`createdBy=userId`,`visibility`,`allowDrop`,`components`） | §6.2.1 |
| `PATCH /api/blends/[id]` | buyer(所有者) | 自作ブレンド編集＝**新versionを派生**（`parentBlendId`） | `blends` Put（version++） | §11.2① |
| `POST /api/checkout/blend` | public/buyer | 決済セッション作成（**拡張**：`blendId`/`blendVersion`/`labelSnapshot` を注文へ、`reservations` で在庫確保） | `orders` Put(pending)＋`reservations` TransactWrite＋Stripe | §13.3 |
| `GET /api/account/orders` | buyer | 注文履歴（既存） | `orders` GSI `userId-index`/`customerEmail-index` | §11.3 |
| `POST /api/account/orders/[id]/substitution` | buyer | **差替提案の承認/辞退**（§6.3・購入者承認必須） | `orders` `substitution[].approvedByBuyerAt` Update／辞退時は返金トリガ | §6.3 |

**販売者（roaster）**
| Method・Path | 認可 | 用途 | 主なテーブル操作 | 参照 |
|---|---|---|---|---|
| `POST /api/roaster/apply` | buyer | 昇格申請（許可/届出・オプトイン・規約同意） | `roasters` Put（`status="paused"`起点→admin承認で`active`） | §6.1.1 |
| `GET /api/account/roaster` | buyer | 自分の焙煎者状態（UI出し分け） | `roasters` Get | §13.1 |
| `PATCH /api/roaster/status` | roaster | 休止/再開/退会（`pausedUntil` 設定＝T1/T2の判定源） | `roasters` Update＋波及で `beans.orderStatus` 一括 | §6.2.1・§6.3 |
| `GET/POST /api/roaster/beans` | roaster | 掲載豆の一覧/追加（§6.2.1 申告5項目＝価格・上限・LT等） | `beans` GSI `by-roaster` Query／Put | §11.2③ |
| `PATCH /api/roaster/beans/[beanId]` | roaster(所有者) | 価格・`weeklyCapKg`・`leadTimeDays`・`orderStatus`(on/off/paused) | `beans` Update | §6.1.2 |
| `POST /api/roaster/lots` | roaster | ロット登録（焙煎日×`onHandG`・`parRankG`・`freshBy`） | `lots` Put（PK`beanId`/SK`roastDate`） | §11.2④ |
| `PATCH /api/roaster/lots/[beanId]/[roastDate]` | roaster(所有者) | 在庫調整・値引き/廃棄マーク | `lots` Update（`onHandG`/`status`/計測） | §7 |
| `GET /api/roaster/pos` | roaster | 自分宛の発注一覧（自動承認/要応答） | `orders` の `procurement` を対象抽出（後付け逆引き要否は§11.4） | §6.2 |
| `POST /api/roaster/pos/[orderId]/respond` | roaster | 発注応答（accept/decline・48hタイムアウト前） | `orders.procurement[].poStatus` Update | §6.2 |
| `GET /api/roaster/metrics` | roaster | 実廃棄率/GMV/失注率（自分の月次） | `roaster_metrics` Get（PK`roasterId`/SK`yyyy-mm`） | §11.2⑦ |
| `POST /api/roaster/subscription` | roaster | サブスク開始/管理（Stripe） | `subscriptions` Put＋Stripe Subscription | §11.2⑧ |

**管理（admin）**
| Method・Path | 認可 | 用途 | 主なテーブル操作 | 参照 |
|---|---|---|---|---|
| `GET /api/admin/roasters` | admin | 昇格申請/休止/退会の運用一覧 | `roasters` GSI `by-status` Query | §11.2② |
| `PATCH /api/admin/roasters/[roasterId]` | admin | 承認（`paused`→`active`）/停止 | `roasters` Update | §6.1.1 |
| `GET /api/admin/pos` | admin | 全発注ダッシュボード（例外T1/T2/T3の監視） | `orders` 例外抽出 | §6.3 |
| `POST /api/admin/orders/[id]/substitution` | admin | **Sikō差替推薦の作成**（価格吸収バンド判定含む）→購入者承認へ | `orders.substitution[]` Put | §6.3 |
| `GET /api/admin/blends` | admin | 全ブレンド（未公開含む・**既存Scanを`list-index` Queryへ置換**） | `blends` GSI Query | §13.6 |

**cron / webhook（非対話）**
| Method・Path | 認可 | 用途 | 主なテーブル操作 | 参照 |
|---|---|---|---|---|
| `GET /api/cron/release-reservations` | cron | 失効予約の在庫戻し（TTLのバックストップ） | `reservations` GSI `by-expire` Query→`lots.reservedG` 戻し | §11.2⑤ |
| `GET /api/cron/fresh-lots` | cron | 鮮度切れ間近ロットの値引き/廃棄判定 | `lots` GSI `by-freshBy` Query→`status` 更新＋`roaster_metrics` ADD | §7・§11.2④ |
| `GET /api/cron/po-timeouts` | cron | 48h無応答の発注をT2/T3例外へ昇格 | `orders.procurement[].poStatus="timeout"` | §6.3 |
| `GET /api/cron/subscription-dunning` | cron | サブスク延滞/失効の運用 | `subscriptions` GSI `by-status` Query | §11.2⑧ |
| `POST /api/webhooks/stripe` | 署名検証 | 決済完了→在庫コミット・返金・サブスク（**拡張**） | §13.3 | §13.4 |

### 13.3 主要フロー：注文→確保→発注→例外（endpoint連携）
1. `POST /api/checkout/blend`：`orders` を `pending` Put → 構成豆ごとに `reservations`＋`lots.reservedG` を **`TransactWriteItems`** で一括確保（`ConditionExpression: reservedG + qty <= onHandG`）。**1つでも不成立の豆**は在庫確保せず `procurement.mode="po"`（発注）としてマーク。全ロット確保できた豆は `mode="stock"`。→ Stripe Checkout URL を返す。
2. **Stripe webhook `checkout.session.completed`**：`orders.status="paid"`。`reservations.state="committed"`＝`lots` から `onHandG-=qty`・`soldG+=qty`。在庫豆はここで履行確定。
3. **発注豆（`mode="po"`）**：`weeklyCapKg` 内なら `poStatus="auto_approved"`、超過は `pending`（`timeoutAt=+48h`）→ 焙煎者が `POST /api/roaster/pos/[orderId]/respond`。
4. **例外（§6.3）**：`declined`／48h `timeout`（`cron/po-timeouts`）で `orders.exception`（T1/T2/T3・課金前後phase）を確定 → **抜く禁止＝差替 or 返金の2択**。差替は `admin/orders/[id]/substitution`（Sikō推薦＋価格吸収バンド±¥100/100g）→ `account/orders/[id]/substitution`（購入者承認）で確定、辞退は返金。
5. **計測**：paid/廃棄/返金の各イベントで `roaster_metrics` を原子 `ADD`（§11.2⑦）。

### 13.4 冪等性・トランザクション・状態機械
- **在庫確保**：`reservations` は state machine `held → committed | released`。ブレンド複数ロットは `TransactWriteItems` で **all-or-nothing**（部分確保を作らない）。
- **予約失効**：DynamoDB ネイティブTTL（`expireAt`）＋ `cron/release-reservations` の二重化（TTLは最大48h遅延しうるためcronが主・TTLは保険）。戻し時は `reservations.state` を条件に**二重戻し防止**（`ConditionExpression: state = "held"`）。
- **webhook冪等**：`checkout.session.completed` は `orders.status` を条件付き更新（`status = "pending"` のときのみ `paid`）で再送耐性（既存 `webhooks/stripe` の様式に一致）。`reservations.state="held"` 条件でコミットの二重適用も防止。
- **発注応答**：`poStatus` 遷移は `pending` からのみ許可（`ConditionExpression`）。承認済/timeout後の遅延応答を弾く。
- **差替**：`substitution[].approvedByBuyerAt` 未セット条件でのみ確定。二重承認・承認後の再提案を防止。

### 13.5 追加する Zod スキーマ（`@/lib/validation`）
- `roasterApplySchema`（許可/届出区分・番号・期限・オプトイン・規約version）
- `beanUpsertSchema`（§6.2.1 の5項目：`name`/`greenOrigin`/`roastLevel`/`pricePer100g`/`weeklyCapKg`＋`leadTimeDays`/`orderStatus`）
- `lotUpsertSchema`（`roastDate`(yyyy-mm-dd)・`onHandG`・`parRankG`・`freshBy`）
- `poRespondSchema`（`accept`|`decline`＋任意コメント）
- `substitutionDecisionSchema`（`approve`|`decline`）
- `blendCheckoutSchema` **拡張**（`blendId`・`blendVersion` を任意追加）／`blendUpsertSchema`（自作ブレンド保存の `components`・`visibility`・`allowDrop`）

### 13.6 実装時の注意
- **既存 `GET /api/admin/blends` は `ScanCommand`**（`src/app/api/admin/blends/route.ts`）。§11.2① の `list-index` GSI 追加後、GSI Query（`BLEND#PUBLIC` ＋ 未公開は別`gsiPk`か管理用GSI）へ置換する（[[feedback-dynamodb-scan]]）。
- **焙煎者ガードは都度 `roasters` Get**（セッション非依存）＝実装は `requireRoaster()`（§13.7）。所有者チェック（`beans`/`lots`/自作`blends`）は `roasterId`/`createdBy` とセッション `userId` の一致で行う。
- 内部リンクは `<Link>`、コミット前に eslint（[[feedback-lint-nextjs]]）。cron 追加時は `vercel.json`（または `vercel.ts`）の `crons` に登録。

### 13.7 実装状況（2026-07-21）
- **焙煎者昇格オンボーディングの縦スライスを実装**（申請→admin承認→active の一巡）：
  - `src/types/platform.ts`（`RoasterRecord` ほか）／`src/lib/validation.ts`（`roasterApplySchema`・`adminRoasterUpdateSchema`）／`src/lib/roasterAuth.ts`（`getSessionRoaster()`＋`requireRoaster()`＝§13.1 の「都度Get」ガード。名称は `verifyRoaster` を `requireRoaster` に具体化）。
  - ルート：`POST /api/roaster/apply`（buyer→`pending` で作成・`attribute_not_exists` で二重申請を409）／`GET /api/account/roaster`（自状態）／`GET /api/admin/roasters?status=`（GSI `by-status` Query・既定 pending）／`PATCH /api/admin/roasters/[roasterId]`（遷移表つき・`ConditionExpression` で競合防止）。
  - **ステータス enum 精緻化**：申請待ちを表す `pending` を §11.2② の enum に追加（`pending|active|paused|withdrawn|selling_out`）。「休止(paused)」と「承認待ち」を別状態に分離（§13.2 の "paused起点" を改め、pending 起点に）。
  - 検証：tsc/eslint クリーン。dev server で未認証=401・admin CSRF(origin不一致)=403・origin一致→admin未認証=401 を確認。**認証済みハッピーパスは本 worktree に `AUTH_SECRET` 未設定のため未通し**（要 env）。
- **②掲載豆 CRUD（§6.2.1 申告5項目）を実装**：
  - `src/types/platform.ts`（`BeanRecord`・`RoastLevel`(8段階)・`BeanOrderStatus`）／`src/lib/validation.ts`（`beanCreateSchema`・`beanUpdateSchema`・`ROAST_LEVELS`）。価格は税込・円/100g（§6.1.2）。
  - ルート：`GET/POST /api/roaster/beans`（自分の豆一覧＝GSI `by-roaster` Query／作成）・`PATCH /api/roaster/beans/[beanId]`（価格・週上限・LT・ON/OFF の部分更新。**所有者チェック**＝`roasterId` 一致・read-modify-write＋`ConditionExpression`）。
  - **公開カタログ GSI `list-index` は sparse**：`orderStatus!=="off"` のとき `gsiPk="BEAN#PUBLIC"`/`gsiSk=createdAt` を書き、`off` で外す（作成/更新の両方で維持）。
  - 検証：tsc/eslint クリーン、dev server で未認証=401。**preview 実テーブルへの直接結合テスト 5/5 パス**（by-roaster 新着降順／カタログが on を含み off を除外＝sparse／on→off でカタログ脱落）。公開カタログの読取エンドポイント（`GET /api/beans`）と焙煎者 active 判定の絞り込みは後続。
- **③在庫ロット CRUD（§11.2④・§7）を実装**（2026-07-23）：
  - `src/types/platform.ts`（`LotRecord`・`LotStatus`・`RoasterMetricsRecord`）／`src/lib/validation.ts`（`lotCreateSchema`・`lotUpdateSchema`）／`src/lib/roasterAuth.ts` に `getOwnedBean()` 追加／`src/lib/roasterMetrics.ts`（`addRoasterMetrics()`＝§11.2⑦ の原子 ADD・月キーは **JST** 基準）。
  - ルート：`GET /api/roaster/lots?beanId=`（PK Query・焙煎日降順）・`POST /api/roaster/lots`（`attribute_not_exists` で豆×焙煎日の二重登録を409）・`PATCH /api/roaster/lots/[beanId]/[roastDate]`。所有者判定は `lots.roasterId`（豆の owner を非正規化）＝ロット単体で完結。
  - **数量の動かし方を3通りに限定（排他）**：`receivedG`（追加入荷＝`onHandG`/`purchasedG` 加算）／`wasteG`（廃棄＝`onHandG` 減・`wastedG` 加算）／`onHandG`（棚卸しの絶対上書き・計測に載せない）。廃棄・入荷は `roaster_metrics` へ原子 ADD（実廃棄率の分子/分母）。
  - **同時実行**：`reservedG` は決済フロー（§13.3）が並行更新するため、素の read-modify-write は禁止。**読んだ `onHandG`/`reservedG`/`roasterId` を条件にした CAS**（`ConditionExpression`）＋割り込み時 409 とした。確保済みを下回る調整も 409。
  - **設計修正**：`ConditionExpression` に算術式が書けない件を受け、派生属性 `availableG` を導入（§11.2④ の注記）。
  - 検証：tsc/eslint クリーン、**vitest 15ケース新規（全体 139 passed）**。preview 実テーブルでの確認（CAS の条件不成立・複合キーの `attribute_not_exists`・`by-freshBy` Query・計測 `ADD`）は実装④の結合テストに含めて実施済み（下記）。
- **④注文→確保→発注（§13.3 の主要フロー）を実装**（2026-07-23）：
  - `src/lib/reservations.ts`：`planLotAllocations()`（**古いロットから FIFO 割当**・期限切れ/空きゼロは除外）／`holdReservations()`（**注文全体で1 `TransactWriteItems`**＝部分確保を作らない）／`commitReservations()`／`releaseReservation(sForOrder)()`／`findExpiredReservations()`（GSI `by-expire` Query）。
  - `src/lib/platformCheckout.ts`：`beanId` から **beans/roasters を forward Get** して価格・可否・生産国を決める（クライアント値は信用しない・§11.4）。`orderStatus!=="on"`／焙煎者が active・selling_out 以外は 409。**selling_out は在庫ぶんのみ**（不足＝購入不可＝§6.3 抜く禁止）。不足ぶんは `mode="po"`（週上限内＝`auto_approved`／超過＝`pending`＋48h `timeoutAt`）。`labelSnapshot`（生産国・重量比・価格）と `etaPromised`（発送準備3日＋最大リードタイム）を注文に固定。
  - `POST /api/checkout/blend` 拡張：`components`／`blendId`／`blendVersion` を受け付け（既存の3種ブレンド＝`ratios` 経路はそのまま動く）、**確保 → 注文 Put → Stripe** の順。以降で失敗したら確保を戻す。競合で確保に失敗＝409。
  - `POST /api/webhooks/stripe` 拡張：`checkout.session.completed` で **held → committed**（`lots` の `onHandG`/`reservedG` を減らし `soldG` を積む）＋ `roaster_metrics` に GMV/件数/soldG を ADD（**`claim('platformCommittedAt')` で再送時の二重計上を防止**）。`checkout.session.expired` では**注文を消す前に確保を戻す**。
  - `GET /api/cron/release-reservations` 新設＋`vercel.json` に 10分毎で登録（TTL は削除されると `reservedG` を戻せなくなるため **cron が主・TTL は保険**）。
  - **週上限の判定は近似**：週次の受注実績を集計する場所が無いため「この注文単体 vs `weeklyCapKg`」で判定している。実績ベースにするなら `roaster_metrics` を週次化するか受注ログが要る（未対応）。
  - 検証：tsc/eslint/`next build` クリーン、vitest **19ケース追加（全体 158 passed）**。
  - **preview 実テーブルの結合テスト 12/12 パス**（2026-07-23）：`scripts/integration/platform-flow.test.ts`＋`vitest.integration.config.ts`（通常の `vitest run` には含めない・実行は `VERCEL_ENV=preview npx vitest run --config vitest.integration.config.ts`）。確認できたのはモックでは検証できない DynamoDB 側の挙動——`TransactWriteItems` の all-or-nothing（1件不成立なら他も入らない）／`availableG >= :qty` 条件の成立・不成立／held→committed の二重適用防止（webhook 再送を模して2回実行）／二重戻し防止／GSI `by-expire`・`by-freshBy` の Query／複合キーでの `attribute_not_exists`／`ADD` の積み上げ。テストデータは毎回 UUID 付きで作り、後始末まで実施（残留ゼロを確認）。
- **⑤発注応答・タイムアウト・差替/返金の2択（§6.2・§6.3）を実装**（2026-07-23）：
  - **新テーブル `pos`（§11.2⑨）を追加**（preview／本番とも作成済み・GSI `by-status` ACTIVE）。`orders.procurement[]` はリスト属性で GSI キーにできず Scan も禁止のため、焙煎者→発注の逆引きを非正規化で用意した。
  - `src/lib/pos.ts`：`createPoRecords()`／`listPosForRoaster()`（PK Query）／`listPosByStatus()`（GSI Query）／`transitionPo()`（**`pending` からのみ遷移＝遅延応答を弾く**）／`syncOrderProcurement()`／`classifyException()`／`applyOrderException()`。
  - `src/lib/platformParams.ts`：§6.3 の運用パラメータを**env で外出し**（`PO_TIMEOUT_HOURS`=48／`DELAY_SILENT_DAYS`=3／`DELAY_CHOICE_DAYS`=7／`SUBSTITUTION_BAND_YEN_PER_100G`=100）。計画書の「ハードコードせず設定値」を満たす。
  - **poStatus enum に `accepted` を追加**：`auto_approved`（枠内で自動）と「焙煎者が明示承認」を区別しないと誰が通したか追えないため（§11.2⑥ の enum を精緻化）。
  - ルート：`GET /api/roaster/pos`（要対応件数つき＝§6.2.1 のベル表示用）／`POST /api/roaster/pos/[orderId]/respond`（accept→`accepted`／decline→`declined`＋注文へ例外記録）／`GET /api/cron/po-timeouts`（`vercel.json` に毎時5分で登録）／`GET /api/admin/pos`／`POST /api/admin/orders/[id]/substitution`（Sikō推薦）／`POST /api/account/orders/[id]/substitution`（購入者の承認/辞退）。
  - **例外の分類（§6.3 軸1）**：`classifyException()` が焙煎者ステータスから T1（`paused`＋`pausedUntil` あり＝ETA を出せる）／T2（復帰未定）／T3（`withdrawn`・`selling_out`＝「待つ」を出さない）を判定。phase は注文が `pending` なら pre_charge、それ以外は post_charge。
  - **差替（`src/lib/substitution.ts`）**：推薦は**同系統（生豆生産国か焙煎度が一致）かつ ±¥100/100g 圏**に限定し、範囲外は 400 で作らせない。吸収バンド内は `absorbedBySiko=true`＝**購入者の支払額は据え置き**（§6.1.2 スナップショット固定と整合）。承認で**法定ラベルを再生成**（比率・g は保ち、豆/生産国/焙煎度/価格だけ差し替え＝作品の同一性を保つ）＋調達先を代替焙煎者の PO へ。辞退は `src/lib/refund.ts` で**全額返金**（確保中の在庫は戻し、**確定済みは戻さず単品消化へ**＝§5・§6.3）＋`roaster_metrics.lostCount` を計上。
  - 検証：tsc/eslint/`next build` クリーン、vitest **21ケース追加（全体 179 passed）**、**preview 実テーブル結合テスト 15/15**（PO の PK Query・GSI by-status での期限切れ抽出・`pending` からのみの遷移・GSI パーティション移動・procurement 同期・例外の phase 判定を実機確認）。
- 次スライス候補：公開カタログ読取（`GET /api/beans`）／サブスク（`roaster/subscription`・§11.2⑧）／UI（焙煎者昇格フォーム・豆/ロット管理・発注応答画面・カタログからのブレンド作成）。

---

## 14. 実装ハンドオフ（次セッション再開用・2026-07-24 更新）

> このセクションだけ読めば、冷えた状態から実装を再開できることを意図した自己完結の引き継ぎ。詳細は各§を参照。
> **経緯**：初版は 2026-07-21 に `claude/blend-platform-plan-docs-7dd63f`（commit `3de981e`）で書かれたが、**PR #68 のマージ時に main へ入らなかった**（当該ブランチは未マージのまま残っている）。本節はその後継として現状に合わせて書き直したもの。

### 14.1 現在地
- **設計（§1〜§13）完了。実装①〜⑤まで完了**（昇格オンボーディング／掲載豆CRUD／在庫ロットCRUD／注文→確保→発注／発注応答・タイムアウト・差替/返金）。
- **UI 一巡完了（2026-07-24）**：焙煎家UI 4画面（昇格申請／発注応答／豆管理／在庫ロット）＋ **admin 焙煎家承認UI** ＋ **公開カタログ読取 `GET /api/beans`＋`/shop/catalog` ブレンドビルダー**。これで「掲載→在庫→（購入者が）カタログでブレンド作成→注文→確保→発注→焙煎家が応答→差替/返金」が画面で通る。
- ブランチ：`claude/remaining-tasks-check-5cb1ab`（worktree 運用）。テストは全 179 passed、`next build`／preview ビルド通過。
- **preview（全機能入り）**：`https://siko-coffee-10uvv0g90-i0li0s-projects.vercel.app`（commit `3caeae8`）。※プロジェクトは Vercel SSO 保護あり＝閲覧に Vercel ログインが必要。git 連携の自動デプロイが不安定だったため CLI（`vercel deploy`）で明示デプロイした。

### 14.2 完了済み（DONE）
1. **設計 §1〜§13**。
2. **DynamoDB**：新設6＋`blends` GSI（2026-07-21）に加え、**`pos`（§11.2⑨）を追加**（2026-07-23・preview／本番とも ACTIVE）。作成は `scripts/create-*-table.sh`・一括 `create-platform-tables.sh`。
3. **API①** 焙煎者オンボーディング（`roaster/apply`・`account/roaster`・`admin/roasters`）。
4. **API②** 掲載豆CRUD（`roaster/beans`・`[beanId]`）。公開カタログ GSI は sparse。
5. **API③** 在庫ロットCRUD（`roaster/lots`・`[beanId]/[roastDate]`）。数量操作は receivedG/wasteG/onHandG の排他3通り、競合は CAS＋409。
6. **API④** 注文→確保→発注（`checkout/blend` 拡張・Stripe webhook で commit・`cron/release-reservations`）。
7. **API⑤** 発注応答（`roaster/pos`・`respond`）・`cron/po-timeouts`・差替/返金（`admin`／`account` の substitution）。
8. **結合テスト基盤**：`scripts/integration/platform-flow.test.ts`＋`vitest.integration.config.ts`（preview 実テーブル・15/15 パス）。
9. **焙煎家UI（2026-07-24）**：`/roaster` ハブ（ステータス出し分け・要対応バッジ）／`/roaster/apply`（昇格申請・§5 同意オプトイン・`termsVersion='1.0'`）／`/roaster/orders`（発注応答＝承認/辞退・48h残時間・履歴）／`/roaster/beans`（豆CRUD＋受注ON/OFF/休止）／`/roaster/lots`（豆セレクタ・入荷/廃棄/棚卸し・鮮度ステータス・確保中ガード）。`/account` に焙煎家のみ導線。全てサーバゲート `getSessionRoaster()`（都度Get）。
10. **admin 焙煎家承認UI（2026-07-24）**：`/admin/(protected)/roasters`（ステータスタブ・申告内容表示・承認/却下/停止/退会）。遷移は API の `TRANSITIONS` と一致。`AdminSidebar` に「焙煎家管理」を追加。→ 昇格承認が画面で完結（旧：API 直叩き）。
11. **公開カタログ＋ブレンド作成（2026-07-24）**：`GET /api/beans`（GSI `list-index` を Query → `orderStatus="on"` かつ焙煎家 `active` を `roasters` BatchGet で forward 絞り込み）／`/shop/catalog`（最大5種選択・比率100%検証・分量/挽き方・概算価格 → `checkout/blend` に `components` で投げ既存フローに合流）／`/shop` ヘッダーに「焙煎家の豆」導線。

### 14.3 環境の状態（要注意）
- **AWS**：`user/shun`（acct 654512230021）・`ap-northeast-1`。プラットフォーム7テーブルが preview／本番の両環境で稼働。
- **`blends` GSI `list-index`**：追加済みだが**バックフィル未**。それまで `GET /api/blends` は旧 `ScanCommand` 経路（§13.6）。
- **ローカル dev の `AUTH_SECRET` 未設定**：`auth()` が動かず**HTTP経由の認証済みE2Eは未検証**。データ層は preview 実テーブルの結合テストで代替確認している。
- **cron の頻度は Vercel Hobby プランの制約で日次**（重要・2026-07-23 に判明）：Hobby は **cron を1日1回までしか許可せず、それより頻繁な式はデプロイが失敗する**（`*/10 * * * *` を入れて実際に落ちた）。そのため `vercel.json` は日次（`release-reservations` 18:10 UTC／`po-timeouts` 18:20 UTC）にし、**適時性はリクエスト時の sweep で担保**する：
  - 失効確保の戻し → `POST /api/checkout/blend` の冒頭で `sweepExpiredReservations()`（**在庫が要る瞬間に自己修復**。30分の確保に日次 cron は追いつかず、TTL は削除されると `reservedG` を戻せないため）。
  - 発注のタイムアウト → `GET /api/roaster/pos`・`GET /api/admin/pos` の読取時に `sweepPoTimeouts()`。
  - **Pro へ上げたら** `vercel.json` の schedule を `*/10 * * * *` / `5 * * * *` に戻すだけでよい（sweep はそのまま残して二重化で問題ない）。
- **cron の認可**：いずれも既存 `CRON_SECRET`（新規 env 不要）。
- **§6.3 の運用パラメータ**は `src/lib/platformParams.ts` で env 外出し（`PLATFORM_PO_TIMEOUT_HOURS` / `PLATFORM_DELAY_SILENT_DAYS` / `PLATFORM_DELAY_CHOICE_DAYS` / `PLATFORM_SUBSTITUTION_BAND_YEN`）。未設定なら既定値（48/3/7/100）。

### 14.4 残タスク（実装・優先順）
- [x] **公開カタログ読取（2026-07-24）**：`GET /api/beans`（GSI `list-index` Query＋焙煎家 active を `roasters` BatchGet で forward 絞り込み・`orderStatus="on"` のみ）。→ §14.2-11。
- [x] **UI（2026-07-24）**：焙煎家昇格フォーム／`account/roaster` 出し分け／豆・ロット管理／発注応答画面（要対応バッジ・§6.2.1）／カタログからのブレンド作成。→ §14.2-9。**加えて admin 焙煎家承認UI も実装**（→ §14.2-10）。
- [ ] **`GET /api/blends` の Scan→Query 置換**：GSI `list-index` のバックフィル完了後に置換（§13.6・§14.3）。カタログの `GET /api/beans` とは別テーブル（`blends`）の話。
- [ ] **サブスク**：`roaster/subscription`(POST) ＋ Stripe Billing。`subscriptions` テーブルは作成済み・未使用。
- [ ] **cron 残り**：`fresh-lots`（鮮度切れの値引き/廃棄・GSI `by-freshBy` は実機確認済み）・`subscription-dunning`。
- [ ] **T1「待つ」の導線**（§6.3 ①）：遅延Δの閾値パラメータは用意済みだが、**ETA 再計算と通知が未実装**。
- [ ] **週上限の実績ベース判定**：現状は「注文単体 vs `weeklyCapKg`」の近似。`roaster_metrics` の週次化か受注ログが要る。
- [ ] **認証済みE2E検証**：preview デプロイ後に「申請→admin承認→active→豆/ロット登録→（カタログで）ブレンド作成→注文→発注応答→差替/返金」を通しで確認。UI は全て揃ったので**あとは通すだけ**。※ preview は Vercel SSO 保護のため要 Vercel ログイン。
- [ ] **`/shop` のテストデータ差し替え**：`data.ts` の豆3種・定番/みんなのブレンドは全て架空（§12）。SikŌ 自身の3種へ差し替える。※ 焙煎家の掲載豆（`beans` テーブル）＋新設 `/shop/catalog` とは別枠で、既存 ShopApp 側の話。

### 14.5 残タスク（外部確認・実装と並行可）
- [ ] 焙煎届出の住所訂正（北新田町→潮新町）の完了確認（§10）。
- [ ] 保健所：複数焙煎者ブレンド小分け・通販が現行届出でカバーされるか（§3.3）。
- [ ] 税理士：免税前提の会計裏取り（§4/§3.5）。
- [ ] オープンデータ取込の実装調査（昇格の自動一次判定・§6.1.1）。※初期は手動ゲートで回避可。

### 14.6 次の一手（推奨開始点）
**認証済みE2Eの通し確認**（§14.4）。API・UI とも掲載→在庫→カタログ→注文→確保→発注→応答→差替/返金まで揃ったので、次は preview で一巡させて実挙動を確認するのが最短。※ preview は Vercel SSO 保護のため要 Vercel ログイン。
その後の実装候補は実利順で **①週上限の実績ベース判定 → ②T1「待つ」導線（ETA再計算＋通知）→ ③サブスク（Stripe Billing）→ ④cron 残り（`fresh-lots`／`subscription-dunning`）**。`GET /api/blends` の Scan→Query は `blends` GSI バックフィル待ちで別軸。

### 14.7 実装上の注意（gotchas・既確認）
- **`ConditionExpression` に算術式は書けない**（`reservedG + qty <= onHandG` は不可）。→ `lots` は派生属性 `availableG` を実体で持ち、`availableG >= :qty` の単純比較で確保する。**lots へのあらゆる書き込みで `availableG = onHandG − reservedG` を維持すること**（§11.2④）。
- **`lots` の read-modify-write は禁止**（`reservedG` を決済フローが並行更新する）。更新は**読んだ値を条件にした CAS**＋競合時 409。
- **`status`・`state`・`comment` は DynamoDB 予約語** → `ExpressionAttributeNames` 必須。
- **計測（`roaster_metrics`）の ADD は冪等でない** → webhook からの計上は `claim()` で1回だけに絞る。
- **焙煎者ガードは都度 `roasters` Get**（`requireRoaster`）。`pos` は PK が `roasterId` なので**キーの時点で所有者が保証される**。
- **公開カタログは sparse index**：`beans.orderStatus="off"` で `gsiPk`/`gsiSk` を落とす（作成・更新の両方）。`GET /api/beans` は index に残る `paused` を弾くため read 時に `orderStatus="on"` で再フィルタする。
- **カタログのブレンド作成は独立ページ**（`/shop/catalog`）：既存 ShopApp（`src/components/shop/blend/`）は3種テストデータ＋比率長3固定・味覚軸・診断に深く結合しているため差し込まず、実プラットフォーム用ビルダーを新設した。両者は当面併存（ShopApp はテストデータ差し替えまで残す・§12）。
- **焙煎家UIのサーバゲート**は `getSessionRoaster()`（都度Get）。`active`/`selling_out` 以外は `/roaster` へリダイレクト。admin 承認UIは既存 `verifyAdminToken`＋(protected)レイアウト配下。
- **`/api/admin/*` の状態変更は Origin 必須**（middleware のCSRF・不一致は403）。`/api/roaster/*`・`/api/account/*` は NextAuth セッション依存。
- **`reservations` TTL は epoch 秒**。TTL は削除されると `reservedG` を戻せないため**cron が主・TTL は保険**。
- **テーブル作成スクリプトは非冪等**（既存は `ResourceInUseException`）。GSI/TTL は非同期＝ACTIVE 確認要。
- **Vercel Hobby の cron は日次まで**。`*/10` や毎時の式を `vercel.json` に書くと**デプロイ自体が失敗する**（ビルド前に弾かれるため Vercel 上にデプロイのレコードすら残らない）。頻繁な処理が要るならリクエスト時 sweep か Pro 昇格で（§14.3）。
- **結合テストは通常の `vitest run` に含めない**：`VERCEL_ENV=preview npx vitest run --config vitest.integration.config.ts`（本番テーブルを触らないためのガード付き）。
- コミット前に **eslint**（[[feedback-lint-nextjs]]）。内部リンクは `<Link>`。

---

## 参考リンク（法規制の根拠）

- 食品衛生法の届出：[キーコーヒー 開業ナビ](https://www.keycoffee.co.jp/business/kaigyo-navi/category/business-use/detail/permission-to-sell-coffee-beans/) ／ [コーヒー豆研究所](https://coffee-labo.co.jp/coffee-sell-permit/)
- 許可と届出の違い（許可＝期限あり／届出＝期限なし）：[おおみ行政書士事務所](https://www.ohmi-office.com/food-business-license) ／ [大阪市](https://www.city.osaka.lg.jp/kenko/page/0000515693.html) ／ [東京都保健医療局](https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/kaisei/files/kyoka_todokede_todokede.pdf)
- 密封包装食品製造業（焙煎豆は許可不要）：[厚生労働省](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/shokuhin/syokuchu/01_00005.html) ／ [対象食品の変更 令和5年](https://www.mhlw.go.jp/content/001040871.pdf) ／ [徳島県](https://www.pref.tokushima.lg.jp/ippannokata/kurashi/shokunoanzen/7213440/)
- 食品表示（ブレンドの生豆生産国・原料原産地）：[食品表示.com](https://hyouji.maru-sin.net/display-pattern/2024/11/13/2548/) ／ [全日本コーヒー協会](https://coffee.ajca.or.jp/column/4448/) ／ [Hand Roasters](https://hand-roasters.com/1545/food-labeling/)
- インボイス経過措置：[freee](https://www.freee.co.jp/kb/kb-invoice/invoice_transitional_measures/) ／ [マネーフォワード](https://biz.moneyforward.com/accounting/basic/79003/)
- DPF法（仲介型のみ対象・直販は対象外）：[消費者庁](https://www.caa.go.jp/policies/policy/consumer_transaction/digital_platform/)
