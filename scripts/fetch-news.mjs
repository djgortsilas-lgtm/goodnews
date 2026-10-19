#!/usr/bin/env node
/**
 * Κατεβάζει RSS από ελληνικές + διεθνείς πηγές καλών νέων,
 * φιλτράρει, κατηγοριοποιεί, μεταφράζει στα ελληνικά και γράφει data/data.json
 * Zero dependencies — τρέχει με καθαρό Node.js ≥ 18
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "data.json");
const CACHE_PATH = join(ROOT, "data", "translation-cache.json");
const MAX_TOTAL = 150;
const TRANSLATE_DELAY_MS = 250;
const TRANSLATE_ATTEMPTS = 4;
const TRANSLATE_BACKOFF_MS = 1200;
const TRANSLATE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* ---------- πηγές ---------- */

const FEEDS = [
  // Διεθνή sites καλών νέων
  { name: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/", lang: "en", mode: "goodsite", max: 25 },
  { name: "Positive News", url: "https://www.positive.news/feed/", lang: "en", mode: "goodsite", max: 15 },
  { name: "Good Good Good", url: "https://www.goodgoodgood.co/feed/", lang: "en", mode: "goodsite", max: 20 },
  { name: "Reasons to be Cheerful", url: "https://reasonstobecheerful.world/feed/", lang: "en", mode: "goodsite", max: 15 },
  { name: "Nice News", url: "https://nicenews.com/feed/", lang: "en", mode: "goodsite", max: 15 },
  { name: "Happy Eco News", url: "https://www.happyeconews.com/feed/", lang: "en", mode: "goodsite", max: 15 },
  { name: "The Better India", url: "https://www.thebetterindia.com/feed/", lang: "en", mode: "goodsite", max: 20 },
  { name: "The Optimist Daily", url: "https://www.optimistdaily.com/feed/", lang: "en", mode: "goodsite", max: 15 },
  { name: "DailyGood", url: "https://www.dailygood.org/feed/", lang: "en", mode: "goodsite", max: 10 },
  { name: "Sunny Skyz", url: "https://feeds.feedburner.com/SunnySkyz", lang: "en", mode: "goodsite", max: 15 },
  { name: "Upworthy", url: "https://www.upworthy.com/feed", lang: "en", mode: "goodsite", max: 12 },
];

const SOURCE_DEFAULT_COUNTRY = {
  "The Better India": "IN",
  "Gazzetta": "GR",
  "in.gr": "GR",
  "ERT News": "GR",
  "Proto Thema": "GR",
  "Best News": "GR",
};

/* ---------- φιλτραρίσματα (αγγλικά) ---------- */

const NEGATIVE_TITLE = [
  /\bkilled?\b/i, /\bmurder/i, /\bshooting\b/i, /\bshootout\b/i, /\bdies?\b/i,
  /\bdeath\b/i, /\bdead\b/i, /\bwar\b/i, /\bmissile/i, /\bterror/i, /\brape\b/i,
  /\babuse\b/i, /\bassault\b/i, /\bgenocide\b/i, /\bplane crash\b/i,
  /\btrain crash\b/i, /\bmass shooting\b/i, /\boverdose\b/i, /\bsuicide\b/i,
  /\bmassacre\b/i, /\bexecuted?\b/i, /\bfuneral\b/i, /\bmourn/i, /\bgrief\b/i,
  /\bcasualt/i, /\binvasion\b/i, /\bbomb/i, /\bgunman\b/i, /\bstabbing\b/i,
  /\bhurricane kills\b/i, /\bearthquake kills\b/i, /\btsunami kills\b/i,
  /\bfatal\b/i, /\bmolest/i, /\bporn/i, /\bscandal\b/i, /\bcorruption\b/i,
];

const SKIP_TITLE = [
  /horoscope/i, /astrolog/i, /free will astrology/i, /\bpoll\b/i, /\bquiz\b/i,
  /subscribe/i, /newsletter/i, /^\s*video\s*:?/i, /^δελτίο ειδήσεων/i,
  /^live\b/i, /^live tv/i,
];

/* ---------- φιλτράρισματα (ελληνικά) ---------- */

const NEGATIVE_EL_TITLE = [
  /θανάτ|σκοτώθηκ|σκοτώνε|δολοφον|πυροβολ|μαχαίρω|τραγωδ|νεκρ|τραυματ|ένοπλ/,
  /βιασμ|βίαι|κακούργ|εγκληματ|σεισμ|πυρκαγιά|καταιγ|πλημμυρ|κακοκαιρ/,
  /αυτοκτον|ομηρ|τρομοκρατ|βομβ|σύγκρουσ|κλοπ|ναρκωτικ|διαφθορ|σκάνδαλ/,
  /ρατσισ|πόλεμ|πολέμ|επιθεσ|σφαγ|θύμ|τρομ|φυλακ|καταδίκ|ποινή|έφοδ/,
  /τροχαί|δυστύχημ|ατύχημ|πέθαν|πεθαίν|αρρώστ|επιδημ|κορωνοϊ|γρίπ/,
  /διαρρ|καταστροφ|ανατιναχ|χάος|πανικ|κινδυν|διαμαρτυρ|απεργ|μετανάστ/,
  /κρίση|προσφυγ|ανθρωπιστικ|ζημι|πληγέ|αγνοούμ|εξαφανίσ|ασθεν|ανεργ/,
  /ληστ|αρπαγ|εκβίασ|μήνυ εκβ|σφυρ|δαρ|αστυνομ|χτυπήθηκ|έπεσε από/,
  /ανήλικ|παιδεραστ|σεξουαλ|πορνο|διακιν|σύλληψ|συνελήφθ|έρευνα αστυν/,
  /ισόβια|δηλητηρ|καταδικ|φυλάκισ|κάθειρξ|ποινή φυλάκ|ένοχος|καταζητούμ|ψευδορκ|διώξ|μήνυμα|έφηβ στη φυλ|ανθρωποκτον|στοιχειώνει|καταστολ|πυροβολισμ|μαχαιρών|τσακών|συντρίβ|πτώση από|πνιγ|πνίγηκ|εγκατέλ|εγκλεισ|βασανισ|απάτη|εξαπάτη|αντιμετωπίζει κατηγορ|κατηγορείται/,
];

const POSITIVE_EL = [
  /επιτυχ|νίκη|νίκησε|κέρδισ|ρεκόρ|βραβευ|τρόπαι|ανακαλύφ|έρευν|επιστημ/,
  /εφεύρ|εφευρέ|γεννήθηκ|γεννιέται|θεραπεύ|γιατρ|νοσοκομείο|δωρ|φιλανθρωπ/,
  /εθελοντ|συλλογή|χορηγ|βοήθησ|βοήθησε|σώζ|απελευθερ|προστατεύ|αποκαταστ/,
  /φυτεύ|δάσος|καθαρισ|περιβάλλ|ανανεωσι|πράσιν|ηλιακ|ανακυκλ|βελτιώ|καλύτερ/,
  /θετικ|ελπιδ|φεστιβαλ|πολιτισμ|τέχν|μουσικ|θέατρ|κινηματογρ|μουσείο|εκθεσ/,
  /ολυμπι|πρωταθλ|γκολ|πρόκριση|ημιτελικ|τελικό|αήττητ|κύπελλο|ντέρμπι/,
  /ιστορικ|μνημ|εγκαίνι|λειτουργ|υπογραφ|συμφων|συνεργ|ιδρύ|καινοτομ/,
  /παιδ|εκπαιδευ|σπουδαστ|φοιτητ|βραβείο|μετάλλιο|πανεπιστημ|άριστ/,
  /διαστημ|αστρονομ|φυσικ|χημ|βιολ|αρχαιολογ|ευρημ|unesco|κληρονομ/,
  /γιορτ|εορτα|σύναψη|αγάπη|φιλία|ηρω|κοινότητα|μεταμόρφωση|αναγέννηση/,
];

const POSITIVE_GREEK_SPORTS = [
  /νίκη|νίκησε|κέρδισ|ρεκόρ|γκολ|τέρμα|πρόκριση|ημιτελικ|τελικ|αήττητ|κύπελλο|πρωταθλ|τρόπαι|μετάλλιο|χατ-τρικ|ντέρμπι|διπλό|νίκες| highlights/i,
];

/* ---------- κατηγορίες ---------- */

const CATEGORIES = [
  { key: "environment", label: "Περιβάλλον", emoji: "🌿",
    words: ["environment", "climate", "conservation", "wildlife", "nature", "forest", "ocean", "pollution", "renewable", "solar", "wind power", "ecosystem", "biodiversity", "reforest", "rewilding", "river", "coral", "green", "eco-", "carbon", "emissions", "planet", "habitat", "endangered", "plastic cleanup", "clean energy", "recycling", "circular economy",
      "περιβάλλ", "κλίμα", "δάσος", "δάση", "φύτευ", "ανακυκλ", "θάλασσ", "ακτοερυθρ", "φυσικ", "βιότοπ", "οικοσύστη", "πράσιν", "ηλιακ", "ανανεωσιμ", "βιοποικιλ", "άγρια ζω", "ελάφ", "αετ", "φίδ", "χελών", "δελφίν", "φάλαιν", "αρκούδ", "λύκ", "αγριόγατ", "πεταλούδ", "μέλισσ"] },
  { key: "animals", label: "Ζώα", emoji: "🐾",
    words: ["dog", "cat", "puppy", "kitten", "pet ", "animal rescue", "shelter", "adoption story", "veterinar", "stray", "foster", "paw ", "horse", "sanctuary", "animal welfare", "no-kill",
      "σκύλ", "γάτα", "γάτες", "σκύλοι", "κυνόγατ", "ζώο", "ζώα", "άγρια ζω", "καταφύγι", "προστασία ζώων", "εθελοντ"] },
  { key: "science", label: "Επιστήμη & Υγεία", emoji: "🔬",
    words: ["science", "scientist", "research", "discovery", "physics", "chemistry", "biology", "space", "nasa", "esa ", "telescope", "galaxy", "exoplanet", "mars", "rocket", "satellite", "quantum", "gene", "dna", "brain", "vaccine", "cancer", "treatment", "therapy", "surgery", "doctor", "nurse", "hospital", "medical", "medicine", "health ", "patient", "clinical trial", "diagnos", "cure ", "organ", "transplant", "stem cell", "antibiotic", "alzheimer", "diabetes", "prosthetic", "implant", "longevity", "nutrition", "mental health", "psychology", "archaeolog", "fossil", "dinosaur", "species", "evolution", "universe", "laboratory", "experiment", "university", "professor", "nobel",
      "έρευν", "επιστημ", "επιστήμον", "ανακαλύφ", "νοσοκομείο", "γιατρ", "θεραπει", "εμβολ", "ασθενε", "παιδιατρ", "οδοντ", "μεταμόσχευ", "καρδ", "εγκέφαλ", "γονίδ", "δνκ", "κυτταρ", "φαρμακ", "κλινικ", "πανεπιστημ", "αρχαιολογ", "παλαιοντ", "απολίθωμ", "δεινόσαυρ", "αστρονομ", "διάστημ", "ορυκτ", "φυσικ", "χημ", "βιολ", "ευρημ", "μελέτη", "σπουδ", "εργαστηρ", "καρκίν", "διάγνωσ", "εμμην", "γυναικολόγ", "μωρ", "βρέφ", "εγχείρησ", "ψυχίατρ", "νευρολόγ", "φυσιοθεραπ", "αιμολογ", "μικροβιολ", "οφθαλμ", "ακού", "βάρδια", "νοσηλε"] },
  { key: "technology", label: "Τεχνολογία", emoji: "💡",
    words: ["technology", "tech ", "app ", "software", "robot", "ai ", "artificial intelligence", "machine learning", "startup", "innovation", "invention", "gadget", "smartphone", "computer", "battery", "drone", "3d print", "electric vehicle", "chip", "open source", "algorithm", "sensor", "bluetooth", "heat pump", "e-bike", "quantum computing",
      "τεχνολογ", "εφεύρεσ", "εφαρμογ", "λογισμικ", "ρομποτ", "τεχνητή νοημοσύν", "εφευρέτ", "καινοτομ", "ψηφιακ", "πλατφόρμ", "startup", "μικροτσίπ", "μπαταρ"] },
  { key: "sports", label: "Αθλητισμός", emoji: "🏆",
    words: ["sport", "athlete", "olympi", "football", "soccer", "basketball", "tennis", "marathon", "championship", "tournament", "medal", "world cup", "league", "runner", "cycling", "swim", "gymnastics", "boxing", "cricket", "rugby", "golf", "ski", "surf", "triathlon", "softball", "baseball", "hockey", "formula 1", "nba", "nfl", "uefa", "fifa",
      "αθλητ", "γκολ", "νίκη", "νίκες", "νίκησε", "επικράτησε", "πρωταθλ", "κύπελλο", "μπάσκετ", "μπασκετ", "ποδοσφαιρ", "βόλεϊ", "τένις", "μαραθώνι", "μετάλλιο", "ολυμπι", "τρόπαι", "πρόκρισ", "ημιτελικ", "ντέρμπι", "αήττητ", "παλαιστ", "κωπηλατ", "σκακ", "γυμναστικ", "κολύμβησ", "παίκτ", "προπονητ", "όσμαν", "λίγκα", "χατ-τρικ", "πέναλτι", "ριμπάουντ", "ασίστ", "παράταση", "εκτέλεσε", "δημιούργησε", "σουτάρισε", "γήπεδ", "αγών", "κέρδισε", "τερμάτισε", "πρωτάθλημα", "μπάσκετμπολ", "basket", "league", "highlights", "νταμπλ", "μόλυνδο", "σούπερ λίγκα"] },
  { key: "culture", label: "Πολιτισμός & Τέχνη", emoji: "🎨",
    words: ["art ", "artist", "music", "musician", "film", "cinema", "movie", "theater", "theatre", "dance", "ballet", "opera", "museum", "gallery", "sculpt", "paint", "photograph", "fashion", "design", "literature", "poet", "author", "book ", "novel", "festival", "culture", "heritage", "tradition", "craft", "architecture", "cathedral", "documentary", "actor", "actress", "singer", "concert", "oscar", "grammy", "cannes", "video game",
      "θέατρ", "μουσικ", "τέχν", "κινηματογρ", "φεστιβαλ", "μουσείο", "εκθεσ", "βιβλι", "ποιητ", "συγγραφ", "μπαλέτ", "όπερ", "χορ", "φωτογραφ", "μόδα", "σχεδιασ", "πολιτισμ", "κληρονομ", "παράδοσ", "αρχιτεκτον", "αγαλματ", "γλυπτ", "εικαστικ", "τραγουδ", "καλλιτέχν", "ευρωσόν", "φεστιβάλ", "εορτασμ"] },
  { key: "society", label: "Κοινωνία & Ανθρωπιά", emoji: "❤️",
    words: ["community", "charity", "donate", "donation", "volunteer", "kindness", "hero", "inspiring", "nonprofit", "fundrais", "crowdfund", "kids", "children", "youth", "teen", "school", "student", "education", "teacher", "classroom", "library", "homeless", "housing", "elderly", "disability", "inclusive", "equality", "women", "girl", "refugee", "indigenous", "first responder", "firefighter", "reunion", "long-lost", "wish ", "scholarship", "mentor", "mutual aid", "food bank", "toy drive", "blood donation", "organ donor", "wedding", "twins", "reunited",
      "κοινων", "εθελοντ", "φιλανθρωπ", "δωρ", "συλλογή", "χρηματοδότησ", "παιδ", "νέοι", "έφηβ", "σχολείο", "μαθητ", "εκπαιδευ", "δάσκαλ", "βιβλιοθήκ", "γηροκομείο", "ηλικιωμέν", "ανδρικ", "γυναικ", "ισότητ", "προσφύγ", "πυροσβέστ", "εθελοντισμ", "αλληλεγγύη", "κοινότητ", "συμπόνια", "ανθρωπιά", "ηρωισμ", "φροντίδ", "μέντορ", "υποτροφ", "προίκισ", "βρεφοτροφεί", "παιδικ", "χειραψία", "αγάπ", "φιλανθρωπ"] },
];

const FALLBACK = { key: "world", label: "Κόσμος", emoji: "🌍" };

const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

/* ---------- χώρες / σημαίες ---------- */

const COUNTRIES = [
  { code: "US", patterns: [/united states/i, /\bu\.?s\.?a\.?\b/i, /america/i, /california/i, /texas/i, /new york/i, /florida/i, /chicago/i, /los angeles/i, /colorado/i, /montana/i, /ohio/i, /tennessee/i, /pennsylvania/i, /washington state/i, /d\.c\./i, /oregon/i, /nevada/i, /arizona/i, /michigan/i, /minnesota/i, /wisconsin/i, /carolina/i, /atlanta/i, /boston/i, /seattle/i, /denver/i, /austin/i, /houston/i, /miami/i, /detroit/i, /pittsburgh/i, /cincinnati/i, /nashville/i, /america/i] },
  { code: "GB", patterns: [/united kingdom/i, /\buk\b/i, /britain/i, /british/i, /england/i, /english/i, /scotland/i, /scottish/i, /\bwales\b/i, /welsh/i, /northern ireland/i, /london/i] },
  { code: "IN", patterns: [/india/i, /indian/i, /new delhi/i, /delhi/i, /mumbai/i, /bangalore/i, /chennai/i, /kolkata/i] },
  { code: "GR", patterns: [/greece/i, /greek/i, /athens/i, /thessalon/i, /πειραι/i, /ελλάδ/i, /ελλην/i, /αθήν/i, /θεσσαλον/i, /ηράκλειο/i, /πάτρα/i, /λάρισα/i, /καβάλ/i, /μυτιλήν/i, /χανι/i, /ρόδο/i, /κρήτ/i, /εύβοια/i, /πάοκ/i, /ολυμπιακό/i, /αεκ/i, /παναθηναϊκ/i, /σαλαμίνα/i, /ξάνθ/i, /δράμα/i, /κοζάν/i, /άρτα/i, /καλαμάτα/i, /λευκωσ/i] },
  { code: "DE", patterns: [/germany/i, /german/i, /berlin/i, /munich/i, /bavaria/i, /frankfurt/i, /hamburg/i, /γερμαν/i, /βερολίν/i] },
  { code: "FR", patterns: [/france/i, /french/i, /paris/i, /γαλλ/i, /παρίσι/i] },
  { code: "IT", patterns: [/italy/i, /italian/i, /\brome\b/i, /milan/i, /venice/i, /vatican/i, /ιταλ/i, /ρώμη/i, /μιλάνο/i] },
  { code: "ES", patterns: [/spain/i, /spanish/i, /madrid/i, /barcelona/i, /catalonia/i, /ισπαν/i, /βαρσελών/i] },
  { code: "JP", patterns: [/japan/i, /japanese/i, /tokyo/i, /osaka/i, /ιαπων/i, /τόκιο/i] },
  { code: "CN", patterns: [/china/i, /chinese/i, /beijing/i, /shanghai/i, /κίνα/i, /κινέζ/i] },
  { code: "TR", patterns: [/turkey/i, /türk/i, /turkish/i, /istanbul/i, /ankara/i, /τουρκ/i, /κωνσταντινούπολ/i] },
  { code: "AU", patterns: [/australia/i, /australian/i, /sydney/i, /melbourne/i, /αυστραλ/i] },
  { code: "NZ", patterns: [/new zealand/i, /auckland/i, /νέα ζηλανδ/i] },
  { code: "BR", patterns: [/brazil/i, /brazilian/i, /rio de janeiro/i, /σάο παύλ/i, /βραζιλ/i] },
  { code: "MX", patterns: [/\bmexic/i, /μεξικ/i] },
  { code: "CA", patterns: [/\bcanad/i, /toronto/i, /vancouver/i, /quebec/i, /καναδ/i] },
  { code: "ZA", patterns: [/south africa/i, /johannesburg/i, /cape town/i, /νότια αφρικ/i] },
  { code: "KE", patterns: [/\bkenya\b/i, /nairobi/i, /κένυα/i] },
  { code: "NG", patterns: [/\bnigeria/i, /lagos/i, /νιγηρ/i] },
  { code: "EG", patterns: [/\begypt/i, /cairo/i, /αίγυπτ/i, /κάιρο/i, /σφίγκ/i, /σφίγγα/i] },
  { code: "IL", patterns: [/\bisrael/i, /tel aviv/i, /ισραήλ/i] },
  { code: "NL", patterns: [/netherlands/i, /dutch/i, /amsterdam/i, /ολλανδ/i] },
  { code: "SE", patterns: [/\bsweden/i, /swedish/i, /stockholm/i, /σουηδ/i] },
  { code: "NO", patterns: [/\bnorway/i, /norwegian/i, /oslo/i, /νορβηγ/i] },
  { code: "DK", patterns: [/\bdenmark/i, /danish/i, /copenhagen/i, /δανία/i] },
  { code: "FI", patterns: [/\bfinland/i, /finnish/i, /helsinki/i, /φινλανδ/i] },
  { code: "IS", patterns: [/\biceland/i, /reykjavik/i, /ισλανδ/i] },
  { code: "PL", patterns: [/\bpoland/i, /polish/i, /warsaw/i, /krakow/i, /πολων/i] },
  { code: "PT", patterns: [/\bportugal/i, /portuguese/i, /lisbon/i, /πορτογαλ/i] },
  { code: "IE", patterns: [/\bireland\b/i, /irish/i, /dublin/i, /ιρλανδ/i] },
  { code: "CH", patterns: [/switzerland/i, /swiss/i, /zurich/i, /geneva/i, /ελβετ/i] },
  { code: "AT", patterns: [/\baustria/i, /austrian/i, /vienna/i, /αυστρία/i] },
  { code: "BE", patterns: [/\bbelgium/i, /belgian/i, /brussels/i, /βέλγ/i, /βρυξέλλ/i] },
  { code: "CZ", patterns: [/czech/i, /prague/i, /τσεχ/i, /πράγα/i] },
  { code: "HU", patterns: [/\bhungary\b/i, /budapest/i, /ουγγρ/i] },
  { code: "RO", patterns: [/\bromania/i, /bucharest/i, /ρουμαν/i] },
  { code: "BG", patterns: [/\bbulgaria/i, /sofia/i, /βουλγαρ/i, /σόφια/i] },
  { code: "RS", patterns: [/\bserbia\b/i, /belgrade/i, /σερβ/i] },
  { code: "HR", patterns: [/\bcroatia/i, /zagreb/i, /κροατ/i] },
  { code: "SI", patterns: [/\bslovenia/i, /ljubljana/i, /σλοβεν/i] },
  { code: "SK", patterns: [/\bslovakia/i, /bratislava/i, /σλοβακ/i] },
  { code: "LT", patterns: [/\blithuania/i, /vilnius/i, /λιθουαν/i] },
  { code: "LV", patterns: [/\blatvia\b/i, /\briga\b/i, /λετον/i] },
  { code: "EE", patterns: [/\bestonia/i, /tallinn/i, /εσθον/i] },
  { code: "UA", patterns: [/\bukraine/i, /ukrainian/i, /kyiv/i, /ουκραν/i] },
  { code: "RU", patterns: [/\brussia/i, /russian/i, /moscow/i, /ρωσ/i, /μόσχα/i] },
  { code: "KR", patterns: [/south korea/i, /korean/i, /seoul/i, /νότια κορέ/i] },
  { code: "SG", patterns: [/\bsingapore/i, /σιγκαπούρ/i] },
  { code: "MY", patterns: [/\bmalaysia/i, /kuala lumpur/i, /μαλαισί/i] },
  { code: "TH", patterns: [/\bthailand/i, /bangkok/i, /ταϊλάνδ/i] },
  { code: "VN", patterns: [/\bvietnam/i, /vietnamese/i, /βιετνάμ/i] },
  { code: "ID", patterns: [/\bindonesia/i, /jakarta/i, /ινδονησ/i] },
  { code: "PH", patterns: [/philippines/i, /manila/i, /φιλιππίν/i] },
  { code: "PK", patterns: [/\bpakistan/i, /πακιστάν/i] },
  { code: "BD", patterns: [/bangladesh/i, /μπαγκλαντές/i] },
  { code: "LK", patterns: [/sri lanka/i, /Σρι Λάνκα/i] },
  { code: "NP", patterns: [/\bnepal\b/i, /νεπάλ/i] },
  { code: "PE", patterns: [/\bperu\b/i, /lima/i, /περού/i] },
  { code: "AR", patterns: [/argentina/i, /buenos aires/i, /αργεντιν/i] },
  { code: "CL", patterns: [/\bchile\b/i, /santiago/i, /τσίλη/i] },
  { code: "CO", patterns: [/colombia/i, /bogota/i, /κολομβ/i] },
  { code: "CR", patterns: [/costa rica/i, /κόστα Ρίκα/i] },
  { code: "CU", patterns: [/\bcuba\b/i, /havana/i, /κούβα/i] },
  { code: "JM", patterns: [/\bjamaica/i, /τζαμάικα/i] },
  { code: "MA", patterns: [/morocco/i, /marrakech/i, /casablanca/i, /μαρόκ/i] },
  { code: "TN", patterns: [/\btunisia/i, /τυνησία/i] },
  { code: "GH", patterns: [/\bghana\b/i, /ghanaian/i, /γκάνα/i] },
  { code: "UG", patterns: [/\buganda/i, /ουγκάνδα/i] },
  { code: "TZ", patterns: [/tanzania/i, /τανζανία/i] },
  { code: "ET", patterns: [/\bethiopia/i, /αιθιοπ/i] },
  { code: "RW", patterns: [/\brwanda/i, /ρουάντα/i] },
  { code: "SN", patterns: [/senegal/i, /σενεγάλ/i] },
  { code: "AE", patterns: [/\buae\b/i, /united arab emirates/i, /dubai/i, /abu dhabi/i, /ντουμπάι/i, /ηνωμένα αραβικά/i] },
  { code: "SA", patterns: [/saudi/i, /riyadh/i, /σαουδ/i] },
  { code: "QA", patterns: [/\bqatar\b/i, /κατάρ(?!τ)/i] },
  { code: "IR", patterns: [/\biran\b/i, /iranian/i, /ιράν/i] },
  { code: "JO", patterns: [/\bjordan\b/i, /ιορδαν/i] },
  { code: "LB", patterns: [/\blebanon/i, /λίβανος/i] },
  { code: "IQ", patterns: [/\biraq\b/i, /ιράκ/i] },
  { code: "KZ", patterns: [/kazakhstan/i, /καζακστάν/i] },
  { code: "GE", patterns: [/tbilisi/i, /γεωργία\b/i] },
  { code: "AM", patterns: [/armenia/i, /αρμεν/i] },
  { code: "AZ", patterns: [/azerbaijan/i, /αζερμπαϊτζ/i] },
  { code: "BY", patterns: [/belarus/i, /λευκορωσ/i] },
  { code: "MD", patterns: [/moldova/i, /μολδαβ/i] },
  { code: "AL", patterns: [/\balbania/i, /tirana/i, /αλβαν/i] },
  { code: "MK", patterns: [/north macedonia/i, /skopje/i, /βόρεια μακεδον/i] },
  { code: "BA", patterns: [/bosnia/i, /βοσνία/i] },
  { code: "ME", patterns: [/\bmontenegro\b/i, /μαυροβούνι/i] },
  { code: "CY", patterns: [/\bcyprus\b/i, /κύπρ/i] },
  { code: "MT", patterns: [/\bmalta\b/i, /μάλτα/i] },
  { code: "TW", patterns: [/\btaiwan/i, /ταϊβάν/i] },
  { code: "HK", patterns: [/hong kong/i, /ονγκ κονγκ/i] },
  { code: "FJ", patterns: [/\bfiji\b/i, /φίτζι/i] },
  { code: "EC", patterns: [/\becuador/i, /εκουαδόρ/i] },
  { code: "BO", patterns: [/\bbolivia/i, /βολιβία/i] },
  { code: "PY", patterns: [/\bparaguay/i, /παραγουάη/i] },
  { code: "UY", patterns: [/\buruguay/i, /ουρουγουάη/i] },
  { code: "VE", patterns: [/\bvenezuela/i, /βενεζουέλα/i] },
  { code: "DO", patterns: [/dominican republic/i, /δομινικαν/i] },
  { code: "PA", patterns: [/\bpanama\b/i, /παναμάς/i] },
  { code: "GT", patterns: [/\bguatemala/i, /γουατεμάλα/i] },
  { code: "EU", patterns: [/\beu\b/i, /european union/i, /european commission/i, /ευρωπαϊκή ένωση/i, /ευρωπαϊκ/i, /ευρωσόν/i, /ευρωπ/i] },
];

function flagEmoji(code) {
  if (!code || code.length !== 2) return "🌍";
  return [...code.toUpperCase()].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join("");
}

function detectCountry(item) {
  const text = `${item.title} ${(item.rawCategories || []).join(" ")}`;
  const GR_PREFIX = /^(Θεσσαλον|Αθήν|Πειραι|Ηράκλειο|Πάτρα|Λάρισα|Καβάλ|Μυτιλήν|Χανι|Ρόδο|Κρήτ|Εύβοια|Σαλαμίν|Ξάνθ|Δράμ|Κοζάν|Άρτα|Καλαμάτ|Λευκωσ|Ελλάδ|Ελλην|Κύπρ|Πάοκ|ΑΕΚ|Ολυμπιακ|Παναθηναϊκ|Σέρρ)/i;
  // Για ελληνικά άρθρα: αν ο τίτλος ξεκινά με ελληνικό τόπο → GR, αλλιώς ξένη χώρα στον τίτλο, μετά GR
  if (item.lang === "el") {
    const titleOnly = item.title;
    if (GR_PREFIX.test(titleOnly)) return "GR";
    for (const c of COUNTRIES) {
      if (c.code === "GR" || c.code === "EU") continue;
      if (c.patterns.some((re) => re.test(titleOnly))) return c.code;
    }
    return SOURCE_DEFAULT_COUNTRY[item.source] || "GR";
  }
  for (const c of COUNTRIES) {
    if (c.patterns.some((re) => re.test(text))) return c.code;
  }
  return SOURCE_DEFAULT_COUNTRY[item.source] || null;
}

/* ---------- helpers ---------- */

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'")
    .replace(/&hellip;/g, "…").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&#8217;|&#8216;/g, "'").replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8230;/g, "…").replace(/&#8211;|&#8212;/g, "–")
    .replace(/&#\d+;/g, " ").replace(/&[a-zA-Z]+;/g, " ");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function extractBlock(block, tag) {
  const cdata = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (plain) return plain[1].trim();
  return "";
}

function firstImage(block) {
  const media =
    block.match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
    block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i) ||
    block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i) ||
    block.match(/<itunes:image[^>]*href=["']([^"']+)["']/i);
  if (media) return media[1];
  const img = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img && /^https?:\/\//i.test(img[1])) return img[1];
  return null;
}

