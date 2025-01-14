// WebCall Copyright 2023 timur.mobi. All rights reserved.
// callee.js for 4.0.0
'use strict';
const dialButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const calleeOnlineElement = document.getElementById("calleeOnline");
const chatButtonLabel = document.getElementById("chatButtonlabel");
const enterIdElement = document.getElementById('enterId');
const enterIdValElement = document.getElementById('enterIdVal');
const enterIdClearElement = document.getElementById("enterIdClear");
const enterDomainValElement = document.getElementById('enterDomainVal');
const enterDomainClearElement = document.getElementById("enterDomainClear");
const divspinnerframe = document.querySelector('div#spinnerframe');
const numericIdLabel = document.querySelector('label#numericIdLabel');
const numericIdCheckbox = document.querySelector('input#numericId');
const enterTextElement = document.getElementById('enterText');
const codecPreferences = document.querySelector('#codecPreferences');
const titleElement = document.getElementById('title');
const textbox = document.getElementById('textbox');
const timerElement = document.querySelector('div#timer');
const bottomElement = document.getElementById("bottom");
const addinfoElement = document.getElementById("addinfo");
const answerButtonsElement = document.getElementById("answerButtons");
const nicknameElement = document.getElementById("nickname");
// idSelect element on the main dialer page
const idSelectLabelElement = document.getElementById("idSelectLabel")
// idSelect element on the DialID page (with domain name form)
const idSelect2LabelElement = document.getElementById("idSelect2Label");
//const onlineIndicator = document.querySelector('img#onlineIndicator');
const calleeMode = false;
const msgBoxMaxLen = 137;

var connectingText = "Connecting P2P...";
var notificationSound = null;
var dtmfDialingSound = null;
var busySignalSound = null;
var wsConn = null;
var peerCon = null;
var localDescription = null;
var rtcConnect = false;
var rtcConnectStartDate = 0;
var earlyRing = false;
var mediaConnectStartDate = 0;
var dataChannel = null;
var dialAfterLocalStream = false;
var dialAfterCalleeOnline = false;
var lastResult;
var candidateArray = [];
var candidateResultGenerated = true;
var candidateResultString = "";
var wsAddr = "";
var wsAddrTime;
// in caller.js 'calleeID' is the id being called
// note that the one making the call may also be a callee (is awaiting calls in parallel and has a cookie!)
var callerId = "";    // this is the callers callback ID (from urlArg, cookie, or idSelect)
var callerIdArg = ""  // this is the callers callback ID (from urlArg only)
var cookieName = "";  // this is the callers ID
var callerHost = "";  // this is the callers home webcall server
var callerName = "";  // this is the callers nickname
var contactName = ""; // this is the callees nickname (from caller contacts or from dial-id form)
var otherUA="";
var sessionDuration = 0;
var iframeParent;
var iframeParentArg="";
var fileReceiveBuffer = [];
var fileReceivedSize = 0;
var fileName = "";
var fileSize = 0;
var fileReceiveStartDate=0;
var fileReceiveSinceStartSecs=0;
var fileSendAbort=false;
var fileReceiveAbort=false;
var goodbyMissedCall="";
var goodbyTextMsg=""
var goodbyDone = false;
var haveBeenWaitingForCalleeOnline=false;
var lastOnlineStatus = "";
var contactAutoStore = false;
var counter=0;
var altIdCount = 0;
var idSelectElement = null;
var newline = String.fromCharCode(13, 10);
var textchatOKfromOtherSide = false;
var placeholderText = "";
var	muteMicModified = false;
var willShowPostCall = "Data will be available after you have made a call";
var serverSettings = null;

var extMessage = function(e) {
	// prevent an error on split() below when extensions emit unrelated, non-string 'message' events to the window
	if(typeof e.data !== 'string') {
		return;
	}
	var data = e.data.split(':')
	var action = data[0];
	var actionArg = data[1];
	gLog("client extMessage action",action,actionArg);
	if(action == "reqActiveNotification") {
		gLog("client extMessage reqActiveNotification",actionArg);
		if(iframeParentArg=="occured") {
			// onlineStatus has alrady arrived
			e.source.postMessage("activeNotification:"+actionArg);
		} else {
			// if callee=online, calleeOnlineStatus() will post msg "activeNotification:"+iframeParentArg
			iframeParent = e.source;
			iframeParentArg = actionArg;
		}
	}
}
window.addEventListener('message', extMessage, false); 
gLog("caller now listening for extMessage");

function languageDefaults() {
	let str = lg("dialButton");
	if(typeof str !== "undefined" && str!="") {
		dialButton.innerHTML = str;
	}

	str = lg("hangupButton");
	if(typeof str !== "undefined" && str!="") {
		hangupButton.innerHTML = str;
	}

	str = lg("connectingText");
	if(typeof str !== "undefined" && str!="") {
		connectingText = str;
	}

//	str = lg("msgbox");
	str = lg("greetingMessage");
	if(typeof str !== "undefined" && str!="") {
		placeholderText = str;
		msgbox.placeholder = placeholderText;
	}

	str = lg("nicknameLabel");
	if(typeof str !== "undefined" && str!="") {
		let nicknameLabel = document.getElementById("nicknameLabel");
		if(nicknameLabel) nicknameLabel.innerHTML = str;
	}

	str = lg("callstatsLabel");
	if(typeof str !== "undefined" && str!="") {
		callStatsTitle = str;
		let callstatsLabel = document.getElementById("callstats");
		if(callstatsLabel) callstatsLabel.innerHTML = callStatsTitle;
		// TODO must also change title of opened iframe "Call Statistics" in client.js
		// as well as 'No call stats available' in client.js
	}

	str = lg("fullscreenLabel");
	if(typeof str !== "undefined" && str!="") {
		let fullscreenLabel = document.getElementById("fullscreen");
		//console.log("fullscreenLabel=",fullscreenLabel.labels[0]);
		//if(fullscreenLabel) fullscreenLabel.value = str;
		if(fullscreenLabel) fullscreenLabel.labels[0].innerText = str;
	}

	str = lg("willShowPostCall");
	if(typeof str !== "undefined" && str!="") {
		willShowPostCall = str;
	}

	str = lg("micmuted");
	if(typeof str !== "undefined" && str!="") {
		let muteMiclabel = document.getElementById("muteMiclabel");
		if(muteMiclabel) muteMiclabel.innerHTML = str;
	}
}

function iframeChild() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

window.onload = function() {
	console.log("caller onload iframeChild="+iframeChild());
	switchLanguage(navigator.language || navigator.userLanguage);
	languageDefaults();

	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		//goOnlineButton.disabled = true;
		//goOfflineButton.disabled = true;
		alert("navigator.mediaDevices not available");
		return;
	}

	window.onhashchange = hashchange;
	window.onbeforeunload = goodby;
	goodbyMissedCall = "";
	goodbyTextMsg = "";

	let dbg = getUrlParams("dbg",true);
	if(typeof dbg!=="undefined" && dbg!="" && dbg!="undefined") {
		gentle = false;
		console.log("dbgmode on");
	}

	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="" && id!="undefined") {
		calleeID = cleanStringParameter(id,true);
	}

	// if on start there is a fragment/hash ('#') in the URL, remove it
	if(location.hash.length > 0) {
		gLog("location.hash.length=%d",location.hash.length);
		window.location.replace("/user/"+calleeID);
		return;
	}

	// if caller is started with ?text=true -> check muteMicElement
	let text = getUrlParams("text");
	if(typeof text!=="undefined" && text!="" && text!="undefined") {
		let textArg = cleanStringParameter(text,true);
		console.log("textmode "+textArg);
		if(textArg=="true") {
			// mic-mute by URL arg
			if(muteMicElement) {
				muteMicElement.checked = true;
			}
		}
	}
	
//	calleeOnlineElement.classList.add("disableElement");
//	msgboxdiv.classList.add("disableElement");
//	bottomElement.classList.add("disableElement");
//	calleeOnlineElement.style.display = "none";
//	msgboxdiv.style.display = "none";
//	bottomElement.style.display = "none";

//	if(addinfoElement) {
//		addinfoElement.innerHTML = "- ver:"+clientVersion;
//	}


	hangupButton.disabled = true;

	if(iframeChild()) {
		// display back-arrow in the upper left corner
		let arrowLeftElement = document.getElementById("arrowleft");
		if(arrowLeftElement!=null) {
			arrowLeftElement.style.display = "block";
		}
	}
	containerElement.style.display = "block";


	playDialSounds = true;
	let ds = getUrlParams("ds",true);
	if(typeof ds!=="undefined" && ds!="" && ds!="undefined") {
		if(ds=="false") {
			playDialSounds = false;
		}
		gLog("dialsounds="+playDialSounds);
	}

	if(localVideoFrame)
		localVideoFrame.onresize = showVideoResolutionLocal;
	if(remoteVideoFrame)
		remoteVideoFrame.onresize = showVideoResolutionRemote;

	let fullscreenDiv = document.getElementById('fullscreenDiv');
	if(typeof Android !== "undefined" && Android !== null) {
		fullscreenDiv.style.display = "none";
	}
