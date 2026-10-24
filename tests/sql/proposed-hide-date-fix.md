# Förslag: hantera saknat hideDate i elevvyn

Endast för granskning. Ingen produktionsändring är gjord.

I funktionen public.get_public_annual_plan är datumregexen redan korrekt.
Det som behöver ändras är NULL-hanteringen av hideDate.

Nuvarande villkor (förkortat):

```sql
NOT (week->>'hideDate' ~ date_pattern)
OR (week->>'hideDate')::date > today
```

Föreslaget villkor:

```sql
NOT coalesce((week->>'hideDate') ~ date_pattern, false)
OR (week->>'hideDate')::date > today
```

Här står week för samma JSON-veckoobjekt och date_pattern för det befintliga, korrekta datumuttrycket. Byt enbart NULL-hanteringen i befintlig funktion, behåll övriga åtkomst- och publiceringsvillkor. Testa med tests/sql/automatic-week-release-regression.sql innan någon separat godkänd produktionsändring.