function categorize(text) {
  const t = ` ${text.toLowerCase()} `;
  let best = null;
  let bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const w of cat.words) {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(escaped, "i").test(t)) score++;
    }
    // Bonus αθλητικών σκορ (π.χ. 84-78)
    if (cat.key === "sports" && /\d{1,3}\s*[-–]\s*\d{1,3}/.test(t)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best ? best.key : FALLBACK.key;
}

function normalizeTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9α-ω ]/gi, "").replace(/\s+/g, " ").trim();
}

/* ---------- ελληνικό φιλτράρισμα ---------- */

function greekPasses(mode, title, description) {
  const combined = `${title} ${description}`;
  if (NEGATIVE_EL_TITLE.some((re) => re.test(title))) return false;
  if (mode === "greekSports") {
    return POSITIVE_GREEK_SPORTS.some((re) => re.test(combined)) || POSITIVE_EL.some((re) => re.test(title));
  }
  // greekHard (mainstream): απαιτείται θετικό σήμα
  if (mode === "greekHard") {
    return POSITIVE_EL.some((re) => re.test(combined));
  }
  // greekSoft (site καλών νέων): αρκεί να μην είναι αρνητικός ο τίτλος
  return true;
}

/* ---------- μετάφραση ---------- */

const GREEK_LETTERS = /[\u0370-\u03FF\u1F00-\u1FFF]/g;

