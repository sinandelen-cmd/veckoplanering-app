# Publiceringsrapport – Min planering

Status: **Inte redo för publicering ännu.** Lokala tester gröna för de områden som listas nedan. Publicering kräver ditt uttryckliga godkännande. Ingen push, ingen merge, ingen produktionsmigrering och ingen publicering är gjord i denna omgång.

Branch: feature/server-subjects. Senaste lokala commits: 51b4577 (startvecka i import), f0f0d9c (begreppsval i import), 7f92e67 (hela planeringen som klassutskrift).

## Verifierat lokalt (Chrome mot lokal Supabase, testdata)

| Område | Resultat |
|---|---|
| Import txt, docx, pdf, xlsx | Avbryt ändrar inget. Godkänn sparar. Innehåll sparas från filen. |
| Import utan veckonummer | Startvecka väljs i förhandsgranskningen. Veckor före startveckan behålls. |
| Begrepp i import | Tydlig koppling används. Oklar koppling visas med val av moment. Ingen gissning till sista momentet. |
| Behörighet mellan lärare (REST) | 10/10 |
| Konflikt mellan två sessioner | Konfliktpanel visas. Ingen tyst överskrivning. Egen version kan sparas efter val. Version i historiken bevaras. |
| Versionshistorik och återställning | 7/7 |
| Ångra, kopiera vecka och lektion | Grön |
| Sökning i egna planeringar | Grön |
| Arkivera, återställa | 6/6 |
| Permanent radering från arkiv | Fel bekräftelsetext raderar inget. Rätt titel tar bort raden i databasen. |
| Grundplanering, tre veckor sida vid sida | 8/8 |
| Klassutskrift, synliga veckor (liggande A4) | 1 sida (test). |
| Klassutskrift, hela planeringen (liggande A4) | 12 veckorubriker på 4 sidor. |
| Elevvy, utskrift | Sidstorlek stående A4 (594 × 842 pt). |
| Word-export (klass) | Fil skapas. Strukturkontroll gjord tidigare. |
| Kompakta fält | Fältet växer till 8,5 em och scrollar därefter. Testets förväntan på växande fält passar inte designen. |
| npm run check | Grön |

## Inte verifierat eller kvar

- Word-filen har inte öppnats i Microsoft Word eller annat program. Ingen sådan app finns här.
- autosave-test kräver server på port 4201 som inte kördes.
- Prestanda och belastning är inte mätta.
- Lektionsnivå-ångra och Klassvy-konflikt har inte testats separat.
- Bekräftelse av Netlify- och Workers-förhandsbyggen som stoppade är inte verifierad från denna miljö.
- Andra steget i raderingstest (avbryt andra bekräftelsen) är inte testat.
- Den bifogade säkerhetsnoteringen om hårdkodat admin-id i en produktionspolicy är oförändrad.

## Testdata som påverkades lokalt

- En lokal testrad (Matematik – Importtest mwdbrpow) skrevs över av ett felaktigt godkännande i testet. Det är lokal data, inte produktion.
- Tre arkiverade testkurser (Raderatest, lokalt) ligger kvar i det lokala testkontot.
- Testplanen Mitt kursnamn 7A publicerades lokalt för elevvy-test och avpubliceras igen.

## Krav innan publicering

1. Ditt godkännande av denna rapport.
2. Bekräftelse att Netlify-förhandsbyggen och Workers-förhandsbyggen är stoppade för repot.
3. Öppning av Word-exporten i Word eller motsvarande program.

## Tillägg: körningar efter första rapporten

- Autosave-vakt (autosave-guard): innehåll sparas, publiceringsflaggan är oförändrad, status visar "Sparat". Grön.
- Prestanda (lokal Chrome, 12 veckor, testdata): öppna plan till första fält ca 356 ms. Cirka 2 600 DOM-noder. Cirka 25 MB JS-heap. Inte belastningstest.
- Klassvy-konflikt och lektionsnivå-ångra: inte körda i denna omgång.
