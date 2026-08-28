/*
 * SF Bay Area agency directory.
 *
 * Imported from the owner's own research document (154 agency records across
 * advertising, digital, marketing, PR, and production). Kept separate from
 * AGENCY_RADAR_PACK so provenance stays clear: that file is a small
 * hand-curated set with verified careers URLs, this one is the bulk directory.
 * Both are merged and de-duplicated by company name in AGENCY_PACK_GROUPS.
 *
 * Only records carrying a real URL are here. 28 directory rows had no reliable
 * website, and seeding a monitor with nothing to scan would fail on every run
 * and bury the useful summaries -- they are listed in DIRECTORY_WITHOUT_URL
 * instead, to be filled in by hand.
 *
 * No email addresses. A check across a spread of 21 of these agencies found
 * that none publish a careers or HR address -- hiring runs through ATS portals
 * and web forms. A field that is empty for all but a handful is worse than no
 * field, because "none exists" would be indistinguishable from "not checked".
 */

import type { AgencyPackEntry } from "./agency-radar-pack";


// Independent and network creative shops from the Bay Area directory.
export const DIRECTORY_ADVERTISING_PACK: readonly AgencyPackEntry[] = [
  { company: "Allied Integrated Marketing", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://alliedglobalmarketing.com/", focus: "Integrated marketing & media — Independent/multicity" },
  { company: "Baunfire", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://baunfire.com/", focus: "Branding & web — Independent/local" },
  { company: "BayCreative", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.baycreative.com/", focus: "Marketing & branding — Independent/local" },
  { company: "BBDO San Francisco", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.bbdo.com/offices/san-francisco", focus: "Advertising — Global/network" },
  { company: "Beyond", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.beyond.co/", focus: "Digital creative — Independent/multicity" },
  { company: "Born & Bred", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://bornandbredusa.com/", focus: "Branding — Independent/local" },
  { company: "BSTRO", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://bstro.com/", focus: "Brand strategy & digital — Independent/local" },
  { company: "Butler Shine Stern & Partners", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.bssp.com/", focus: "Creative advertising — Independent/local" },
  { company: "Camp+King", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://campking.com/", focus: "Advertising — Independent/local" },
  { company: "Chapter SF", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "http://www.chaptersf.com/", focus: "Creative — Independent/local" },
  { company: "Cog1", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://cog1.com/", focus: "Brand strategy — Independent/local" },
  { company: "Creative:MINT", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://creative-mint.com/", focus: "Creative — Independent/local" },
  { company: "Cutwater", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.cutwater.com/", focus: "Branding & advertising — Independent/local" },
  { company: "Dentsu Creative", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.dentsucreative.com/", focus: "Integrated creative — Global/network" },
  { company: "Designity", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.designity.com/", focus: "Creative services — Independent" },
  { company: "Division of Labor", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://divisionoflabor.com/", focus: "Creative advertising — Independent/local" },
  { company: "Eleven, Inc.", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://eleveninc.com/", focus: "Creative advertising — Independent/local" },
  { company: "FCB", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.fcb.com/", focus: "Advertising — Global/network" },
  { company: "Gershoni", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://gershoni.com/", focus: "Branding & strategy — Independent/local" },
  { company: "Grey Group", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.grey.com/", focus: "Advertising — Global/network" },
  { company: "Gumas", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://gumas.com/", focus: "Marketing & creative — Independent/local" },
  { company: "Heat", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://heat-sf.com/", focus: "Advertising — Independent/local; historic URL" },
  { company: "Ignite X", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://ignitexagency.com/", focus: "Digital campaigns — Independent/local" },
  { company: "Leo Burnett", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.leoburnett.com/", focus: "Advertising — Global/network" },
  { company: "Merkle", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.merkle.com/", focus: "Customer experience — Global/network" },
  { company: "Mortar", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.mortaragency.com/", focus: "Creative & advertising — Independent/local" },
  { company: "Mucho", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.mucho.cc/", focus: "Branding — Independent/multicity" },
  { company: "Pereira & O’Dell", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.pereiraodell.com/", focus: "Creative advertising — Independent/local" },
  { company: "ResponseMill", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://responsemill.com/", focus: "Advertising — Independent/local" },
  { company: "RNO1", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://rno1.com/", focus: "Branding & digital — Independent/local" },
  { company: "Synapbox", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.synapbox.com/", focus: "Creative insights — Independent/local" },
  { company: "TBWA", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://tbwa.com/", focus: "Advertising — Global/network" },
  { company: "Theory SF", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://theorysf.com/", focus: "Creative advertising — Independent/local" },
  { company: "Twenty First Century Brands", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "http://www.twentyfirstcenturybrands.com/", focus: "Branding — Independent/local" },
  { company: "VML", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://www.vml.com/", focus: "Integrated creative & digital — Global/network" },
  { company: "Wunderdogs", kind: "Creative / Advertising Agency", careersUrl: "", websiteUrl: "https://wunderdogs.co/", focus: "Branding & digital — Independent/local" },
];

// Digital experience, product, and web builds from the directory.
export const DIRECTORY_DIGITAL_PACK: readonly AgencyPackEntry[] = [
  { company: "Blacksmith Agency", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://blacksmith.agency/", focus: "Web & brand — Independent/multicity" },
  { company: "Clear Digital", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.cleardigital.com/", focus: "Digital experience — Independent/local" },
  { company: "Eveo", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://eveo.com/", focus: "Brand & digital — Independent/local" },
  { company: "Extractable", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://extractable.com/", focus: "UX & digital strategy — Independent/local" },
  { company: "Fantasy", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://fantasy.co/", focus: "Design & innovation — Independent/multicity" },
  { company: "Firstborn", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.firstborn.com/", focus: "Digital experience — Independent/multicity" },
  { company: "Hero Digital", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.herodigital.com/", focus: "Customer experience — Independent/multicity" },
  { company: "Kindred SF", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://kindredsf.com/", focus: "Design — Independent/local" },
  { company: "Retina", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://retinastudio.com/", focus: "Design — Independent/local" },
  { company: "TechInSF Consulting", kind: "Marketing Agency", careersUrl: "", websiteUrl: "http://techinsf.com/", focus: "Web, SEO & digital — Independent/local" },
  { company: "Wire Stone", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.wirestone.com/", focus: "Digital strategy & CX — Independent/multicity" },
];

// Performance, growth, media, and demand-generation firms.
export const DIRECTORY_MARKETING_PACK: readonly AgencyPackEntry[] = [
  { company: "Artsy Geek", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://artsygeek.com/", focus: "Digital marketing — Independent/local" },
  { company: "CAYK Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://caykmarketing.com/", focus: "Marketing — Independent" },
  { company: "CRM Switch", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://crmswitch.com/", focus: "CRM & marketing — Independent" },
  { company: "Crowd Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://crowdmarketing.com/", focus: "Digital marketing — Independent/local" },
  { company: "Cyrusson", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://cyrusson.com/", focus: "SEO & digital — Independent/local" },
  { company: "Directive", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://directiveconsulting.com/", focus: "B2B performance — Independent/multicity" },
  { company: "Disruptive Advertising", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://disruptiveadvertising.com/", focus: "PPC & CRO — Independent" },
  { company: "Dubasik Digital Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.dubasikmarketing.com/", focus: "SEO & digital — Independent/local" },
  { company: "E29 Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://e29marketing.com/", focus: "Marketing — Independent/local" },
  { company: "Evolve Media", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://evolvemedia.net/", focus: "Digital & content — Independent/local" },
  { company: "Firewood", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://firewoodmarketing.com/", focus: "Digital marketing — Global/network" },
  { company: "Gravity Global", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.gravityglobal.com/", focus: "B2B marketing — Global/network" },
  { company: "GrowthExpertz", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://growthexpertz.com/", focus: "Growth marketing — Independent/local" },
  { company: "GrowthHackers", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://growthhackers.com/", focus: "Growth marketing — Independent" },
  { company: "Honeycomb", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://honeycomb.agency/", focus: "Digital marketing — Independent/local" },
  { company: "Hotspex Media", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.hotspexmedia.com/", focus: "Media & digital — Independent" },
  { company: "Ignite Digital", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://ignitedigital.com/", focus: "SEO & digital — Independent" },
  { company: "Illuminator", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://illuminatoragency.com/", focus: "Digital strategy — Independent/local" },
  { company: "IPG Mediabrands", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.ipgmediabrands.com/", focus: "Media — Global/network" },
  { company: "Jives Media", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.jivesmedia.com/", focus: "Digital marketing — Independent/local" },
  { company: "KlientBoost", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.klientboost.com/", focus: "Performance marketing — Independent" },
  { company: "Liatrio", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://liatr.io/", focus: "Digital consultancy — Independent" },
  { company: "Metric Theory", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://metrictheory.com/", focus: "Performance marketing — Independent/multicity" },
  { company: "Mindshare", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.mindshareworld.com/", focus: "Media — Global/network" },
  { company: "Moburst", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.moburst.com/", focus: "Growth marketing — Independent/multicity" },
  { company: "Muchisimo", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://gomuchisimo.com/", focus: "Multicultural marketing — Independent" },
  { company: "NoGood", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://nogood.io/", focus: "Growth marketing — Independent/multicity" },
  { company: "NP Digital", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://npdigital.com/", focus: "Performance marketing — Independent/multicity" },
  { company: "OMD", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.omd.com/", focus: "Media — Global/network" },
  { company: "Publicis Groupe", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.publicisgroupe.com/", focus: "Marketing network — Global/network" },
  { company: "RSO Consulting", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://rsoconsulting.com/", focus: "Performance marketing — Independent/local" },
  { company: "Ryzeo", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://ryzeo.com/", focus: "Digital marketing — Independent/local" },
  { company: "Search Nurture", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://searchnurture.com/", focus: "SEO & analytics — Independent/local" },
  { company: "Secret Sushi", kind: "Marketing Agency", careersUrl: "", websiteUrl: "http://secretsushiinc.com/", focus: "B2B digital marketing — Independent/local" },
  { company: "SevenAtoms", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.sevenatoms.com/", focus: "Performance marketing — Independent/local" },
  { company: "ShyftUp", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://shyftup.com/", focus: "Digital marketing — Independent/local" },
  { company: "Siege Media", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.siegemedia.com/", focus: "SEO & content — Independent" },
  { company: "Single Grain", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.singlegrain.com/", focus: "Growth marketing — Independent" },
  { company: "SmartBug Media", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.smartbugmedia.com/", focus: "Inbound marketing — Independent" },
  { company: "Stackmatix", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://stackmatix.com/", focus: "Growth & PPC — Independent/local" },
  { company: "Starcom", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.starcomww.com/", focus: "Media — Global/network" },
  { company: "Sum Digital", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.sumdigital.com/", focus: "Digital marketing — Independent/local" },
  { company: "Thrive Internet Marketing Agency", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://thriveagency.com/", focus: "Digital marketing — Independent" },
  { company: "Top Growth Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.topgrowthmarketing.com/", focus: "Growth marketing — Independent/local" },
  { company: "Tuff", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://tuffgrowth.com/", focus: "Growth marketing — Independent" },
  { company: "Two Trees PPC", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://twotreesppc.com/", focus: "PPC — Independent/local" },
  { company: "Upgrow", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://upgrow.io/", focus: "Growth marketing — Independent/local" },
  { company: "Verbsz Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://verbszmarketing.com/", focus: "SEO & PPC — Independent/local" },
  { company: "Victorious", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://victoriousseo.com/", focus: "SEO — Independent/local" },
  { company: "Vonnda", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://vonnda.com/", focus: "Digital & social — Independent/local" },
  { company: "WebFX", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.webfx.com/", focus: "Digital marketing — Independent" },
];

// PR, communications, and content-marketing firms.
export const DIRECTORY_PR_PACK: readonly AgencyPackEntry[] = [
  { company: "Animalz", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.animalz.co/", focus: "Content marketing — Independent" },
  { company: "BarrettSF", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://barrettsf.com/", focus: "Branding & communications — Independent/local" },
  { company: "bread & Butter PR & Marketing", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.wearebreadandbutter.com/", focus: "PR — Independent/multicity" },
  { company: "Column Five", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.columnfivemedia.com/", focus: "Content marketing — Independent" },
  { company: "Havas", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.havasgroup.com/", focus: "Integrated communications — Global/network" },
  { company: "Landis Communications", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.landispr.com/", focus: "PR & communications — Independent/local" },
  { company: "PRxDigital", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://prxdigital.com/", focus: "Digital PR — Independent/local" },
  { company: "SmallGiants", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.smallgiants.com/", focus: "PR & branding — Independent" },
  { company: "Tendo Communications", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://tendocom.com/", focus: "Content marketing — Independent/local" },
  { company: "Walker Sands", kind: "Marketing Agency", careersUrl: "", websiteUrl: "https://www.walkersands.com/", focus: "B2B marketing & PR — Independent/multicity" },
];

// Content, film, and experiential production companies.
export const DIRECTORY_PRODUCTION_PACK: readonly AgencyPackEntry[] = [
  { company: "Ameredia", kind: "Production Company", careersUrl: "", websiteUrl: "https://www.ameredia.net/", focus: "Multicultural marketing & production — Independent/local" },
  { company: "B-Reel", kind: "Production Company", careersUrl: "", websiteUrl: "https://www.b-reel.com/", focus: "Creative production — Independent/multicity" },
  { company: "Bonfire Labs", kind: "Production Company", careersUrl: "", websiteUrl: "https://bonfirelabs.com/", focus: "Creative production — Independent/local" },
];

// Directory rows with no reliable website in the source document. Add a URL
// to move one into a pack above; without one there is nothing to scan.
export const DIRECTORY_WITHOUT_URL: readonly string[] = [
  "Actuate Media",
  "Antenna Group",
  "Baker Street Advertising",
  "Bell Curve",
  "BOCA Communications",
  "Brainchild Creative",
  "Clarity Public Relations",
  "Colibri Digital Marketing",
  "Dynamo PR",
  "Fenton",
  "Funnel Boost Media",
  "Gauger + Associates",
  "Hatch Design",
  "Ideal Visibility",
  "Inkhouse",
  "Katz & Associates",
  "Offleash PR",
  "PageTraffic",
  "PAN Communications",
  "Piedmont Avenue Consulting",
  "San Francisco Online",
  "SDLC Corp",
  "Searchbloom",
  "SmartSites",
  "Swirl",
  "Teak",
  "Wise Public Relations",
  "XTRA BOLD",
];
