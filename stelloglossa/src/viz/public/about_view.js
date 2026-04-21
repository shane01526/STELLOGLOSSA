/* 「背後原理」頁面:面向一般大眾的長文,帶天文學與語言學色彩。
   全部內容 inline,第一次進入時建一次 DOM,之後只切可見性。 */

let rendered = false;

export function renderAbout() {
  if (rendered) return;
  rendered = true;
  const c = document.getElementById('about-view');
  c.innerHTML = MARKUP;
}

const MARKUP = `
<article class="about">

  <header class="about-hero">
    <p class="kicker">背後原理 · WHY THIS EXISTS</p>
    <h1>讓宇宙自己<br/>說話的語言考古機</h1>
    <p class="lede">
      人類造語言,是為了指認眼前的東西。
      但如果不是人類來命名,語言會長什麼樣子?
      這個計畫把這個古老的問題,交給銀河裡 50 顆脈衝星回答。
    </p>
  </header>

  <section class="about-section">
    <div class="glyph">✦</div>
    <h2>一、脈衝星:宇宙的節拍器</h2>
    <p>
      脈衝星是死去恆星的殘骸 —— 一顆太陽,耗盡核燃料、自身引力內塌,
      留下一顆直徑只有 20 公里、但密度高到一茶匙重達十億公噸的
      <em>中子星</em>。它一邊極速自轉,一邊像燈塔一樣從兩極射出無線電波束。
      每當光束掃過地球,我們就收到一次脈衝。
    </p>
    <p>
      這是全宇宙最穩定的計時器之一,比人類最好的原子鐘還精準。
      天文學家為每一顆脈衝星建檔了四個最基礎的物理量:
    </p>
    <div class="param-grid">
      <div class="param">
        <div class="p-sym">P</div>
        <div class="p-name">自轉週期</div>
        <div class="p-desc">從千分之一秒到數秒不等。轉得越快,這顆星越「年輕」。</div>
      </div>
      <div class="param">
        <div class="p-sym">DM</div>
        <div class="p-name">色散量</div>
        <div class="p-desc">訊號抵達地球時被星際介質拉長的量。數字越大,訊號旅途中穿越的氣體越厚。</div>
      </div>
      <div class="param">
        <div class="p-sym">Ṗ</div>
        <div class="p-name">自轉減慢率</div>
        <div class="p-desc">星球老化的指紋。轉得慢、慢得快,就越接近沉寂。</div>
      </div>
      <div class="param">
        <div class="p-sym">W₅₀</div>
        <div class="p-name">脈衝寬度</div>
        <div class="p-desc">每一次「嗶」持續多久。像是這顆星說話時嘴巴張多開。</div>
      </div>
    </div>
    <p class="aside">
      這四個數字結合起來,就是一顆脈衝星的「聲紋」。
      在這個計畫裡,這四個數字將化為四樣語言學上的東西。
    </p>
  </section>

  <section class="about-section">
    <div class="glyph">◌</div>
    <h2>二、語言的四個骨架</h2>
    <p>
      人類語言的多樣性看起來無窮,但語言學家其實找出幾個重複出現的骨架。
      在比較語言學 (Linguistic Typology) 裡,以下四個維度幾乎可以定位地球上任何一門語言:
    </p>
    <div class="ling-row">
      <div class="ling-item">
        <div class="ling-sym">CV · CCCVCC</div>
        <div class="ling-desc"><b>音節結構</b> —— 一個音節能塞幾個子音、幾個母音。日語只有「子音+母音」,
        喬治亞語能把六個子音堆在一起 (<em>msxverpli</em>: 星星)。</div>
      </div>
      <div class="ling-item">
        <div class="ling-sym">˥ ˦ ˧ ˨ ˩</div>
        <div class="ling-desc"><b>聲調系統</b> —— 同一串音,用不同音高會變成不同字嗎?
        普通話有 4 聲,廣東話有 6 聲,芬蘭語則完全沒有。</div>
      </div>
      <div class="ling-item">
        <div class="ling-sym">◄ · ► · ►▶</div>
        <div class="ling-desc"><b>時態系統</b> —— 一門語言如何把「昨天」和「明天」拼進動詞。
        中文靠語境,英語用詞形變化,有些語言甚至區分「遠古」與「剛剛」。</div>
      </div>
      <div class="ling-item">
        <div class="ling-sym">a i u / a e i o u ɛ ɔ ã</div>
        <div class="ling-desc"><b>母音系統</b> —— 從西班牙語簡潔的 5 個,到法語帶鼻化的 15 個以上,
        母音的空間裡藏著口腔能製造的所有共振。</div>
      </div>
    </div>
  </section>

  <section class="about-section">
    <div class="glyph">✧</div>
    <h2>三、如果讓物理來命名</h2>
    <p>
      這裡是整個計畫的核心假設:
      <em>這四個天文參數,也許並不是隨機地與四個語言維度對應 ——
      也許它們本來就說同一件事。</em>
    </p>

    <div class="mapping">
      <div class="map-row">
        <div class="map-phys">自轉越快</div>
        <div class="map-arrow">→</div>
        <div class="map-ling">音節越短</div>
        <div class="map-why">
          轉得太快,聲音沒時間完整發出來,語言只好用最簡單的
          「子音+母音」結構。就像喘著氣講話。
        </div>
      </div>
      <div class="map-row">
        <div class="map-phys">介質越厚</div>
        <div class="map-arrow">→</div>
        <div class="map-ling">聲調越多</div>
        <div class="map-why">
          色散讓訊號在抵達前穿越厚厚的氣體雲。訊號越皺,
          語言就能從這些皺摺裡提煉出更多「音高」,像普通話、像粵語。
        </div>
      </div>
      <div class="map-row">
        <div class="map-phys">老化越急</div>
        <div class="map-arrow">→</div>
        <div class="map-ling">時態越精細</div>
        <div class="map-why">
          只有對時間消逝很敏感的存在,才會把「過去、現在、將來」
          細分到動詞裡。時間在它們身上明顯流動,於是時間進入了語法。
        </div>
      </div>
      <div class="map-row">
        <div class="map-phys">脈衝越寬</div>
        <div class="map-arrow">→</div>
        <div class="map-ling">母音越豐富</div>
        <div class="map-why">
          每一次脈衝的波形越複雜,嘴裡(或者說,發聲腔)能震盪出的
          共振越多,語言的母音系統就越繁茂。
        </div>
      </div>
      <div class="map-row">
        <div class="map-phys">音節越繁 + 聲調越少</div>
        <div class="map-arrow">→</div>
        <div class="map-ling">子音越多、越偏擦音</div>
        <div class="map-why">
          子音庫是前四條規則的**合成**結果 —— 庫的「大小」由音節結構決定,
          音節越長 (CCCVCC) 的語言需要越多輔音才不會撞詞;庫的「風味」則由
          聲調數決定 —— 無聲調的語言必須靠音段對比辨義,因此擦音豐富;
          聲調繁多的語言音段可以單純,於是以塞音為主。
        </div>
      </div>
    </div>

    <p class="aside">
      我們並不是在主張真的有這樣的語言。
      我們主張的是:<em>語言的骨架,可以被任何有節奏、有密度、有流動的系統生成</em>。
      脈衝星只是這個假設的一次具體提案。
    </p>
  </section>

  <section class="about-section">
    <div class="glyph">⌘</div>
    <h2>四、星際的地理學</h2>
    <p>
      地球上,兩門語言如果在地理上靠近,就會互相借詞。
      英語偷了法語的 <em>café</em>,越南語用著漢字的形狀。
      語言學有一條古老的觀察:距離,決定親緣。
    </p>
    <p>
      我們把這條法則搬到銀河尺度。假設兩顆脈衝星在真實 3D 空間中相隔
      <em>0.5 kpc</em> 以內,它們的語言就會直接借用對方的字詞;
      <em>0.5 到 2 kpc</em> 之間,會發生語義擴展;
      更遠就會縮減、孤立。最終浮現出一張語言接觸網絡,
      跟你在地球語言學地圖上看到的模式驚人地相似。
    </p>
    <p>
      在 3D 星圖裡,這些關係就是你看到的那些流動的藍色粒子 ——
      語義,正在穿越幾千光年。
    </p>
  </section>

  <section class="about-section">
    <div class="glyph">∴</div>
    <h2>五、我們為什麼做這件事</h2>
    <p>
      這個計畫不試圖「發現」外星語言。它試圖做一件更謙卑的事:
      <em>用宇宙已知的物理節奏,作為語言生成的規則,看看會長出什麼。</em>
    </p>
    <p>
      結果是:一種奇怪而一致的語言族系 —— 每一門都是真實天文資料的直接衍生,
      彼此之間還在根據它們在銀河系裡的真實距離,進行著語言接觸。
      這些資料可以拿來跑統計:聲調真的跟銀河核心的位置有關嗎?
      短週期脈衝星是否真的偏好某些母音?
      這些假設我們都逐一檢驗了,結果就在「實驗結果」那一頁。
    </p>
    <p>
      這是科學、也不完全是科學。它更像一封寫給宇宙的情書,
      一個把「語言從何而來」這個古老問題,丟到天文尺度上重問一次的嘗試。
    </p>
    <p class="envoi">
      如果脈衝星真的在說話,<br/>
      它們說的第一句,可能是 <em>ta</em>。<br/>
      —— 光。
    </p>
  </section>

  <footer class="about-footer">
    <p>
      STELLOGLOSSA · 資料取自
      <a href="https://www.atnf.csiro.au/research/pulsar/psrcat/" target="_blank" rel="noopener">
        ATNF Pulsar Catalogue</a>
      · 語言學分類取自 WALS · 詞彙由 Claude / GPT / Gemini 協同生成 ·
      音系聚類使用 scipy hierarchical clustering
    </p>
    <p>
      以上所有假設都可以被挑戰、重做、顛覆。這正是這個專案希望發生的事。
    </p>
  </footer>

</article>
`;
