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
22 syntetiska SQL-testfall körda skrivskyddat och godkända. GitHub CI kontrollerar testfilernas struktur och antal, men kör INTE SQL-fallen mot PostgreSQL.
Skrivskyddad jämförelse: 20 veckor nuvarande, 60 veckor efter korrigering, varav 40 saknar hideDate.
Ingen produktionsändring har gjorts.
