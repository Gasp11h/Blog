/*
  Le "moteur" du site : il choisit la séance du jour, le conseil du jour,
  et se souvient de tes séances grâce au localStorage (la mémoire du navigateur).
*/

const CLE_STOCKAGE = "routine-sport";
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// ---------- Mémoire ----------

function chargerDonnees() {
	let donnees = null;
	try {
		donnees = JSON.parse(localStorage.getItem(CLE_STOCKAGE));
	} catch (e) {}
	if (!donnees) {
		// Première visite : le programme commence le lundi de cette semaine
		donnees = { debut: dateTexte(lundiDe(new Date())), premierJour: dateTexte(new Date()), faites: {}, coches: {} };
	}
	if (!donnees.premierJour) donnees.premierJour = donnees.debut;
	return donnees;
}

function sauvegarder() {
	try {
		localStorage.setItem(CLE_STOCKAGE, JSON.stringify(donnees));
	} catch (e) {}
}

let donnees = chargerDonnees();
sauvegarder();

// ---------- Outils pour les dates ----------

// Transforme une date en texte "2026-09-22"
function dateTexte(date) {
	const mois = String(date.getMonth() + 1).padStart(2, "0");
	const jour = String(date.getDate()).padStart(2, "0");
	return date.getFullYear() + "-" + mois + "-" + jour;
}

function texteVersDate(texte) {
	const morceaux = texte.split("-");
	return new Date(morceaux[0], morceaux[1] - 1, morceaux[2]);
}

function lundiDe(date) {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const decalage = (d.getDay() + 6) % 7; // lundi = 0, dimanche = 6
	d.setDate(d.getDate() - decalage);
	return d;
}

function ajouterJours(date, n) {
	const d = new Date(date);
	d.setDate(d.getDate() + n);
	return d;
}

const aujourdhui = new Date();
const aujourdhuiTexte = dateTexte(aujourdhui);

// Numéro de semaine du programme (1 à 8, puis on recommence un nouveau cycle)
function semaineDuProgramme(date) {
	const jours = Math.round((lundiDe(date) - texteVersDate(donnees.debut)) / MS_PAR_JOUR);
	return Math.max(0, Math.floor(jours / 7)) % 8 + 1;
}

function phaseDe(semaine) {
	return Math.floor((semaine - 1) / 2); // 0, 1, 2 ou 3
}

// ---------- Statistiques ----------

function calculerSerie() {
	// On remonte le temps jour par jour : chaque jour de séance prévu doit être fait
	let serie = 0;
	let jour = new Date(aujourdhui);
	for (let i = 0; i < 365; i++) {
		const texte = dateTexte(jour);
		const prevu = PLANNING[jour.getDay()].type === "seance";
		if (texte < donnees.premierJour) break;
		if (donnees.faites[texte]) {
			serie++;
		} else if (prevu && texte !== aujourdhuiTexte) {
			break; // séance ratée : la série s'arrête
		}
		jour = ajouterJours(jour, -1);
	}
	return serie;
}

function afficherStats() {
	const semaine = semaineDuProgramme(aujourdhui);
	document.getElementById("stat-semaine").textContent = semaine + "/8";
	document.getElementById("stat-serie").textContent = calculerSerie();
	document.getElementById("stat-total").textContent = Object.keys(donnees.faites).length;

	const lundi = lundiDe(aujourdhui);
	let faitesSemaine = 0;
	for (let i = 0; i < 7; i++) {
		const jour = ajouterJours(lundi, i);
		// seuls les jours de séance comptent (pas les jours de repos validés)
		if (PLANNING[jour.getDay()].type === "seance" && donnees.faites[dateTexte(jour)]) faitesSemaine++;
	}
	document.getElementById("stat-semaine-faites").textContent = faitesSemaine + "/3";
}

// ---------- La semaine ----------

