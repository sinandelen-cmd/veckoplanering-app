# Minimal SQL-rättning – endast för granskning

Ändra EN rad i CTE eligible i public.get_public_annual_plan. Kör inte mot produktion utan separat godkännande.

## Före
```sql
and (not ((w.week->>'hideDate') ~ '^\d{4}-\d{2}-\d{2}$') or (w.week->>'hideDate')::date > s.today)
```

## Efter
```sql
and (not coalesce((w.week->>'hideDate') ~ '^\d{4}-\d{2}-\d{2}$', false) or (w.week->>'hideDate')::date > s.today)
```

## Oförändrade regler
- Publicerad planering, korrekt public_slug och published_content.
- Validering av weekStart och dold vecka.
- autoReleaseWeeks, publishDate, visibleWeekCount och max 12.
- schoolClosures filtreras som tidigare.
- Datumregex, SECURITY DEFINER och behörigheter ändras inte.

## Testläge
22 syntetiska SQL-testfall körda och godkända. GitHub Actions kör dem dessutom mot en isolerad PostgreSQL 16-service, utan produktionsanslutning. Godkänd körning: https://github.com/sinandelen-cmd/veckoplanering-app/actions/runs/40083359299.
Skrivskyddad jämförelse: 20 veckor nuvarande, 60 veckor efter korrigering, varav 40 saknar hideDate.
Ingen produktionsändring har gjorts.

## Separat godkännande före driftsättning

1. Granska exakt en ändrad rad i den verkliga funktionsdefinitionen. Kontrollera att övriga SQL-villkor, behörigheter och RLS inte ändras.
2. Säkerställ att driftsättningsskriptet bygger på aktuell funktionsdefinition och att återställning till tidigare definition är förberedd.
3. Kör SQL-regressionerna och kontrollera att opublicerade, dolda och framtida veckor förblir skyddade.
4. Begär ett uttryckligt, separat godkännande innan någon produktionsfunktion ändras.
5. Efter ett eventuellt godkännande: verifiera RPC-svar och åtkomst i elevvyn, utan att röja privata planeringar.

**Beslutsläge:** Ej godkänd för driftsättning. Detta dokument är ett underlag, inte ett driftsättningsbeslut.