//	if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
//		avSelect.style.display = "none";
//	}

	// requestFullscreen and exitFullscreen are not supported in iOS (will abort JS without err-msg)
	let ua = navigator.userAgent;
	if(ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
		fullscreenDiv.style.display = "none";
	}

	if(fullscreenCheckbox && fullscreenDiv.style.display!="none") {
		fullscreenCheckbox.addEventListener('change', function() {
			if(this.checked) {
				// user is requesting fullscreen mode
				if(!document.fullscreenElement) {
					// not yet in fullscreen mode
					if(mainElement.requestFullscreen) {
						// trigger fullscreen mode
						mainElement.requestFullscreen();
					}
				}
			} else {
				// user is requesting fullscreen exit
				// exitFullscreen not supported in iOS (iOS aborts JS without err-msg if exitFullscreen is called)
				document.exitFullscreen().catch(err => {
					console.log('fullscreenCheckbox exitFullscreen err='+err.message);
				});
			}
			setTimeout(function(){history.back();},150);
		});

		document.addEventListener('fullscreenchange', (event) => {
			if(document.fullscreenElement) {
				// we have switched to fullscreen mode
				fullscreenCheckbox.checked = true;
			} else {
				// we have left fullscreen mode
				fullscreenCheckbox.checked = false;
			}
		});
	}

	if(typeof numericIdCheckbox!=="undefined" && numericIdCheckbox!=null) {
		// numericIdCheckbox (activated for smartphones only) for switching input-type text/number
		let ua = navigator.userAgent;
		//console.log("navigator.userAgent=("+ua+")");
		if(ua.indexOf("Android")>=0 || ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
			// enable and activate numericIdCheckbox
			//console.log("numericIdCheckbox enable");
			numericIdCheckbox.checked = true;
			enterIdValElement.setAttribute('type','number');
			enterIdValElement.focus();
			numericIdLabel.style.display = "block";

			numericIdCheckbox.addEventListener('change', function() {
				if(enterIdValElement.readOnly) {
					return;
				}
				if(this.checked) {
					gLog("numericIdCheckbox checked");
					enterIdValElement.setAttribute('type','number');
				} else {
					gLog("numericIdCheckbox unchecked");
					enterIdValElement.setAttribute('type','text');
				}
				enterIdValElement.focus();
			});
		} else {
			// disable numericId checkbox: default to text-id input
			numericIdLabel.style.display = "none";
		}
	}

	if(window.self == window.top) {
		// not running in iframe mode
		//gLog("onload setup onkeydownFunc");
		document.onkeydown = (evt) => onkeydownFunc(evt);
	} else {
		// running in iframe mode
		gLog("onload no onkeydownFunc in iframe mode");
	}

	// do checkServerMode() here?

	callerId = "";
	let str = getUrlParams("callerId");
	if(typeof str!=="undefined" && str!="" && str!="undefined") {
		callerId = str;
	}
	callerIdArg = callerId;
	// callerId may change by cookieName and idSelect

	// showMissedCalls hands over the default webcall nickname with this
	callerName = "";
	// TODO should not deliver callerName via url (usually arrives via serverSettings.nickname or /getcontact)
	str = getUrlParams("callerName");
	if(typeof str!=="undefined" && str!=null && str!="" && str!="undefined" && str!="null" && str!="true") {
		// this urlArg has a low priority
		// will be overwritten by the contacts-entry for enterIdValElement.value (calleeID)
		callerName = cleanStringParameter(str,true,"c1");
		console.log("onload getUrlParams str=("+str+") callerName=("+callerName+")");
	}

	callerHost = location.host;
	str = getUrlParams("callerHost");
	if(typeof str!=="undefined" && str!="" && str!="undefined") {
		// if this is coming from the android client, it will be correct data
		// if this comes directly from a 3rd party source, it may be false data
		//    in such a case the party being called will not be able to call back this caller
		//    however, if the caller cookie is found, we will set: callerHost = location.host;
		//    TODO tmtmtm but this may cut off the :port
		callerHost = str;
	}

	contactName = "";
	str = getUrlParams("contactName");
	if(typeof str!=="undefined" && str!==null && str!=="" && str!="undefined" && str!=="null") {
		// this urlArg has a low priority
		// will be overwritten by the contacts-entry for enterIdValElement.value (calleeID)
		contactName = cleanStringParameter(str,true,"c1");
	}

	console.log("onload urlParam callerId=("+callerId+") callerHost=("+callerHost+")"+
		 " callerName=("+callerName+") contactName=("+contactName+")");

	cookieName = "";
	if(document.cookie!="") {
		let webcallididx = document.cookie.indexOf("webcallid=");
		if(webcallididx>=0) {
			// cookie webcallid exists
			cookieName = document.cookie.substring(webcallididx+10);
			let separatorIdx = cookieName.indexOf(";");
			if(separatorIdx>=0) {
				cookieName = cookieName.substring(0,separatorIdx);
			}
			let idxAmpasent = cookieName.indexOf("&");
			if(idxAmpasent>0) {
				cookieName = cookieName.substring(0,idxAmpasent);
			}
			gLog('onload cookieName='+cookieName);
		}
	}

	let nicknameDivElement = document.getElementById("nicknameDiv");
	nicknameDivElement.style.display = "block";

	contactAutoStore = false;
	if(cookieName!="" && (callerId==cookieName || callerId=="" || callerId=="select")) {
		// using cookieName (bc callerID is same or not set)
		gLog("onload set callerId = cookieName ("+cookieName+")");
		callerId = cookieName;
		let api = apiPath+"/getsettings?id="+callerId;
		gLog('onload request getsettings api '+api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			var xhrresponse = xhr.responseText;
			//gLog('xhr.responseText '+xhrresponse);
			if(xhrresponse=="") {
				serverSettings = null;
				return;
			}
			// xhrresponse can contain random html
			if(xhrresponse.indexOf("<html")>=0 || xhrresponse.indexOf("<head")>=0) {
				console.log("# xhr /getsettings received garbage "+xhr.status);
				showStatus("error xhr getsettings",-1,true);
				return;
			}
			serverSettings = JSON.parse(xhrresponse);
			if(typeof serverSettings!=="undefined") {
				gLog('serverSettings.storeContacts',serverSettings.storeContacts);
				if(serverSettings.storeContacts=="true") {
					contactAutoStore = true;
					// if callerIdArg=="select", we don't need dialIdAutoStoreElement
					// bc we offer a manual store-contact button in that case
					if(callerIdArg!="select") {
						var dialIdAutoStoreElement = document.getElementById("dialIdAutoStore");
						if(dialIdAutoStoreElement) {
							gLog('dialIdAutoStore on');
							dialIdAutoStoreElement.style.opacity = "0.8";
						}
					}
				}

				if(serverSettings.dialSounds=="true") {
					playDialSounds = true;
					//console.log("playDialSounds from settings ="+playDialSounds);
				} else if(serverSettings.dialSounds=="false") {
					playDialSounds = false;
					//console.log("playDialSounds from settings ="+playDialSounds);
				} else {
					//console.log("playDialSounds from settings NOT SET");
				}

				// prefer nickname from getUrlParams over settings!
				// note that nicknameElement.value may be overwritten by callerName from contacts (see: getContact())
				if(callerName!="") {
					nicknameElement.value = callerName;
				} else {
					nicknameElement.value = serverSettings.nickname;
				}
			}

		}, function(errString,err) {
			console.log("# onload xhr error "+errString+" "+err);
		});
	} else {
		// ignore cookieName
		cookieName = "";
	}

	// show dial-id dialog
	// - if calleeID=="": called by dialpad icon from mainpage
	// - if callerIdArg=="select": called by android client as a 1st step before calling a remote host user
	console.log("onload show dial-id calleeID="+calleeID+" callerIdArg="+callerIdArg);
	if(calleeID=="" || callerIdArg=="select") {
		containerElement.style.display = "none";
		enterIdElement.style.display = "block";

		if(iframeChild()) {
			//if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
				// display back-arrow in the upper left corner
				let arrowLeftElement = document.getElementById("arrowleftDialID");
				if(arrowLeftElement!=null) {
					arrowLeftElement.style.display = "block";
				}
			//}
		}

		if(callerIdArg=="select") {
			// callerId MUST be set now, bc it is currently set to "select"
			if(callerId!="" && callerId!=cookieName) {
				// if we override the callerId with a different cookieName
				// we also clear the callerName (aligned with the old callerId)
				callerName = "";
			}
			callerId = cookieName; // main callback id
		}

		if(cookieName!="") {
			// when user operates idSelectElement, callerId may be changed
			idSelectElement = document.getElementById("idSelect2");
			if(idSelectElement!=null) {
				//let idSelect2LabelElement = document.getElementById("idSelect2Label");
				// fetchMapping() will use "/getmapping?id="+cookieName
				fetchMapping(null,idSelectElement,null); //idSelect2LabelElement);
			}
		}

		// set target domain name with local hostname
		// note: location.hostname does not contain the :port, so we use location.host
		let targetHost = location.host;
		// andr activity hands over the target domain with this when sending callerIdArg='select'
		str = getUrlParams("targetHost");
		if(typeof str!=="undefined" && str!="" && str!="undefined") {
			targetHost = str;
		}
		enterDomainValElement.value = targetHost;
		if(targetHost!=location.host && cookieName!="") {
			idSelect2LabelElement.style.display = "inline-block";
		} else {
			idSelect2LabelElement.style.display = "none";
		}
		enterDomainValElement.onblur = function() {
			// catch enterDomainValElement.value change to invoke /getcontact
			//console.log("enterDomainValElement blur value = ("+enterDomainValElement.value+")");
			let contactHost = cleanStringParameter(enterDomainValElement.value,true);
			if(contactHost!=location.host && cookieName!="") {
				idSelect2LabelElement.style.display = "inline-block";
			} else {
				idSelect2LabelElement.style.display = "none";
			}
			getContactFromForm();
		};
		//console.log("onload enterIdValElement.value="+enterIdValElement.value);
		if(targetHost!=location.host) {
			enterDomainValElement.readOnly = true;
			enterDomainClearElement.style.display = "none";
			enterDomainValElement.style.background = "#33b";
			enterDomainValElement.style.color = "#eee";
			//console.log("onload enterDomain readOnly");
		}

		// if calleeID is not pure numeric, we first need to disable numericId checkbox
		if(isNaN(calleeID)) {
			gLog("onload isNaN(calleeID="+calleeID+") true");
			numericIdCheckbox.checked = false;
			enterIdValElement.setAttribute('type','text');
		} else {
			gLog("onload isNaN("+calleeID+") false");
		}
		if(calleeID!="") {
			// calleeID is given: make enterIdVal readonly
			enterIdValElement.value = calleeID;
			enterIdValElement.readOnly = true;
			enterIdClearElement.style.display = "none";
			enterIdValElement.style.background = "#33b";
			enterIdValElement.style.color = "#eee";
			enterIdValElement.autoFocus = false;
			numericIdLabel.style.display = "none";
			if(altIdCount>1) {
				setTimeout(function() {
					gLog("onload idSelectElement.focus");
					idSelectElement.focus();
				},400);
			}
			getContactFromForm();
		} else {
			// calleeID is empty: focus on enterIdVal
			setTimeout(function() {
				gLog("onload enterIdValElement.focus");
				enterIdValElement.focus();
				var rect1 = enterIdValElement.getBoundingClientRect();

				let iframeX=0;
				let iframeY=0;
				if(window.self !== window.top) {
					iframeX = window.parent.document.getElementById('iframeWindow').offsetLeft;
					iframeY = window.parent.document.getElementById('iframeWindow').offsetTop;
					//console.log("we are an iframe at x/y-pos",iframeX,iframeY)
				} else {
					//console.log("we are no iframe")
				}
				// NOTE: DO NOT CHANGE THE console.log() BELOW !!!
				console.log("showNumberForm pos",
					rect1.left, rect1.top, rect1.right, rect1.bottom,	// x/y x2/y2 of input form (rel to ifra)
					iframeX, iframeY, screen.width, screen.height);		// x/y of iframe + web width/height pix
			},400);

			enterIdValElement.onblur = function() {
				// catch enterIdValElement.value change to invoke /getcontact
				//console.log("enterIdValElement blur value = ("+enterIdValElement.value+")");
				getContactFromForm();
			};
		}


		/* store contact button moved to call-widget
		// enable storeContactButton (like dialIdAutoStore)
		var storeContactButtonElement = document.getElementById("storeContactButton");
		if(storeContactButtonElement) {
			gLog('storeContactButton on');
			storeContactButtonElement.style.opacity = "0.8";
			storeContactButtonElement.onclick = function() {
				// enable [Save Contact] button when enterIdValElement.value!=""
				// TODO: but only if enterDomainValElement.value != location.host ???
				// [Save Contact] we want to save the id of the user we are about to call:
				// local id:  enterIdValElement.value (if enterDomainValElement.value==location.host)
				// remote id: enterIdValElement.value@enterDomainValElement.value
				//		let calleeID = enterIdValElement.value@enterDomainValElement.value
				// form for contactName: ____________
				// form for callerName: ____________ (ourNickname)
				let contactID = cleanStringParameter(enterIdValElement.value,true) +
					"@" + cleanStringParameter(enterDomainValElement.value,true);
				//console.log("/setcontact contactID="+contactID);
				if(contactName=="") contactName="unknown";
				let compoundName = contactName+"|"+callerId+"|"+callerName;
				//console.log("/setcontact compoundName="+compoundName);
				let api = apiPath+"/setcontact?id="+cookieName +
					"&contactID="+contactID + "&name="+compoundName;
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					console.log("/setcontact ("+contactID+") stored ("+xhr.responseText+")");
				}, function(errString,errcode) {
					console.log("# /setcontact ("+contactID+") ex "+errString+" "+errcode);
				});
			}
		}
		*/

		// [Dial] button -> will resume in submitFormDone()
		return;
	}

	onload2();
}

function getContactFromForm() {
	let contactID = cleanStringParameter(enterIdValElement.value,true);
	if(contactID!="") {
		let contactHost = cleanStringParameter(enterDomainValElement.value,true);
		if(contactHost!="" && contactHost!=location.host) {
			if(contactID.indexOf("@")<0) {
				contactID += "@"+contactHost;
			} else {
				contactID += "@@"+contactHost;
			}
		}
		getContact(contactID);
	}
}

function getContact(contactID) {
	console.log("getcontact() "+cookieName+" "+contactID);
	if(contactID!="" && cookieName!="") {
		// get preferred callerID and callerNickname from calleeID-contact
		let api = apiPath+"/getcontact?id="+cookieName + "&contactID="+contactID;
		gLog('request /getcontact api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			var xhrresponse = xhr.responseText;
			//console.log("/getcontact callee="+cookieName+" contactID="+contactID+" xhrresponse="+xhrresponse);
			if(xhrresponse!="") {
				// xhrresponse can contain random html
				if(xhrresponse.indexOf("<html")>=0 || xhrresponse.indexOf("<head")>=0) {
					console.log("# xhr /getcontacts received garbage "+xhr.status);
					showStatus("error xhr getcontacts",-1,true);
					return;
				}
				//console.log("--- /getcontact xhrresponse=("+xhrresponse+")");

				// format: name|prefCallbackID|myNickname
				let tok = xhrresponse.split("|");
				if(tok.length>0 && tok[0]!="") {
					let tmpContactName = cleanStringParameter(tok[0],true);
					if(tmpContactName!="" && tmpContactName!="unknown") {
						contactName = tmpContactName;
						enableCalleeOnlineElement(false);

						// show contact nickname (for dial-id dialog)
						var contactNameElement = document.getElementById("contactNickName");
						if(contactNameElement) {
							contactNameElement.innerHTML = "Nickname: "+contactName;
							contactNameElement.style.display = "block";
						}
					}
				}
				console.log("/getcontact contactName=("+contactName+")");

				if(tok.length>1) {
					let prefCallbackID = tok[1];
					//console.log("/getcontact prefCallbackID="+prefCallbackID);
					// we can now preselect idSelect with prefCallbackID
					// we accept prefCallbackID only if it is (still) in the idSelect list !!!
					const listArray = Array.from(idSelectElement.children);
					if(listArray.length>0) {
						// preselect: incognito
						callerId = "";
						//console.log("/getcontact idSelectElement.selectedIndex="+listArray.length+" -1");
						//idSelectElement.selectedIndex = listArray.length -1;

						let i=0;
						listArray.forEach((item) => {
							if(item.text.startsWith(prefCallbackID)) {
								console.log("/getcontact idSelectElement.selectedIndex="+i);
								idSelectElement.selectedIndex = i;
								// this will set callerId based on id=cookieName in contacts
								callerId = prefCallbackID;
							}
							i++
						});
					}
				}
				console.log("preferred callerId="+callerId);

				if(tok.length>2 && tok[2]!="") {
					// we prefer this over getUrlParams and settings
					callerName = tok[2]; // nickname of caller
					//console.log("/getcontact callerName="+callerName);
					// will be shown (and can be edited) in final call-widget

					if(!calleeID.startsWith("answie") && !calleeID.startsWith("talkback")) {
						console.log("getContact set nickname form with callerName="+callerName);
						let nicknameDivElement = document.getElementById("nicknameDiv");
						nicknameElement.value = callerName;
						nicknameDivElement.style.display = "block";
						// callername will be fetched from form in checkCalleeOnline()
					}
				}
				console.log("/getcontact contactName2=("+contactName+")");
			}
		}, errorAction);
	}
}

function changeId(selectObject) {
	if(selectObject) {
		gLog("changeId selectObject="+selectObject);
		// selectObject is (only) set if user operates idSelect manually
		// parse for deviceId (selectObject.value in idSelect.options)
		for(var i = idSelectElement.options.length - 1; i >= 0; i--) {
			if(idSelectElement.options[i].value == selectObject.value) {
				// found selectObject
				callerId = cleanStringParameter(selectObject.value,true);
				gLog('changeId callerId='+callerId);
				break;
			}
		}
	} else {
		console.log("# changeId no selectObject");
	}
}