function afficherSemaine() {
	const conteneur = document.getElementById("semaine");
	conteneur.innerHTML = "";
	const lundi = lundiDe(aujourdhui);

	for (let i = 0; i < 7; i++) {
		const jour = ajouterJours(lundi, i);
		const texte = dateTexte(jour);
		const plan = PLANNING[jour.getDay()];
		const case_ = document.createElement("div");
		case_.className = "jour";

		const emoji = plan.type === "seance" ? SEANCES[plan.seance].emoji : plan.emoji;
		let etat = "";
		if (donnees.faites[texte]) {
			etat = "✅";
			case_.classList.add("fait");
		} else if (plan.type === "seance" && texte < aujourdhuiTexte && texte >= donnees.premierJour) {
			etat = "❌";
			case_.classList.add("rate");
		}
		if (texte === aujourdhuiTexte) case_.classList.add("aujourdhui");

		case_.innerHTML =
			"<strong>" + JOURS[jour.getDay()].slice(0, 3) + "</strong>" +
			"<span class='emoji'>" + emoji + "</span>" +
			"<span class='etat'>" + etat + "</span>";
		conteneur.appendChild(case_);
	}
}

// ---------- La séance du jour ----------

function afficherSeanceDuJour() {
	const section = document.getElementById("seance-du-jour");
	const plan = PLANNING[aujourdhui.getDay()];
	const dejaFaite = donnees.faites[aujourdhuiTexte];

	if (plan.type === "repos") {
		section.innerHTML =
			"<h2>" + plan.emoji + " Aujourd'hui : " + plan.titre + "</h2>" +
			"<p>" + plan.texte + "</p>" +
			(dejaFaite
				? "<p class='bravo'>✅ Validé pour aujourd'hui, bien joué !</p>"
				: "<button id='btn-valider' class='btn-principal'>Je l'ai fait ✅</button>");
	} else {
		const seance = SEANCES[plan.seance];
		const semaine = semaineDuProgramme(aujourdhui);
		const phase = phaseDe(semaine);
		const coches = donnees.coches[aujourdhuiTexte] || [];

		let html =
			"<h2>" + seance.emoji + " Séance du jour : " + seance.nom + "</h2>" +
			"<p class='infos'>Semaine " + semaine + " · <strong>" + TOURS[phase] + " tours</strong> · " + seance.duree + "</p>" +
			"<p class='petit'>" + ECHAUFFEMENT + "</p>" +
			"<ul class='exercices'>";

		seance.exercices.forEach(function (exo, i) {
			const coche = coches.includes(i) ? "checked" : "";
			html +=
				"<li>" +
				"<label><input type='checkbox' data-index='" + i + "' " + coche + ">" +
				"<span class='nom'>" + exo.nom + "</span>" +
				"<span class='reps'>" + exo.reps[phase] + "</span></label>" +
				"<details><summary>Comment faire ?</summary>" +
				"<p>👉 " + exo.astuce + "</p>" +
				"<p>🙂 Trop dur ? " + exo.facile + "</p></details>" +
				"</li>";
		});

		html +=
			"</ul>" +
			"<p class='petit'>Entre chaque tour : 1 min 30 de repos.</p>" +
			"<button class='btn-secondaire' data-minuteur='90'>Repos 1 min 30</button> " +
			"<p class='petit'>" + ETIREMENTS + "</p>" +
			(dejaFaite
				? "<p class='bravo'>✅ Séance validée ! Tu peux être fier de toi.</p>"
				: "<button id='btn-valider' class='btn-principal'>Séance terminée ✅</button>");

		section.innerHTML = html;

		// Quand on coche un exercice, on s'en souvient
		section.querySelectorAll("input[type=checkbox]").forEach(function (caseACocher) {
			caseACocher.addEventListener("change", function () {
				const cochees = [];
				section.querySelectorAll("input[type=checkbox]:checked").forEach(function (c) {
					cochees.push(Number(c.dataset.index));
				});
				donnees.coches = {}; // on ne garde que les cases d'aujourd'hui
				donnees.coches[aujourdhuiTexte] = cochees;
				sauvegarder();
			});
		});

		section.querySelector("[data-minuteur]").addEventListener("click", function () {
			lancerMinuteur(90);
		});
	}

	const bouton = document.getElementById("btn-valider");
	if (bouton) {
		bouton.addEventListener("click", function () {
			validerJour(plan.type === "seance" ? "complete" : "repos");
			section.insertAdjacentHTML("beforeend", "<p class='bravo'>" + messageBravo() + "</p>");
		});
	}
}

function validerJour(type) {
	if (!donnees.faites[aujourdhuiTexte] || donnees.faites[aujourdhuiTexte] === "mini") {
		donnees.faites[aujourdhuiTexte] = type;
	}
	sauvegarder();
	toutAfficher();
}

