# Gemensam datorlayout på alla skärmar

Kalender, lärarvy och elevvy använder samma layoutbredd i mobila webbläsare: 1280 CSS-pixlar. Viewport-taggen anger bara width=1280. Webbläsaren får själv passa hela layouten till skärmen; nypzoom är fortsatt tillåten. Det gör att mobilens bredd inte aktiverar separata mediaregler som staplar om kolumner.

Detta ersätter tidigare önskemål om en separat responsiv mobilvy. Text och knappar blir proportionellt mindre. Samma dokument och funktioner används; ingen skärmbild eller skrivskyddad kopia ersätter lärarvyn.

Vanliga desktop-iframes emulerar inte mobilens hantering av viewport-taggen. Tidigare 320/390/768-tester av ombruten layout verifierar därför inte denna skalning. Kontroll på en riktig mobilwebbläsare krävs före påstående om fullständig mobilverifiering. Ingen låsning av user-scalable eller maximum-scale har införts.