function onload2() {
	console.log("onload2");
	haveBeenWaitingForCalleeOnline=false;
//	altIdCount = 0;
/*
	checkServerMode(function(mode,msgString) {
		if(mode==0) {
*/
			// normal mode
			gLog("onload2 normal mode");

			// enable randomized 123 codeDivElement if no cookie available (and if not answie or talkback)
			if(calleeID.startsWith("answie") || calleeID.startsWith("talkback")) {
				//console.log("no 123 entry for user "+calleeID);
			} else if(cookieName!="") {
				//console.log("no 123 entry for user "+cookieName);
			} else {
				// if cookie webcalluser=human is already set, we do NOT show 123 entry form
				let iswebcalluser = false;
				if(document.cookie!="") {
					let webcalluseridx = document.cookie.indexOf("webcalluser=");
					//console.log("webcalluseridx="+webcalluseridx);
					if(webcalluseridx>=0) {
						// cookie webcalluser exists
						let webcalluserValue = document.cookie.substring(webcalluseridx+12);
						//console.log("webcalluserValue1="+webcalluserValue);
						let separatorIdx = webcalluserValue.indexOf(";");
						if(separatorIdx>=0) {
							webcalluserValue = webcalluserValue.substring(0,separatorIdx);
							//console.log("webcalluserValue2="+webcalluserValue);
						}
						if(webcalluserValue=="human") {
							iswebcalluser = true;
							//console.log("no 123 entry for iswebcalluser");
						}
					}
				}
				//console.log("iswebcalluser="+iswebcalluser);

				if(!iswebcalluser) {
					let codeDivElement = document.getElementById("codeDiv");
					let codeLabelElement = document.getElementById("codeLabel");
					let codeElement = document.getElementById("code");
					let codeString = ""+(Math.floor(Math.random() * 900) + 100);
					codeLabelElement.innerHTML = "Enter "+codeString+":";
					codeElement.value = "";

					let ua = navigator.userAgent;
					if(ua.indexOf("Android")>=0 || ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
						// enable type="number" for code form
						gLog("showConfirmCodeForm type=number");
						codeElement.type = "number";
					}
					codeDivElement.style.display = "block";
					setTimeout(function() {
						gLog("showConfirmCodeForm code.focus()!");
						codeElement.focus();
						// unfortunately .focus() does NOT make the Android keyboard pop up (only a user tap does)
						// so we emulate a screen tap from Java code, based on the coordinates of this log
						// NOTE: DO NOT CHANGE THE console.log() BELOW !!!
						var rect1 = codeElement.getBoundingClientRect();
						let iframeX=0;
						let iframeY=0;
						if(window.self !== window.top) {
							iframeX = window.parent.document.getElementById('iframeWindow').offsetLeft;
							iframeY = window.parent.document.getElementById('iframeWindow').offsetTop;
							//console.log("we are an iframe at x/y-pos",iframeX,iframeY)
						} else {
							//console.log("we are no iframe")
						}
						console.log("showNumberForm pos",
							rect1.left, rect1.top, rect1.right, rect1.bottom, // x/y x2/y2 of form (rel to ifra)
							iframeX, iframeY, screen.width, screen.height);   // x/y of iframe + web width/height
					},500);

					// disable call button for as long as code.value does not have the right value
					dialButton.disabled = true;

					let keyupEventFkt = function() {
						if(codeElement.value==codeString) {
							// user is human, has entered 123 code
							dialButton.disabled = false;
							// disable EventListener
							this.removeEventListener("keyup",keyupEventFkt);
							codeDivElement.style.display = "none";

							// create webcalluser=human cookie (with no unique ID)
							// so this user does not need to enter 123 code again (for a month)
							const d = new Date();
							d.setTime(d.getTime() + (31*24*60*60*1000));
							let expires = "expires="+ d.toUTCString();
							//console.log("create webcalluser=human cookie");
							document.cookie =
								"webcalluser=human; SameSite=Strict; expires="+d.toUTCString();
						}
					}
					document.addEventListener("keyup", keyupEventFkt);
					//console.log("showConfirmCodeForm start");
					// checkCalleeOnline() will fetch callername from form
				}
			}

			// if cookie webcallid is available, fetch mapping and offer idSelect
			if(cookieName!="") {
				idSelectElement = document.getElementById("idSelect");
				if(idSelectElement!=null) {
					fetchMapping(onload3,idSelectElement,idSelectLabelElement);
				}
				return;
			}

			onload3("onload2");
			return;
/*
		}
		if(mode==1) {
			// maintenance mode
			let mainParent = containerElement.parentNode;
			mainParent.removeChild(containerElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; "+
							   "justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML =
				"<div>WebCall server is currently in maintenance mode.<br>Please try again later.</div>";
			mainParent.appendChild(msgElement);
			return;
		}

		let mainParent = containerElement.parentNode;
		mainParent.removeChild(containerElement);
		var msgElement = document.createElement("div");
		msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; "+
						   "justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
		msgElement.innerHTML = "<div>"+msgString+"</div>";
		mainParent.appendChild(msgElement);
	});
*/
}

function fetchMapping(contFunc,idSelectElement,idSelectLabelElem) {
	if(idSelectElement==null) return;
	altIdCount = 0
	if(cookieName!="") {
		let preselectIndex = -1;

		let idOption = document.createElement('option');
		idOption.text = cookieName + " (main id)";
		idOption.value = cookieName;
		idSelectElement.appendChild(idOption);
		altIdCount++;

		let api = apiPath+"/getmapping?id="+cookieName;
		console.log('fetchMapping request api='+api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			let xhrresponse = xhr.responseText;
			console.log('fetchMapping response='+xhrresponse);
			// xhrresponse can contain random html
			if(xhrresponse.indexOf("<html")>=0 || xhrresponse.indexOf("<head")>=0) {
				console.log("# xhr /getmapping received garbage "+xhr.status);
				showStatus("error xhr getmapping",-1,true);
				return;
			}

			let altPreselectIndex = -1;
			if(xhrresponse!="") {
				let altIDs = xhrresponse;
				let tok = altIDs.split("|");
				for(var i=0; i<tok.length; i++) {
					console.log("tok["+i+"]="+tok[i]);
					if(tok[i]!="") {
						let tok2 = tok[i].split(",");
						let id = cleanStringParameter(tok2[0],true);
						if(id==callerId) {
							preselectIndex = i;
							gLog('preselectIndex='+preselectIndex);
						}
						let active = cleanStringParameter(tok2[1],true);
						//console.log("--- i="+i+" active="+active+" altPreselectIndex="+altPreselectIndex);
						if(altPreselectIndex<0 && active=="true") {
							altPreselectIndex = i;
							//console.log("--- altPreselectIndex="+altPreselectIndex);
						}
						//console.log("assign=("+assign+")");
						let idOption = document.createElement('option');
						idOption.text = id;
						idOption.value = id;
						idSelectElement.appendChild(idOption);
						altIdCount++;
					}
				}

				if(altIdCount>0) {
					// enable idSelectElement
					if(idSelectLabelElem!=null) {
						idSelectLabelElem.style.display = "inline-block";
						if(idSelectElement!=null) {
							idSelectElement.style.display = "inline-block"
						}
						if(preselectIndex>=0) {
							idSelectElement.selectedIndex = preselectIndex+1;
						}
					}

					if(preselectIndex<0 && altPreselectIndex>=0) {
						// no stored callbackID was found in mapping
						// so we use the first non-deactivated ID
						//console.log("-- set altPreselectIndex+1="+(altPreselectIndex+1));
						idSelectElement.selectedIndex = altPreselectIndex+1;
					}
				}

				//console.log("----fetchMapping preselectIndex="+preselectIndex+"/"+altPreselectIndex+
				//	" altIdCount="+altIdCount+" callerId="+callerId+" cookieName="+cookieName+
				//	" idSelectElement.selectedIndex="+idSelectElement.selectedIndex);
			}

			let idOptionAnon = document.createElement('option');
			idOptionAnon.text = "(incognito)";
			idOptionAnon.value = "";
			idSelectElement.appendChild(idOptionAnon);
			altIdCount++;

			if(contFunc!=null)
				contFunc("fetchMapping 1");

		}, function(errString,errcode) {
			// /getmapping failed
			if(callerId!=cookieName) {
				callerId = cookieName;
			}
			if(contFunc!=null)
				contFunc("fetchMapping 2 "+errString+" "+errcode);
		});
	} else {
		if(contFunc!=null)
			contFunc("fetchMapping 3");
	}
}

function onload3(comment) {
	console.log('onload3 '+comment);

//	var calleeIdTitle = calleeID;
//	document.title = "WebCall "+calleeIdTitle;
//	if(titleElement) {
//		titleElement.innerHTML = "WebCall "+calleeIdTitle;
//	}

	if(calleeID.startsWith("#")) {
		// special case: action
		gLog('start action calleeID='+calleeID);
		let api = apiPath+"/action?id="+calleeID.substring(1)+"&callerId="+callerId;
		xhrTimeout = 5*1000;
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			let xhrresponse = xhr.responseText;
			gLog("xhr.resp="+xhrresponse);
			if(xhrresponse.startsWith("widget=")) {
				// switch widget: replace parent iframe src
				let url = xhrresponse.substring(7) + "?callerId="+callerId+"&i="+counter;
				counter++;
				let iframeElement = parent.document.querySelector('iframe#child');
				gLog("widget("+url+") iframeElement="+iframeElement);
				if(parent!=null && iframeElement!=null) {
					iframeElement.src = url;
				}
			} else {
				history.back();
			}
		}, errorAction2);
		return;
	}

	if(playDialSounds) {
		if(!dtmfDialingSound) {
			console.log('load dtmf-dial.ogg');
			dtmfDialingSound = new Audio('dtmf-dial.ogg');
			if(!dtmfDialingSound) {
				console.warn('# load dtmfDialingSound fail');
			}
		}
	}

	if(!notificationSound) {
		//console.log('load notificationSound');
		notificationSound = new Audio("notification.ogg");
		if(!notificationSound) {
			console.warn('# load notificationSound fail');
		}
	}

	if(!busySignalSound) {
		//console.log('load busySignalSound');
		busySignalSound = new Audio('busy-signal.ogg');
		if(!busySignalSound) {
			console.warn('# load busySignalSound fail');
		}
	}

	console.log('onload3 calleeOnlineAction()');
	calleeOnlineAction("onload3");

	if(dialButton) {
		if(calleeID.match(/^[0-9]*$/) != null) {
			// calleeID is numeric - don't show
		} else {
			//dialButton.innerHTML = "Call "+calleeIdTitle;
		}
		dialButton.onclick = dialButtonClick;
	}
	if(hangupButton) {
		hangupButton.onclick = function() {
			let msg = lg("hangingUpText");
			//console.log(msg);
			if(mediaConnect) {
				if(playDialSounds) {
					hangupWithBusySound(true,msg);
				} else {
					hangup(true,true,msg);
				}
			} else {
				if(playDialSounds) {
					stopAllAudioEffects();
				}
				hangup(true,true,msg);
			}
			// focus back to background, so that esc-key via onkeydown will work
			hangupButton.blur();
		};
	}
	if(chatButtonLabel) {
		chatButtonLabel.onclick = function() {
			history.back();
			if(textchatOKfromOtherSide) {
				enableDisableTextchat(false);
			} else {
				setTimeout(function() {
					console.log("onload3 peerNoTextChat");
					chatButtonLabel.style.display = "none";
					showStatus(lg("peerNoTextChat"),4000,false);
				},500);
			}
		}
	}

	calleeID = calleeID.toLowerCase();

	// TODO we might want to skip getContact() if altIdCount==0
	if(cookieName=="") {
		console.log("onload3 skip getContact() on empty cookiename");
	} else if(calleeID=="") {
		console.log("onload3 skip getContact() on empty calleeID");
	} else if(altIdCount<1) {
		console.log("onload3 skip getContact() on altIdCount<1");
	} else {
		// since mapping was requested before
		// we can now use prefCallbackID to set callerId and idSelectElement.selectedIndex
		// and also set contactName and callerName
		console.log('onload3 getContact() altIdCount='+altIdCount);
		getContact(calleeID);
	}
}

function dialButtonClick() {
	/* dial confirm dialog (yes/no) (here only for android)
	if(typeof Android !== "undefined" && Android !== null) {
		let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.6em; border-radius:3px; cursor:pointer;'><div style='font-weight:600'>Dial now?</div><br>"+
		"<a onclick='dialButtonClick2();history.back();'>Yes</a> &nbsp; &nbsp; <a onclick='history.back();'>No</a></div>";
		menuDialogOpen(dynDialog,2,yesNoInner);
		return;
	}
	*/

	if(idSelectElement && idSelectElement.options.length>0 && idSelectElement.selectedIndex>=0) {
		console.log("dialButtonClick idSelectElement.selectedIndex="+idSelectElement.selectedIndex+
					" callerId="+idSelectElement.options[idSelectElement.selectedIndex].value+" old:"+callerId);
		callerId = idSelectElement.options[idSelectElement.selectedIndex].value;
	}

	dialButtonClick2();
}

function dialButtonClick2() {
	callerName = cleanStringParameter(nicknameElement.value,true);

	console.log("dialButtonClick2 calleeID="+calleeID+" callerId="+callerId+" callerName="+callerName);

	showStatus(connectingText,-1,false); // "Connecting P2P..."
	doneHangup = false;
	onIceCandidates = 0;
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	connectionstatechangeCounter = 0;

	if(localStream) {
		const audioTracks = localStream.getAudioTracks();
		console.log('dialButtonClick2 audioTracks.len='+audioTracks.length);
	} else {
		// this is expected when we clear localStream in gotStream2()
		//console.log('! dialButtonClick2 !localStream');
	}

	if(dialButton.disabled) {
		// prevent multiple checkCalleeOnline()
		return;
	}

	calleeOnlineElement.classList.add("disableElement");
	msgboxdiv.classList.add("disableElement");
	bottomElement.classList.add("disableElement");

	// hide 'store contact' button
	let storeContactElement = document.getElementById("storeContact");
	if(storeContactElement) {
		storeContactElement.innerHTML = "";
	}

	// disable nicknameElement input form
	nicknameElement.disabled = true;

	// focus back to background, so that esc-key via onkeydown works
	dialButton.blur();

	// -> checkCalleeOnline -> ajax -> calleeOnlineAction -> gotStream -> connectSignaling
	gLog("dialButtonClick set dialAfterCalleeOnline");
	dialAfterCalleeOnline = true;

	checkCalleeOnline(true,"dialButtonClick");
}

function videoOn() {
	// enable local video
	gLog("videoOn");
	constraintString = defaultConstraintString;
	setVideoConstraintsGiven();
	localVideoShow();

	// add localStream video-track to peerCon
	if(peerCon && peerCon.iceConnectionState!="closed" && 
			rtcConnect && addLocalVideoEnabled && localStream.getTracks().length>=2 && !addedVideoTrack) {
		if(localCandidateType=="relay" || remoteCandidateType=="relay") {
			gLog('videoOn no addTrack vid on relayed con (%s)(%s)',localCandidateType,remoteCandidateType);
		} else {
			gLog('videoOn addTrack local video input',localStream.getTracks()[1]);
			addedVideoTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
		}
	}

	// activate localStream in localVideoFrame
	localVideoFrame.volume = 0; // avoid audio feedback / listening to own mic
	localVideoFrame.muted = 1;

	// switch avSelect.selectedIndex to 1st video option
	getStream(false,"videoon").then(() => navigator.mediaDevices.enumerateDevices()).then((deviceInfos) => {
		gotDevices(deviceInfos);
		let optionElements = Array.from(avSelect);
		gLog("videoOn avSelect len",optionElements.length);
		if(optionElements.length>0) {
			// avSelect.selectedIndex <- 1st video device
			for(let i=0; i<optionElements.length; i++) {
				if(optionElements[i].text.startsWith("Video")) {
					console.log("videoOn avSelect selectedIndex="+i);
					avSelect.selectedIndex = i;
					break;
				}
			}
		}

		if(videoEnabled) {
			// start localVideoFrame playback, setup the localVideo pane buttons
			vmonitor();
		}

		if(videoEnabled && mediaConnect && !addLocalVideoEnabled && vsendButton) {
			gLog('videoOn mediaConnect, blink vsendButton');
			vsendButton.classList.add('blink_me');
			setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
		}
	});
}

