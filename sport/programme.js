/*
  Le programme d'entraînement.
  Chaque exercice a 4 valeurs de "reps" : une pour chaque phase de 2 semaines
  (semaines 1-2, 3-4, 5-6, 7-8). Le site choisit automatiquement la bonne.
*/

// Nombre de tours du circuit selon la phase
const TOURS = [2, 3, 3, 4];

const SEANCES = {
	A: {
		nom: "Haut du corps",
		emoji: "💪",
		duree: "30 à 40 min",
		exercices: [
			{ nom: "Pompes", reps: ["6", "8", "10", "12"], facile: "Sur les genoux, ou mains posées sur une table", astuce: "Corps bien droit comme une planche, coudes à 45° du corps" },
			{ nom: "Dips sur une chaise", reps: ["6", "8", "10", "12"], facile: "Garde les jambes pliées, pieds proches", astuce: "Descends jusqu'à ce que les coudes fassent un angle droit" },
			{ nom: "Pompes piquées (pike push-ups)", reps: ["5", "6", "8", "10"], facile: "Fais juste la descente, lentement", astuce: "Fesses en l'air, la tête descend entre les mains : top pour les épaules (et les freezes !)" },
			{ nom: "Superman", reps: ["10", "12", "15", "15"], facile: "Lève seulement les bras, puis seulement les jambes", astuce: "Allongé sur le ventre, décolle bras et jambes, tiens 1 seconde" },
			{ nom: "Planche", reps: ["20 s", "30 s", "40 s", "50 s"], facile: "Sur les genoux", astuce: "Serre les fesses et le ventre, ne laisse pas le dos se creuser" }
		]
	},
	B: {
		nom: "Jambes & cardio",
		emoji: "🦵",
		duree: "30 à 40 min",
		exercices: [
			{ nom: "Squats", reps: ["12", "15", "20", "25"], facile: "Descends moins bas, ou assieds-toi sur une chaise et relève-toi", astuce: "Talons au sol, poitrine fière, genoux dans l'axe des pieds" },
			{ nom: "Fentes alternées", reps: ["6 / jambe", "8 / jambe", "10 / jambe", "12 / jambe"], facile: "Tiens-toi à un mur", astuce: "Le genou arrière descend presque jusqu'au sol" },
			{ nom: "Pont fessier", reps: ["12", "15", "18", "20"], facile: "Fais des pauses", astuce: "Pousse dans les talons, serre les fessiers en haut" },
			{ nom: "Mountain climbers", reps: ["20 s", "30 s", "40 s", "45 s"], facile: "Fais-le lentement, en marchant", astuce: "Position de pompe, ramène les genoux vers la poitrine en alternant" },
			{ nom: "Jumping jacks", reps: ["30 s", "40 s", "45 s", "60 s"], facile: "Sans sauter : écarte une jambe à la fois", astuce: "Reste léger sur la pointe des pieds" },
			{ nom: "Chaise contre le mur", reps: ["20 s", "30 s", "40 s", "50 s"], facile: "Monte un peu plus haut", astuce: "Dos collé au mur, cuisses parallèles au sol" }
		]
	},
	C: {
		nom: "Gainage & full body",
		emoji: "🔥",
		duree: "30 à 40 min",
		exercices: [
			{ nom: "Burpees", reps: ["5", "6", "8", "10"], facile: "Sans la pompe et sans le saut", astuce: "Accroupi → planche → pompe → accroupi → saut" },
			{ nom: "Planche latérale", reps: ["15 s / côté", "20 s / côté", "30 s / côté", "40 s / côté"], facile: "Genou du bas posé au sol", astuce: "Le corps forme une ligne droite, hanches hautes" },
			{ nom: "Hollow hold (banane)", reps: ["15 s", "20 s", "25 s", "30 s"], facile: "Genoux pliés, bras le long du corps", astuce: "Bas du dos collé au sol, bras et jambes décollés" },
			{ nom: "Marche de l'ours", reps: ["20 s", "30 s", "40 s", "45 s"], facile: "Fais des pauses", astuce: "À quatre pattes, genoux juste au-dessus du sol, avance et recule" },
			{ nom: "Crunchs vélo", reps: ["10 / côté", "12 / côté", "15 / côté", "20 / côté"], facile: "Moins vite, pieds plus hauts", astuce: "Coude vers le genou opposé, sans tirer sur la nuque" },
			{ nom: "Frog stand (base du freeze)", reps: ["5 s", "10 s", "15 s", "20 s"], facile: "Genoux posés sur les coudes, garde les pieds au sol et penche-toi juste en avant", astuce: "Mains au sol, genoux sur les coudes, penche-toi jusqu'à décoller les pieds. Mets un coussin devant ta tête !" }
		]
	}
};

// Le "finisher abdos" : à faire à la fin de CHAQUE séance, juste avant les étirements
const TOURS_ABDOS = [1, 1, 2, 2];
const FINISHER_ABDOS = [
	{ nom: "Crunchs", reps: ["15", "20", "20", "25"], facile: "Mains sur les cuisses, monte juste un peu", astuce: "Décolle les épaules en soufflant, le bas du dos reste au sol" },
	{ nom: "Relevés de jambes", reps: ["8", "10", "12", "15"], facile: "Genoux pliés", astuce: "Allongé, mains sous les fesses, monte les jambes sans creuser le dos" },
	{ nom: "Russian twist", reps: ["10 / côté", "12 / côté", "15 / côté", "20 / côté"], facile: "Pieds posés au sol", astuce: "Assis, buste penché en arrière, tourne les épaules de gauche à droite" },
	{ nom: "Planche", reps: ["30 s", "40 s", "45 s", "60 s"], facile: "Sur les genoux", astuce: "Rentre le nombril comme si tu voulais le coller à ta colonne" }
];

// Ce qu'on fait chaque jour de la semaine (0 = dimanche, 1 = lundi, ... 6 = samedi)
const PLANNING = {
	1: { type: "seance", seance: "A" },
	2: { type: "repos", titre: "Cardio doux", emoji: "🚶", texte: "Pas de séance, mais on brûle des calories : 30 à 45 minutes de marche rapide (ou vélo). Tu dois être un peu essoufflé mais pouvoir parler. C'est l'arme n°1 pour perdre du gras sans te fatiguer." },
	3: { type: "seance", seance: "B" },
	4: { type: "repos", titre: "Marche + mobilité", emoji: "🧘", texte: "30 minutes de marche rapide, puis 10 minutes d'étirements (cou, épaules, poignets, hanches, ischios). Tes muscles récupèrent et tu seras plus souple pour le break." },
	5: { type: "seance", seance: "C" },
	6: { type: "repos", titre: "Activité libre", emoji: "🕺", texte: "Au moins 45 minutes d'un sport qui te fait plaisir : break dance, vélo, foot, piscine... Plus tu bouges, plus tu brûles de calories !" },
	0: { type: "repos", titre: "Repos complet", emoji: "😌", texte: "Repos. Dors bien, mange bien, prépare ta semaine. Une balade tranquille est un bonus. Et attention aux repas du week-end : c'est souvent là qu'on reprend les kilos !" }
};

// L'échauffement et le retour au calme, identiques à chaque séance
const ECHAUFFEMENT = "Échauffement (5 min) : 1 min de jumping jacks, 10 rotations des bras, 10 rotations des hanches, 10 rotations des poignets (important pour le break !), 10 squats lents.";
const ETIREMENTS = "Retour au calme (5 min) : étire les muscles travaillés, 30 secondes par étirement, en respirant lentement.";
