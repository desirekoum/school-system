// Excel import dialog
export default {
  en: {
    title: 'Import from Excel', what: 'What do you import?', notXlsx: 'Choose an Excel file (.xlsx). In Excel: File → Save as → Excel Workbook.',
    step1: 'Fill the template', step1Help: 'One row per record. Blue columns are required. Your own list also works if its headers match (French or English names are recognised).',
    preparing: 'Preparing…', download: 'Download the template',
    step2: 'Choose the file', clickToChange: 'click to change', drop: 'Drop the .xlsx file here or {browse}', browse: 'browse',
    step3: 'Check, then import', step3Help: "Existing records are updated, the others are created. Empty cells don't erase anything. If a row has an error, nothing is saved.",
    complete: 'Import complete: {n} rows saved.', errorsFound: 'No error found | 1 error found. Nothing was saved: fix the file and check again. | {n} errors found. Nothing was saved: fix the file and check again.',
    allValid: 'All {n} rows are valid. You can import.',
    created: 'created', toCreate: 'to create', updated: 'updated', toUpdate: 'to update', unchanged: 'unchanged', errors: 'errors',
    ignored: 'Ignored columns (not recognised): {list}', row: 'Row', column: 'Column', problem: 'Problem', more: '… and {n} more.',
    checking: 'Checking…', check: 'Check the file', importing: 'Importing…',
  },
  fr: {
    title: 'Importer depuis Excel', what: 'Que voulez-vous importer ?', notXlsx: 'Choisissez un fichier Excel (.xlsx). Dans Excel : Fichier → Enregistrer sous → Classeur Excel.',
    step1: 'Remplir le modèle', step1Help: 'Une ligne par enregistrement. Les colonnes bleues sont obligatoires. Votre propre liste fonctionne aussi si ses en-têtes correspondent (noms français ou anglais reconnus).',
    preparing: 'Préparation…', download: 'Télécharger le modèle',
    step2: 'Choisir le fichier', clickToChange: 'cliquer pour changer', drop: 'Déposez le fichier .xlsx ici ou {browse}', browse: 'parcourez',
    step3: 'Vérifier, puis importer', step3Help: 'Les enregistrements existants sont mis à jour, les autres sont créés. Les cellules vides n’effacent rien. Si une ligne a une erreur, rien n’est enregistré.',
    complete: 'Import terminé : {n} lignes enregistrées.', errorsFound: 'Aucune erreur | 1 erreur trouvée. Rien n’a été enregistré : corrigez le fichier et vérifiez à nouveau. | {n} erreurs trouvées. Rien n’a été enregistré : corrigez le fichier et vérifiez à nouveau.',
    allValid: 'Les {n} lignes sont valides. Vous pouvez importer.',
    created: 'créés', toCreate: 'à créer', updated: 'mis à jour', toUpdate: 'à mettre à jour', unchanged: 'inchangés', errors: 'erreurs',
    ignored: 'Colonnes ignorées (non reconnues) : {list}', row: 'Ligne', column: 'Colonne', problem: 'Problème', more: '… et {n} de plus.',
    checking: 'Vérification…', check: 'Vérifier le fichier', importing: 'Import…',
  },
};
