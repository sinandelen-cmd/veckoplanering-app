# Enda innehållskällan: Grundplanering

Krav förtydligat av användaren: alla innehållsändringar ska ske i Grundplanering och speglas till kopplade klasser. Klasserna skiljer sig endast genom schema och momenttakt.

Den aktiva lärarvyn visar därför klassfördelningar skrivskyddat. ClassSchedules och StudentView använder sharedBaseContent=true vid beräkning, så tidigare sparade weeksData/overrides i klasser aldrig ersätter grundinnehållet. Dessa äldre data raderas inte. Den äldre rena redigeringshjälparen finns kvar för kompatibilitetstester men används inte av den aktiva klassvyn.

Denna ändring löser inte serverns tidigare dokumenterade fel med veckofiltrering före klassfördelning. Produktionspublicering ska invänta det separata serverflödet och verifiering av publiceringen.
