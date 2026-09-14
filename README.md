# Nuvio-Addons

WioSinema ve WioSpor'u **ana depolara dokunmadan** Nuvio'ya uyarlamak için ayrı adapter/build deposu.

## Mimari

Bu proje iki farklı Nuvio entegrasyonu üretir ve dağıtım için yalnızca GitHub kullanır:

- **WioSinema → Nuvio Plugin Repository**: Nuvio film/dizi sayfasından gelen TMDB kimliğini doğrudan stream'e çeviren yerel JavaScript provider'ları. `main/manifest.json` doğrudan GitHub Raw üzerinden yüklenir.
- **WioSpor → Stremio/Nuvio canlı TV addon'ı**: `catalog`, `meta` ve `stream` JSON kaynakları GitHub Actions tarafından periyodik çözülür ve ayrı `live` branch'ine yazılır. Nuvio bunları doğrudan GitHub Raw üzerinden okur.

Harici sunucu veya serverless hosting gerekmez.

## Şu anki durum

**WioSinema:** doğrudan TMDB alan yerel Nuvio provider'ları:

- `providers/wiosinema-clipbox.js` — ClipBox/VixSrc.
- `providers/wiosinema-vidup.js` — CineStream Vidup.
- `providers/wiosinema-hexa.js` — CineStream Hexa.

Provider'lar film/dizi için `getStreams(tmdbId, mediaType, season, episode)` export eder. Private `TurkSinema-Source` senkronu açıksa kritik endpoint ve davranış marker'ları upstream kaynaktan doğrulanır; tanınmayan değişiklikte build durur.

**WioSpor:** public `WioSpor` kaynağından 80 kanal üretiliyor. WORDPRESS, ROYAL, INTER ve BEYAZ ortak kaynak aileleri JS'e portlandı; aktif domain adayları public `Wiojelt/TurkSpor/domains.json` manifestinden alınır. Resolver sonuçları GitHub Actions tarafından statik Stremio/Nuvio JSON'larına dönüştürülür.

`publish-live.yml` her 15 dakikada bir çalışır. Başarılı stream sonuçlarını `live` branch'ine force-push eder. Bir kaynak geçici olarak çözülemezse en fazla 90 dakika önceki çalışan stream çıktısı fallback olarak korunur. Hiç kanal çözülemiyorsa workflow yeni boş dağıtımı yayınlamaz.

**Upstream senkronu:** `WioSpor` public deposu GitHub Actions tokenıyla; `TurkSinema-Source` ve `TurkSpor-Source` private depoları varsa ayrı salt-okunur token ile izlenir. Ana WioSinema/WioSpor depolarında hiçbir workflow veya dosya değiştirilmez.

## Nuvio'ya ekleme

### WioSinema plugin repository

```text
https://raw.githubusercontent.com/Wiojelt/Nuvio-Addons/main/manifest.json
```

### WioSpor canlı TV addon

```text
https://raw.githubusercontent.com/Wiojelt/Nuvio-Addons/live/wiospor/manifest.json
```

`live` branch ilk başarılı canlı resolver koşusundan sonra otomatik oluşur.

## Private upstream doğrulamasını açma

Public WioSpor senkronu ve live yayın secret istemez. Private kaynak değişikliklerini de otomatik guard etmek için repoda `UPSTREAM_GH_TOKEN` adlı Actions secret tanımlanabilir. Token'ın yalnızca `Wiojelt/TurkSinema-Source` ve `Wiojelt/TurkSpor-Source` için **Contents: Read** izni olması yeterlidir.

Yerelde:

```bash
UPSTREAM_GH_TOKEN=... npm run sync
npm run generate
npm test
npm run build:live
```

## Neden genel Kotlin → JavaScript transpiler değil?

CloudStream Kotlin sağlayıcıları Android API'leri, CloudStream `MainAPI`, `app.get`, `ExtractorLink`, `loadExtractor`, coroutines, WebView ve provider'a özel parsing kodu kullanabiliyor. Bunları sözdizimsel olarak JavaScript'e çevirmek çalışan Nuvio provider garantisi vermez.

Bu repo bunun yerine **source-aware adapter** kullanır:

1. deklaratif verileri (domain, kanal, alias, provider listesi) otomatik çıkarır;
2. her davranış ailesi için bir kez yazılan JS runtime adapter'ını kullanır;
3. upstream davranış sözleşmesi değiştiğinde marker/hash guard ile build'i durdurur;
4. son çalışan Nuvio çıktısını bozmadan korur.

## Dizinler

```text
manifest.json                         # WioSinema Nuvio plugin repository manifesti
providers/                            # Nuvio'nun doğrudan yüklediği WioSinema JS provider'ları
src/addons/wiospor/                   # WioSpor resolver/parser kodu
scripts/build-wiospor-live.mjs        # canlı stream JSON builder
scripts/                              # upstream sync + adapter generator'ları
config/upstreams.json                 # izlenen upstream dosyaları
config/wiospor-source-specs.bootstrap.json
generated/                            # katalog/spec/state çıktıları
.github/workflows/sync.yml            # 6 saatte bir upstream senkronu
.github/workflows/publish-live.yml    # 15 dakikada bir GitHub-only canlı yayın
live branch                           # Nuvio'nun okuduğu statik WioSpor addon çıktısı
```

## Güvenli yayın prensibi

Converter'ın tanımadığı kritik upstream değişikliği build'i **fail** eder. Live resolver tamamen başarısız olduğunda mevcut çalışan `live` branch korunur; boş/bozuk sürüm yayınlanmaz.

## Lisans

GPL-3.0-only. Port edilen kodun upstream lisans/atıfları korunmalıdır.