function messageBravo() {
	const messages = [
		"🎉 Bravo ! Une séance de plus dans la poche.",
		"💪 Énorme ! Ton toi du futur te remercie.",
		"🔥 La série continue, ne lâche rien !",
		"👏 Tu l'as fait alors que tu aurais pu ne rien faire. Respect.",
		"🚀 Chaque séance te rapproche de ton objectif."
	];
	return messages[Math.floor(Math.random() * messages.length)];
}

// ---------- Le conseil du jour ----------

let indexConseil = Math.floor(texteVersDate(aujourdhuiTexte).getTime() / MS_PAR_JOUR) % CONSEILS.length;

function afficherConseil() {
	document.getElementById("conseil-texte").textContent = CONSEILS[indexConseil];
}

document.getElementById("btn-autre-conseil").addEventListener("click", function () {
	indexConseil = (indexConseil + 1) % CONSEILS.length;
	afficherConseil();
});

// ---------- Le programme complet ----------

function afficherProgrammeComplet() {
	let html = "";
	["A", "B", "C"].forEach(function (lettre) {
		const seance = SEANCES[lettre];
		const jour = Object.keys(PLANNING).find(function (j) { return PLANNING[j].seance === lettre; });
		html +=
			"<details><summary>" + seance.emoji + " " + JOURS[jour] + " – " + seance.nom + "</summary>" +
			"<div class='tableau'><table><tr><th>Exercice</th><th>S1-2</th><th>S3-4</th><th>S5-6</th><th>S7-8</th></tr>";
		seance.exercices.forEach(function (exo) {
			html += "<tr><td>" + exo.nom + "</td><td>" + exo.reps.join("</td><td>") + "</td></tr>";
		});
		html += "<tr><td><em>Tours</em></td><td>" + TOURS.join("</td><td>") + "</td></tr></table></div></details>";
	});
	document.getElementById("programme-complet").innerHTML = html;
}

// ---------- Le minuteur ----------

let intervalle = null;

function lancerMinuteur(secondes) {
	clearInterval(intervalle);
	const boite = document.getElementById("minuteur");
	const affichage = document.getElementById("minuteur-temps");
	let restant = secondes;
	boite.hidden = false;

	function maj() {
		const min = Math.floor(restant / 60);
		const sec = String(restant % 60).padStart(2, "0");
		affichage.textContent = min + ":" + sec;
	}
	maj();

	intervalle = setInterval(function () {
		restant--;
		maj();
		if (restant <= 0) {
			clearInterval(intervalle);
			bip();
			affichage.textContent = "C'est reparti ! 💥";
			setTimeout(function () { boite.hidden = true; }, 3000);
		}
	}, 1000);
}

function bip() {
	try {
		const audio = new AudioContext();
		const son = audio.createOscillator();
		son.frequency.value = 880;
		son.connect(audio.destination);
		son.start();
		son.stop(audio.currentTime + 0.4);
	} catch (e) {}
	if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

document.getElementById("minuteur-stop").addEventListener("click", function () {
	clearInterval(intervalle);
	document.getElementById("minuteur").hidden = true;
});

// ---------- Le bouton anti-flemme ----------

document.getElementById("btn-flemme").addEventListener("click", function () {
	document.getElementById("flemme-contenu").hidden = false;
	this.hidden = true;
});

document.getElementById("btn-minuteur-flemme").addEventListener("click", function () {
	lancerMinuteur(5 * 60);
});

document.getElementById("btn-mini-faite").addEventListener("click", function () {
	if (!donnees.faites[aujourdhuiTexte]) validerJour("mini");
	document.getElementById("flemme-message").textContent =
		"🙌 Tu vois, tu l'as fait ! Même 5 minutes, ça garde ta série en vie. Et si tu te sens chaud, lance la vraie séance au-dessus 😉";
});

// ---------- Recommencer ----------

document.getElementById("btn-reset").addEventListener("click", function () {
	if (confirm("Tu es sûr ? Toutes tes séances enregistrées seront effacées.")) {
		donnees = { debut: dateTexte(lundiDe(new Date())), premierJour: dateTexte(new Date()), faites: {}, coches: {} };
		sauvegarder();
		toutAfficher();
	}
});

// ---------- On affiche tout ----------

function toutAfficher() {
	document.getElementById("date-du-jour").textContent =
		JOURS[aujourdhui.getDay()] + " " + aujourdhui.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
	afficherStats();
	afficherSemaine();
	afficherSeanceDuJour();
}

toutAfficher();
afficherConseil();
afficherProgrammeComplet();
