// Own-activity declarations for catalog branches missing from the legacy motor.
// No domains, countries or brands: words describe the business, not its audience.
// Every rule additionally requires a named activity in title/H1 AND supporting
// activity in the description. A keyword, schema type or booking button alone
// cannot identify the business. Homepage-only decisions remain probable.
const terms = expressions => new RegExp(`(?<![\\p{L}])(?:${expressions.join('|')})(?![\\p{L}])`, 'iu');
/** @returns {[string,string,string,RegExp,RegExp,string[],boolean]} */
const rule = (sector,key,label,names,activities) => [sector,key,label,terms(names),terms(activities),[],true];
export const CATALOG_PRIMARY_DECLARATIONS = [
 rule('service_marketplace','marketplace','Marktplaats voor onafhankelijke verkopers',
  ['(?:online )?marketplace','market for (?:independent )?sellers','marktplaats','marktplatz','place de marché','mercato online','mercado digital','platforma handlowa'],
  ['independent sellers?','merchants?','sellers? and buyers?','onafhankelijke verkopers','verkopers? en kopers?','händler','vendeurs?','venditori','vendedores','sprzedawc\\p{L}*']),
 rule('transport_travel','travel','Reisbureau & reisorganisatie',
  ['travel agenc(?:y|ies)','tour operator','reisbureau','reisorganisatie','reisebüro','reiseveranstalter','agence de voyages?','agenzia (?:di )?viaggi','agencia de viajes','agência de viagens','biuro podróży'],
  ['holidays?','package tours?','itinerar\\p{L}*','reizen','rondreizen','vakantie\\p{L}*','reisen','urlaub','voyages?','séjours?','viaggi','viajes','viagens','wyciecz\\p{L}*']),
 rule('saas_b2b','saas_b2b','Software & SaaS',
  ['saas','software','logiciel\\p{L}*','oprogramowanie'],
  ['workflow\\p{L}*','subscription\\p{L}*','cloud','licen[cs]\\p{L}*','integrat\\p{L}*','abonnement\\p{L}*','automatis\\p{L}*','automatiz\\p{L}*','automatyz\\p{L}*','arbeitsabläufe','dashboard\\p{L}*']),
 rule('saas_b2b','software_app','Softwareapplicatie',
  ['software application','(?:mobile|editing|document|productivity) app(?:lication)?','applicatie','logiciel','application mobile','applicazione','aplicación','aplicativo','aplikacja'],
  ['download\\p{L}*','subscription\\p{L}*','synchron\\p{L}*','devices?','install\\p{L}*','abonnement\\p{L}*','télécharg\\p{L}*','descarg\\p{L}*','scaric\\p{L}*','licen[cs]\\p{L}*']),
 rule('events_culture','events','Evenementenorganisatie',
  ['event organi[sz]er','conference organi[sz]er','evenementen(?:bureau|organisator|organisatie)','veranstaltungsagentur','eventagentur','organisateur d.événements','organizzatore di eventi','organizador de eventos'],
  ['conferences?','exhibitions?','congress\\p{L}*','congres\\p{L}*','conferenc\\p{L}*','evenement\\p{L}*','veranstaltung\\p{L}*','salons? professionnels','eventi','eventos']),
 rule('general_business','wholesale','Groothandel & distributie',
  ['groothandel','wholesal(?:e|er)','großhandel','grosshandel','grossiste','grossista','mayorista','atacadista','hurtownia'],
  ['business customers','businesses','resellers?','zakelijk\\p{L}*','installateurs?','wederverkopers?','distribut\\p{L}*','gewerb\\p{L}*','professionnels?','rivenditor\\p{L}*','empresas','revendedor\\p{L}*','przedsiębior\\p{L}*']),
 rule('hospitality','food_delivery','Maaltijdbezorging',
  ['meal delivery','food delivery (?:company|service)','maaltijd(?:service|bezorg\\p{L}*)','maaltijdenservice','essenslieferdienst','repas à domicile','consegna pasti','entrega de (?:comida|refeições)','bezorgdienst'],
  ['meals?','food','maaltijd\\p{L}*','weekmenu','avondeten','essen','gerichte','repas','pasti','comida','refeições','menu']),
 rule('professional_services','photography','Fotografie',
  ['photograph(?:er|y studio)','fotograaf','fotograf(?:iebedrijf|iestudio|o|a|en)?','photographe','fotógraf[oa]'],
  ['portraits?','portret\\p{L}*','reportage\\p{L}*','portfolio','fotosessie','fotoshoot','fotografie','fotografía','fotografia','fotografieren']),
 rule('education','childcare','Kinderopvang',
  ['childcare','child care','day ?care','kinderopvang','kindertagesstätte','kita','crèche','asilo nido','guardería','creche','żłobek'],
  ['children','babies','toddlers','kinderen','baby','baby.s','peuter\\p{L}*','pedagog\\p{L}*','pädagog\\p{L}*','kinder','enfants','bambini','niños','crianças','dzieci']),
 rule('health_wellness','senior_care','Ouderenzorg & verpleging',
  ['nursing home','elderly care','senior care','ouderenzorg','verpleeghuis','woonzorgcentrum','pflegeheim','altenpflege','maison de retraite','ehpad','casa di riposo','residencia de mayores','lar de idosos','dom opieki'],
  ['nursing','residential','care','zorg','verpleging','ouderen','pflege','bewohner','soins','résidents','assistenza','anziani','cuidados','mayores','idosos','opieka']),
 rule('transport_travel','parking','Parkeerbeheer',
  ['parking (?:operator|company|facility)','park operator','parkeer(?:beheerder|bedrijf|beheer|exploitant)','parkhausbetreiber','betreiber von parkhäusern','exploitant de parkings','gestore di parcheggi','operador de aparcamientos'],
  ['parking','car parks?','parkeer\\p{L}*','parkplätze','parkhäuser','stationnement','parcheggi','aparcamientos']),
 rule('hospitality','holiday_rental','Vakantieverhuur',
  ['holiday rentals?','vacation rentals?','vakantieverhuur','vakantiehuizen','locations? de vacances','ferienhausvermietung','ferienwohnungen','case vacanza','alquiler vacacional','alojamento local'],
  ['stays?','holidays?','accommodat\\p{L}*','families','verblijf','vakantie','beschikbaarheid','séjour\\p{L}*','disponibilit\\p{L}*','réserv\\p{L}*','urlaub','übernacht\\p{L}*','soggiorno','estancia','estadia']),
 rule('hospitality','camping','Camping & kampeerterrein',
  ['campsite','campground','campingplatz','campingterrein','kampeerterrein','camping','campeggio','parque de campismo'],
  ['pitches','tents?','motorhomes?','caravans?','stellplätze','zelte','wohnmobile','kampeer\\p{L}*','tenten','emplacements?','tentes?','piazzole','tende','parcelas','tiendas','tendas']),
 rule('professional_services','coworking','Coworking & gedeelde werkruimte',
  ['co-?working','gedeelde (?:kantoren|werkruimtes)','bureaux partagés','uffici condivisi'],
  ['desks?','meeting rooms?','workspaces?','werkplekken','vergaderruimtes','schreibtisch\\p{L}*','arbeitsplätze','besprechungsräume','bureaux','salles de réunion','scrivanie','sale riunioni','escritorios','salas de reuniones']),
];
