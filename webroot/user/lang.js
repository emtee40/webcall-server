// WebCall Copyright 2023 timur.mobi. All rights reserved.
var langMap = {
"de": {
	"dialButton"		: "Anwählen",
	"hangupButton"		: "Auflegen",
	"greetingMessage"	: "Gruß-Nachricht (optional):",
	"connectingText"	: "Verbinde P2P...",
	"ringingText"		: "Klingeln...",
	"hangingUpText"		: "Auflegen...",
	"msgbox"			: "(Deine Nachricht)",
	"nicknameLabel"		: "Rufname:",
	"callstatsLabel"	: "Anruf Daten",
	"fullscreenLabel"	: "Vollschirm",
	"notAvailable"		: "Nicht verfügbar",
},
"fr": {
	"dialButton"		: "Composer",
	"hangupButton"		: "Déconnexion",
	"greetingMessage"	: "Message d'accueil (optionnel):",
	"connectingText"	: "Connexion P2P...",
	"ringingText"		: "Sonnerie...",
	"hangingUpText"		: "Raccrocher...",
	"msgbox"			: "(Votre message)",
	"nicknameLabel"		: "Surnom:",
	"callstatsLabel"	: "Statistiques d'appels",
	"fullscreenLabel"	: "Plein écran",
	"notAvailable"		: "non disponible",
},
"pt-BR": {
	"dialButton"		: "Chamar",
	"hangupButton"		: "Desligar",
	"greetingMessage"	: "Mensagem de saudação (opcional):",
	"connectingText"	: "Conectando P2P...",
	"ringingText"		: "Tocando...",
	"hangingUpText"		: "Desligando...",
	"msgbox"			: "(Sua mensagem)",
	"nicknameLabel"		: "Apelido:",
	"callstatsLabel"	: "Estatísticas de chamada",
	"fullscreenLabel"	: "Tela cheia",
	"notAvailable"		: "não Disponível",
}};

function switchLanguage(userLang) {
	console.log("switchLanguage: "+userLang);
	let shortLang = userLang;
	let mainLang = shortLang;
	let myLang = langMap[userLang];
	if(typeof myLang == "undefined" || myLang==null) {
		let idxDash = userLang.indexOf("-");
		if(idxDash>0) {
			shortLang = userLang.substring(0,idxDash);
			console.log("try shortLang: "+shortLang);
			myLang = langMap[shortLang];
		}
		if(typeof myLang == "undefined" || myLang==null) {
			mainLang = shortLang+"-"+
					shortLang.charAt(0).toUpperCase()+shortLang.charAt(1).toUpperCase();
			console.log("try mainLang: "+mainLang);
			myLang = langMap[mainLang];
		}
	}
	if(typeof myLang == "undefined" || myLang==null) {
		console.log("# no support for "+userLang+"/"+shortLang+"/"+mainLang);
		return;
	}

	console.log("myLang",myLang);

	let str = myLang["dialButton"];
	if(typeof str !== "undefined" && str!="") {
		dialButton.innerHTML = str;
	}

	str = myLang["hangupButton"];
	if(typeof str !== "undefined" && str!="") {
		hangupButton.innerHTML = str;
	}

	str = myLang["greetingMessage"];
	if(typeof str !== "undefined" && str!="") {
		greetingMessage = str;
	}

	str = myLang["connectingText"];
	if(typeof str !== "undefined" && str!="") {
		connectingText = str;
	}

	str = myLang["ringingText"];
	if(typeof str !== "undefined" && str!="") {
		ringingText = str;
	}

	str = myLang["hangingUpText"];
	if(typeof str !== "undefined" && str!="") {
		hangingUpText = str;
	}

	str = myLang["msgbox"];
	if(typeof str !== "undefined" && str!="") {
		if(msgbox) msgbox.placeholder = str;
	}

	str = myLang["nicknameLabel"];
	if(typeof str !== "undefined" && str!="") {
		let nicknameLabel = document.getElementById("nicknameLabel");
		if(nicknameLabel) nicknameLabel.innerHTML = str;
	}

	str = myLang["callstatsLabel"];
	if(typeof str !== "undefined" && str!="") {
		callStatsTitle = str;
		let callstatsLabel = document.getElementById("callstats");
		if(callstatsLabel) callstatsLabel.innerHTML = callStatsTitle;
		// TODO must also change title of opened iframe "Call Statistics" in client.js
		// as well as 'No call stats available' in client.js
	}

	str = myLang["fullscreenLabel"];
	if(typeof str !== "undefined" && str!="") {
		let fullscreenLabel = document.getElementById("fullscreen");
		//console.log("fullscreenLabel=",fullscreenLabel.labels[0]);
		//if(fullscreenLabel) fullscreenLabel.value = str;
		if(fullscreenLabel) fullscreenLabel.labels[0].innerText = str;
	}

	str = myLang["notAvailable"];
	if(typeof str !== "undefined" && str!="") {
		notAvailable = str;
	}
}

