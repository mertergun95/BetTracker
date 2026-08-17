# BetTracker

Bahis takibi, kasa (bankroll) yönetimi ve performans analizi.
Tek bir TypeScript kod tabanı; hem **web sitesi** (GitHub Pages) hem de **Android
uygulaması** (Capacitor) olarak çalışır.

Veriler cihazda, tarayıcının IndexedDB'sinde saklanır. İstersen **özel bir
GitHub deposu** bağlayarak tüm cihazlarını tek bir bahis geçmişinde
birleştirebilirsin — sunucu yok, hesap yok, veri yalnızca senin deponda.

---

## Hızlı başlangıç

```bash
npm install
npm run dev        # http://localhost:5173/BetTracker/
```

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Web derlemesi (`dist/`) |
| `npm run preview` | Derlenmiş çıktıyı yerel sunar |
| `npm test` | Çekirdek matematik testleri (vitest) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run android:sync` | Android için derle ve Capacitor'a kopyala |
| `npm run android:open` | Android Studio'da aç |
| `npm run fetch:sports` | Lig, takım ve fikstür verisini yeniler |

---

## Özellikler

### Cihazlar arası senkron (GitHub)
Ayarlar → *Cihazlar arası senkron* bölümünden bağlanır:

1. GitHub'da **özel (private)** bir depo aç, örn. `bettracker-data`
2. Fine-grained token oluştur, erişimi o depoya sınırla, **Contents: Read and write** ver
3. Kullanıcı adı, depo ve token'ı gir → **Bağlan**. Her cihazda aynı token ile tekrarla.

Birleştirme **kayıt bazlıdır**: telefonda eklediğin bahisle bilgisayarda
eklediğin bahsin ikisi de kalır, aynı kaydı iki yerde düzenlediysen son
güncellenen kazanır. Silmeler mezar taşı (tombstone) ile taşınır, böylece bir
cihazda sildiğin bahis diğerinden geri gelmez. Token yalnızca o cihazda durur,
hiçbir yere gönderilmez.

### Lig, takım ve fikstür kataloğu
`public/data/` altındaki katalog derlemeye gömülüdür ve her gün bir GitHub
Action ile tazelenir. Bu sayede CORS sorunu, API anahtarı veya kota yoktur —
ve Android uygulamasında **internetsiz** de çalışır.

**Kapsam:** 25 lig · 1200+ takım · 6800+ fikstür
- **ABD:** NFL, NCAA Football, NBA, NCAA Basketball
- **Avrupa futbolu:** İngiltere, İspanya, İtalya, Almanya, Fransa, Hollanda,
  Portekiz, Belçika, Türkiye, İskoçya, Avusturya, İsviçre, Yunanistan, Rusya,
  Romanya, İsrail, **Danimarka**, Norveç, İsveç
- **Kupalar:** Şampiyonlar Ligi, Avrupa Ligi

Bahis eklerken lig seçilir, ardından ya planlanmış bir **fikstür** ya da iki
takım listeden seçilir; katalogda olmayan bir müsabaka için serbest yazı hep
açıktır.

### Bahis kaydı
- **Bet builder** — aynı müsabakada birden fazla tahmin, **tek oranla** fiyatlanır
- Tekli/kombine sekmesi yoktur: bir maç girersen tekli, *Başka maç ekle* dersen
  kombine olur; sistem ise ikinci maçtan sonra çıkan bir anahtarla açılır
- **Back / Lay** (borsa bahsi) — lay için risk, miktar değil **sorumluluk (liability)** üzerinden ölçülür
- **Each-way** bahisler (derece sayısı ve derece oranı ayarlanabilir)
- **Bedava bahis** (kazanınca anapara geri gelmez)
- **Bozdurma (cash out)** — spor sonucunu geçersiz kılar
- **Asya handikap çeyrek çizgileri** — yarım kazanç / yarım kayıp
- **Komisyon** (borsa siteleri için, net kazanç üzerinden)
- **Kapanış oranı** girişi → CLV ve EV takibi
- 44 spor dalı, lig/market/tahmin alanları, etiketler, tipster, not
- Hazır sistem şablonları: Trixie, Patent, Yankee, Lucky 15/31/63, Canadian, Heinz, Super Heinz, Goliath

### Kasa yönetimi
- **Spor kısıtı** — bir kasayı yalnızca seçtiğin sporlara açarsın. Sadece
  Amerikan futbolu seçtiysen o kasaya başka spor girilemez ve bahis formu
  doğrudan o spora göre açılır. Birden fazla spor seçilebilir; boş bırakırsan
  kısıt olmaz.
- Sınırsız kasa, ayrı para birimleriyle (TRY, EUR, USD, GBP, USDT, BTC…)
- Para yatırma / çekme / bonus / düzeltme işlemleri
- Kasa başına not defteri
- Arşivleme, renk kodlaması, kasa karşılaştırma

### Analiz — 50'den fazla istatistik
Kâr, verim (yield), ROI, tutturma oranı, ciro, toplam dönen, RTP, kâr faktörü,
ortalama/medyan oran, kazanan/kaybeden ortalama oranı, bahis başı kâr, en büyük
kazanç/kayıp, en yüksek miktar/oran, en uzun kazanma ve kaybetme serileri, güncel
seri, **maksimum düşüş (drawdown)** ve yüzdesi, standart sapma, **Sharpe oranı**,
ödenen komisyon, açık bahis riski, olası kâr.

**CLV paneli:** ortalama CLV, kapanışı geçme oranı, toplam beklenen değer (EV) ve
**şans** (gerçek kâr − EV) — iyi seçim yapmakla şanslı gitmeyi ayırt eder.

**Kırılımlar:** spor, bahis sitesi, lig, bahis türü, oran aralığı, haftanın günü,
ay, tipster, etiket, taraf (back/lay). Her kırılım hem yatay bar grafiği hem de
sıralanabilir tablo olarak.

**Kâr takvimi:** günlük kâr/zarar ısı haritası.

### Araçlar
| Araç | Ne yapar |
|---|---|
| Miktar planı | Kelly, kısmi Kelly, sabit, kasa yüzdesi, sabit kazanç hedefi, Martingale, Fibonacci, D'Alembert |
| Hedge / bozdurma | Açık bahsi kilitleyen lay miktarını hesaplar; bedavaya çevirme miktarını da verir |
| Dutching | Bir miktarı birden fazla sonuca eşit kâr verecek şekilde böler |
| Surebet | Siteler arası arbitraj kontrolü ve avantaj hesabı |
| Marj / RTP | Site marjını ölçer, marjsız adil oranı çıkarır |
| Simülasyon | Monte Carlo projeksiyonu: beklenen kâr, yüzdelikler, iflas ihtimali |
| Oran çevirici | Ondalık ↔ Amerikan ↔ Kesirli, implied olasılık |
| Sermaye dağılımı | Kasayı gerçek ciro payına göre siteler arasında dağıtır |

### Veri
- **JSON yedek** — her şey (kasalar, bahisler, işlemler, ayarlar), sürümlü format
- **CSV dışa/içe aktarma** — çok ayaklı kombineler `bet_id` sütunuyla korunur;
  okunamayan satırlar atlanır ve raporlanır, import iptal edilmez
- Durum kelimeleri Türkçe ve İngilizce tanınır (`kazandı`, `won`, `iade`, `void`…)

### Arayüz
- **Panel** çok bölmeli: solda sermaye grafiği, sağda devam eden bahisler,
  altta son sonuçlananlar, bugünün özeti ve son 10 sonucun form şeridi
- **Daraltılabilir menü** — simge şeridi olarak durur, üzerine gelince açılır,
  istersen sabitlenir. Açılırken içeriği kaydırmaz, üstüne biner.
- **BT monogramı** — sadece harfler, 20px'te de okunur
- Türkçe / İngilizce (tam i18n, sayı ve tarih biçimlendirmesi dahil)
- Açık / koyu / sistem teması
- Ondalık, Amerikan veya kesirli oran gösterimi
- Mobil öncelikli; masaüstünde kenar çubuğu, mobilde alt sekme çubuğu

---

## Mimari

```
src/
├── core/          Saf mantık — UI'dan tamamen bağımsız, testlerin hedefi
│   ├── sync.ts         Anlık görüntü birleştirme + GitHub taşıma katmanı
│   ├── syncService.ts  Senkron turu: çek, birleştir, yaz, gönder
│   ├── sportsData.ts   Lig/takım/fikstür kataloğu erişimi
│   ├── types.ts        Domain modeli
│   ├── odds.ts         Oran dönüşümleri, implied olasılık, marj temizleme
│   ├── systems.ts      Kombinasyon matematiği ve sistem şablonları
│   ├── settlement.ts   Sonuçlandırma motoru (asıl doğruluk burada)
│   ├── stats.ts        50+ istatistik, kırılımlar, sermaye eğrisi
│   ├── calculators.ts  Kelly, dutching, surebet, hedge, RTP, simülasyon
│   ├── store.ts        Veri erişimi — DataStore arayüzü arkasında
│   ├── db.ts           Dexie / IndexedDB şeması
│   └── io.ts           Yedekleme, CSV dışa/içe aktarma
├── i18n/          Çeviriler (en.ts anahtarların kaynağı, tr.ts tip zorunlu)
├── state/         Uygulama durumu (React context)
├── components/    Paylaşılan UI ve grafikler
└── screens/       Panel, Bahisler, Analiz, Araçlar, Kasalar, Ayarlar
```

**Veri katmanı soyutlanmıştır.** Uygulamanın hiçbir yeri Dexie'yi doğrudan
çağırmaz; her şey `core/store.ts` içindeki `DataStore` arayüzünden geçer.
İleride bulut senkronu eklemek için ikinci bir implementasyon yazıp dosyanın
sonundaki export'u değiştirmek yeterlidir — başka hiçbir yere dokunulmaz.

### Terminoloji (kod boyunca sabit)
- **turnover / ciro** — riske atılan para. Lay bahislerde miktar değil sorumluluk.
- **yield / verim** — kâr ÷ ciro. Bahislerin kendi verimliliği.
- **ROI** — kâr ÷ yatırılan sermaye. Kasanın getirisi.
- `Selection.status` **bahisçinin** gözünden yazılır: lay bir bahis, laylanan
  taraf kazanamadığında `won` olur. Böylece "kazandı" her yerde "para kazandırdı"
  demektir.

### Grafik renkleri
Grafik işaretleri kâr/zarar kutupluluğunu doğrulanmış **mavi ↔ kırmızı**
çiftiyle kodlar, yeşil/kırmızı ile değil: yeşil/kırmızı renk körlüğü ayrımında
kalıyor (deutan ΔE 4.3, hedef ≥ 8). Sayı metinlerinde yeşil/kırmızı korundu,
çünkü orada +/− işareti anlamı zaten taşıyor; ısı haritası hücresinde ise rengin
kendisi tek kodlayıcı.

---

## Android

```bash
npm run android:sync    # web'i derler, Capacitor'a kopyalar
npm run android:open    # Android Studio'da açar
```

APK'yı CI'da derlemek için: **Actions → Build Android APK → Run workflow**.
Çıktı artifact olarak iner. `debug` imzalıdır ve doğrudan kurulabilir; `release`
imzasızdır, mağazaya yüklemek için kendi keystore'unuzla imzalamanız gerekir.

Yerelde derlemek için Android SDK (platform 34, build-tools 34) ve JDK 21 gerekir:

```bash
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Web yayını

`main` dalına her push'ta GitHub Actions siteyi derleyip GitHub Pages'e yayınlar.

İlk kurulumda bir kez: **Settings → Pages → Source: GitHub Actions**.

Yönlendirme `HashRouter` kullanır — GitHub Pages statik dosya sunduğu için
derin bağlantılar yeniden yüklendiğinde 404 vermesin diye, ve Capacitor'ın
`file://` yüklemesiyle uyumlu olsun diye.

---

## Testler

```bash
npm test
```

86 test, çekirdek matematiği kapsar: oran dönüşümleri, sonuçlandırma (tekli,
kombine, sistem, lay, each-way, bedava bahis, bozdurma, çeyrek çizgi), CLV/EV,
istatistikler (verim, seriler, drawdown, sermaye eğrisi), hesap makineleri
(dutching eşit kâr, hedge kilidi, Kelly, RTP, simülasyon determinizmi), CSV
gidiş-dönüşü (bet builder dahil) ve **senkron birleştirme** — iki cihazın
paralel eklemeleri, çakışan düzenlemeler, silme mezar taşları ve silinen bir
kaydın yeniden dirilmemesi.
