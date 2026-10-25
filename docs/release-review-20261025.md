# Granskning av Årsplanering 2026-10-25

Status: testgren, inte produktionspublicerad. PR #7 ska förbli Draft.

## Förberett i kod
- Klassvis momentkö med separata redigeringar och bibehållna resurser.
- Fem lektioner med ett tomt moment vardera i nya grundplaneringar.
- Gemensamt plus för en ny rad Sida/Uppgift, diskreta redigeringskontroller.
- Infogad vecka med fem lektioner, initialt dold för elever; datum flyttas bara vid kollision.
- Lärarens aktuella/kommande veckor före tidigare veckor, grupperade per kapitel.
- Tidigare veckor i separata kapitelmenyer; lärarens fäll ut/fäll ihop påverkar inte publicering.
- Stabil kapitelfärg och enskild öppning/stängning av veckor.
- Elevvyn sorterar nyast först. Automatiskt läge använder ett kalenderfönster (normalt aktuell och föregående vecka), med svenska datum och gränsen måndag 00.01.
- Öppna elevsidor hämtar uppdaterat publicerat innehåll vid minutskiften och när fliken återaktiveras.
- Ångra/gör om är avgränsat per användare/planering och ignorerar automatisk sparmetadata.

## Kvarstående serverkrav – får inte kringgås i webbläsaren
Den befintliga Supabase-funktionen get_public_annual_plan väljer källveckor innan klassernas moment fördelas. Den begränsar till senaste antal tillgängliga veckor, inte ett kalenderfönster, och hanterar inte klasspecifik takt eller extra fästa veckor fullständigt. Att enbart ändra visningen räcker därför inte.

Säker lösning behöver publicerade klassveckor beräknade från hela momentkön och serverfiltrering av varje klass enligt svensk tid. Inga framtida/dolda data ska exponeras för att kringgå serverfiltreringen. Serverns förmåga ska verifieras innan automatisk klasspublicering tillåts.

Testgrenen kontrollerar supports_class_week_release före automatisk klasspublicering. Eftersom det stödet saknas sparas ändringar som utkast, medan befintlig publicerad version lämnas oförändrad. Publicering från listan stoppas också. Ingen funktion eller tabell har ändrats i produktion.

## Återstående verifiering
- Fullständigt serverflöde för automatisk klasspublicering kräver separat godkänd serverrättning.
- Ny layout behöver granskas i webbläsaren.
- Mobilkontroll av hela arbetsflödet återstår.
- Separat uttryckligt godkännande krävs före ny produktionspublicering.
