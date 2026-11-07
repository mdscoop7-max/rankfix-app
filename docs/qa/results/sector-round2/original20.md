# Onderzoek van de oorspronkelijke 20 afwijkingen

Alle 20 hebben voldoende concrete eigen-activiteitsinformatie in de metadata.
De ontbrekende regels zijn aangevuld; de feitelijke metadata en uitspraken per URL
staan volledig in diagnosis-before.json. Er is geen ontbrekend paginabewijs verzonnen.

| Geval / taal | Verwacht | Voorheen | Oorzaak | Daarna |
| --- | --- | --- | --- | --- |
| holdout-002.test / en | service_marketplace | unknown (0) | Verkopersplatform ontbrak; alleen vakdienstenplatform herkend | service_marketplace |
| holdout-010.test / en | transport_travel | unknown (0) | Eigen reisbureau-activiteit ontbrak | transport_travel |
| holdout-011.test / fr | beauty | unknown (0) | Frans salon de beauté ontbrak | beauty |
| holdout-014.test / en | saas_b2b | unknown (0) | Generieke SaaS-activiteit ontbrak | saas_b2b |
| holdout-028.test / en | events_culture | unknown (0) | Evenementenorganisator ontbrak | events_culture |
| holdout-033.test / nl | general_business | unknown (0) | Groothandel ontbrak als eigen identiteit | general_business |
| holdout-035.test / nl | hospitality | unknown (0) | Maaltijdbezorging ontbrak als eigen activiteit | hospitality |
| holdout-038.test / en | saas_b2b | unknown (0) | Softwareapplicatie ontbrak | saas_b2b |
| holdout-040.test / nl | professional_services | unknown (0) | Fotograaf ontbrak | professional_services |
| holdout-041.test / fr | health_wellness | unknown (0) | Frans clinique médicale ontbrak | health_wellness |
| holdout-044.test / nl | education | unknown (0) | Kinderopvang ontbrak | education |
| holdout-045.test / en | health_wellness | unknown (0) | Ouderenzorg/verpleeghuis ontbrak | health_wellness |
| holdout-048.test / nl | transport_travel | unknown (0) | Parkeerexploitatie ontbrak | transport_travel |
| holdout-051.test / fr | hospitality | unknown (0) | Vakantieverhuur ontbrak | hospitality |
| holdout-053.test / de | hospitality | unknown (0) | Camping als eigen activiteit ontbrak | hospitality |
| holdout-054.test / en | professional_services | unknown (0) | Coworking ontbrak | professional_services |
| holdout-061.test / en | maritime_ports | government (84) | Specifieke havenexploitant werd door algemene overheid geblokkeerd | maritime_ports |
| holdout-063.test / nl | agriculture_horticulture | unknown (0) | Nederlandse samenstelling tuinbouwbedrijf ontbrak | agriculture_horticulture |
| holdout-064.test / de | professional_services | unknown (0) | Duits architekturbüro en context ontbraken | professional_services |
| holdout-068.test / en | manufacturing_industrial | unknown (0) | Generieke fabrikant met productiecontext ontbrak | manufacturing_industrial |

De resultaten horen bij de bijgestuurde ontwikkelset, niet bij een onafhankelijke
beoordeling. Schaarse of conflicterende informatie wordt apart getest in de nieuwe
bevroren set; de daar gevonden fouten worden gerapporteerd zonder verdere tuning.