function videoOff() {
	// disable local video (but if rtcConnect, keep local mic on)
	gLog("videoOff");
	localVideoHide();
	if(localStream) {
		// stop streaming video track
		connectLocalVideo(true);
	}

	if(!rtcConnect) {
		if(localStream) {
			// remove audio track from peerCon (stop streaming local audio)
			if(peerCon && peerCon.iceConnectionState!="closed" && addedAudioTrack) {
				gLog("videoOff !rtcConnect peerCon.removeTrack(addedAudioTrack)");
				peerCon.removeTrack(addedAudioTrack);
				addedAudioTrack = null;
			}

			const audioTracks = localStream.getAudioTracks();
			gLog('videoOff removeTrack local mic audioTracks.length',audioTracks.length);
			if(audioTracks.length>0) {
				gLog('videoOff removeTrack local mic',audioTracks[0]);
				audioTracks[0].enabled = false;
				audioTracks[0].stop();
				localStream.removeTrack(audioTracks[0]);
			}

			const videoTracks = localStream.getVideoTracks();
			gLog('videoOff removeTrack local vid videoTracks.length',videoTracks.length);
			if(videoTracks.length>0) {
				gLog('videoOff removeTrack local vid',videoTracks[0]);
				videoTracks[0].enabled = false;
				videoTracks[0].stop();
				localStream.removeTrack(videoTracks[0]);
			}

			// stop all localStream tracks
			const allTracks = localStream.getTracks();
			gLog("videoOff !rtcConnect localStream stop len",allTracks.length);
			allTracks.forEach(track => {
				gLog('videoOff local track.stop()',track);
				track.stop();
			});
		}

		// fully deacticate localVideoFrame + localStream (mic)
		gLog("videoOff !rtcConnect shut localVideo");
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;
		localStream = null;

		// hide and fully deacticate remoteVideoFrame + remoteStream
		gLog("videoOff !rtcConnect shut remoteVideo");
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;
	}

	// switch to the 1st/default audio device
	let optionElements = Array.from(avSelect);
	if(optionElements.length>0) {
		gLog("videoOff avSelect len",optionElements.length);
		// avSelect.selectedIndex <- 1st audio device
		for(let i=0; i<optionElements.length; i++) {
			if(optionElements[i].text.startsWith("Audio")) {
				console.log("videoOff avSelect selectedIndex="+i);
				avSelect.selectedIndex = i;
				break;
			}
		}
	}
}

function checkServerMode(callback) {
	let api = apiPath+"/mode";
	xhrTimeout = 30*1000;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		let xhrresponse = xhr.responseText;
		// xhrresponse can contain random html
		if(xhrresponse.indexOf("<html")>=0 || xhrresponse.indexOf("<head")>=0) {
			console.log("# xhr /mode received garbage "+xhr.status);
			showStatus("error xhr mode",-1,true);
			return;
		}
		if(xhrresponse.startsWith("normal")) {
			callback(0);
			return;
		}
		if(xhrresponse.startsWith("maintenance")) {
			callback(1);
			return;
		}
		// error
		callback(2,xhrresponse);
	}, function(errString,err) {
		console.log("# xhr error "+errString+" "+err);
		callback(2,errString);
	});
}

function checkCalleeOnline(waitForCallee,comment) {
	//callerName = cleanStringParameter(nickname.value,true);

	// Connecting P2P...
	//console.log("checkCalleeOnline callerId="+callerId+" callerName="+callerName);
	// check if calleeID is online (on behalf of callerId/callerName)
	let api = apiPath+"/online?id="+calleeID;
	if(callerId!=="") {
		let fullCallerID = callerId;
		if(callerHost!="" && !callerHost.startsWith(location.host)) {
			// if calleeID is on a remote server (relative to callerID), add callerHost to callerID
			// "&callerId="+callerId + "@@" + callerHost
			fullCallerID = callerId + "@@" + callerHost;
			if(callerId.indexOf("@")>=0) {
				fullCallerID = callerId + "@" + callerHost;
			}
		}
		api += "&callerId="+fullCallerID;
	}
	api = api + "&ver="+clientVersion;

	console.log("checkCalleeOnline api="+api+" ("+comment+")");
	xhrTimeout = 30*1000;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		//console.log("/online xhr.responseText="+xhr.responseText);
		calleeOnlineStatus(xhr.responseText, waitForCallee);
	}, errorAction);
}

function calleeOnlineStatus(onlineStatus,waitForCallee) {
	if(rtcConnect || dialing) {
		// TODO check if this is still meaningful
		gLog('calleeOnlineStatus abort',rtcConnect,dialing);
		return;
	}
	console.log("calleeOnlineStatus="+onlineStatus+" waitForCallee="+waitForCallee);

	// onlineStatus should be something like "127.0.0.1:8071?wsid=4054932942" (aka wsAddr)
	if(onlineStatus!="" && onlineStatus.indexOf("wsid=")>=0) {
		// callee is available/online
		lastOnlineStatus = onlineStatus;
		let tok = onlineStatus.split("|");
		wsAddr = tok[0];
		wsAddrTime = Date.now();
		calleeOnlineAction("calleeOnlineStatus");
		return;
	}

	// callee user is not available
	console.log("calleeOnlineStatus no wsid, onlineStatus="+onlineStatus);
	dialButton.disabled = false;
	hangupButton.disabled = true;
/*
	if(!localStream) {
		// we need to call mediaDevices.enumerateDevices() anyway
		loadJS("adapter-latest.js",function() {
			if(!navigator.mediaDevices) {
				console.warn("navigator.mediaDevices not available");
				// TODO no visible warning?
			} else {
				getStream(false,"calleeOnlineStatus").then(() =>
					navigator.mediaDevices.enumerateDevices()).then(gotDevices);
				// -> getUserMedia -> gotStream -> checkCalleeOnline -> ajax -> calleeOnlineStatus
			}
		});
	}
*/
/*
	if(onlineStatus=="error") {
		showStatus("Error: user ID not found",-1,true)
		waitForCallee = false;
	}
*/
	// switch to offline mode and (if waitForCallee is set) check if calleeID can be notified
	calleeOfflineAction(onlineStatus,waitForCallee);
}

function calleeOnlineAction(comment) {
	console.log('calleeOnlineAction from='+comment+' dialAfterCalleeOnline='+dialAfterCalleeOnline);

	if(haveBeenWaitingForCalleeOnline) {
		haveBeenWaitingForCalleeOnline = false;
		if(notificationSound) {
			notificationSound.play().catch(function(error) {
				console.warn("# calleeOnlineAction notificationSound err="+error);
			});
		} else {
			console.log("calleeOnlineAction no notificationSound");
		}
	}

	// switch to callee-is-online layout (call and hangupButton)

	// now that we know callee is online, we load adapter-latest.js
	// (we load it only the 1st time)
	//gLog("load adapter...");
	loadJS("adapter-latest.js",function() {
		if(!navigator.mediaDevices) {
			console.warn("navigator.mediaDevices not available");
			if(calleeOnlineElement) {
				showStatus("navigator.mediaDevices not available",-1,true);
			} else {
				alert("navigator.mediaDevices not available");
			}
			return;
		}

		if(dialAfterCalleeOnline) {
			console.log("calleeOnlineAction dialAfterCalleeOnline..");
			// autodial after detected callee is online
			// normally set by gotStream, if dialAfterLocalStream was set (by dialButton.onclick)
			dialAfterCalleeOnline = false;

			if(localStream) {
// if we DO NOT clear localStream in gotStream2() (to keep the audio-channel-select) we end up here
// but shortly after we get "# dial2 no audioTracks"
				const audioTracks = localStream.getAudioTracks();
				console.log('calleeOnlineAction localStream -> connectSignaling() audioTracks.len='+audioTracks.length);
				connectSignaling("",dial); // when ws-connected to server, call dial() to call peer
			} else {
// if we DO clear localStream in gotStream2() (to keep the audio-channel-select) we end up here
// and shortly after we can make a call
				dialAfterLocalStream = true;
				console.log('calleeOnlineAction noLocalStream dialAfterLocalStream -> getStream(avSelect)');
				/*
				if(typeof Android !== "undefined" && Android !== null) {
					// remote audio will be played back on earpiece (if available) instead of speakerphone
					// not sure this is still needed
					Android.prepareDial();
				}
				*/
				getStream(false,"calleeOnlineAction").then(() =>
					navigator.mediaDevices.enumerateDevices()).then(gotDevices);
				// and bc of dialAfterLocalStream also: -> gotStream -> gotStream2 -> connectSignaling
			}
		} else {
			console.log("calleeOnlineAction no dialAfterCalleeOnline");
			// no autodial after we detected callee is online
			/*
			if(typeof Android !== "undefined" && Android !== null) {
				// remote audio will be played back on earpiece (if available) instead of speakerphone
				Android.prepareDial();
			}
			*/

			enableCalleeOnlineElement(false);

			getStream(false,"calleeOnlineAction2").then(() =>
				navigator.mediaDevices.enumerateDevices()).then(gotDevices);

			// so we display a message to prepare the caller hitting the call button manually
			if(calleeID.startsWith("answie"))  {
				msgboxdiv.classList.add("disableElement");
				showStatus(lg("digAnswMachine"),-1,false);
			} else if(calleeID.startsWith("talkback")) {
				msgboxdiv.classList.add("disableElement");
				showStatus( "Talkback service let's you test your microphone audio quality. "+
							"The first six seconds of the call will be recorded (red led) "+
							"and then immediately played back to you.",-1,false);
			} else {
				//msgboxdiv.classList.remove("disableElement");
				msgbox.value = "";
				msgbox.readOnly = false;
				if(placeholderText!="") {
					msgbox.placeholder = placeholderText;
					placeholderText = "";
				}
				console.log("calleeOnlineAction callerName="+callerName);
				msgbox.onfocus = function() {
					placeholderText = msgbox.placeholder;
					msgbox.placeholder = "";
				};
				msgbox.onblur = function() {
					// caller leaving the msgbox
					if(placeholderText!="") {
						msgbox.placeholder = placeholderText;
						placeholderText = "";
					}
				};
			}
		}
	});
}

var loadedJsMap = new Map();
var loadJsBusy = 0;
function loadJS(jsFile,callback) {
	// do not load same file more than once
	if(loadedJsMap.get(jsFile)) {
		callback();
		return;
	}
	if(loadJsBusy>0) {
		setTimeout(function() {
			loadJS(jsFile,callback);
		},100);
		return;
	}

	loadJsBusy++;
	gLog('loadJS jsFile='+jsFile);
	var script = document.createElement('script');
	script.setAttribute('src', jsFile);
	script.setAttribute('type', 'text/javascript');
	var loaded = false;
	var loadFunction = function () {
		if(!loaded) {
			loaded = true;
			loadedJsMap.set(jsFile,true);
			console.log('loadJS done loading '+jsFile);
			callback();
		}
		loadJsBusy--;
	};
	script.onload = loadFunction;
	script.onreadystatechange = loadFunction;
	document.getElementsByTagName("head")[0].appendChild(script);
}

function calleeOfflineAction(onlineStatus,waitForCallee) {
	// switch to callee-is-offline layout
	console.log("calleeOfflineAction "+onlineStatus+" "+waitForCallee);

	if(waitForCallee) {
		if(onlineStatus.startsWith("notavailtemp")) {
			// callee temporarily offline: have caller wait for callee
			var offlineFor = parseInt(onlineStatus.substring(12),10);

			showStatus(lg("tryingToFind")+" "+calleeID+". "+lg("thisCanTakeSomeTime"),-1,false);

			if(divspinnerframe) {
				divspinnerframe.style.display = "block";
			}
			let api = apiPath+"/online?id="+calleeID+"&wait=true&callerId="+callerId;
			xhrTimeout = 1*60*1000; // max 1min
			if(offlineFor>0) {
				xhrTimeout = xhrTimeout - offlineFor*1000;
			}
			if(xhrTimeout < 5*1000) { // min 5s
				xhrTimeout = 5*1000;
			}
			console.log("notifyCallee notavailtemp timeout="+xhrTimeout+" offlineFor="+(offlineFor*1000));
			// in case caller aborts:
			goodbyMissedCall = calleeID+"|"+callerName+"|"+callerId+
				"|"+Math.floor(Date.now()/1000)+
				"|"+cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen)+
				"|"+location.host;
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				// end spinner
				if(divspinnerframe) {
					divspinnerframe.style.display = "none";
				}
				if(xhr.responseText!=null) {
					console.log("xhr.responseText",xhr.responseText);
					if(xhr.responseText.indexOf("?wsid=")>0) {
						gLog('callee is now online. switching to call layout. '+xhr.responseText);
						goodbyMissedCall = "";
						lastOnlineStatus = xhr.responseText;
						let tok = xhr.responseText.split("|");
						wsAddr = tok[0];
						wsAddrTime = Date.now();
						// switch to callee-is-online layout

						//msgboxdiv.classList.remove("disableElement");
						msgbox.readOnly = false;
						if(placeholderText!="") {
							msgbox.placeholder = placeholderText;
							placeholderText = "";
						}
						haveBeenWaitingForCalleeOnline=true; // will cause notificationSound to play

						if(notificationSound) {
							gLog('play notificationSound');
							notificationSound.play().catch(function(error) { 
								console.log('# notificationSound err='+error);
							});
						} else {
							console.log("calleeOnlineAction no notificationSound");
						}
						return;
					}
				}
				/*
				if(!goodbyDone) {
					gLog('online: callee could not be reached (%s)',xhr.responseText);
					showStatus("Unable to reach "+calleeID+".<br>Please try again later.",-1);
					// TODO we should ask to send a msg
					//wsSend("missedcall|"+goodbyMissedCall); // this is not possible here

					let api = apiPath+"/missedCall?id="+goodbyMissedCall;
					goodbyMissedCall = "";
					ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
						gLog('/missedCall success');
					}, function(errString,err) {
						console.log('# /missedCall xhr error: '+errString+' '+err);
					});
				}
				*/
				if(goodbyDone) {
					return;
				}
				calleeNotificationAction();

			}, function(errString,errcode) {
				// end spinner
				if(divspinnerframe) {
					divspinnerframe.style.display = "none";
				}
				// errcode 504 = timeout
				console.log('online: callee could not be reached. xhr err',errString,errcode);
				// TODO if xhr /online failed, does it make sense to try xhr /missedCall ?
				showStatus("Unable to reach "+calleeID+".<br>Please try again later.",-1,true);
/*
				if(goodbyMissedCall!="") {
					console.log("calleeOfflineAction xhr /missedCall "+goodbyMissedCall);
					let api = apiPath+"/missedCall?id="+goodbyMissedCall;
					ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
						gLog('/missedCall success');
					}, function(errString,err) {
						console.log('# /missedCall xhr error: '+errString+' '+err);
					});
					goodbyMissedCall = "";
				}
*/
				goodbyMissedCall = "";
			});
			return;
		}

		calleeNotificationAction();

	} else {
		console.log('calleeOfflineAction no waitForCallee');
// TODO
		window.location.reload();
	}

	gLog('calleeOfflineAction done');
}

