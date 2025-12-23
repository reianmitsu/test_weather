const WEATHER_CODES = {
  clear: [0, 1],
  cloudy: [2, 3, 45, 48],
  rain: [51, 53, 55, 61, 63, 65, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  storm: [95, 96, 99],
};

const ENABLE_BACKGROUND = false;

const BOUNDS = {
  minLat: 20.42,
  maxLat: 45.56,
  minLon: 122.93,
  maxLon: 153.99,
};

const UPDATE_INTERVAL = 5 * 60 * 1000;

const state = {
  rainIntensity: 0.2,
  tempLevel: 0.5,
  cards: new Map(),
  dots: new Map(),
  tails: new Map(),
  clouds: new Map(),
  lines: new Map(),
  mapOffset: { x: 0, y: 0 },
  mapScale: 1,
  drag: { active: false, startX: 0, startY: 0 },
  facts: new Map(),
  latestWeather: null,
  densityMask: null,
  mapPaths: null,
};

const elements = {
  canvas: document.getElementById("glCanvas"),
  cards: document.getElementById("cityCards"),
  dots: document.getElementById("dotLayer"),
  lineLayer: document.getElementById("lineLayer"),
  mapFrame: document.getElementById("mapFrame"),
  mapOverlay: document.getElementById("mapOverlay"),
  updatedAt: document.getElementById("updatedAt"),
  refreshButton: document.getElementById("refreshButton"),
  densityLayer: document.getElementById("densityLayer"),
  tooltip: null,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function projectCoord(lat, lon, frameSize) {
  const lonRange = BOUNDS.maxLon - BOUNDS.minLon;
  const latRange = BOUNDS.maxLat - BOUNDS.minLat;
  const scale = Math.min(frameSize.width / lonRange, frameSize.height / latRange);
  const xOffset = (frameSize.width - lonRange * scale) / 2;
  const x = (lon - BOUNDS.minLon) * scale + xOffset;
  const y = (BOUNDS.maxLat - lat) * scale;
  return { x, y };
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function categorizeWeather(code) {
  if (WEATHER_CODES.clear.includes(code)) return "Clear";
  if (WEATHER_CODES.cloudy.includes(code)) return "Cloudy";
  if (WEATHER_CODES.rain.includes(code)) return "Rain";
  if (WEATHER_CODES.snow.includes(code)) return "Snow";
  if (WEATHER_CODES.storm.includes(code)) return "Storm";
  return "Mixed";
}

function buildCards() {
  elements.cards.innerHTML = "";
  elements.lineLayer.innerHTML = "";
  const primary = document.createElement("div");
  primary.className = "city-column primary";
  const secondary = document.createElement("div");
  secondary.className = "city-column secondary";
  elements.cards.appendChild(primary);
  elements.cards.appendChild(secondary);

  let index = 0;
  CITIES.forEach((city) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.city = city.name;
    card.innerHTML = `
      <h3>${city.name}</h3>
      <div class="metric">--°</div>
      <div class="meta-line"><span>Cloud</span><span class="cloud">--%</span></div>
      <div class="meta-line"><span>Wind</span><span class="wind">-- m/s</span></div>
    `;
    if (index < 4) {
      primary.appendChild(card);
    } else {
      secondary.appendChild(card);
    }
    index += 1;
    state.cards.set(city.name, card);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    elements.lineLayer.appendChild(line);
    state.lines.set(city.name, line);

    card.addEventListener("mouseenter", () => showTooltip(card));
    card.addEventListener("mouseleave", () => hideTooltip());
    card.addEventListener("mousemove", () => positionTooltip(card));
  });
}

function setupTooltip() {
  const tooltip = document.createElement("div");
  tooltip.className = "fact-tooltip";
  tooltip.setAttribute("role", "tooltip");
  document.body.appendChild(tooltip);
  elements.tooltip = tooltip;
}

function showTooltip(card) {
  const name = card.dataset.city;
  const facts = state.facts.get(name) || [];
  if (!facts.length) return;
  const fact = facts[Math.floor(Math.random() * facts.length)];
  elements.tooltip.textContent = fact;
  elements.tooltip.style.opacity = "1";
  positionTooltip(card);
}

function hideTooltip() {
  if (!elements.tooltip) return;
  elements.tooltip.style.opacity = "0";
}

function positionTooltip(card) {
  if (!elements.tooltip) return;
  const rect = card.getBoundingClientRect();
  const tooltip = elements.tooltip;
  const margin = 10;
  const width = tooltip.offsetWidth || 180;
  const height = tooltip.offsetHeight || 40;
  let left = rect.left + rect.width + margin;
  let top = rect.top + rect.height / 2 - height / 2;
  if (left + width > window.innerWidth - margin) {
    left = rect.left - width - margin;
  }
  if (top < margin) top = margin;
  if (top + height > window.innerHeight - margin) {
    top = window.innerHeight - height - margin;
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function buildFacts() {
  const factsByCity = {
    Sapporo: [
      "雪まつりだけでなく、秋のオータムフェストや初夏のライラックまつりまで“屋外グルメの季節”が続くのが札幌らしさ。季節で屋台の味が大きく変わります。",
      "スープカレーは店ごとにスパイスの配合が違い、“今日の辛さ”を選ぶのが文化。具材も野菜盛りが定番で、観光より日常食に近い存在です。",
      "ジンギスカンは“焼く”より“蒸し焼きに近い”独特の食べ方が主流。厚切りラムや生ラムの食感の違いで店を選ぶ人も多いです。",
      "時計台は“写真より小さい”で有名ですが、実は周囲の街並みの変化で目立ちにくくなっただけ。昔の札幌中心部を想像すると納得できます。",
      "大通公園のビアガーデンは国内最大級の規模で、エリアごとにブランドが分かれています。昼と夜で客層が変わるのも面白いところです。",
      "ラーメン横丁は観光地として有名ですが、地元は路地の小さな一軒に通う人が多いです。味噌でも濃厚・あっさりの幅が広いのが札幌の特徴です。",
      "場外市場の海鮮は朝の早い時間が勝負。行列ができる前に回るのが通で、季節によって“旬が突然変わる”のも北の街らしさです。",
      "よさこいソーラン祭りは大学チームが本気で衣装・構成を作り込むことで有名。踊りの迫力が年々上がるので、見比べる楽しみがあります。",
      "“締めパフェ文化”が広まり、夜のパフェ専門店が定番に。甘さより香り重視の店も多く、食後でも意外にさっぱり食べられます。",
      "冬の路面は“ツルツル路面”対策として靴底の滑り止めが必須。地元は店先の砂箱を活用して歩くという生活の知恵があります。",
    ],
    Sendai: [
      "仙台七夕まつりは巨大な吹き流しの見応えが魅力ですが、前夜の花火大会から“町全体が七夕に切り替わる”空気感が楽しいと言われます。",
      "牛タンは“焼き具合”より“厚みと切り方”で店を選ぶ文化。麦飯とテールスープの組み合わせは仙台流の定番セットです。",
      "ずんだ餅は甘さ控えめが主流で、枝豆の香りを強く感じる店ほど人気。ずんだシェイクは地元のソウルドリンクに近い存在です。",
      "青葉まつりの山鉾は豪華さより“伊達政宗の時代を思わせる雰囲気”を味わう祭り。すずめ踊りの軽快さが印象的です。",
      "定禅寺通は並木道が美しく、ジャズフェスの時期は街が音楽で埋まります。歩いているだけで音が流れてくる感覚が仙台ならではです。",
      "笹かまぼこはそのまま食べるだけでなく、チーズや枝豆を挟むアレンジも人気。新幹線のお供としても定番です。",
      "仙台城跡からの夜景は“街の広がり”が分かりやすく、山の上から見下ろす感覚が東北の拠点都市らしい景色です。",
      "地元では“仙台味噌”が日常の味として根付いています。味噌汁の香りが強いのはこの地域ならではです。",
      "冬の光のページェントはケヤキ並木が主役。点灯の瞬間に歓声が上がるのが名物で、空気の冷たさも演出の一部です。",
      "市場や横丁は観光向けより“地元の昼ごはん”に近い雰囲気。小ぶりな定食や海鮮丼が早い時間に売り切れることもあります。",
    ],
    Tokyo: [
      "下町のもんじゃ焼きは“焼くというより刻む”独特の食べ方が面白い文化。店によって香ばしさの出し方が全く違います。",
      "神田や神保町は古書の街として有名ですが、喫茶店文化が濃く“本とコーヒーの一日”が成立します。時間がゆっくり流れるのが魅力です。",
      "浅草の三社祭は“粋”と“荒っぽさ”が混ざる独特の熱気。掛け声や担ぎ手の勢いに圧倒されます。",
      "築地・豊洲の魚文化は早朝から動くのが普通。寿司だけでなく、卵焼きや干物など“朝ごはん文化”が充実しています。",
      "相撲の本場所がある月は街の雰囲気が少し変わります。ちゃんこ鍋の店が賑わい、相撲部屋の看板が目立ちます。",
      "東京の立ち食いそばは“駅ごとに味が違う”と言われるほど多様。だしの色や香りで地元の人は店を選びます。",
      "祭りや縁日では屋台の種類が地域ごとに異なります。たとえば下町は焼きそばよりもフランクが多い、など細かな違いがあります。",
      "銭湯文化が今も根強く、リノベ銭湯やアート系の浴場が人気。街歩きのゴールとして行く人も多いです。",
      "都内の川沿いは春の桜だけでなく、夏の花火で雰囲気が変わります。季節イベントで“同じ場所が別の街に見える”のが東京の面白さです。",
      "古い商店街では“個人店の味”が今も健在。コロッケや焼き鳥など、軽食が地元のソウルフードになっています。",
    ],
    Nagoya: [
      "ひつまぶしは“食べ方を変えて三度楽しむ”のが名古屋流。最後のだし茶漬けまで含めて一品が完成します。",
      "味噌カツは赤味噌だれの甘辛さが決め手で、店ごとの配合で全く別物になります。揚げたてにたっぷりかけるのが定番です。",
      "手羽先は“胡椒の強さ”が店選びのポイント。ビールと合わせるより“単品で食べ続けられる味”を狙う店が多いです。",
      "きしめんは平打ち麺の食感が命。だしの味が強めで、駅の立ち食いでもレベルが高いと言われます。",
      "名古屋まつりは武将行列が華やかで、街全体が歴史テーマパークのような雰囲気になります。観光より地元の誇りに近い祭りです。",
      "モーニング文化が定着していて、喫茶店の朝セットが豊富。トーストに加えて小鉢が付くなど、コスパの高さが話題になります。",
      "あんかけスパは“濃いソースと太麺”が特徴の独自進化系。初見の人ほどクセになると言われます。",
      "名古屋城の金シャチは“写真映え”だけでなく、地域のアイコンとして日常に溶け込んでいます。土産物も金シャチだらけです。",
      "味噌煮込みうどんは土鍋のグツグツ感が大事。麺は硬めで“煮ても伸びない”食感が名古屋らしいです。",
      "地元の市場では“エビフライ文化”が根強く、家庭の定番メニューとして愛されています。大きさで店を選ぶ人もいます。",
    ],
    Osaka: [
      "たこ焼きは“外カリ中トロ”の火入れが命で、ソースだけでなく出汁や塩で食べる店も増えています。地元では“はしご”が普通です。",
      "お好み焼きは“混ぜ焼き派”と“重ね焼き派”が混在するのが大阪らしい多様さ。店のこだわりで全く別メニューに見えます。",
      "天神祭は船渡御が圧巻で、川沿いの熱気が大阪らしさを象徴します。花火と船の灯りが混ざる光景は必見です。",
      "串カツは“ソース二度づけ禁止”が有名ですが、今は塩や味噌ダレで食べる店も。衣の軽さが勝負どころです。",
      "道頓堀は派手な看板だけでなく、地元民は昼の静かな時間帯に歩くことも多いです。景色が時間で変わるのが面白いポイントです。",
      "新世界は昭和の空気感が残り、通天閣の周りにはレトロな飲み屋が並びます。安さと濃さのバランスが魅力です。",
      "粉もん文化はたこ焼きだけではなく、いか焼きやねぎ焼きまで幅広いです。地元の家庭でもホットプレートが活躍します。",
      "大阪の商店街は“買い物より会話”が名物と言われるほど賑やか。歩くだけで店主の声掛けが飛んできます。",
      "夏のだんじりや秋祭りは地区ごとに色が濃く、祭りへの熱量が高いのも大阪らしい特徴です。",
      "ミックスジュース発祥の地の一つと言われ、喫茶店で甘いドリンクを頼むのが大阪の定番。昭和レトロな味が人気です。",
    ],
    Hiroshima: [
      "広島風お好み焼きは“重ね焼き”が基本で、麺入りが主流。蒸し焼きにする工程が味を決めます。",
      "牡蠣は冬が有名ですが、実は夏の岩牡蠣も人気。産地ごとに味が違うので食べ比べが楽しいです。",
      "厳島神社の大鳥居は潮位で表情が変わります。満潮と干潮で歩ける距離が変わるので、時間帯で体験が違います。",
      "平和記念公園は観光地であると同時に市民の散歩道でもあります。日常の中で静かに歴史を感じる場所です。",
      "広島のつけ麺は“辛さが選べる”のが特徴で、冷たい麺に辛いつけだれを合わせるスタイル。夏に人気です。",
      "お酒の町・西条は地酒巡りが楽しい地域。酒蔵通りを歩くだけで香りが漂います。",
      "カープの試合がある日は街の色が一気に変わります。ユニフォーム姿が増え、球場周辺の熱気が上がります。",
      "尾道ラーメンは“背脂が浮いた醤油味”が特徴。坂の町らしく、食べた後に歩いて景色を楽しむ人も多いです。",
      "しまなみ海道はサイクリング文化が根付いていて、地元の人も休日に走ります。海と橋の景色が爽快です。",
      "宮島のもみじ饅頭は焼きたてが別格と言われます。中身の種類が増えていて、チーズやチョコなど新定番も人気です。",
    ],
    Fukuoka: [
      "博多の屋台は夜の名物ですが、実は常連の“締めの一杯”が主役。店ごとの焼きラーメンの味が違います。",
      "博多祇園山笠は“走る祭り”として有名で、追い山のスピード感が圧巻。早朝の熱気が福岡の夏を象徴します。",
      "明太子は家庭の冷蔵庫に常備されるレベルで、辛さや粒感の好みが分かれます。おにぎりよりも“ご飯のお供”に近い存在です。",
      "豚骨ラーメンは替え玉文化が根付いており、“硬さ指定”が日常。スープの濃さや臭みで店が選ばれます。",
      "水炊きは鶏のうまみを引き出す料理で、冬の定番。締めの雑炊まで含めて一つのコースです。",
      "太宰府天満宮の参道は梅ヶ枝餅が名物で、焼きたての香りが強いのが特徴。学問の神様として受験生の参拝も多いです。",
      "中洲の夜景は派手ですが、地元は川沿いの静かな散歩道としても使います。時間で雰囲気が変わるのが面白い場所です。",
      "福岡は焼き鳥の“串の種類”が豊富で、豚バラが定番。味噌だれや塩の違いで店が分かれます。",
      "糸島はカフェと海がセットになったスポットとして人気。景色を眺めながらのんびり過ごすのが福岡流の休日です。",
      "うどん文化も根強く、やわらかい麺が好まれます。ラーメンと並ぶ日常食として存在しています。",
    ],
    Kagoshima: [
      "桜島は日常の風景として見える火山で、灰が降る日は“灰雨対策”が必要。地元では洗濯物を室内に干すのが常識です。",
      "黒豚は脂の甘さが特徴で、とんかつにすると“衣より肉”が主役。しゃぶしゃぶも人気で食べ比べが楽しいです。",
      "芋焼酎文化が根付いていて、銘柄の違いを語るのが地元の会話の一部。水割りやお湯割りの好みも分かれます。",
      "さつま揚げは屋台の定番で、味のバリエーションが豊富。チーズ入りや野菜入りなど、日常のおかずに近い存在です。",
      "おはら祭は踊りのパワーが強く、通り一面が踊り子で埋まります。観光客も一緒に踊れるのが特徴です。",
      "鹿児島ラーメンは白濁よりも“澄んだ豚骨”が多く、優しい味わいが特徴。地元では朝ラーメンの文化もあります。",
      "砂むし温泉は“温泉＋サウナ”に近い感覚で、短時間で体が温まります。海辺で体験できるのが独特です。",
      "桜島大根は世界最大級の大根で、冬の収穫時期に話題になります。煮物にすると甘みが強く出ると言われます。",
      "奄美や種子島など周辺離島の文化が県内に混ざり、方言や食文化も多様。鹿児島は“南国と本土の境界”の色が濃い地域です。",
      "地元の郷土菓子“かるかん”は山芋で作るのが特徴で、素朴な甘さが人気。お茶菓子として愛されています。",
    ],
    Naha: [
      "那覇の市場は“朝から夜まで動く”のが特徴で、地元の台所として機能しています。揚げたてサーターアンダギーの香りが漂います。",
      "国際通りは観光地として有名ですが、裏通りに入ると地元の食堂が並びます。沖縄そばやチャンプルーが日常の味です。",
      "首里城は復元が進む途中ですが、周囲の石畳や城下町の雰囲気だけでも琉球文化を感じられます。散歩が楽しい場所です。",
      "エイサーは旧盆の時期に街中で踊られる文化で、太鼓の音が響きます。地域ごとにリズムや衣装が違うのが面白いです。",
      "泡盛は“古酒（クース）文化”が根強く、寝かせた年数を重視する人が多いです。お祝いの場に欠かせません。",
      "那覇の海は街に近く、夕暮れの海沿いが人気スポット。空の色が一気に変わる時間帯が特にきれいです。",
      "ゆいレールは短距離ですが“街の景色を眺める乗り物”としても楽しいです。車窓から海が見える瞬間があります。",
      "公設市場の“持ち上げ”文化は買った魚をその場で調理してもらうスタイル。観光客にも地元の食文化が伝わります。",
      "沖縄の祭りは旧暦ベースのものが多く、季節感が本土と少しズレるのが特徴。夏が長く続く感じになります。",
      "ゴーヤーチャンプルーは家庭ごとに味付けが違い、苦味を活かす派と抑える派に分かれます。家庭の味を比べるのが楽しいです。",
    ],
  };

  CITIES.forEach((city) => {
    const facts = factsByCity[city.name] || [];
    state.facts.set(city.name, facts);
  });
}

function updateColumnOffset() {
  const primary = elements.cards.querySelector(".city-column.primary");
  const firstCard = primary ? primary.querySelector(".card") : null;
  if (!firstCard) return;
  const styles = getComputedStyle(primary);
  const gapValue = styles.rowGap || styles.gap || "0px";
  const gap = parseFloat(gapValue) || 0;
  elements.cards.style.setProperty(
    "--column-offset",
    `${firstCard.offsetHeight + firstCard.offsetHeight/2 + gap + 5}px`
  );
}

function buildDots() {
  elements.dots.innerHTML = "";
  CITIES.forEach((city) => {
    const cloud = document.createElement("div");
    cloud.className = "city-cloud";

    const haze = document.createElement("div");
    haze.className = "city-haze";

    const tail = document.createElement("div");
    tail.className = "city-tail";

    const dot = document.createElement("div");
    dot.className = "city-dot";
    elements.dots.appendChild(cloud);
    elements.dots.appendChild(haze);
    elements.dots.appendChild(tail);
    elements.dots.appendChild(dot);
    state.dots.set(city.name, dot);
    state.tails.set(city.name, tail);
    state.clouds.set(city.name, cloud);
  });
}

function positionCityElements() {
  const frameSize = {
    width: elements.mapFrame.offsetWidth,
    height: elements.mapFrame.offsetHeight,
  };
  if (!frameSize.width || !frameSize.height) return;

  const layerRect = elements.lineLayer.getBoundingClientRect();
  elements.lineLayer.setAttribute(
    "viewBox",
    `0 0 ${layerRect.width.toFixed(0)} ${layerRect.height.toFixed(0)}`
  );
  elements.lineLayer.setAttribute("preserveAspectRatio", "none");
  CITIES.forEach((city) => {
    const dot = state.dots.get(city.name);
    const card = state.cards.get(city.name);
    const line = state.lines.get(city.name);
    if (!dot || !card || !line) return;
    const haze = dot.previousElementSibling;
    const tail = state.tails.get(city.name);
    const cloud = state.clouds.get(city.name);

    const { x: px, y: py } = projectCoord(city.lat, city.lon, frameSize);
    dot.style.left = `${px}px`;
    dot.style.top = `${py}px`;
    if (cloud) {
      cloud.style.left = `${px}px`;
      cloud.style.top = `${py}px`;
    }
    if (haze && haze.classList.contains("city-haze")) {
      haze.style.left = `${px}px`;
      haze.style.top = `${py}px`;
    }
    if (tail) {
      tail.style.left = `${px}px`;
      tail.style.top = `${py}px`;
    }

    const dotRect = dot.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const x1 = dotRect.left + dotRect.width / 2 - layerRect.left;
    const y1 = dotRect.top + dotRect.height / 2 - layerRect.top;
    const x2 = cardRect.left - layerRect.left;
    const y2 = cardRect.top + cardRect.height / 2 - layerRect.top;

    line.setAttribute("x1", x1.toFixed(1));
    line.setAttribute("y1", y1.toFixed(1));
    line.setAttribute("x2", x2.toFixed(1));
    line.setAttribute("y2", y2.toFixed(1));
  });
}

function setUpdatedTime() {
  const now = new Date();
  const week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const stamp =
    `${year} | ${month} | ${day} | ${week[now.getDay()]} | ${hours}:${minutes}:${seconds}`;
  elements.updatedAt.textContent = stamp;
}

function getDensityMask(width, height) {
  if (
    state.densityMask &&
    state.densityMask.width === width &&
    state.densityMask.height === height
  ) {
    return state.densityMask;
  }

  if (!state.mapPaths) {
    const svg = document.querySelector(".jp-wireframe");
    const paths = svg ? Array.from(svg.querySelectorAll("path")) : [];
    state.mapPaths = paths.map((path) => new Path2D(path.getAttribute("d")));
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;

  maskCtx.clearRect(0, 0, width, height);
  maskCtx.save();
  maskCtx.scale(width / 400, height / 500);
  maskCtx.filter = "blur(18px)";
  maskCtx.fillStyle = "rgba(255, 255, 255, 1)";
  state.mapPaths.forEach((path) => maskCtx.fill(path));
  maskCtx.restore();
  maskCtx.filter = "none";

  const data = maskCtx.getImageData(0, 0, width, height).data;
  state.densityMask = { width, height, data };
  return state.densityMask;
}

function drawDensityLayer(list) {
  if (!elements.densityLayer) return;
  const canvas = elements.densityLayer;
  const width = elements.mapFrame.offsetWidth;
  const height = elements.mapFrame.offsetHeight;
  if (!width || !height) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const square = 2;
  const gap = 1;
  const step = square + gap;
  const color = "rgba(90, 90, 90, 0.6)";
  const sigma = 40;
  const sigma2 = sigma * sigma * 2;
  const mask = getDensityMask(width, height);
  const maskData = mask ? mask.data : null;

  const points = list.map((item) => {
    const level = clamp(item.temperature / 30, 0, 1);
    const { x, y } = projectCoord(item.city.lat, item.city.lon, {
      width,
      height,
    });
    return { x, y, level, temperature: item.temperature };
  });

  const cols = Math.ceil((width - square) / step);
  const rows = Math.ceil((height - square) / step);
  const edgeFade = 500;
  const edgeBuffer = 80;

  const noise = (x, y) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let row = 0; row < rows; row += 1) {
    const yPos = row * step;
    for (let col = 0; col < cols; col += 1) {
      const xPos = col * step;
      let influence = 0;
      let tempWeight = 0;
      let weightSum = 0;
      let minDist2 = Infinity;
      for (let i = 0; i < points.length; i += 1) {
        const dx = xPos - points[i].x;
        const dy = yPos - points[i].y;
        const dist2 = dx * dx + dy * dy;
        const weight = Math.exp(-dist2 / sigma2);
        influence += points[i].level * weight;
        tempWeight += points[i].temperature * weight;
        weightSum += weight;
        if (dist2 < minDist2) minDist2 = dist2;
      }
      const edgeDist =
        Math.min(xPos, yPos, width - xPos, height - yPos) + edgeBuffer;
      const edgeFactor = clamp(edgeDist / edgeFade, 0, 1);
      const edgeSmooth = edgeFactor * edgeFactor * (3 - 2 * edgeFactor);
      let maskAlpha = 1;
      if (maskData) {
        const mx = Math.max(0, Math.min(width - 1, Math.round(xPos)));
        const my = Math.max(0, Math.min(height - 1, Math.round(yPos)));
        maskAlpha = maskData[(my * width + mx) * 4 + 3] / 255;
        maskAlpha = Math.pow(maskAlpha, 0.6);
        const cityFade = 200;
        const cityDist = Math.sqrt(minDist2);
        const cityFactor = clamp(cityDist / cityFade, 0, 1);
        const citySmooth = cityFactor * cityFactor * (3 - 2 * cityFactor);
        maskAlpha = maskAlpha + (1 - maskAlpha) * (1 - citySmooth);
      }
      const probability = clamp(
        (0.03 + influence * 0.6) * edgeSmooth * maskAlpha,
        0,
        0.85
      );
      if (noise(col, row) < probability) {
        const avgTemp = tempWeight / Math.max(weightSum, 1e-4);
        const colorMix = tempToColor(avgTemp);
        ctx.fillStyle = `rgba(${colorMix.r}, ${colorMix.g}, ${colorMix.b}, 0.55)`;
        ctx.fillRect(xPos, yPos, square, square);
      }
    }
  }
}

function summarizeWeather(values) {
  const temps = values.map((v) => v.temperature);
  const rains = values.map((v) => v.precipitation);
  const avgTemp =
    temps.reduce((sum, val) => sum + val, 0) / Math.max(temps.length, 1);
  const avgRain =
    rains.reduce((sum, val) => sum + val, 0) / Math.max(rains.length, 1);

  state.tempLevel = clamp((avgTemp + 5) / 35, 0, 1);
  state.rainIntensity = clamp(avgRain / 5, 0, 1);
}

async function fetchWeather() {
  const latitudes = CITIES.map((city) => city.lat).join(",");
  const longitudes = CITIES.map((city) => city.lon).join(",");
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitudes}` +
    `&longitude=${longitudes}` +
    "&current=temperature_2m,precipitation,weather_code,wind_speed_10m,cloud_cover" +
    "&timezone=Asia%2FTokyo";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Weather API error");
  }
  const data = await response.json();
  const list = CITIES.map((city, index) => {
    const entry = Array.isArray(data) ? data[index] : data;
    const current = (entry && entry.current) || {};
    return {
      city,
      temperature: toNumber(current.temperature_2m),
      precipitation: toNumber(current.precipitation),
      wind: toNumber(current.wind_speed_10m),
      code: toNumber(current.weather_code),
      cloudCover: toNumber(current.cloud_cover),
    };
  });

  state.latestWeather = list;

  list.forEach((item) => {
    const card = state.cards.get(item.city.name);
    if (!card) return;
    card.querySelector(".metric").textContent = `${Math.round(
      item.temperature
    )}°`;
    const cardTemp = card.querySelector(".metric");
    const cardColor = tempToColor(item.temperature);
    cardTemp.style.color = `rgb(${cardColor.r}, ${cardColor.g}, ${cardColor.b})`;
    card.querySelector(".cloud").textContent = `${Math.round(
      item.cloudCover
    )}%`;
    card.querySelector(".wind").textContent = `${item.wind.toFixed(1)} m/s`;

    const dot = state.dots.get(item.city.name);
    if (dot) {
      const intensity =
        item.precipitation > 2 ? "high" : item.precipitation > 0.3 ? "mid" : "low";
      dot.dataset.intensity = intensity;

      const color = tempToColor(item.temperature);
      dot.style.setProperty("--dot-color", `rgb(${color.r}, ${color.g}, ${color.b})`);
      dot.style.setProperty(
        "--dot-glow",
        `rgba(${color.r}, ${color.g}, ${color.b}, 0.5)`
      );
      dot.style.setProperty(
        "--dot-glow-transparent",
        `rgba(${color.r}, ${color.g}, ${color.b}, 0)`
      );

      const haze = dot.previousElementSibling;
      if (haze && haze.classList.contains("city-haze")) {
        haze.style.background = tempToHaze(item.temperature);
      }

      const tail = state.tails.get(item.city.name);
      const cloud = state.clouds.get(item.city.name);
      const wind = clamp(item.wind, 0, 20);
      const speedScale = 0.4 + wind / 6;
      const lengthScale = 0.4 + wind / 8;
      const angle = 45;
      if (tail) {
        tail.style.transform = `translate(0, -50%) rotate(${angle}deg) scaleX(${lengthScale})`;
        tail.style.background = `linear-gradient(90deg, rgba(${color.r}, ${color.g}, ${color.b}, 0.75), rgba(${color.r}, ${color.g}, ${color.b}, 0))`;
        tail.style.opacity = `${0.45 + wind / 20}`;
      }
      if (cloud) {
        const cloudLevel = clamp(item.cloudCover / 100, 0, 1);
        cloud.style.opacity = `${0.15 + cloudLevel * 0.65}`;
        cloud.style.transform = `translate(-50%, -50%) scale(${0.6 + cloudLevel * 0.7})`;
      }
    }
  });

  summarizeWeather(
    list.map((item) => ({
      temperature: item.temperature,
      precipitation: item.precipitation,
    }))
  );
  drawDensityLayer(list);
  setUpdatedTime();
  positionCityElements();
}

function tempToColor(temp) {
  const min = -10;
  const max = 35;
  const t = clamp((temp - min) / (max - min), 0, 1);
  const mid = 0.5;
  const cool = { r: 120, g: 190, b: 255 };
  const warm = { r: 90, g: 210, b: 120 };
  const hot = { r: 255, g: 90, b: 90 };
  let a;
  let b;
  let p;
  if (t <= mid) {
    a = cool;
    b = warm;
    p = t / mid;
  } else {
    a = warm;
    b = hot;
    p = (t - mid) / mid;
  }
  const r = Math.round(a.r + (b.r - a.r) * p);
  const g = Math.round(a.g + (b.g - a.g) * p);
  const bch = Math.round(a.b + (b.b - a.b) * p);
  return { r, g, b: bch };
}

function tempToHaze(temp) {
  const color = tempToColor(temp);
  return `radial-gradient(circle, rgba(${color.r}, ${color.g}, ${color.b}, 0.5) 0%, rgba(${color.r}, ${color.g}, ${color.b}, 0.0) 80%)`;
}

function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({
    canvas: elements.canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const plane = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0.2 },
      uTemp: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uRain;
      uniform float uTemp;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amp * noise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float drift = uTime * 0.03;
        float field = fbm(vUv * 3.0 + vec2(drift, drift * 0.7));
        float cloud = smoothstep(0.35, 0.8, field);

        vec3 warm = vec3(0.14, 0.14, 0.15);
        vec3 cool = vec3(0.08, 0.09, 0.11);
        vec3 base = mix(vec3(0.06, 0.07, 0.08), vec3(0.10, 0.11, 0.12), cloud);

        vec3 tempMix = mix(cool, warm, uTemp);
        vec3 rainMix = mix(base, vec3(0.08, 0.09, 0.11), uRain * 0.8);

        vec3 color = mix(rainMix, tempMix, 0.18);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(plane, material);
  scene.add(mesh);

  const rainCount = 1200;
  const positions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    positions[i * 3] = Math.random() * 2 - 1;
    positions[i * 3 + 1] = Math.random() * 2 - 1;
    positions[i * 3 + 2] = 0;
  }

  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const rainMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.01,
    transparent: true,
    opacity: 0.35,
  });

  const rain = new THREE.Points(rainGeometry, rainMaterial);
  scene.add(rain);

  function resize() {
    const { clientWidth, clientHeight } = elements.canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    positionCityElements();
  }

  function animate(time) {
    material.uniforms.uTime.value = time * 0.001;
    material.uniforms.uRain.value = state.rainIntensity;
    material.uniforms.uTemp.value = state.tempLevel;

    const speed = 0.004 + state.rainIntensity * 0.02;
    const array = rainGeometry.attributes.position.array;
    for (let i = 0; i < rainCount; i++) {
      const idx = i * 3 + 1;
      array[idx] -= speed;
      if (array[idx] < -1.1) array[idx] = 1.1;
    }
    rainGeometry.attributes.position.needsUpdate = true;
    rainMaterial.opacity = 0.15 + state.rainIntensity * 0.55;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);
}

function applyMapTransform() {
  const { x, y } = state.mapOffset;
  const scale = state.mapScale;
  elements.mapFrame.style.transform =
    `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
}

function updateMapScale() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = 500 / 400;
  const maxHeight = vh * 0.82;
  const maxWidth = vw * 0.62;
  const height = Math.min(maxHeight, maxWidth * aspect);
  elements.mapFrame.style.height = `${Math.max(height * 3.12, vh * 0.6)}px`;
  elements.mapFrame.style.width = "auto";
  applyMapTransform();
  if (state.latestWeather) {
    drawDensityLayer(state.latestWeather);
  }
}

async function updateWeather() {
  try {
    await fetchWeather();
  } catch (error) {
    elements.updatedAt.textContent = "API error";
  }
}

buildCards();
buildDots();
if (ENABLE_BACKGROUND) {
  setupRenderer();
}
updateMapScale();
updateWeather();
setUpdatedTime();
updateColumnOffset();
setInterval(updateWeather, UPDATE_INTERVAL);
setInterval(setUpdatedTime, 1000);
buildFacts();
setupTooltip();

if (elements.refreshButton) {
  elements.refreshButton.addEventListener("click", updateWeather);
}
function startDrag(event) {
  if (event.button !== 0) return;
  if (event.target.closest("#refreshButton")) return;
  state.drag.active = true;
  state.drag.startX = event.clientX - state.mapOffset.x;
  state.drag.startY = event.clientY - state.mapOffset.y;
  elements.mapFrame.classList.add("dragging");
  elements.mapOverlay.classList.add("dragging");
  document.body.classList.add("dragging");
}

function moveDrag(event) {
  if (!state.drag.active) return;
  state.mapOffset.x = event.clientX - state.drag.startX;
  state.mapOffset.y = event.clientY - state.drag.startY;
  applyMapTransform();
  positionCityElements();
}

function endDrag() {
  state.drag.active = false;
  elements.mapFrame.classList.remove("dragging");
  elements.mapOverlay.classList.remove("dragging");
  document.body.classList.remove("dragging");
}

document.addEventListener("pointerdown", startDrag, { capture: true });
document.addEventListener("pointermove", moveDrag);
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

document.addEventListener(
  "wheel",
  (event) => {
    if (event.target.closest("#refreshButton")) return;
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    const next = state.mapScale * (delta > 0 ? 0.92 : 1.08);
    state.mapScale = Math.min(Math.max(next, 0.6), 3.0);
    applyMapTransform();
    positionCityElements();
  },
  { passive: false, capture: true }
);

window.addEventListener("resize", () => {
  updateMapScale();
  positionCityElements();
  updateColumnOffset();
});
requestAnimationFrame(positionCityElements);
elements.cards.addEventListener("scroll", positionCityElements);
window.addEventListener("load", positionCityElements);
