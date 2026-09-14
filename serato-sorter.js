/*
  Trieur de musique pour Serato DJ Pro
  -------------------------------------
  Tout se passe dans le navigateur : les fichiers audio ne sont jamais envoyés
  sur un serveur. On lit uniquement le début (et la toute fin) de chaque
  fichier pour en extraire les tags ID3 (titre, artiste, album, genre,
  année, BPM, clé).
*/

/* ---------- Liste des genres ID3v1 (pour les vieux fichiers taggés en numérique) ---------- */
const ID3V1_GENRES = [
	"Blues","Classic Rock","Country","Dance","Disco","Funk","Grunge","Hip-Hop","Jazz","Metal",
	"New Age","Oldies","Other","Pop","R&B","Rap","Reggae","Rock","Techno","Industrial",
	"Alternative","Ska","Death Metal","Pranks","Soundtrack","Euro-Techno","Ambient","Trip-Hop","Vocal","Jazz+Funk",
	"Fusion","Trance","Classical","Instrumental","Acid","House","Game","Sound Clip","Gospel","Noise",
	"AlternRock","Bass","Soul","Punk","Space","Meditative","Instrumental Pop","Instrumental Rock","Ethnic","Gothic",
	"Darkwave","Techno-Industrial","Electronic","Pop-Folk","Eurodance","Dream","Southern Rock","Comedy","Cult","Gangsta",
	"Top 40","Christian Rap","Pop/Funk","Jungle","Native US","Cabaret","New Wave","Psychedelic","Rave","Showtunes",
	"Trailer","Lo-Fi","Tribal","Acid Punk","Acid Jazz","Polka","Retro","Musical","Rock & Roll","Hard Rock",
	"Folk","Folk-Rock","National Folk","Swing","Fast Fusion","Bebop","Latin","Revival","Celtic","Bluegrass",
	"Avantgarde","Gothic Rock","Progressive Rock","Psychedelic Rock","Symphonic Rock","Slow Rock","Big Band","Chorus","Easy Listening","Acoustic",
	"Humour","Speech","Chanson","Opera","Chamber Music","Sonata","Symphony","Booty Bass","Primus","Porn Groove",
	"Satire","Slow Jam","Club","Tango","Samba","Folklore","Ballad","Power Ballad","Rhythmic Soul","Freestyle",
	"Duet","Punk Rock","Drum Solo","A Cappella","Euro-House","Dance Hall"
];

/* Extensions dont on sait lire les tags (ID3v2/ID3v1, format MP3). Les autres formats
   sont acceptés dans la liste mais sans lecture de tags (limitation connue du MVP). */
const MP3_EXTENSIONS = new Set(["mp3"]);
const SUPPORTED_AUDIO_EXTENSIONS = new Set(["mp3", "wav", "aiff", "aif", "m4a", "flac", "ogg"]);

/* ---------- Etat de l'application ---------- */
let tracks = [];          // { id, file, title, artist, album, genre, year, bpm, key, filename, size, tagsRead, dupKey }
let nextTrackId = 1;
let crates = {};          // { name: [ {title, artist, album, genre, year, bpm, key, filename, size} , ... ] }
let activeCrate = null;
let sortState = { column: "title", direction: "asc" };

/* ---------- Utilitaires ---------- */