function calleeNotificationAction() {
	// calleeID is currently offline - check if calleeID can be notified (via notification)
	if(divspinnerframe) {
		divspinnerframe.style.display = "none";
	}
	// TODO callerName may trigger fail2ban (but post is already used for greetingmsg)
	let api = apiPath+"/canbenotified?id="+calleeID + "&callerId="+callerId +
		"&callerName="+callerName + "&callerHost="+callerHost;
	let greetingMsg = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);

	// greetingMsg sent via POST
	gLog('canbenotified api',api);
	xhrTimeout = 30*1000;
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		//console.log("/canbenotified xhr.responseText="+xhr.responseText);
		if(xhr.responseText.startsWith("direct")) {
			// calleeID can be notified (or is hidden)
			// don't ask caller
			confirmNotifyConnect();
			return;

		} else if(xhr.responseText.startsWith("ok")) {
			// calleeID can be notified (or is hidden)
			// if caller is willing to wait, caller can invoke confirmNotifyConnect() to enter own name
			/*
			let calleeName = xhr.responseText.substring(3);
			if(calleeName=="" || calleeName.length<3) {
				calleeName = calleeID;
			} else {
				calleeName = calleeName + " ("+calleeID+")";
			}
			*/

			let calleeName = calleeID;
			var msg = calleeName+" "+lg("isCurrentlyNot")+" "+
				lg("canYouWaitSomeTime")+"<br><a onclick='confirmNotifyConnect()'>"+
				"<div style='line-height:1.8em;'>"+
				lg("yesPleaseTry")+"</a> &nbsp; &nbsp;";

			if(window.self == window.top) {
				// not running in iframe mode: no -> jump on directory up
				msg += "<a onclick='enableCalleeOnlineElement(false)' style='white-space:nowrap;'>"+lg("noIHaveToGo")+"</a>";
			} else {
				// running in iframe mode: no -> history.back()
				msg += "<a onclick='history.back();' style='white-space:nowrap;'>"+lg("noIHaveToGo")+"</a>";
			}
			msg += "</msg>";

			showStatus(msg,-1,true);
			goodbyMissedCall = calleeID+"|"+callerName+"|"+callerId+
				"|"+Math.floor(Date.now()/1000)+
				"|"+cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen)+
				"|"+location.host;
			// goodbyMissedCall will be cleared by a successful call
			// if it is still set in goodby(), we will ask server to store this as a missed call

			// disable answer buttons (will be re-enabled in dial2() after successful RTCPeerConnection())
			answerButtons.classList.add("disableElement");
			return;
		}
		// calleeID can NOT be reached right now
// TODO tmtmtm display callee nickname instead of calleeID
		let statusMsg = "<a href='javascript:enableCalleeOnlineElement(true)'>"+calleeID+" is currently not available.";

		if(xhr.responseText.startsWith("offline") && greetingMsg!="") {
			// calleeID can NOT be reached (but greeting msg can be send)
			statusMsg += " Your text message has been sent.";
		}

		statusMsg += " "+lg("PleaseTryAgainALittle")+".</a>";
		showStatus(statusMsg,-1,true);
		calleeOnlineElement.classList.add("disableElement");
		msgboxdiv.classList.add("disableElement");
		bottomElement.classList.add("disableElement");
		answerButtonsElement.classList.add("disableElement");
	}, // xhr error
		errorAction,
		// TODO errorAction will switch back
		// if we don't want this we shd handle err like in notifyConnect()
		greetingMsg
	);
}

function enableCalleeOnlineElement(clearStatus) {
	console.log("enableCalleeOnlineElement");
	//showStatus("target ID: "+calleeID,-1,true);
	if(contactName!="" && contactName!="unknown" && contactName!=calleeID) {
		showStatus(calleeID+" "+contactName,-1,true);
	} else {
		showStatus(calleeID,-1,true);
	}

	setTimeout(function() {
		msgbox.value = "";
		answerButtons.style.display = "grid";
		calleeOnlineElement.style.display = "block";
		msgboxdiv.style.display = "block";
		bottomElement.style.display = "block";
		muteMicDiv.style.display = "block";
		nicknameElement.disabled = false;
		let nicknameDivElement = document.getElementById("nicknameDiv");
		nicknameDivElement.disabled = false;

		idSelectLabelElement.disabled = true;
		idSelectLabelElement.classList.remove("disableElement");

		answerButtons.classList.remove("disableElement");
		calleeOnlineElement.classList.remove("disableElement");
		nicknameDivElement.classList.remove("disableElement");
		msgboxdiv.classList.remove("disableElement");
		bottomElement.classList.remove("disableElement");
	},20);
}

function goodby() {
	gLog("goodby");
	if(goodbyMissedCall!="") {
		// goodbyMissedCall is used, when callee can not be reached (is offline)
		// in this case the server does NOT call peerConHasEnded(), so we call /missedCall from here
		// id=format: calleeID|callerName|callerID|ageSecs|msgbox
		// goodbyMissedCall arrives as urlID but is then tokenized
		if(wsConn!=null) {
			console.log('goodbyMissedCall missedCall wsSend='+goodbyMissedCall);
			wsSend("missedcall|"+goodbyMissedCall);
		} else {
			// tell server to store a missed call entry
			// doing sync xhr in goodby/beforeunload (see: last (7th) parameter = true)
			console.log('goodbyMissedCall /missedCall syncxhr='+goodbyMissedCall);
			let api = apiPath+"/missedCall?id="+goodbyMissedCall;
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				   gLog('goodby /missedCall sent to '+goodbyMissedCall);
			}, function(errString,err) {
				   console.log('# goodby xhr error '+errString);
			}, false, true);
		}
	} else if(goodbyTextMsg!="" && wsConn!=null) {
		// goodbyTextMsg is used, when callee is online (peerconnect), but does not pick up (no mediaconnect)
		// in this case server calls peerConHasEnded() for the callee, where addMissedCall() is generated
		if(wsConn!=null) {
			gLog('goodbyTextMsg wsSend='+goodbyTextMsg);
			wsSend("msg|"+goodbyTextMsg);
		} else {
			// sync xhr?
			// no solution for this yet
			gLog('goodbyTextMsg syncxhr not yet impl '+goodbyTextMsg);
		}
	}
	goodbyDone = true;

	if(wsConn) {
		// only peerDisConnect() if this session has established a wsConn
		if(typeof Android !== "undefined" && Android !== null) {
			Android.peerDisConnect();
		}
		if(wsConn) {
			wsConn.close();
			wsConn = null;
		}
	}
}

function confirmNotifyConnect() {
	//console.log("confirmNotifyConnect callerName="+callerName+" callerId="+callerId+" callerHost="+callerHost);
	notifyConnect(callerName,callerId,location.host);
}

function submitFormDone(idx) {
	console.log("submitFormDone() idx="+idx+" callerName="+callerName);
	if(idx==1) {
		// DialID: switch back to default container
		calleeID = cleanStringParameter(enterIdValElement.value,true); // remove all white spaces

		// get callerId from 'idSelect2'  idSelectElement.selectedIndex
		idSelectElement = document.getElementById("idSelect2");
		if(idSelectElement && idSelectElement.options.length>0 && idSelectElement.selectedIndex>=0) {
			callerId = idSelectElement.options[idSelectElement.selectedIndex].value;

			// TODO also do getContact(calleeID) to get preferred callerName <- callerNickname ?
			// otoh: if user does dial-ID, then calleeID may not be stored as contact
		}

		console.log("submitFormDone calleeID="+calleeID+" callerId="+callerId);
		// TODO .host may have :443 set, while DomainVal may not
		gLog("submitFormDone targetDomain="+enterDomainValElement.value+" location.host="+location.host);
		if(cleanStringParameter(enterDomainValElement.value,true) != location.host) {
			// calling a remote server callee
			// if we are running on Android, callUrl will be handled by onNewIntent() in the activity
			//   which will forward callUrl via iframeWindowOpen() to the remote host

			// if location.host is an internal ip-addr:port, which cannot be adressed over he internet
			// then sending callerHost=location.host is futile

			// below code tries to catch an window.open() error ("host not found")
			// and throw an alert() instead of relying on an ugly browser err-msg
			let randId = ""+Math.floor(Math.random()*1000000);
			if(callerId=="") {
				// if user has deliberately selected incognito, this is set to 'none'
				console.log("submitFormDone empty callerId set to cookieName="+cookieName);
				callerId = cookieName;
			}
			let callUrl = "https://"+cleanStringParameter(enterDomainValElement.value,true)+"/user/"+calleeID+
				"?callerId="+callerId + "&callerHost="+callerHost;
			//if(contactName!="") {
			//	callUrl += "&contactName="+contactName;
			//}
			if(playDialSounds==false) {
				callUrl += "&ds=false";
			}
			callUrl += "&i="+randId;
			var openOK = false;
			try {
				console.log("submitFormDone window.open "+callUrl);
				// in WebCallAndroid: callUrl being opened will trigger onNewIntent()
				openOK = window.open(callUrl, "");
				//console.log("submitFormDone window.open "+callUrl+" done");
				// callUrl has been opened in a separate tab (browser) or in the secondary webview
				// we can close contacts now (but only if we have been called from contacts)
				//history.back(); // close contacts
			} catch(e) {
				// if we end here, the domain cannot be reached, so we don't do window.open()
				console.log("# submitFormDone window.open("+callUrl+") ex="+e);
				//alert("Connection failed. Please check the server address.");
				showStatus("Connection failed. Please check the server address.");
				//de-focus submit button
				document.activeElement.blur();
			} finally {
				if(!openOK) {
					// if we end here, the domain cannot be reached, so we don't do window.open()
					console.log("# submitFormDone !openOK window.open("+callUrl+")");
					//alert("Connection failed. Please check the server address.");
					showStatus("Connection failed. Please check the server address.");
					//de-focus submit button
					document.activeElement.blur();
				} else {
					// everything OK
					// on android the window.open() may be handled by dialId() or by an ext browser
					//console.log("submitFormDone window.open("+callUrl+") no err");
					enterIdElement.style.display = "none";
					containerElement.style.display = "block";
					history.back();
					return;
				}
			}
		} else {
			// the callee to call is hosted on the same server
			enterIdElement.style.display = "none";
			containerElement.style.display = "block";
			onload2();
		}
	} else if(idx==2) {
		// get TextChat-msg from enterTextElement and send it via dataChannel
		let text = cleanStringParameter(enterTextElement.value,false);
		//console.log("submitText text="+text);
		if(isDataChlOpen()) {
			dataChannel.send("msg|"+text);
			// add text to msgbox
			let msg = "> " + text;
			if(msgbox.value!="") { msg = newline + msg; }
			msgbox.value += msg;
			//console.log("msgbox "+msgbox.scrollTop+" "+msgbox.scrollHeight);
			msgbox.scrollTop = msgbox.scrollHeight-1;
			enterTextElement.value = "";
		}
	}
}

function errorAction2(errString,err) {
	console.log("# xhr error "+errString+" "+err);
	// let user know via alert
	//alert("xhr error "+errString);
	showStatus("xhr error "+errString);
}

function notifyConnect(callerName,callerId,callerHost) {
	// nickname form was valid
	// the next xhr will freeze until offline or hidden callee accepts the call
	//showStatus("Trying to get"+" "+calleeID+" "+"on the phone. Please wait...",-1);
	let name = calleeID;
	if(contactName!="" && contactName!="unknown") {
		name = contactName+" ("+calleeID+")";
	}
	showStatus(lg("TryingToGet")+" "+name+" "+lg("onThePhonePleaseWait"),-1,false);

	if(divspinnerframe) {
		divspinnerframe.style.display = "block";
	}
	goodbyMissedCall = "";
	// notify calleeID (on behalf of callerId)
	// NOTE this may take a while bc the server will have to post a direct msg

	// if muteMicElement is checked -> request &text=true
	var textModeArg = ""
	if(muteMicElement && muteMicElement.checked) {
		textModeArg = "&text=true";
	}
	let api = apiPath+"/notifyCallee?id="+calleeID +
		"&callerId="+callerId + "&callerName="+callerName + "&callerHost="+callerHost + textModeArg +
		"&msg="+cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
	xhrTimeout = 30*60*1000; // 30 min extended xhr timeout
	console.log("notifyConnect api="+api+" timeout="+xhrTimeout);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		//console.log("/notifyCallee?id xhr.responseText="+xhr.responseText);
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}
		if(xhr.responseText=="ok") {
			gLog('callee is now online. switching to call layout.');
			// switch to callee-is-online layout
			// auto-click on call button
			dialButton.click();
			return;
		}
		console.log('notify: callee could not be reached (%s)',xhr.responseText);
		//showStatus("Sorry! Unable to reach "+calleeID+".<br>Please try again a little later.",-1,false);
		let name = calleeID;
		if(contactName!="" && contactName!="unknown") {
			name = contactName+" ("+calleeID+")";
		}
		showStatus(lg("sorryUnableToReach")+" "+name+"<br>"+
			"<a href='javascript:window.location.href=window.location.href'>"+lg("PleaseTryAgainALittle")+"</a>",-1);
	}, function(errString,errcode) {
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}
		//errorAction(errString)
		gLog('notify: callee could not be reached. xhr err',errString,errcode);
		//showStatus("Sorry! Unable to reach "+calleeID+".<br>Please try again a little later.",-1);
		let name = calleeID;
		if(contactName!="" && contactName!="unknown") {
			name = contactName+" ("+calleeID+")";
		}
		showStatus(lg("sorryUnableToReach")+" "+name+"<br>"+
			"<a href='javascript:window.location.href=window.location.href'>"+lg("PleaseTryAgainALittle")+"</a>",-1);
	});
}

function errorAction(errString,errcode) {
	console.log("# errorAction "+errString+" "+errcode);
	if(errString.startsWith("fetch")) {
		showStatus("No response from signaling server",-1,true);
	} else {
		showStatus("Error xhr "+errString,-1,true);
	}
}

function gotStream2() {
	//console.log("gotStream2 audioTracks len="+localStream.getAudioTracks().length);

	if(dialAfterLocalStream) {
		// dialAfterLocalStream was set by calleeOnlineAction() -> dialAfterCalleeOnline
		console.log("gotStream2 dialAfter connectSignaling()");
		dialAfterLocalStream = false;
		connectSignaling("",dial); // when ws-connected to server, call dial() to call peer
		return;
	}

	// we land here after audio/video was initialzed
	//console.log("gotStream2 !dialAfter");
	if(videoEnabled) {
		console.log("gotStream2 !dialAfter videoEnabled: no mute mic until dial");
	} else if(!localStream) {
		console.log("# gotStream2 !dialAfter !localStream: no mute mic until dial");
	} else if(rtcConnect) {
		console.log("gotStream2 !dialAfter rtcConnect: no mute mic until dial");
	} else {
		console.log("gotStream2 !dialAfter mute mic until dial");

		// disable local mic until we start dialing
		localStream.getTracks().forEach(track => {
			gLog('gotStream2 local mic track.stop()',track);
			track.stop();
		});

		const audioTracks = localStream.getAudioTracks();
		console.log('gotStream2 removeTrack local mic audioTracks.length='+audioTracks.length);
		if(audioTracks.length>0) {
			gLog('gotStream2 removeTrack local mic',audioTracks[0]);
			audioTracks[0].stop();
			audioTracks[0].enabled = false;
			localStream.removeTrack(audioTracks[0]);
		}

		const videoTracks = localStream.getVideoTracks();
		gLog('gotStream2 removeTrack local vid videoTracks.length',videoTracks.length);
		if(videoTracks.length>0) {
			gLog('videoOff removeTrack local vid',videoTracks[0]);
			// TODO would it be enough to do this?
			//videoTracks[0].enabled = false;
			videoTracks[0].stop();
			localStream.removeTrack(videoTracks[0]);
		}

		localStream = null;
	}
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
	let msg = getStatsCandidateTypesEx(results,eventString1)
	console.log("getStatsCandidateTypes "+msg);
	wsSend("log|caller "+msg);

	if(eventString2!="") {
		msg += " "+eventString2;
	}

	if(otherUA!="") {
		msg += "<div style='font-size:0.8em;margin-top:10px;color:#aac;'>UA: "+otherUA+"</div>";
	}
	showStatus(msg,0,true);
}

