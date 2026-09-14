# Upstream senkron tasarımı

## İzlenen kaynaklar

- `Wiojelt/WioSpor@main` (public)
  - `WioChannels.kt`
  - `SourceAggregator.kt`
- `Wiojelt/TurkSinema-Source@main` (private, opsiyonel ama önerilir)
  - WioSinema `StreamAggregator.kt`
  - ClipBox adapter kaynağı
  - CineStream `ApiConstants.kt`
  - CineStream `CineStreamExtractors.kt`
- `Wiojelt/TurkSpor-Source@main` (private, opsiyonel sözleşme doğrulaması)
  - shared `SourceSpec.kt`
  - shared `SportsProvider.kt`
  - shared `PlayerParser.kt`
- `Wiojelt/TurkSpor@main/domains.json` (public runtime manifest)
  - WioSpor resolver'ın güncel domain adayları

## Token ayrımı

Public GitHub API çağrıları Actions'ın `${{ github.token }}` değeriyle yapılır; böylece anonim API kotasına bağımlı kalınmaz. Private kaynaklar için yalnız `UPSTREAM_GH_TOKEN` kullanılır. Bu secret yoksa private depolar denenmez ve public WioSpor senkronu çalışmaya devam eder.

## Akış

`sync-upstreams.mjs` commit SHA'larını `generated/upstream-state.json` ile karşılaştırır. SHA değişmişse ilgili kaynak dosyalarını GitHub Contents API üzerinden `.upstream-cache` içine alır.

`generate-wiospor.mjs`, `WioChannel(...)` kayıtlarını Nuvio/Stremio katalog JSON'una çevirir. Private `SourceSpec.kt` erişilemiyorsa `config/wiospor-source-specs.bootstrap.json` içindeki beş kararlı kaynak sözleşmesi kullanılır. Runtime domainler hardcode edilmez; public TurkSpor `domains.json` manifestinden alınır. WORDPRESS, ROYAL, INTER ve BEYAZ resolver aileleri `src/addons/wiospor/resolver.mjs` içinde çalışır.

`generate-wiosinema.mjs` ClipBox provider'ını private kaynak mevcutsa yeniden üretir ve kritik marker'ları fail-closed doğrular. Vidup adapter'ı davranış portudur; private kaynak mevcutsa `vidupAPI` ve `multiDecryptAPI` adresleri upstream `ApiConstants.kt` içinden yenilenir ve `invokeVidup` sözleşmesinin temel marker'ları kontrol edilir.

## Test kapıları

- bütün yayınlanan provider ve addon giriş noktaları `node --check` ile doğrulanır;
- WioSpor katalog/source-spec minimum sözleşmeleri doğrulanır;
- PlayerParser için upstream davranışından taşınan regresyon testleri vardır;
- WioSpor manifest/catalog/meta sözleşmeleri deterministik test edilir;
- ClipBox ve Vidup ağ akışları gerçek internete çıkmadan mock `fetch` testleriyle sınanır.

Canlı kaynak sitelerin geçici kapanması veya rate-limit'i CI yayın kapısını gereksiz yere kırmasın diye zorunlu CI içinde canlı stream smoke testi yapılmaz.

## Cross-repo tetikleme

Ana depolara hiç dokunmamak için `repository_dispatch` veya upstream workflow eklenmez. Bu repo kendi schedule job'ı ile 6 saatte bir kaynak SHA'larını kontrol eder. Böylece WioSinema/WioSpor ana depolarında değişiklik yapılmaz.
