// Titles and texts of the simple list pages (students, teachers, classes, courses, items) and the access page
export default {
  en: {
    students: { title: 'Students', singular: 'student', subtitle: 'Student records, contacts and health information.', importGuardians: 'Parents / guardians (linked by matricule)' },
    teachers: { title: 'Teachers', singular: 'teacher', subtitle: 'Teaching staff, contracts and pay details.' },
    classes: {
      title: 'Classes', singular: 'class', subtitle: 'Classes per academic year, homeroom teachers and enrollment.',
      level: 'Level', capacity: 'Capacity', tuition: 'Tuition (FCFA)', homeroom: 'Homeroom teacher', enrolled: 'Enrolled',
      importClassCourses: 'Courses taught per class (and their teacher)',
    },
    courses: { title: 'Courses', singular: 'course', subtitle: 'Subjects taught, with coefficients and weekly hours.', code: 'Code', coefficient: 'Coefficient', hours: 'Hours/week' },
    items: {
      title: 'Items for sale', singular: 'item', subtitle: 'Uniforms, books, supplies and services the school sells to students. Stock goes up with purchases and down with sales.',
      price: 'Price (FCFA)', stock: 'Stock', stockHint: 'Empty = not tracked (services, fees)', notTracked: 'Not tracked', outOfStock: 'Out of stock',
      sold: 'Sold', onSale: 'On sale', withdrawn: 'Withdrawn',
    },
    forbidden: { title: 'Access restricted', text: 'Your role ({role}) cannot open this page. Ask your system administrator if you need it.', back: 'Back to the dashboard' },
  },
  fr: {
    students: { title: 'Élèves', singular: 'un élève', subtitle: 'Dossiers des élèves, contacts et informations de santé.', importGuardians: 'Parents / tuteurs (liés par matricule)' },
    teachers: { title: 'Enseignants', singular: 'un enseignant', subtitle: 'Personnel enseignant, contrats et rémunération.' },
    classes: {
      title: 'Classes', singular: 'une classe', subtitle: 'Classes par année scolaire, professeurs principaux et effectifs.',
      level: 'Niveau', capacity: 'Capacité', tuition: 'Scolarité (FCFA)', homeroom: 'Professeur principal', enrolled: 'Inscrits',
      importClassCourses: 'Matières enseignées par classe (et leur enseignant)',
    },
    courses: { title: 'Matières', singular: 'une matière', subtitle: 'Matières enseignées, avec coefficients et heures par semaine.', code: 'Code', coefficient: 'Coefficient', hours: 'Heures/semaine' },
    items: {
      title: 'Articles en vente', singular: 'un article', subtitle: 'Uniformes, livres, fournitures et services vendus aux élèves. Le stock augmente avec les achats et baisse avec les ventes.',
      price: 'Prix (FCFA)', stock: 'Stock', stockHint: 'Vide = non suivi (services, frais)', notTracked: 'Non suivi', outOfStock: 'Rupture de stock',
      sold: 'Vendus', onSale: 'En vente', withdrawn: 'Retiré',
    },
    forbidden: { title: 'Accès restreint', text: 'Votre rôle ({role}) ne permet pas d’ouvrir cette page. Demandez à votre administrateur système si vous en avez besoin.', back: 'Retour au tableau de bord' },
  },
};