function fileExtension(name) {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function formatSize(bytes) {
	if (bytes < 1024) return bytes + " o";
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
	return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
}

function normalizeForDup(str) {
	return (str || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function escapeHtml(str) {
	const div = document.createElement("div");
	div.textContent = str == null ? "" : String(str);
	return div.innerHTML;
}

function sanitizeFilename(name) {
	const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, ""); // enlève les accents
	const safe = ascii.replace(/[\\/:*?"<>|]/g, "_").trim();
	return safe || "crate";
}

function downloadBlob(filename, content, mime) {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/* ---------- Lecture des tags ID3 ---------- */

function readSynchsafeInt(bytes, offset) {
	return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) |
	       ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function readInt32(bytes, offset) {
	return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function decodeId3Text(bytes) {
	if (bytes.length === 0) return "";
	const encoding = bytes[0];
	let body = bytes.subarray(1);
	let text = "";
	try {
		if (encoding === 0) {
			text = new TextDecoder("iso-8859-1").decode(body);
		} else if (encoding === 3) {
			text = new TextDecoder("utf-8").decode(body);
		} else {
			// encoding 1 = UTF-16 with BOM, encoding 2 = UTF-16BE without BOM
			let le = true;
			if (encoding === 1 && body.length >= 2) {
				if (body[0] === 0xff && body[1] === 0xfe) { le = true; body = body.subarray(2); }
				else if (body[0] === 0xfe && body[1] === 0xff) { le = false; body = body.subarray(2); }
			} else if (encoding === 2) {
				le = false;
			}
			text = new TextDecoder(le ? "utf-16le" : "utf-16be").decode(body);
		}
	} catch (e) {
		text = "";
	}
	// Les frames multi-valeurs (ID3v2.4) séparent les valeurs par des \0
	return text.split("\0").map(s => s.trim()).filter(Boolean).join(", ").replace(/\0/g, "").trim();
}

function parseGenreValue(raw) {
	if (!raw) return "";
	// Ancien format : "(17)" ou "(17)Rock"
	const match = raw.match(/^\((\d+)\)(.*)$/);
	if (match) {
		const idx = parseInt(match[1], 10);
		const rest = match[2].trim();
		if (rest) return rest;
		return ID3V1_GENRES[idx] || raw;
	}
	if (/^\d+$/.test(raw.trim())) {
		const idx = parseInt(raw.trim(), 10);
		return ID3V1_GENRES[idx] || raw;
	}
	return raw;
}

function parseId3v2(bytes) {
	const result = {};
	if (bytes.length < 10) return result;
	if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return result; // "ID3"
	const majorVersion = bytes[3];
	const tagSize = readSynchsafeInt(bytes, 6);
	const end = Math.min(bytes.length, 10 + tagSize);

	if (majorVersion === 2) {
		// ID3v2.2 : identifiants sur 3 caractères, tailles sur 3 octets
		let offset = 10;
		const map = { TT2: "title", TP1: "artist", TAL: "album", TCO: "genre", TYE: "year", TBP: "bpm", TKE: "key" };
		while (offset + 6 <= end) {
			const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
			if (id === "\0\0\0") break;
			const size = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
			const dataStart = offset + 6;
			if (size <= 0 || dataStart + size > bytes.length) break;
			const field = map[id];
			if (field) {
				const value = decodeId3Text(bytes.subarray(dataStart, dataStart + size));
				result[field] = field === "genre" ? parseGenreValue(value) : value;
			}
			offset = dataStart + size;
		}
		return result;
	}

	// ID3v2.3 / ID3v2.4 : identifiants sur 4 caractères, en-tête de frame sur 10 octets
	let offset = 10;
	const map = { TIT2: "title", TPE1: "artist", TALB: "album", TCON: "genre", TYER: "year", TDRC: "year", TBPM: "bpm", TKEY: "key" };
	while (offset + 10 <= end) {
		const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
		if (id === "\0\0\0\0") break;
		const size = majorVersion >= 4 ? readSynchsafeInt(bytes, offset + 4) : readInt32(bytes, offset + 4);
		const dataStart = offset + 10;
		if (size <= 0 || dataStart + size > bytes.length) break;
		const field = map[id];
		if (field) {
			const value = decodeId3Text(bytes.subarray(dataStart, dataStart + size));
			if (field === "genre") result.genre = parseGenreValue(value);
			else if (field === "year" && !result.year) result.year = (value.match(/\d{4}/) || [value])[0];
			else result[field] = value;
		}
		offset = dataStart + size;
	}
	return result;
}

function parseId3v1(bytes) {
	const result = {};
	if (bytes.length < 128) return result;
	const start = bytes.length - 128;
	if (String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2]) !== "TAG") return result;
	const latin1 = new TextDecoder("iso-8859-1");
	const field = (o, l) => latin1.decode(bytes.subarray(start + o, start + o + l)).replace(/\0+$/, "").trim();
	result.title = field(3, 30);
	result.artist = field(33, 30);
	result.album = field(63, 30);
	result.year = field(93, 4);
	const genreByte = bytes[start + 127];
	result.genre = ID3V1_GENRES[genreByte] || "";
	return result;
}

async function readTags(file) {
	const ext = fileExtension(file.name);
	const base = { title: file.name.replace(/\.[^.]+$/, ""), artist: "", album: "", genre: "", year: "", bpm: "", key: "", tagsRead: false };
	if (!MP3_EXTENSIONS.has(ext)) {
		return base; // formats non pris en charge pour l'instant : on garde juste le nom de fichier
	}
	try {
		const headerSlice = file.slice(0, Math.min(file.size, 1024 * 1024));
		const headerBytes = new Uint8Array(await headerSlice.arrayBuffer());
		const v2 = parseId3v2(headerBytes);

		let v1 = {};
		if (file.size >= 128) {
			const tailBytes = new Uint8Array(await file.slice(file.size - 128, file.size).arrayBuffer());
			v1 = parseId3v1(tailBytes);
		}

		const merged = {
			title: v2.title || v1.title || base.title,
			artist: v2.artist || v1.artist || "",
			album: v2.album || v1.album || "",
			genre: v2.genre || v1.genre || "",
			year: v2.year || v1.year || "",
			bpm: v2.bpm || "",
			key: v2.key || "",
			tagsRead: true
		};
		return merged;
	} catch (e) {
		return base;
	}
}

/* ---------- Chargement des fichiers ---------- */

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const progressEl = document.getElementById("load-progress");
const tbody = document.getElementById("track-tbody");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const genreFilter = document.getElementById("genre-filter");
const bpmMinInput = document.getElementById("bpm-min");
const bpmMaxInput = document.getElementById("bpm-max");
const dupOnlyCheckbox = document.getElementById("dup-only");
const trackCountEl = document.getElementById("track-count");
const cratesListEl = document.getElementById("crates-list");
const crateDetailEl = document.getElementById("crate-detail");
const newCrateForm = document.getElementById("new-crate-form");
const newCrateNameInput = document.getElementById("new-crate-name");
const addToCrateBtn = document.getElementById("add-to-crate-btn");
const activeCrateSelect = document.getElementById("active-crate-select");

["dragenter", "dragover"].forEach(evt => {
	dropZone.addEventListener(evt, e => {
		e.preventDefault();
		dropZone.classList.add("drag-over");
	});
});
["dragleave", "drop"].forEach(evt => {
	dropZone.addEventListener(evt, e => {
		e.preventDefault();
		dropZone.classList.remove("drag-over");
	});
});
dropZone.addEventListener("drop", e => {
	handleFiles(e.dataTransfer.files);
});
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

async function handleFiles(fileList) {
	const files = Array.from(fileList).filter(f => SUPPORTED_AUDIO_EXTENSIONS.has(fileExtension(f.name)));
	if (files.length === 0) return;

	progressEl.hidden = false;
	let done = 0;
	progressEl.textContent = `Analyse des fichiers : 0 / ${files.length}`;

	for (const file of files) {
		const tags = await readTags(file);
		tracks.push({
			id: nextTrackId++,
			file,
			filename: file.name,
			size: file.size,
			...tags
		});
		done++;
		progressEl.textContent = `Analyse des fichiers : ${done} / ${files.length}`;
	}

	progressEl.hidden = true;
	fileInput.value = "";
	computeDuplicates();
	refreshGenreFilterOptions();
	renderTable();
}

/* ---------- Doublons ---------- */

function computeDuplicates() {
	const groups = new Map();
	for (const t of tracks) {
		const key = normalizeForDup(t.title) + "|" + normalizeForDup(t.artist);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(t);
	}
	for (const t of tracks) t.dupKey = null;
	for (const [key, group] of groups) {
		if (group.length > 1 && (normalizeForDup(key) !== "|")) {
			for (const t of group) t.dupKey = key;
		}
	}
}

/* ---------- Filtres / tri / rendu du tableau ---------- */

function refreshGenreFilterOptions() {
	const current = genreFilter.value;
	const genres = Array.from(new Set(tracks.map(t => t.genre).filter(Boolean))).sort((a, b) => a.localeCompare(b));
	genreFilter.innerHTML = '<option value="">Tous les genres</option>' +
		genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
	if (genres.includes(current)) genreFilter.value = current;
}

function getFilteredSortedTracks() {
	const search = searchInput.value.trim().toLowerCase();
	const genre = genreFilter.value;
	const bpmMin = parseFloat(bpmMinInput.value);
	const bpmMax = parseFloat(bpmMaxInput.value);
	const dupOnly = dupOnlyCheckbox.checked;

	let list = tracks.filter(t => {
		if (search) {
			const hay = `${t.title} ${t.artist} ${t.album}`.toLowerCase();
			if (!hay.includes(search)) return false;
		}
		if (genre && t.genre !== genre) return false;
		if (!isNaN(bpmMin) && (parseFloat(t.bpm) || 0) < bpmMin) return false;
		if (!isNaN(bpmMax) && (parseFloat(t.bpm) || Infinity) > bpmMax) return false;
		if (dupOnly && !t.dupKey) return false;
		return true;
	});

	const { column, direction } = sortState;
	list.sort((a, b) => {
		let va = a[column], vb = b[column];
		if (column === "bpm" || column === "year" || column === "size") {
			va = parseFloat(va) || 0;
			vb = parseFloat(vb) || 0;
		} else {
			va = (va || "").toString().toLowerCase();
			vb = (vb || "").toString().toLowerCase();
		}
		if (va < vb) return direction === "asc" ? -1 : 1;
		if (va > vb) return direction === "asc" ? 1 : -1;
		return 0;
	});
	return list;
}

function renderTable() {
	const list = getFilteredSortedTracks();
	trackCountEl.textContent = `${list.length} / ${tracks.length} morceau(x)`;
	emptyState.hidden = tracks.length !== 0;

	tbody.innerHTML = list.map(t => `
		<tr class="${t.dupKey ? "dup-row" : ""}" data-id="${t.id}">
			<td><input type="checkbox" class="row-check" data-id="${t.id}"></td>
			<td>${escapeHtml(t.title)}${t.dupKey ? '<span class="dup-badge" title="Doublon probable">Doublon</span>' : ""}</td>
			<td>${escapeHtml(t.artist)}</td>
			<td>${escapeHtml(t.album)}</td>
			<td>${escapeHtml(t.genre)}</td>
			<td>${escapeHtml(t.year)}</td>
			<td>${escapeHtml(t.bpm)}</td>
			<td>${escapeHtml(t.key)}</td>
			<td class="filename-cell" title="${escapeHtml(t.filename)}">${escapeHtml(t.filename)}</td>
			<td>${formatSize(t.size)}</td>
			<td><button class="remove-btn" data-id="${t.id}" title="Retirer de la liste">✕</button></td>
		</tr>
	`).join("");

	document.querySelectorAll(".remove-btn").forEach(btn => {
		btn.addEventListener("click", () => {
			const id = parseInt(btn.dataset.id, 10);
			tracks = tracks.filter(t => t.id !== id);
			computeDuplicates();
			refreshGenreFilterOptions();
			renderTable();
		});
	});
}

document.querySelectorAll("th[data-sort]").forEach(th => {
	th.addEventListener("click", () => {
		const column = th.dataset.sort;
		if (sortState.column === column) {
			sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
		} else {
			sortState = { column, direction: "asc" };
		}
		document.querySelectorAll("th[data-sort]").forEach(h => h.classList.remove("sort-asc", "sort-desc"));
		th.classList.add(sortState.direction === "asc" ? "sort-asc" : "sort-desc");
		renderTable();
	});
});

[searchInput, genreFilter, bpmMinInput, bpmMaxInput, dupOnlyCheckbox].forEach(el => {
	el.addEventListener("input", renderTable);
});

document.getElementById("clear-all-btn").addEventListener("click", () => {
	if (tracks.length && !confirm("Vider toute la liste de morceaux chargés ? (les crates enregistrées ne sont pas touchées)")) return;
	tracks = [];
	renderTable();
	refreshGenreFilterOptions();
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
	const list = getFilteredSortedTracks();
	const header = ["Titre", "Artiste", "Album", "Genre", "Année", "BPM", "Clé", "Fichier", "Taille (o)"];
	const rows = list.map(t => [t.title, t.artist, t.album, t.genre, t.year, t.bpm, t.key, t.filename, t.size]);
	const csv = [header, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
	downloadBlob("bibliotheque-serato.csv", "﻿" + csv, "text/csv;charset=utf-8");
});

function csvEscape(value) {
	const s = value == null ? "" : String(value);
	return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ---------- Crates ---------- */

function loadCratesFromStorage() {
	try {
		const raw = localStorage.getItem("serato-sorter-crates");
		crates = raw ? JSON.parse(raw) : {};
	} catch (e) {
		crates = {};
	}
}

function saveCratesToStorage() {
	localStorage.setItem("serato-sorter-crates", JSON.stringify(crates));
}

function trackDescriptor(t) {
	return { title: t.title, artist: t.artist, album: t.album, genre: t.genre, year: t.year, bpm: t.bpm, key: t.key, filename: t.filename, size: t.size };
}

function renderCratesList() {
	const names = Object.keys(crates).sort((a, b) => a.localeCompare(b));
	cratesListEl.innerHTML = names.length
		? names.map(name => `
			<li class="${name === activeCrate ? "active" : ""}" data-name="${escapeHtml(name)}">
				<span class="crate-name">${escapeHtml(name)}</span>
				<span class="crate-count">${crates[name].length}</span>
				<button class="delete-crate-btn" data-name="${escapeHtml(name)}" title="Supprimer le crate">✕</button>
			</li>
		`).join("")
		: `<li class="crate-empty">Aucun crate pour l'instant</li>`;

	activeCrateSelect.innerHTML = '<option value="">— choisir un crate —</option>' +
		names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
	if (activeCrate) activeCrateSelect.value = activeCrate;

	document.querySelectorAll("#crates-list li[data-name]").forEach(li => {
		li.addEventListener("click", e => {
			if (e.target.classList.contains("delete-crate-btn")) return;
			activeCrate = li.dataset.name;
			renderCratesList();
			renderCrateDetail();
		});
	});
	document.querySelectorAll(".delete-crate-btn").forEach(btn => {
		btn.addEventListener("click", e => {
			e.stopPropagation();
			const name = btn.dataset.name;
			if (!confirm(`Supprimer le crate "${name}" ?`)) return;
			delete crates[name];
			if (activeCrate === name) activeCrate = null;
			saveCratesToStorage();
			renderCratesList();
			renderCrateDetail();
		});
	});
}

function renderCrateDetail() {
	if (!activeCrate || !crates[activeCrate]) {
		crateDetailEl.innerHTML = `<p class="muted">Sélectionnez ou créez un crate pour voir son contenu.</p>`;
		return;
	}
	const items = crates[activeCrate];
	crateDetailEl.innerHTML = `
		<h3>${escapeHtml(activeCrate)} <span class="crate-count">${items.length} morceau(x)</span></h3>
		<div class="crate-actions">
			<button id="export-m3u-btn">Exporter en playlist (.m3u8)</button>
		</div>
		<ul class="crate-track-list">
			${items.map((t, i) => `
				<li>
					<span>${escapeHtml(t.title)} — ${escapeHtml(t.artist || "Artiste inconnu")}</span>
					<button class="remove-from-crate-btn" data-index="${i}" title="Retirer du crate">✕</button>
				</li>
			`).join("")}
		</ul>
	`;
	document.getElementById("export-m3u-btn").addEventListener("click", () => exportCrateAsM3U(activeCrate));
	document.querySelectorAll(".remove-from-crate-btn").forEach(btn => {
		btn.addEventListener("click", () => {
			const idx = parseInt(btn.dataset.index, 10);
			crates[activeCrate].splice(idx, 1);
			saveCratesToStorage();
			renderCratesList();
			renderCrateDetail();
		});
	});
}

function exportCrateAsM3U(name) {
	const items = crates[name];
	const lines = ["#EXTM3U"];
	for (const t of items) {
		const artistTitle = `${t.artist || "Artiste inconnu"} - ${t.title}`;
		lines.push(`#EXTINF:-1,${artistTitle}`);
		lines.push(t.filename);
	}
	downloadBlob(`${sanitizeFilename(name)}.m3u8`, lines.join("\r\n"), "audio/x-mpegurl;charset=utf-8");
}

newCrateForm.addEventListener("submit", e => {
	e.preventDefault();
	const name = newCrateNameInput.value.trim();
	if (!name) return;
	if (!crates[name]) crates[name] = [];
	activeCrate = name;
	newCrateNameInput.value = "";
	saveCratesToStorage();
	renderCratesList();
	renderCrateDetail();
});

activeCrateSelect.addEventListener("change", () => {
	activeCrate = activeCrateSelect.value || null;
	renderCratesList();
	renderCrateDetail();
});

addToCrateBtn.addEventListener("click", () => {
	if (!activeCrate) {
		alert("Choisissez d'abord un crate (ou créez-en un) dans le panneau de droite.");
		return;
	}
	const checked = Array.from(document.querySelectorAll(".row-check:checked")).map(cb => parseInt(cb.dataset.id, 10));
	if (checked.length === 0) {
		alert("Cochez au moins un morceau dans le tableau.");
		return;
	}
	const selectedTracks = tracks.filter(t => checked.includes(t.id));
	crates[activeCrate].push(...selectedTracks.map(trackDescriptor));
	saveCratesToStorage();
	renderCratesList();
	renderCrateDetail();
});

/* ---------- Initialisation ---------- */

loadCratesFromStorage();
renderCratesList();
renderCrateDetail();
renderTable();