function connectSignaling(message,openedFunc) {
	if(!window["WebSocket"]) {
		console.error('connectSignaling: no WebSocket support');
		showStatus("No WebSocket support",0,true);
		return;
	}
	if(wsAddr=="") {
		gLog('connectSignaling: no wsAddr for callee='+calleeID);
		return;
	}
	console.log('connectSignaling: open ws connection '+calleeID+' '+wsAddr);
	let tryingToOpenWebSocket = true;
    var wsUrl = wsAddr;
	if(callerId!="") {
		wsUrl += "&callerId="+callerId;
	}
	if(callerName!="") {
		wsUrl += "&callerName="+callerName;
	}
	if(callerHost!="") {
		wsUrl += "&callerHost="+callerHost;
	}

	// if muteMicElement is checked -> request &text=true from callee
	if(muteMicElement && muteMicElement.checked) {
		wsUrl += "&text=true";
	}

//	if(typeof Android !== "undefined" && Android !== null) {
//		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
//			wsUrl = wsUrl + "&ver="+Android.getVersionName();
//		}
//		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
//			wsUrl = wsUrl + "_" + Android.webviewVersion() +"_"+ clientVersion;
//		}
//	} else {
		wsUrl = wsUrl + "&ver="+clientVersion;
//	}

	gLog('connectSignaling: wsUrl='+wsUrl);
	wsConn = new WebSocket(wsUrl);
	wsConn.onopen = function () {
		gLog('ws connection open '+calleeID);
		tryingToOpenWebSocket = false;
		if(message!="") {
			wsSend(message); // most likely "callerOffer" with localDescription
			gLog('ws message sent');
		}
		if(openedFunc) {
			openedFunc(); // dial()
		}
	};
	wsConn.onmessage = function (evt) {
		var messages = evt.data.split('\n');
		for (var i = 0; i < messages.length; i++) {
			signalingCommand(messages[i]);
			if(!peerCon || peerCon.iceConnectionState=="closed") {
				break;
			}
		}
	};
	wsConn.onerror = function(evt) {
		// this can be caused by a network problem
		// this can also mean that callee has gone offline recently and that wsAddr is now outdated
		// should this generate a /missedcall? no, bc we continue in onClose()
		if(evt && evt.data) {
			showStatus("connect error "+evt.data,0,true);
		} else {
			showStatus("connect error",0,true);
		}
		wsAddr = "";
		stopAllAudioEffects();
		hangupButton.disabled = true;
		dialButton.disabled = false;
	}
	wsConn.onclose = function (evt) {
		if(tryingToOpenWebSocket) {
			// onclose before a ws-connection could be established
			// likely wsAddr is outdated (may have been cleared by onerror already)
			gLog("wsConn.onclose: clear wsAddr="+wsAddr);
			wsAddr = "";
			tryingToOpenWebSocket = false;
			hangupButton.disabled = true;
			dialButton.disabled = false;
			// clearing wsAddr does not always have the desired effect (of resulting in no err on next try)
			// so retry with checkCalleeOnline(true) (since wsConn is closed, we don't need to hangup)
			//hangupWithBusySound(false,"connect error");
			checkCalleeOnline(true,"onclose");
		} else {
			// it is common for the signaling server to disconnect the caller early
			gLog('wsConn.onclose');
		}
		wsConn = null;
		if(!mediaConnect) {
//			onlineIndicator.src="";
		}
	};
}

function signalingCommand(message) {
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}
	//console.log("...signaling cmd="+cmd);

	if(cmd=="calleeAnswer") {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.warn('calleeAnswer abort no peerCon');
			return;
		}
		let hostDescription = JSON.parse(payload);
		//console.log("calleeAnswer setLocalDescription (onIceCandidates="+onIceCandidates+")");
		// setLocalDescription will cause "onsignalingstate have-local-offer"
		peerCon.setLocalDescription(localDescription).then(() => {
			//console.log('calleeAnswer setRemoteDescription');
			peerCon.setRemoteDescription(hostDescription).then(() => {
				console.log("calleeAnswer setRemoteDescription done");
			}, err => {
				console.warn("calleeAnswer setRemoteDescription fail",err)
				showStatus("Error: Cannot set remoteDescr "+err,0,true);
			});
		}, err => {
			console.warn("# calleeAnswer setLocalDescription fail",err)
			showStatus("Error: Cannot set localDescr "+err,0,true);
		});

	} else if(cmd=="calleeOffer") {
		// calleeOffer is being used when callee wants to deliver a config change
		let hostDescription = JSON.parse(payload);
		console.log('calleeOffer setRemoteDescription');

		peerCon.setRemoteDescription(hostDescription).then(() => {
			console.log("calleeOffer setRemoteDescription done");

			if(hostDescription.type == "offer") {
				console.log('calleeOffer received offer createAnswer');
				peerCon.createAnswer().then((desc) => {
					localDescription = desc;
					console.log('calleeOffer got localDescription');
					localDescription.sdp =
						maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
					localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
						'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
					peerCon.setLocalDescription(localDescription).then(() => {
						console.log('calleeOffer localDescription set -> signal');
						if(isDataChlOpen()) {
							console.log('calleeOffer callerAnswer -> signal (dataChl)');
							dataChannel.send("cmd|callerAnswer|"+JSON.stringify(localDescription));
						} else {
							console.log('calleeOffer callerAnswer -> signal');
							wsSend("callerAnswer|"+JSON.stringify(localDescription));
						}
					}, err => console.error(`# Failed to set local descr: ${err.toString()}`));
				}, err => {
					console.warn("# calleeOffer failed to createAnswer",err)
					showStatus("Error: Failed to createAnswer",0,true);
				});
			} else {
				console.log("# calleeOffer received no offer:",hostDescription.type);
			}

		}, err => {
			console.warn("# calleeOffer setRemoteDescription fail",err)
			showStatus("Error: Cannot set remoteDescr "+err,0,true);
		});

	} else if(cmd=="calleeCandidate") {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.warn('cmd calleeCandidate abort no peerCon');
			hangupWithBusySound(true,"Peer connection lost");
			return;
		}
		var calleeCandidate = JSON.parse(payload);

		// see: https://stackoverflow.com/questions/61292934/webrtc-operationerror-unknown-ufrag
		calleeCandidate.usernameFragment = null;

		var addIceCalleeCandidate = function(calleeCandidate,loop) {
			if(calleeCandidate.candidate==null) {
				if(!gentle) console.warn('calleeCandidate.candidate==null');
				return
			}

			let tok = calleeCandidate.candidate.split(' ');
			if(tok.length<5) {
				if(calleeCandidate.candidate!="") {
					console.warn("# cmd calleeCandidate format err",calleeCandidate.candidate);
				}
				return;
			}
			let address = tok[4];
			if(tok.length>=10 && tok[8]=="raddr" && tok[9]!="" && tok[9].length>=7 && tok[9]!="0.0.0.0") {
				address = tok[9];
			}

			//console.log("calleeCandidate",address,calleeCandidate.candidate);
			//console.log("calleeCandidate "+loop+" "+address);

			// "Failed to execute 'addIceCandidate' on 'RTCPeerConnection'"
			// may happen if peerCon.setRemoteDescription is not finished yet
			if(!peerCon || peerCon.iceConnectionState=="closed") {
				console.warn("# cmd calleeCandidate abort no peerCon");
				return;
			}
			if(!peerCon.remoteDescription) {
				// this happens bc setRemoteDescription may take a while
				if(loop<6) {
					//console.log("! cmd calleeCandidate !peerCon.remoteDescription "+loop,calleeCandidate.candidate);
					setTimeout(addIceCalleeCandidate,100,calleeCandidate,loop+1);
				} else {
					console.warn("# cmd calleeCandidate !peerCon.remoteDescription "+loop,
						calleeCandidate.candidate);
				}
				return;
			}
			if(!peerCon.remoteDescription.type) {
				if(loop<6) {
				  //console.log("! cmd calleeCandidate !peerCon.remoteDescription.type "+loop, calleeCandidate.candidate);
					setTimeout(addIceCalleeCandidate,100,calleeCandidate,loop+1);
				} else {
					console.warn("# cmd calleeCandidate !peerCon.remoteDescription.type "+loop,
						calleeCandidate.candidate);
				}
				return;
			}
			peerCon.addIceCandidate(calleeCandidate).catch(e => {
				console.error("# addIce calleeCandidate",e,payload);
				showStatus("RTC error "+e,0,true);
			});
		}
		addIceCalleeCandidate(calleeCandidate,1);

	} else if(cmd=="pickup") {
		// callee has picked up the call
		if(!rtcConnect) {
			if(!gentle) console.warn('cmd pickup without rtcConnect; ignored');
			return
		}

		console.log("callee is answering call");
		if(!localStream) {
			// TODO no localStream OK in textmode (if muteMicElement && muteMicElement.checked)?
			console.warn("cmd pickup no localStream");
			// I see this when I quickly re-dial while busy signal of last call is still playing
			// TODO button may now continue to show "Connecting..."
			// but connection is still established (at least when calling answ)
			hangupWithBusySound(true,"no localStream");
			return;
		}

		// callee.js has responded to our callerOffer
		// get callerName from form and don't forget cleanStringParameter(,true)
		callerName = cleanStringParameter(nicknameElement.value,true);
		// contactAutoStore is only true if caller is logged in on the local server
		// if the caller is a remote user (calling someone on this server), contactAutoStore will be false
		if(contactAutoStore && cookieName!="" && calleeID!="") {
			// store the user being called (calleeID) into the contacts of the caller (cookieName)
			let compoundName = contactName+"|"+callerId+"|"+callerName;
			let api = apiPath+"/setcontact?id="+cookieName+"&contactID="+calleeID + "&name="+compoundName;
			gLog("request api="+api);
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				gLog("xhr setcontact OK "+xhr.responseText);
			}, errorAction2);
		} else {
			//console.log('signalingCommand no store contact',contactAutoStore,cookieName,calleeID);
		}