/** true αν το κείμενο είναι πραγματικά ελληνικό (όχι αγγλικό ή μικτό) */
function isGreekText(s) {
  const greek = (String(s || "").match(GREEK_LETTERS) || []).length;
  if (!greek) return false;
  const latin = (String(s).match(/[A-Za-z]/g) || []).length;
  return greek >= (greek + latin) * 0.25;
}

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf8");
}

function cacheKey(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 20);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestTranslation(text, provider, sourceLang) {
  if (provider === "mymemory") {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      `&langpair=${encodeURIComponent(sourceLang)}|el`;
    const res = await fetch(url, { headers: { "User-Agent": TRANSLATE_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return decodeEntities(String(json?.responseData?.translatedText || "")).trim();
  }

  if (provider === "google-alt") {
    const url =
      "https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=el&q=" +
      encodeURIComponent(text);
    const res = await fetch(url, { headers: { "User-Agent": TRANSLATE_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (typeof json === "string") return json.trim();
    if (Array.isArray(json)) {
      return json
        .map((part) => (Array.isArray(part) ? part[0] : part))
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    return "";
  }

  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=el&dt=t&q=" +
    encodeURIComponent(text);
  const res = await fetch(url, { headers: { "User-Agent": TRANSLATE_UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json[0] || []).map((seg) => seg[0]).join("").trim();
}

async function translateText(text, cache, stats, sourceLang = "en") {
  if (!text) return text;
  text = String(text).trim();
  if (!text) return text;
  const key = cacheKey(text);
  if (cache[key] && isGreekText(cache[key])) {
    stats.cached++;
    return cache[key];
  }

  // Εναλλαγή παρόχων ώστε να μην κολλάμε όταν το Google απορρίπτει τον runner
  const providers = ["google", "google", "google-alt", "mymemory"];
  for (let attempt = 0; attempt < TRANSLATE_ATTEMPTS; attempt++) {
    try {
      const translated = await requestTranslation(
        text,
        providers[Math.min(attempt, providers.length - 1)],
        sourceLang
      );
      if (translated && translated !== text && isGreekText(translated)) {
        cache[key] = translated;
        stats.translated++;
        await sleep(TRANSLATE_DELAY_MS);
        return translated;
      }
      stats.retries++;
    } catch (err) {
      stats.retries++;
    }
    if (attempt < TRANSLATE_ATTEMPTS - 1) {
      await sleep(TRANSLATE_BACKOFF_MS * (attempt + 1));
    }
  }
  stats.failed++;
  return text;
}

/* ---------- fetch feed ---------- */

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "GoodNewsApp/1.0 (+https://github.com/)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (/<!DOCTYPE html/i.test(xml.slice(0, 500))) throw new Error("HTML αντί για RSS");
    const items = [];
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const block of blocks.slice(0, feed.max || 25)) {
      const title = stripTags(extractBlock(block, "title"));
      const link = stripTags(extractBlock(block, "link"));
      const rawDesc =
        extractBlock(block, "content:encoded") ||
        extractBlock(block, "description") ||
        extractBlock(block, "summary");
      const description = stripTags(rawDesc)
        .replace(/^The post .*? appeared first on .*?\.$/i, "")
        .replace(/^Δημοσιεύτηκε πρώτα στο .*?\.$/i, "")
        .trim();
      const pub = stripTags(extractBlock(block, "pubDate")) || stripTags(extractBlock(block, "published"));
      const date = pub ? new Date(pub) : null;
      if (!title || !link || !/^https?:\/\//i.test(link)) continue;
      if (SKIP_TITLE.some((re) => re.test(title))) continue;

      const cats = [];
      for (const m of block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)) {
        cats.push(stripTags(m[1]));
      }

      if (feed.lang === "en" && NEGATIVE_TITLE.some((re) => re.test(title))) continue;
      if (feed.lang === "el" && !greekPasses(feed.mode, title, description)) continue;

      const haystack = `${title} ${description} ${cats.join(" ")}`;
      const category = categorize(haystack);

      items.push({
        id: link.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
        title,
        titleOriginal: title,
        link,
        description: description.length > 400 ? description.slice(0, 397).replace(/\s+\S*$/, "") + "…" : description,
        descriptionOriginal: description,
        image: firstImage(block),
        date: date && !isNaN(date) ? date.toISOString() : null,
        source: feed.name,
        category,
        lang: feed.lang,
        langOriginal: feed.lang,
        rawCategories: cats,
      });
    }
    console.log(`  ✓ ${feed.name}: ${items.length} άρθρα`);
    return items;
  } catch (err) {
    console.error(`  ✗ ${feed.name}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- περιλήψεις άρθρων χωρίς περιγραφή ---------- */

function extractMetaDescription(html) {
  const patterns = [
    /<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["']/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return stripTags(match[1]);
  }
  return "";
}

async function fetchPageDescription(link) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(link, {
      signal: ctrl.signal,
      headers: { "User-Agent": TRANSLATE_UA },
      redirect: "follow",
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") || "";
    if (type && !/text\/html/i.test(type)) return "";
    return extractMetaDescription(await res.text());
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function backfillDescriptions(items) {
  const missing = items.filter((item) => !item.descriptionOriginal && item.link);
  if (!missing.length) return 0;
  console.log(`\nΑνάκτηση περιλήψεων για ${missing.length} άρθρα χωρίς περιγραφή…`);
  let filled = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < missing.length) {
      const item = missing[cursor++];
      const description = await fetchPageDescription(item.link);
      if (description) {
        item.descriptionOriginal =
          description.length > 400 ? description.slice(0, 397).replace(/\s+\S*$/, "") + "…" : description;
        item.description = item.descriptionOriginal;
        filled++;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`  ✓ Βρέθηκαν περιλήψεις για ${filled}/${missing.length} άρθρα`);
  return filled;
}

/* ---------- main ---------- */

console.log("Ανάκτηση RSS (ελληνικές + διεθνείς πηγές)…");
const results = await Promise.all(FEEDS.map(fetchFeed));
let all = results.flat();

// χώρες
for (const item of all) {
  item.country = detectCountry(item);
  item.flag = flagEmoji(item.country);
}

// περιλήψεις για feeds που δεν παρέχουν description
await backfillDescriptions(all);

// μετάφραση αγγλικών
const cache = loadCache();
const stats = { translated: 0, cached: 0, failed: 0, retries: 0 };
const english = all.filter((i) => i.lang === "en");
console.log(`\nΜετάφραση ${english.length} αγγλικών άρθρων στα ελληνικά…`);
let done = 0;
let untranslated = 0;
for (const item of english) {
  const sourceLang = item.langOriginal || "en";
  const title = await translateText(item.titleOriginal, cache, stats, sourceLang);
  let description = "";
  if (item.descriptionOriginal) {
    description = await translateText(item.descriptionOriginal.slice(0, 350), cache, stats, sourceLang);
    if (item.descriptionOriginal.length > 350) description += "…";
  }
  if (isGreekText(title)) {
    item.title = title;
    item.lang = "el";
  } else {
    untranslated++;
  }
  item.description = isGreekText(description) ? description : "";
  done++;
  if (done % 25 === 0) console.log(`  … ${done}/${english.length}`);
}
saveCache(cache);
console.log(`Μεταφράσεις: ${stats.translated} νέες, ${stats.cached} από cache, ${stats.retries} επαναλήψεις, ${stats.failed} αποτυχίες`);
if (untranslated > 0) {
  console.log(`⚠ ${untranslated} άρθρα έμειναν στα αγγλικά — θα ξαναδοκιμαστούν στην επόμενη εκτέλεση`);
}

// ταξινόμηση: ελληνικά πρώτα (με προτεραιότητα), μετά χρονολογικά
all.sort((a, b) => {
  const ga = a.lang === "el" ? 0 : 1;
  const gb = b.lang === "el" ? 0 : 1;
  if (ga !== gb) return ga - gb;
  return new Date(b.date || 0) - new Date(a.date || 0);
});

// dedupe
const seenTitle = new Set();
const seenLink = new Set();
const deduped = [];
for (const item of all) {
  const nt = normalizeTitle(item.title);
  if (seenLink.has(item.id) || seenTitle.has(nt)) continue;
  seenLink.add(item.id);
  seenTitle.add(nt);
  const { rawCategories, ...rest } = item;
  deduped.push(rest);
}

const finalItems = deduped.slice(0, MAX_TOTAL);
const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    total: finalItems.length,
    greek: finalItems.filter((i) => i.lang === "el").length,
    sources: FEEDS.map((f) => f.name),
  },
  items: finalItems,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");

const byCat = {};
for (const i of finalItems) byCat[i.category] = (byCat[i.category] || 0) + 1;
console.log(`\nΣύνολο: ${finalItems.length} άρθρα (${out.meta.greek} ελληνικά με προτεραιότητα)`);
console.log("Ανά κατηγορία:", byCat);
console.log(`Γράφτηκε: data/data.json`);
