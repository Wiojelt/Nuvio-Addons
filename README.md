# Nuvio-Addons

WioSinema ve WioSpor'u **ana depolara dokunmadan** Nuvio'ya uyarlamak için ayrı adapter/build deposu.

## Mimari

Bu proje iki farklı Nuvio entegrasyonu üretir:

- **WioSinema → Nuvio Plugin Repository**: Nuvio film/dizi sayfasından gelen TMDB kimliğini doğrudan stream'e çeviren yerel JavaScript provider'ları. `manifest.json` Nuvio'nun Plugin bölümüne eklenir.
- **WioSpor → Stremio/Nuvio HTTP Addon**: canlı TV için `catalog`, `meta` ve `stream` endpoint'leri. Nuvio'nun Addons bölümüne HTTPS manifest URL'si eklenir.

Nuvio pluginleri sadece stream sağlar; canlı kanal kataloğu için HTTP addon kullanılması kasıtlıdır.

## Şu anki durum

**Çalışan ilk port:** `providers/wiosinema-clipbox.js`. WioSinema kaynak kodundaki ClipBox/VixSrc TMDB rotasının bağımsız Nuvio karşılığıdır. Film ve dizilerde `getStreams(tmdbId, mediaType, season, episode)` export eder.

**Otomatik senkron altyapısı:** `WioSpor` public deposunu tokensız, `TurkSinema-Source` ve `TurkSpor-Source` private depolarını varsa salt-okunur token ile izler. Upstream SHA değişince Kotlin kaynak snapshot'larını yeniler, adapter'ları çalıştırır, doğrular ve yalnızca testler geçerse generated çıktıları commit eder.

**WioSpor:** kanal kataloğu ve `SourceSpec` verisi otomatik dönüştürülebilir durumda. HTTP addon'ın `manifest`, `catalog` ve `meta` katmanı hazır. Player parser katmanı JS'e portlandı ve upstream testleri Node testlerine taşındı. Domain/catalog resolver portu tamamlanana kadar `/stream/...` bilinçli olarak boş döner; bozuk link yayınlamaz.

**WioSinema tam kapsam:** `StreamAggregator.kt` içinden sağlayıcı listeleri otomatik keşfediliyor. ClipBox ilk adapter. CineStream miras alınan resolver'ları ve scraper/search tabanlı sağlayıcılar sırayla JS adapter'larına taşınmalı.

## İlk kurulum

Private kaynak depolarını okuyabilmesi için repoda `UPSTREAM_GH_TOKEN` adlı bir Actions secret tanımla. Token'ın yalnızca `Wiojelt/TurkSinema-Source` ve `Wiojelt/TurkSpor-Source` için **Contents: Read** izni olması yeterlidir. Bu repo için Actions'ın kendi `GITHUB_TOKEN`'ı generated dosyaları commit etmek için kullanılır.

Ardından:

```bash
UPSTREAM_GH_TOKEN=... npm run sync
npm run generate
npm test
```

GitHub Actions ayrıca 6 saatte bir upstream SHA kontrolü yapar. `workflow_dispatch` ile elle de tetiklenebilir.

## Neden genel Kotlin → JavaScript transpiler değil?

CloudStream Kotlin sağlayıcıları Android API'leri, CloudStream `MainAPI`, `app.get`, `ExtractorLink`, `loadExtractor`, coroutines, WebView ve provider'a özel parsing kodu kullanabiliyor. Bunları sözdizimsel olarak JavaScript'e çevirmek çalışan Nuvio provider garantisi vermez.

Bu repo bunun yerine **source-aware adapter** kullanır:

1. deklaratif verileri (domain, kanal, alias, provider listesi) otomatik çıkarır;
2. her davranış ailesi için bir kez yazılan JS runtime adapter'ını kullanır;
3. upstream davranış sözleşmesi değiştiğinde marker/hash guard ile build'i durdurur;
4. son çalışan Nuvio çıktısını bozmadan korur.

Bu sayede günlük domain/kanal güncellemeleri gerçekten otomatik taşınabilir; resolver algoritması değişirse sessizce kırık sürüm yayınlamak yerine inceleme gerekir.

## Dizinler

```text
manifest.json                     # Nuvio plugin repository manifesti
providers/                        # Nuvio'nun doğrudan yüklediği JS çıktıları
src/addons/wiospor/               # WioSpor Stremio/Nuvio HTTP addon
scripts/                          # upstream sync + adapter generator'ları
config/upstreams.json             # hangi kaynakların izlendiği
.upstream-cache/                  # son senkronlanan Kotlin snapshot'ları
generated/                        # katalog/spec/state çıktıları
.github/workflows/sync.yml        # 6 saatte bir güvenli otomatik senkron
api/index.mjs + vercel.json       # WioSpor HTTP addon için Vercel/Node 24 giriş noktası
```

## Güvenli yayın prensibi

Converter'ın tanımadığı kritik upstream değişikliği build'i **fail** eder. Workflow o durumda eski çalışan generated dosyaları değiştirmez. Bu özellikle kaynak sitelerin resolver akışları değiştiğinde yanlış/bozuk otomatik çeviri yayınlanmasını engeller.

## Lisans

GPL-3.0-only. Port edilen kodun upstream lisans/atıfları korunmalıdır.