/*
		// open textChat or enable chatButton
		chatButtonLabel.onclick = function() {
			if(textchatOKfromOtherSide) {
				console.log("chatButtonLabel.onclick -> enableDisableTextchat");
				enableDisableTextchat(false);
			} else {
				//chatButtonLabel.style.display = "none";
				showStatus("Peer does not support textchat",4000);
			}
		}
*/
		// callee has accepted our call, if muteMicElement checked -> enable textchat
		if(muteMicElement.checked) {
			// we auto-open the textbox bc the caller requested textmode
			console.log("muteMicElement.checked -> enableDisableTextchat");
			enableDisableTextchat(true);
		}

		// start muteMicElement checked handler to mute/unmute the local mic
		if(muteMicElement) {
			muteMicElement.addEventListener('change', function() {
				muteMic(this.checked);
			});
		}

		if(typeof Android !== "undefined" && Android !== null) {
			// on smartphones this is supposed to disable speakerphone
			// remote audio will be played back on earpiece (if available) instead of speakerphone
			// will also disable screenorientlock
			Android.peerConnect();
		}

		var enableRemoteStream = function(calleeCandidate) {
			console.log('enableRemoteStream stopAllAudioEffects');
			stopAllAudioEffects();

			if(remoteVideoFrame) {
				// enable (un-mute) remoteStream
				gLog('set remoteVideoFrame '+remoteStream);
				remoteVideoFrame.srcObject = remoteStream;
				remoteVideoFrame.play().catch(function(error) {
					console.warn("# enableRemoteStream remoteVideoFrame err="+error);
				});
			}

			mediaConnect = true;
			console.log("mediaConnect (set dialing=false)");
			dialing = false;
			msgboxdiv.style.display = "none";

			// enable avSelect
// TODO tmtmtm
//			if(navigator.userAgent.indexOf("Android")<0 && navigator.userAgent.indexOf("Dalvik")<0) {
				avSelect.style.display = "inline-block";
				calleeOnlineElement.style.display = "block";
				calleeOnlineElement.classList.remove("disableElement");

				idSelectLabelElement.disabled = true;
				idSelectLabelElement.classList.add("disableElement");

				let nicknameDivElement = document.getElementById("nicknameDiv");
				nicknameDivElement.disabled = true;
				nicknameDivElement.classList.add("disableElement");
//			}

			// on start of fullConnect: un-mute mic if muteMicElement not checked
			if(localStream) {
				if(!muteMicElement || !muteMicElement.checked) {
					const audioTracks = localStream.getAudioTracks();
					if(audioTracks==null) {
						// severe
						console.log("# on mediaConnect audioTracks==null, cannot enable mic");
					} else if(!audioTracks[0]) {
						// severe
						console.log("# on mediaConnect audioTracks[0]==null, cannot enable mic");
					} else {
						audioTracks[0].enabled = true;
						console.log("on mediaConnect enabled mic");
					}
				}
			} else {
				// severe
				console.log("# on mediaConnect no localStream");
			}
			if(vsendButton) {
				vsendButton.style.display = "inline-block";
			}
			mediaConnectStartDate = Date.now();
			goodbyMissedCall = "";
			// clear own greeting-msg
			msgbox.value = "";

			if(fileselectLabel && isDataChlOpen()) {
				if(isP2pCon()) {
					fileselectLabel.style.display = "block";
					fileSelectInit();
				} else {
					gLog("fileselectLabel not enabled (not p2p)");
				}
			} else {
				console.log("# fileselectLabel not enabled (no dataChl)");
			}

			if(chatButtonLabel) {
				if(isDataChlOpen()) {
					// good
					chatButtonLabel.style.display = "block";
				} else {
					chatButtonLabel.style.display = "none";
					console.log("# chatButtonLabel not enabled (no dataChl)");
				}
			}

			// getting stats (p2p or relayed connection)
			console.log("full mediaConnect, getting stats...");
			peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,lg("connected"),"E2EE"),
				err => console.log(err));

			// in case local video is active, blink vsendButton
			if(videoEnabled && vsendButton && !addLocalVideoEnabled) {
				gLog('full mediaConnect, blink vsendButton');
				vsendButton.classList.add('blink_me');
				setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
			}
		}

		// we now wait up to 5x300ms for remoteStream before we continue with enableRemoteStream()
		// remoteStream will arrive via: peerCon.ontrack onunmute
		var waitLoopCount=0;
		let waitForRemoteStreamFunc = function() {
			if(!remoteStream) {
				waitLoopCount++;
				console.log('! waitForRemoteStreamFunc '+remoteStream+" "+waitLoopCount);
				if(waitLoopCount<=5) {
					console.log("# waitForRemoteStreamFunc force enableRemoteStream");
					setTimeout(waitForRemoteStreamFunc, 300);
					return;
				}
			}
			enableRemoteStream();
		}
		console.log('waitForRemoteStreamFunc start...');
		waitForRemoteStreamFunc();

		/*
		// offer store contact link (only if callerId and calleeID exist)
		// TODO: if "store contact" is clicked while in call, the call gets disconnected
		// enable button at the end of hangup()
		if(callerId!="" && calleeID!="" && callerHost!="" && callerHost!=location.host) {
			let storeContactElement = document.getElementById("storeContact");
			if(storeContactElement) {
				let fullContactId = calleeID+"@"+location.host;
				//console.log("contactName (for storeContactLink)=("+contactName+")");
				let storeContactLink = "https://"+callerHost+"/callee/contacts/store/?id="+callerId+
					"&contactId="+fullContactId+"&contactName="+contactName+"&callerName="+callerName;
				storeContactElement.innerHTML = "<a href='"+storeContactLink+"'>Store contact</a>";
			}
		}
		*/
	} else if(cmd=="cancel") {
		// either the server or the peer wants us disconnected
		if(payload!="c") {
			setTimeout(function() {
				if(wsConn) {
					if(!mediaConnect) {
						// before wsConn.close(): send msgbox text (via server) to peer
						let msgboxText = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
						if(msgboxText!="") {
							wsSend("msg|"+msgboxText);
						}
					}
					// make sure server will generate a missed call
					wsSend("cancel|");

					wsConn.close();
					// wsConn=null prevents hangup() from generating a return cancel msg
					wsConn=null;
				}
				hangupWithBusySound(false,"Peer has disconnected");
			},250);
		} else {
			console.log("ignore cancel "+payload);
		}

	} else if(cmd=="ring") {
		if(!rtcConnect) {
			earlyRing = true;
			console.log("cmd ring");
			showStatus(lg("ringingText"),-1); // Ringing...
		} else {
			console.log("cmd ring, but already rtcConnect");
		}
	} else if(cmd=="sessionDuration") {
		// longest possible call duration
		sessionDuration = parseInt(payload);
		gLog('sessionDuration '+sessionDuration);
		if(sessionDuration>0 && mediaConnect && !isP2pCon() && !timerStartDate) {
			startTimer(sessionDuration);
		}

	} else if(cmd=="calleeInfo") {
		let idxTab = payload.indexOf("\t");
		if(idxTab>=0) {
			let calleeName = payload.substring(idxTab+1);
			//console.log('cmd calleeInfo ('+calleeID+') ('+calleeName+')');
			if(calleeName!="" && calleeName!="unknown") {
				// if we receive a calleeName via calleeInfo, we use it over existing contactName
				contactName = calleeName;
			}
		} else {
			//console.log('cmd calleeInfo payload=('+payload+')');
		}

	} else if(cmd=="ua") {
		otherUA = payload;
		gLog("otherUA "+otherUA);

	} else if(cmd=="rtcVideoOff") {
		// remote video has ended
		gLog("rtcVideoOff");
		remoteVideoHide();

	} else if(cmd=="stopCamDelivery") {
		gLog("stopCamDelivery");
		connectLocalVideo(true);

	} else if(cmd=="textmode") {
		console.log("textmode="+payload);
		if(payload=="true") {
			// callee is live-requestiong textmode: open Textchat + mute mic
			enableDisableTextchat(true);
			// hide chat-button
			//chatButtonLabel.style.display = "none";
			// mute mic
			if(muteMicElement.checked==false) {
				muteMicElement.checked = true;
				muteMic(true);
				// remember to turn muteMic off on hangup
				muteMicModified = true;

				// tell caller about textmode, requested by callee
				let confirmDialog = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:18px; line-height:1.4em; border-radius:3px; cursor:pointer; width:80%; max-width:600px; top:10px; left:50%; transform:translate(-50%,0%);'><div style='font-weight:600;'>WebCall TextChat</div><br><div>TextChat was requested by the other side. Your microphone is now muted.<br>You can un-mute and switch to voice telephony at any time.<br><br></div><div style='text-align:center;'><a onclick='history.back();'>OK</a></div></div>";
				menuDialogOpen(dynDialog,0,confirmDialog);
			}
		}
	} else {
		//console.log("# ignore incom cmd='"+cmd+"'");
	}
}

function wsSend(message) {
	if(wsConn==null || wsConn.readyState!=1) {
		if(wsConn==null) {
			console.log('wsSend wsConn==null -> connectSignaling() '+message);
		} else {
			console.log('wsSend wsConn.readyState=="+wsConn.readyState+" -> connectSignaling() '+message);
		}
		connectSignaling(message,null);
	} else {
		wsConn.send(message);
	}
}

let dialDate;
function dial() {
	// start dialing: playDialSound and prepare to stop sound on mediaConnect
	if(!localStream) {
		console.warn('dial abort no localStream');
		showStatus("Dialing canceled",0,true);
		hangupWithBusySound(true,"no localStream");
		return;
	}

	console.log('dial...');
	otherUA = "";
	dialing = true;
	rtcConnect = false;
	earlyRing = false;

	if(playDialSounds) {
		let loop = 0;
		//console.log('playDialTone start loop...');
		var playDialTone = function() {
			if(!dialing) {
				console.log('playDialTone abort no dialing');
				return;
			}
			if(doneHangup) {
				console.log('playDialTone abort doneHangup');
				return;
			}
			if(!wsConn) {
				console.log('playDialTone abort no wsConn');
				return;
			}
			if(mediaConnect) {
				console.log('playDialTone abort is mediaConnect');
				return;
			}
			if(!dtmfDialingSound) {
				console.log('# playDialTone abort no dtmfDialingSound');
				return;
			}
			console.log('playDialTone loop='+loop);
			if(loop>0) {
				dtmfDialingSound.currentTime = 2;
			} else {
				dtmfDialingSound.currentTime = 0;
			}
			loop++;
			dtmfDialingSound.volume = 0.5;
			dtmfDialingSound.onended = playDialTone;
			dtmfDialingSound.play().catch(function(error) {
				// "The play() request was interrupted by a call to pause()."
				console.log("# playDialTone err="+error);
				//showStatus("Error: DialSound "+error,-1,true);
			});
		}

		setTimeout(function() {
			playDialTone();
		},10);
	}

	dial2();
}

