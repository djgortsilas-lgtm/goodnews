# ☀️ Καλά Νέα

Μια απλή εφαρμογή (στατικό HTML) με **μόνο καλές και ευχάριστες ειδήσεις** από όλο τον κόσμο — χωρίς doomscrolling.

## Τι κάνει

- Συλλέγει RSS από ~12 sites αποκλειστικά καλών νέων (Good News Network, Positive News, Nice News, Good Good Good, Reasons to be Cheerful, Happy Eco News, The Better India κ.ά.)
- Φιλτράρει αρνητικούς τίτλους (blacklist), αφαιρεί διπλότυπα και μη-άρθρα
- Κατηγοριοποιεί αυτόματα: Περιβάλλον, Ζώα, Επιστήμη & Υγεία, Τεχνολογία, Αθλητισμός, Πολιτισμός, Κοινωνία, Κόσμος
- Ελληνικό UI με αναζήτηση, φίλτρα ανά κατηγορία και ταξινόμηση (νεότερα / τυχαία)
- Κάθε κάρτα συνδέεται στο πρωτότυπο άρθρο

## Τοπική προεπισκόπηση

Χρειάζεται τοπικός server (το `file://` μπλοκάρει το fetch στον Chrome):

```bash
# με Node
npx serve .
# ή με Python
python -m http.server 8000
```

Στη συνέχεια άνοιξε http://localhost:3000 (ή :8000).

## Ενημέρωση δεδομένων τοπικά

```bash
node scripts/fetch-news.mjs
```

Δεν θέλει `npm install` — είναι zero-dependency.

## Ανέβασμα στο GitHub Pages

1. Δημιούργησε ένα repo στο GitHub (π.χ. `goodnews`)
2. Κάνε push του κώδικα:

   ```bash
   git remote add origin https://github.com/<USERNAME>/<REPO>.git
   git branch -M main
   git push -u origin main
   ```

3. Στο repo: **Settings → Pages → Source**: επίλεξε `Deploy from a branch`, κλάδος `main`, φάκελο `/ (root)` → Save
4. Σε λίγα λεπτά το site θα είναι στο: `https://<USERNAME>.github.io/<REPO>/`
5. Το GitHub Action (`.github/workflows/update-news.yml`) τρέχει **κάθε 3 ώρες** και ανανεώνει το `data/data.json` μόνο του. Μπορείς να το τρέξεις χειροκίνητα από **Actions → Ενημέρωση ειδήσεων → Run workflow**.

## Δομή

```
index.html              # σελίδα
styles.css              # στυλ
app.js                  # λογική UI
scripts/fetch-news.mjs  # fetch + φιλτράρισμα RSS
data/data.json          # δεδομένα (παράγεται από το script)
.github/workflows/      # αυτόματη ενημέρωση
```
