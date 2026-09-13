# Upstream senkron tasarımı

## İzlenen kaynaklar

- `Wiojelt/TurkSinema-Source@main` (private)
  - WioSinema `StreamAggregator.kt`
  - ClipBox adapter kaynağı
- `Wiojelt/WioSpor@main` (public; token gerekmez)
  - `WioChannels.kt`
  - `SourceAggregator.kt`
- `Wiojelt/TurkSpor-Source@main` (private; opsiyonel geliştirme kaynağı)
  - shared `SourceSpec.kt`
  - shared `SportsProvider.kt`
  - shared `PlayerParser.kt`

## Akış

`sync-upstreams.mjs` commit SHA'larını `generated/upstream-state.json` ile karşılaştırır. SHA değişmişse ilgili kaynak dosyalarını GitHub Contents API üzerinden `.upstream-cache` içine alır. Private token yoksa private kaynaklar atlanır; public WioSpor senkronu yine çalışır.

`generate-*` scriptleri cache snapshot'larından dağıtım dosyalarını üretir. Adapter'lar kritik kod şekillerini marker kontrolleriyle doğrular. ClipBox adapter'ı `/api/movie/`, `/api/tv/` ve token/expires akışının kaynakta hâlâ bulunduğunu doğrulamadan provider üretmez.

WioSpor generator'ı `WioChannel(...)` kayıtlarını JSON'a çevirir. Private TurkSpor kaynakları erişilebilirse `SourceSpec` ve resolver sözleşmesi de izlenir. PlayerParser'ın JS portu upstream test davranışıyla regresyon testlerine bağlanmıştır.

## Cross-repo tetikleme

Ana depolara hiç dokunmamak için `repository_dispatch` veya upstream workflow eklenmez. Bu repo kendi schedule job'ı ile kaynak SHA'larını periyodik kontrol eder. Böylece WioSinema/WioSpor ana depolarında değişiklik yapılmaz.