function dial2() {
	// start dialing part 2: create new RTCPeerConnection, setting up peerCon
	if(fileselectLabel) {
		fileselectLabel.style.display = "none";
		progressSendElement.style.display = "none";
		progressRcvElement.style.display = "none";
	}

//	onlineIndicator.src="";
	doneHangup = false;
	candidateResultGenerated = false;
	candidateArray = [];
	candidateResultString = "";
	dialDate = Date.now();
	//console.log('dial2 dialDate='+dialDate);

	if(!localStream) {
		console.log('# dial2 localStream');
		//showStatus("Dialup canceled (no localStream)");
		stopAllAudioEffects();
		hangup(true,false,"no localStream");
		return;
	}
	const audioTracks = localStream.getAudioTracks();
	if(audioTracks.length<=0) {
		console.log('# dial2 no audioTracks');
		//showStatus("Dialup canceled (no mic)");
		stopAllAudioEffects();
		hangup(true,false,"no mic");
		return;
	}

	if(typeof myUserMediaDeviceId !== "undefined" && myUserMediaDeviceId!=null &&
			myUserMediaDeviceId!="" && myUserMediaDeviceId!="default") {
		console.log('dial2 set avSelect.value='+myUserMediaDeviceId);
		avSelect.value = myUserMediaDeviceId;
	}

	// show connectingText with additional dots - in case we don't get a quick peerConnect
	// when this msg shows up, either peerCon is really slow, or there is a webrtc problem
	// if peerConnect is quick (as in most cases), we will see "ringing..." instead (with rtcConnect set)
	setTimeout(function(lastDialDate) {
		if(dialDate==lastDialDate && !doneHangup && !rtcConnect && !earlyRing) { // still the same call after 3s?
			showStatus(connectingText+"...",-1); // "Connecting P2P......"
		}
	},3000,dialDate);

	addedAudioTrack = null;
	addedVideoTrack = null;
	onIceCandidates = 0;
	try {
		console.log("dial2 peerCon = new RTCPeerConnection");
		peerCon = new RTCPeerConnection(ICE_config);
		hangupButton.disabled = false;
		dialButton.disabled = true;
		answerButtons.classList.remove("disableElement");
	} catch(ex) {
		console.error("# RTCPeerConnection "+ex.message);
		var statusMsg = "RTCPeerConnection "+ex.message;
		if(typeof Android !== "undefined" && Android !== null) {
			statusMsg += " <a href='https://timur.mobi/webcall/android/#webview'>More info</a>";
		}
		showStatus(statusMsg,0,true);

		stopAllAudioEffects();
		hangup(true,false,"WebRTC error");
		// now both buttons (Call/Hangup) are deactivated
		return;
	};
	peerCon.onicecandidate = e => onIceCandidate(e,"callerCandidate");
	peerCon.onicecandidateerror = function(e) {
		// don't warn on
		//  701 (chrome "STUN allocate request timed out" or "address is incompatible")
		//  400 = bad request
		if(e.errorCode==701 || e.errorCode==400) {
			//console.log("# peerCon onicecandidateerror", e.errorCode, e.errorText, e.url);
		} else {
			if(!gentle) console.warn("peerCon onicecandidateerror", e.errorCode, e.errorText, e.url);
			showStatus("Error: iceCandidate "+e.errorCode+" "+e.errorText,0,true);
		}
	}
	peerCon.ontrack = ({track, streams}) => peerConOntrack(track, streams);
	peerCon.onnegotiationneeded = async () => {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log('# peerCon onnegotiationneeded !peerCon');
			return;
		}
		try {
			// note: this will trigger onIceCandidates and send calleeCandidate's to the client
			gLog("peerCon onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');

			peerCon.setLocalDescription(localDescription).then(() => {
				if(doneHangup) {
					//console.log('! peerCon onnegotiationneeded deny doneHangup sent');
				} else if(!rtcConnect && !dialing) {
					console.log('# onnegotiationneeded deny send: !rtcConnect && !dialing');
				} else if(isDataChlOpen()) {
					let localDescriptionStr = JSON.stringify(localDescription);
					console.log('peerCon onnegotiationneeded send callerOfferUpd via dc');
					dataChannel.send("cmd|callerOfferUpd|"+localDescriptionStr);
				} else {
					console.log('peerCon onnegotiationneeded send callerOffer via ws');
					// when server receives our callerOffer, it sends 'callerInfo|' to the callee
/*
					// if msgboxText exists, send it before callerOffer
					let msgboxText = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
					//gLog('msgboxText=('+msgboxText+')');
					if(msgboxText!="") {
						gLog('msg=('+msgboxText+')');
						wsSend("msg|"+msgboxText);
					}
*/
					wsSend("callerOffer|"+JSON.stringify(localDescription));
				}
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("# peerCon onnegotiationneeded err",err);
		}
	};
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		console.log("peerCon onicegatheringstatechange "+connection.iceGatheringState);
		if(connection.iceGatheringState=="complete") {
			console.log("peerCon onIceCandidates from callee "+onIceCandidates);
		}
	}
	peerCon.onsignalingstatechange = event => {
		console.log("peerCon onsignalingstate "+peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		gLog("peerCon oniceconnectionstate "+peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		connectionstatechangeCounter++;
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log("# peerCon onconnectionstatechange !peerCon "+peerCon.connectionState);
			hangupWithBusySound(true,"Peer connection closed");
			return;
		}
		gLog("peerCon onconnectionstatechange "+peerCon.connectionState);
		if(peerCon.connectionState=="disconnected") {
			gLog("peerCon disconnected",rtcConnect,mediaConnect);
			hangupWithBusySound(true,"Peer is disconnected");
			return;
		}
		if(peerCon.connectionState=="failed") {
			// TODO in some situations this strikes multiple times; but there is no point playing busySound multpl times
			hangupWithBusySound(true,"Peer connection failed "+candidateResultString);
			return;
		}

		if(peerCon.connectionState=="connecting") {
			// if we see this despite being mediaConnect already, it is caused by createDataChannel
			//if(!mediaConnect) {
			//	showStatus(connectingText,-1);
			//}
		} else if(peerCon.connectionState=="connected") {
			// if we see this despite being mediaConnect already, it is caused by createDataChannel
			if(doneHangup) {
				console.log("# rtcConnect after doneHangup - ignore");
			} else {
				if(!rtcConnect && !mediaConnect) {
					// caller just now got peer-connected to callee; callee starts ringing now
					console.log('rtcConnect');
					rtcConnect = true;
					rtcConnectStartDate = Date.now();
					mediaConnectStartDate = 0;

					// set goodbyTextMsg (including msgbox text) to be evaluated in goodby
					//goodbyTextMsg = calleeID+"|"+callerName+"|"+callerId+
					//		"|"+Math.floor(Date.now()/1000)+"|"+msgbox.value.substring(0,300)
					goodbyTextMsg = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen)
					gLog('set goodbyTextMsg='+goodbyTextMsg);

					showStatus(lg("ringingText"),-1); // Ringing...
//					onlineIndicator.src="green-gradient.svg";
				}
			}
//			console.log("rtcConnect stop dialing");
//			dialing = false;
		}
	}

	// add selected local audioTrack (audio input / mic) to peerCon
	if(mediaConnect) {
		if(!muteMicElement || !muteMicElement.checked) {
			audioTracks[0].enabled = true; // unmute
			console.log('dial2 addTrack local audio input',audioTracks[0]);
		}
	} else {
		audioTracks[0].enabled = false; // mute
		console.log('dial2 addTrack local mute audio input',audioTracks[0]);
	}
	addedAudioTrack = peerCon.addTrack(audioTracks[0],localStream);

	createDataChannel();

	gLog('dial2 peerCon.createOffer');
	peerCon.createOffer().then((desc) => {
		localDescription = desc;
		localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
		localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
			'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
		// this localDescription will be sent with upcoming calleeAnswer in response to upcoming callerOffer

		// -> onsignalingstate have-local-offer
		// -> onnegotiationneeded send callerOffer via ws
		// -> signaling cmd calleeAnswer -> calleeAnswer setLocalDescription -> calleeAnswer setRemoteDescription
		// -> onconnectionstate connected
		// -> signaling cmd calleeOffer -> calleeOffer setRemoteDescription -> onsignalingstate have-remote-offer
		// -> calleeOffer received offer createAnswer
	}, err => console.warn(`dial createOffer failed: ${error.toString()}`));
}

function createDataChannel() {
	gLog('createDataChannel...');
	dataChannel = peerCon.createDataChannel("datachannel");
	dataChannel.onopen = event => {
		gLog("dataChannel.onopen");
		// tell other side that we support textchat
		textchatOKfromOtherSide = false;
		dataChannel.send("textchatOK");
	};
	dataChannel.onclose = event => dataChannelOnclose(event);
	dataChannel.onerror = event => dataChannelOnerror(event);
	dataChannel.onmessage = event => dataChannelOnmessage(event);
}

function dataChannelOnmessage(event) {
	if(doneHangup) {
		gLog("dataChannel.onmessage ignored on doneHangup");
		return;
	}
	if(typeof event.data === "string") {
		//console.log("dataChannel.onmessage "+event.data);
		if(event.data) {
			if(event.data.startsWith("disconnect")) {
				console.log("disconnect via dataChannel");
				if(dataChannel) {
					dataChannel.close();
					dataChannel = null;
				}
				hangupWithBusySound(false,"Disconnect by peer");
			} else if(event.data.startsWith("textchatOK")) {
				textchatOKfromOtherSide = true;
			} else if(event.data.startsWith("msg|")) {
				// sanitize incoming data
				//let cleanString = event.data.substring(4).replace(/<(?:.|\n)*?>/gm, "...");
				let cleanString = cleanStringParameter(event.data.substring(4),false);
				if(cleanString!="") {
					//gLog("dataChannel.onmessage msg",cleanString);
					//chatButtonLabel.style.display = "none";
					enableDisableTextchat(true);
					msgbox.readOnly = true;
					placeholderText = msgbox.placeholder;
					msgbox.placeholder = "";
					msgboxdiv.classList.remove("disableElement");
					textbox.style.display = "block"; // -> submitFormDone()
					let msg = "< " + cleanString;
					if(msgbox.value!="") { msg = newline + msg; }
					msgbox.value += msg;
					//console.log("msgbox "+msgbox.scrollTop+" "+msgbox.scrollHeight);
					msgbox.scrollTop = msgbox.scrollHeight-1;
					soundKeyboard();
				}
			} else if(event.data.startsWith("cmd|")) {
				let subCmd = event.data.substring(4);
				//gLog("subCmd="+subCmd);
				signalingCommand(subCmd);
			} else if(event.data.startsWith("file|")) {
				var fileDescr = event.data.substring(5);

				if(fileDescr=="end-send") {
					console.log("file transmit aborted by sender");
					progressRcvElement.style.display = "none";
					if(fileReceivedSize < fileSize) {
						showStatus("file transmit aborted by sender",-1);
					}
					fileReceivedSize = 0;
					fileReceiveBuffer = [];
					return;
				}
				if(fileDescr=="end-rcv") {
					console.log("file send aborted by receiver");
					showStatus("file send aborted by receiver",-1);
					fileSendAbort = true;
					progressSendElement.style.display = "none";
					if(fileselectLabel && mediaConnect && isDataChlOpen() && isP2pCon()) {
						fileselectLabel.style.display = "block";
					}
					return;
				}

				if(!showStatusCurrentHighPrio) {
					showStatus("",0);
				}
				fileReceiveAbort = false;
				// parse: "file|"+file.name+","+file.size+","+file.type+","+file.lastModified);
				let tok = fileDescr.split(",");
				fileName = tok[0];
				fileSize = 0;
				if(tok.length>=2) {
					fileSize = parseInt(tok[1]);
					progressRcvBar.max = fileSize;
					progressRcvElement.style.display = "block";
				}
				console.log("file="+fileName+" size="+fileSize);
				fileReceivedSize = 0;
				fileReceiveBuffer = [];
				fileReceiveStartDate = Date.now();
				fileReceiveSinceStartSecs=0;
			}
		}
	} else {
		if(fileReceiveAbort) {
			console.log("file receive abort");
			fileReceivedSize = 0;
			fileReceiveBuffer = [];
			return;
		}

		fileReceiveBuffer.push(event.data);
		var chunkSize = event.data.size; // ff
		if(isNaN(chunkSize)) {
			chunkSize = event.data.byteLength; // chrome
		}

		fileReceivedSize += chunkSize;
		progressRcvBar.value = fileReceivedSize;
		let sinceStartSecs = Math.floor((Date.now() - fileReceiveStartDate + 500)/1000);
		if(sinceStartSecs!=fileReceiveSinceStartSecs && sinceStartSecs!=0) {
			let kbytesPerSec = Math.floor(fileReceivedSize/1000/sinceStartSecs);
			progressRcvLabel.innerHTML = "receiving '"+fileName.substring(0,22)+"' "+kbytesPerSec+" KB/s";
			fileReceiveSinceStartSecs = sinceStartSecs;
		}
		if(fileReceivedSize === fileSize) {
			console.log("file receive complete");
			const receivedBlob = new Blob(fileReceiveBuffer);
			fileReceiveBuffer = [];
			progressRcvElement.style.display = "none";

			let randId = ""+Math.random()*100000000;
			var aDivElement = document.createElement("div");
			aDivElement.id = randId;
			downloadList.appendChild(aDivElement);

			var aElement = document.createElement("a");
			aElement.href = URL.createObjectURL(receivedBlob);
			aElement.download = fileName;
			let kbytes = Math.floor(fileReceivedSize/1000);
			aElement.textContent = `received '${fileName.substring(0,25)}' ${kbytes} KB`;
			aDivElement.appendChild(aElement);

			var aDeleteElement = document.createElement("a");
			aDeleteElement.style = "margin-left:10px;";
			aDeleteElement.onclick = function(){ downloadList.removeChild(aDivElement); }
			aDeleteElement.textContent = `[x]`;
			aDivElement.appendChild(aDeleteElement);
		}
	}
}

function stopAllAudioEffects() {
	gLog('stopAllAudioEffects');
	if(playDialSounds) {
		if(dtmfDialingSound) {
			gLog('stopAllAudioEffects dtmfDialingSound stop');
			dtmfDialingSound.pause();
			dtmfDialingSound.currentTime = 100000;
		}

		if(busySignalSound) {
			gLog('stopAllAudioEffects busySignalSound stop');
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
		}
	}
}

function hangup(mustDisconnectCallee,mustcheckCalleeOnline,message) {
	console.log("hangup: message="+message);
	dialing = false;

	textbox.style.display = "none";
	chatButtonLabel.style.display = "none";
	connectLocalVideo(true); // forceOff
	if(fileselectLabel) {
		fileselectLabel.style.display = "none";
		progressSendElement.style.display = "none";
		progressRcvElement.style.display = "none";
	}

	if(doneHangup) {
		gLog('hangup abort on doneHangup');
		return;
	}
	doneHangup = true;

	gLog('hangup msg='+message+' '+mustDisconnectCallee);

	stopTimer();

	localDescription = null;
	hangupButton.disabled = true;

	if(peerCon && peerCon.iceConnectionState!="closed") {
		if(addedAudioTrack) {
			gLog("hangup peerCon.removeTrack(addedAudioTrack)");
			peerCon.removeTrack(addedAudioTrack);
			addedAudioTrack = null;
		} else {
			gLog("hangup no addedAudioTrack for peerCon.removeTrack()");
		}

		let peerConCloseFunc = function() {
			console.log("hangup: peerConClose");
			if(mustDisconnectCallee) {
				let closePeerCon = function() {
					if(peerCon && peerCon.iceConnectionState!="closed") {
						const senders = peerCon.getSenders();
						if(senders) {
							gLog('hangup peerCon.removeTrack senders '+senders.length);
							try {
								senders.forEach((sender) => { peerCon.removeTrack(sender); })
							} catch(ex) {
								console.warn('hangup peerCon.removeTrack sender',ex);
							}
						}

						const receivers = peerCon.getReceivers();
						if(receivers) {
							gLog('hangup peerCon.receivers len='+receivers.length);
							try {
								receivers.forEach((receiver) => { receiver.track.stop(); });
							} catch(ex) {
								console.warn('hangup receiver.track.stop()',ex);
							}
						}

						const transceivers = peerCon.getTransceivers();
						if(transceivers) {
							gLog('hangup peerCon.transceivers len='+transceivers.length);
							try {
								transceivers.forEach((transceiver) => { transceiver.stop(); })
							} catch(ex) {
								console.warn('hangup peerCon.transceiver stop ex',ex);
							}
						}

						console.log("hangup: peerCon.close");
						peerCon.close();
					}
				}

				if(isDataChlOpen()) {
					console.log("hangup: send disconnect via dataChannel");
					dataChannel.send("disconnect");
					// give dataChannel disconnect some time to deliver
					setTimeout(function() {
						if(isDataChlOpen()) {
							console.log("hangup: dataChannel.close");
							dataChannel.close();
							dataChannel = null;
						}
						closePeerCon();
					},500);
				} else {
					gLog('hangup dataChannel not open');
					// most likely hangup came very early; unfortunately now we cannot disconnect callee
					closePeerCon();
				}
			} else {
				if(dataChannel) {
					gLog('hangup dataChannel.close');
					dataChannel.close();
					dataChannel = null;
				}

				// TODO peerCon.getSenders().forEach( peerCon.removeTrack(sender) ) etc like above?

				gLog('hangup peerCon.close 2 '+calleeID);
				peerCon.close();
				gLog('hangup peerCon.signalingState '+peerCon.signalingState);
			}
		}

		peerCon.getStats(null).then((results) => { 
			getStatsPostCall(results);
			peerConCloseFunc();
		}, err => {
			console.log("hangup: error="+err);
			peerConCloseFunc();
		});
	}

	if(typeof Android !== "undefined" && Android !== null) {
		Android.peerDisConnect();
	}

	mediaConnect = false;
	rtcConnect = false;
	if(vsendButton) {
		vsendButton.style.display = "none";
	}
	vmonitor();
	if(vsendButton) {
		vsendButton.classList.remove('blink_me')
	}

	if(message!="") {
		showStatus(message,-1);
	}

	// offer store contact link (only if callerId and calleeID exist)
	if(callerId!="" && calleeID!="" && callerHost!="" && !callerHost.startsWith(location.host)) {
		let storeContactElement = document.getElementById("storeContact");
		if(storeContactElement) {
			let fullContactId = calleeID+"@@"+location.host;
			if(calleeID.indexOf("@")>=0) {
				fullContactId = calleeID+"@"+location.host;
			}

			//console.log("contactName (for storeContactLink)=("+contactName+")");
			// TODO should not deliver contactName and callerName via URL, may trigger fail2ban
			let storeContactLink = "https://"+callerHost+"/callee/contacts/store/?id="+callerId+
				"&contactId="+fullContactId+"&contactName="+contactName+"&callerName="+callerName;
			storeContactElement.innerHTML = "<a href='"+storeContactLink+"'>Store contact</a>";
			// button will be removed in dialButtonClick()
		}
	}

	// enable nicknameElement input form
	nicknameElement.disabled = false;

	if(wsConn && wsConn.readyState==1) {
		console.log('hangup mustDisc='+mustDisconnectCallee+' readyState='+wsConn.readyState+" mediaCon="+mediaConnect);
		if(!mediaConnect) {
			let msgboxText = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
			//gLog('msgboxText=('+msgboxText+')');
			if(msgboxText!="") {
				gLog('hangup wsSend msg=('+msgboxText+')');
				wsSend("msg|"+msgboxText);
			}
		}
		if(mustDisconnectCallee) {
			// if hangup occurs while still ringing, send cancel
			// before that: send msgbox text to server
			gLog('hangup wsSend(cancel)');
			wsSend("cancel|c");
		}
	}

	if(muteMicModified) {
		console.log("hangup: undo muteMic");
		muteMicElement.checked = false;
		muteMic(false);
		muteMicModified = false;
	}

	msgbox.value = "";
	if(remoteVideoFrame) {
		gLog('hangup shutdown remoteAV');
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
	}
	remoteStream = null;

	if(videoEnabled) {
		gLog("hangup no shutdown localAV bc videoEnabled",videoEnabled);
	} else {
		gLog("hangup shutdown localAV");
		if(localStream) {
			// stop all localStream tracks
			localStream.getTracks().forEach(track => {
				gLog('hangup stop localStream track.stop()',track);
				track.stop(); 
			});

			// remove local mic from localStream
			const audioTracks = localStream.getAudioTracks();
			gLog('hangup remove local mic audioTracks.length',audioTracks.length);
			if(audioTracks.length>0) {
				gLog('hangup remove local mic removeTrack',audioTracks[0]);
				audioTracks[0].stop();
				localStream.removeTrack(audioTracks[0]);
			}

			// remove local vid from localStream
			const videoTracks = localStream.getVideoTracks();
			gLog('hangup remove local vid videoTracks.length '+videoTracks.length);
			if(videoTracks.length>0) {
				gLog('hangup remove local vid removeTrack',videoTracks[0]);
				videoTracks[0].stop();
				localStream.removeTrack(videoTracks[0]);
			}
		}
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;

		console.log('hangup set localStream=null');
		localStream = null;
	}

	if(mustcheckCalleeOnline) {
		// it can take up to 3s for our call to get fully ended and cleared on server and callee side
		console.log("hangup: mustcheckCalleeOnline");
		setTimeout(function() {
			gLog('hangup -> checkCalleeOnline');
			// show msgbox etc.
			//calleeOnlineStatus(lastOnlineStatus,false);
			checkCalleeOnline(false,"hangup");
			dialButton.disabled = false;
		},1500);
	}
	console.log("hangup: showStatusCurrentHighPrio="+showStatusCurrentHighPrio);
	if(!showStatusCurrentHighPrio) {
		showStatus("");
	}
}

function clearForm(idx) {
	if(idx==3) {
		enterIdValElement.value = "";
		setTimeout(function() {
			   enterIdValElement.focus();
		},400);
	} else if(idx==4) {
		enterDomainValElement.value = "";
		setTimeout(function() {
			   enterDomainValElement.focus();
		},400);
	} else {
		console.log("clearForm unused "+idx);
	}
}

