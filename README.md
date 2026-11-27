# Pomiar odcinkowy

Aplikacja PWA: https://art3pl-user.github.io/odcinkowy/

## Wspólna baza odcinków

| Plik | Zawartość |
|---|---|
| `data/odcinki-osm.json` | dane z OpenStreetMap, tworzone skryptem (nie edytować ręcznie) |
| `data/odcinki-wlasne.json` | wpisy dodane przez użytkowników |

### Jak dodać odcinek

1. **Z aplikacji:** zakładka *Baza odcinków* → zapisz początek i koniec w czasie jazdy (pasażer) →
   *Wyślij do wspólnej bazy*. Powstanie zgłoszenie (Issue) w tym repozytorium.
2. **Bezpośrednio:** edytuj `data/odcinki-wlasne.json` na GitHubie i wyślij Pull Request.
3. **W OpenStreetMap:** dodaj relację `type=enforcement`, `enforcement=average_speed`.

Przykład wpisu (jeden kierunek jazdy):

```json
{
  "sections": [
    {
      "id": "user-unikalny-napis",
      "name": "Nazwa drogi i kierunek",
      "limit": 90,
      "start": { "lat": 52.000000, "lon": 21.000000, "heading": 0 },
      "end": { "lat": 52.030000, "lon": 21.000000, "heading": 0 }
    }
  ]
}
```

`heading` to kierunek jazdy w stopniach (0 = północ, 90 = wschód). `limit`, `heading` i `lengthM` są opcjonalne.

### Dla opiekuna bazy

- Przyjęcie zgłoszenia: wklej obiekt z Issue do tablicy `sections` w `data/odcinki-wlasne.json`.
- Sprawdzenie plików: `node tools/check_data.js`
- Aktualizacja z OpenStreetMap: `python3 tools/update_osm.py`
- Po zmianach: commit i push. Aplikacja pobierze nową bazę przy następnym uruchomieniu z internetem.

## Licencje

Dane o odcinkach z OpenStreetMap: © autorzy OpenStreetMap, [ODbL](https://opendatacommons.org/licenses/odbl/).
Mapa: [Leaflet](vendor/leaflet/LICENSE) i kafelki OpenStreetMap.
