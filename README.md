# Nuvio-Addons

WioSinema ve WioSpor'u **ana depolara dokunmadan** Nuvio'ya uyarlamak için ayrı adapter/build deposu.

## Mimari

Bu proje iki farklı Nuvio entegrasyonu üretir:

- **WioSinema → Nuvio Plugin Repository**: Nuvio film/dizi sayfasından gelen TMDB kimliğini doğrudan stream'e çeviren yerel JavaScript provider'ları. `manifest.json` Nuvio'nun Plugin bölümüne eklenir.
- **WioSpor → Stremio/Nuvio HTTP Addon**: canlı TV için `catalog`, `meta` ve `stream` endpoint'leri. Nuvio'nun Addons bölümüne HTTPS manifest URL'si eklenir.

Nuvio pluginleri sadece stream sağlar; canlı kanal kataloğu için HTTP addon kullanılması kasıtlıdır.

## Şu anki durum

**WioSinema:** iki yerel Nuvio provider çalışır durumda:

- `providers/wiosinema-clipbox.js` — WioSinema ClipBox/VixSrc TMDB rotası.
- `providers/wiosinema-vidup.js` — CineStream içindeki Vidup doğrudan TMDB rotası; upstream'in kullandığı HTTP decrypt akışını Nuvio/Hermes uyumlu Promise tabanlı JavaScript ile uygular.

Her ikisi de film ve dizilerde `getStreams(tmdbId, mediaType, season, episode)` export eder. Private `TurkSinema-Source` senkronu açıksa ClipBox tamamen yeniden üretilir; Vidup API adresleri ve davranış marker'ları upstream kaynaktan doğrulanır. Tanınmayan kritik değişiklikte build fail olur ve eski çalışan çıktı korunur.

**WioSpor:** public `WioSpor` kaynağından şu anda 80 kanal üretiliyor. HTTP addon `manifest`, `catalog`, `meta` ve **gerçek `stream` resolver** katmanlarına sahiptir. WORDPRESS, ROYAL, INTER ve BEYAZ ortak kaynak aileleri JS'e portlandı; player parser upstream regresyon testleriyle doğrulanıyor. Aktif domain adayları public `Wiojelt/TurkSpor/domains.json` manifestinden alınır. Böylece WioSpor stream çözümü private secret olmadan da çalışabilir.

**Otomatik senkron altyapısı:** `WioSpor` public deposunu GitHub Actions tokenıyla; `TurkSinema-Source` ve `TurkSpor-Source` private depolarını varsa ayrı salt-okunur token ile izler. Upstream SHA değişince snapshot'lar yenilenir, adapter'lar çalıştırılır, test edilir ve yalnızca başarılıysa generated çıktılar commit edilir. Workflow 6 saatte bir ve kod değişikliklerinde çalışır.

## Nuvio'ya ekleme

WioSinema plugin repository için:

```text
https://raw.githubusercontent.com/Wiojelt/Nuvio-Addons/main/manifest.json
```

WioSpor canlı TV addon'ı için repo önce Vercel gibi kalıcı bir HTTPS Node 24 ortamına deploy edilmelidir. Deploy edilen alan adında Nuvio'ya eklenecek adres:

```text
https://<alan-adin>/manifest.json
```

Repo `api/index.mjs` ve `vercel.json` ile Vercel'e hazırdır.

## Private upstream doğrulamasını açma

Public WioSpor senkronu ve canlı resolver secret istemez. Private kaynak değişikliklerini de otomatik guard etmek için bu repoda `UPSTREAM_GH_TOKEN` adlı Actions secret tanımla. Token'ın yalnızca `Wiojelt/TurkSinema-Source` ve `Wiojelt/TurkSpor-Source` için **Contents: Read** izni olması yeterlidir.

Yerelde:

```bash
UPSTREAM_GH_TOKEN=... npm run sync
npm run generate
npm test
```

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
src/addons/wiospor/               # WioSpor HTTP addon + resolver
scripts/                          # upstream sync + adapter generator'ları
config/upstreams.json             # hangi kaynakların izlendiği
config/wiospor-source-specs.bootstrap.json
.upstream-cache/                  # son senkronlanan Kotlin snapshot'ları
generated/                        # katalog/spec/state çıktıları
.github/workflows/sync.yml        # 6 saatte bir güvenli otomatik senkron
api/index.mjs + vercel.json       # Vercel/Node 24 giriş noktası
```

## Güvenli yayın prensibi

Converter'ın tanımadığı kritik upstream değişikliği build'i **fail** eder. Workflow o durumda eski çalışan generated dosyaları değiştirmez. Bu özellikle kaynak sitelerin resolver akışları değiştiğinde yanlış/bozuk otomatik çeviri yayınlanmasını engeller.

## Lisans

GPL-3.0-only. Port edilen kodun upstream lisans/atıfları korunmalıdır.
