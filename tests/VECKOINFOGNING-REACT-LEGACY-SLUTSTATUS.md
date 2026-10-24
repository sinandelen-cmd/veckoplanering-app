# Fjärdubbel arbetsgrupp: isolerad React-integration och legacy-kollisioner

Datum: 2026-10-24. Feature-gren och draft PR #5. Ingen produktion, publicering eller merge.

## Genomförda moment

1. Kontrollerat GitHub Actions för föregående snapshot-rättning.
2. Bekräftat att `88256e9` och `abf250e` har gröna CI-körningar.
3. Granskat beroenden och konstaterat att Playwright/webbläsartestmiljö inte är installerad i projektet.
4. Granskat GitHub Actions verifieringsjobb och separat PostgreSQL 16-testjobb.
5. Granskat verklig `buildClassSchedule` och override-remappning.
6. Identifierat kollision mellan föräldralöst numeriskt legacy-index och nytt korrekt index.
7. Infört tvåstegsremappning där giltiga matchningar prioriteras.
8. Bevarat kolliderande äldre värde under `legacy-unmapped:<index>` utan att visa det som lektion.
9. Bevarat icke-kolliderande äldre index i originalformat.
10. Lagt till test för kolliderande äldre index.
11. Lagt till test för icke-kolliderande föräldralöst index.
12. Verifierat grön CI för remappningsrättningen `c2ac590`.
13. Verifierat grön CI för nya kollisionsregressioner `12d3949`.
14. Skapat ett React SSR-integrationstest med Vites faktiska JSX-transformering och `react-dom/server`.
15. Testat att faktisk klasskomponent kan rendera en klassanpassning efter infogning.
16. Testat att två klassers scheman förblir oberoende i samma React-integration.
17. Kopplat React SSR-testet till `npm run check` och GitHub Actions.
18. Kontrollerat att ingen ny databas-/produktionsmigrering behövs.
19. Dokumenterat testgränser och återstående blockerare.
20. Bevarat draft PR utan merge/publicering.

## Verifierat och inte verifierat

- GitHub Actions: tidigare snapshot- och kollisionstester är gröna. Kontrollera separat slutstatus för den nya React SSR-körningen.
- React SSR-testet använder faktisk komponentkod och Vite, inte en webbläsare med klick och händelser.
- Publiceringssnapshot-testet använder verklig `sanitizeForStudents` och kontrollerar kopior av nästlade objekt, men anropar inte Supabase.
- Ångra/gör om har kodvägsbaserade tester, inte React-state-livscykel eller browser-automation.
- Äldre felaktiga index bevaras för att undvika databortfall. Nycklar under `legacy-unmapped:` kräver ett framtida UI-/produktbeslut om manuell återkoppling.
- Fullt godkännande kräver isolerad webbläsar- och publiceringsintegration samt slutligt godkännande; ingen produktionsåtkomst har använts.

## Status

7/8 delar (87,5 %) på kvalitetssäkringsplanen. En sista del återstår: fullständig webbläsar-/Supabase-integration och release-godkännande. Bedömning: minst en större arbetsgrupp, eventuellt fler om en testmiljö måste etableras eller nya fel hittas.
