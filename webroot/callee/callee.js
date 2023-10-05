// WebCall Copyright 2023 timur.mobi. All rights reserved.
// callee.js for 4.0.0
'use strict';
const goOnlineSwitch = document.querySelector('input#onlineSwitch');
const callScreen = document.getElementById('callScreen');
const callScreenType = document.getElementById('callScreenType');
const callScreenPeerData = document.getElementById('callScreenPeerData');
const answerButtons = document.getElementById('answerButtons');
const answerButton = document.querySelector('button#answerButton');
const rejectButton = document.querySelector('button#rejectButton');
const isHiddenCheckbox = document.querySelector('input#isHidden');
const isHiddenlabel = document.querySelector('label#isHiddenlabel');
const autoanswerCheckbox = document.querySelector('input#autoanswer');
const autoanswerlabel = document.querySelector('label#autoanswerlabel');
const divspinnerframe = document.querySelector('div#spinnerframe'); // busy animation
const timerElement = document.querySelector('div#timer');
const missedCallsTitleElement = document.getElementById('missedCallsTitle');
const missedCallsElement = document.getElementById('missedCalls');
const form = document.querySelector('form#password');
const formPw = document.querySelector('input#current-password');
const menuSettingsElement = document.getElementById('menuSettings');
const menuClearCookieElement = document.getElementById('menuClearcookie');
const menuClearCacheElement = document.getElementById('menuClearCache');
const menuExitElement = document.getElementById('menuExit');
const iconContactsElement = document.getElementById('iconContacts');
const dialpadElement = document.getElementById('dialpad');
const idMappingElement = document.getElementById('idMapping');
const exclamationElement = document.getElementById('exclamation');
const ownlinkElement = document.getElementById('ownlink');
const autoReconnectDelay = 15;
const calleeMode = true;
const enterTextElement = document.getElementById('enterText');
const slideRevealElement = document.getElementById("slideReveal");
const buttonRowElement = document.getElementById("buttonRow");


var ringtoneSound = null;
var ringtoneIsPlaying = false;
var busySignalSound = null;
var notificationSound = null;
var wsAddr = "";
var talkSecs = 0;
var outboundIP = "";
var serviceSecs = 0;
var wsConn = null;
var lastWsConn = null;
var localDescription = null;
var callerDescription = null;
var peerCon = null;
var dataChannel = null;
var rtcConnect = false
var rtcConnectStartDate = 0;
var mediaConnectStartDate = 0;
var listOfClientIps = "";
var callerID = "";
var callerName = "";
var callerMsg = ""; // greeting msg
var lastResult;
var lastUserActionDate = 0;
var calleeName = "";
var mastodonID = "";
var mainLinkDeactive = false;
var mastodonLinkDeactive = false;
var wsSecret = "";
var audioContext = null;
var audioStreamDest = null;
var autoPlaybackAudioBuffer = null;
var autoPlaybackAudioSource = null;
var autoPlaybackAudioSourceStarted;
var buttonBlinking = false;
var onGotStreamGoOnline = false;
var autoPlaybackFile = "";
var waitingCallerSlice = null;
var missedCallsSlice = null;
var pushRegistration=null;
var otherUA="";
var fileReceiveBuffer = [];
var fileReceivedSize = 0;
var fileName = "";
var fileSize = 0;
var fileReceiveStartDate=0;
var fileReceiveSinceStartSecs=0;
var fileSendAbort=false;
var fileReceiveAbort=false;
var minNewsDate=0;
var mid = "";
var altIdArray = [];
var altIdActive = [];
//var altLabel = [];
var newline = String.fromCharCode(13, 10);
var textmode = false;
var	muteMicModified = false;
var textchatOKfromOtherSide = false;
var newestMissedCallBingClock = 0;
var lastInnerWidth = 0;
var spinnerStarting = false;
var mappingFetched = false;
var startedWithRinging = false;
var willShowPostCall = "Data will be available after you have received a call";

window.onload = function() {
	console.log("callee.js onload...");
	
	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		showVisualOffline("onload mediaDevices not found");
		showStatus("MediaDevices not found",0,true);
		return;
	}

	fileSelectInit();
	window.onhashchange = hashchange;

	let dbg = getUrlParams("dbg",true);
	if(typeof dbg!=="undefined" && dbg!="" && dbg!="undefined") {
		gentle = false;
	}

	//console.log("callee.js onload getUrlParams('id') search="+window.location.search);
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="" && id!="undefined") {
		calleeID = cleanStringParameter(id,true,"id");
	}
	id = getUrlParams("mid");
	if(typeof id!=="undefined" && id!="" && id!="undefined") {
		mid = cleanStringParameter(id,true,"mid");
		// if given, send msg to caller (mastodon user) when this callee has logged in (see "login success")
	}
	gLog("onload calleeID="+calleeID+" mid="+mid);

	if(calleeID=="") {
		// if callee was started without a calleeID, reload with calleeID from cookie
		if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
			let cookieName = document.cookie.substring(10);
			let idxAmpasent = cookieName.indexOf("&");
			if(idxAmpasent>0) {
				cookieName = cookieName.substring(0,idxAmpasent);
			}
			cookieName = cleanStringParameter(cookieName,true);
			if(cookieName!="") {
				console.log("! callee.js redirect to cookieName");
				window.location.replace("/callee/"+cookieName);
				return;
			}
		}

		showStatus("calleeID missing in URL",-1,true);
		return;
	}
	document.title = "Callee "+calleeID;

	// remote on start fragment/hash ('#') in URL
	if(location.hash.length > 0) {
		console.log("! location.hash.length="+location.hash.length);
		window.location.replace("/callee/"+calleeID);
		return;
	}

	// FF needs checkbox resetting
	goOnlineSwitch.checked = false;
	console.log("onLoad goOnlineSwitch.checked="+goOnlineSwitch.checked);
	autoanswerlabel.checked = false;
	//console.log("onLoad autoanswerlabel.checked="+autoanswerlabel.checked);
	muteMiclabelElement.checked = false;

	window.onresize = (event) => {
		//console.log("onresize "+window.innerHeight+" "+window.innerWidth);
		if(window.innerWidth!=lastInnerWidth) {
			if(Math.abs(window.innerWidth-lastInnerWidth)>=2) {
				//console.log("window.innerWidth has changed="+(window.innerWidth)+" was="+lastInnerWidth);
				if(wsConn!=null && missedCallsSlice!=null && missedCallsSlice.length>0) {
					//console.log("onresize -> showMissedCalls() -------------------");
					showMissedCalls();
				} else {
					//console.log("onresize -> no showMissedCalls(");
				}
			}
			lastInnerWidth = window.innerWidth;
		}
	};

	menuClearCookieElement.style.display = "block";

//	if(typeof Android !== "undefined" && Android !== null) {
	if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
		avSelect.style.display = "none";
	}

	// if set will auto-login as callee
	let auto = cleanStringParameter(getUrlParams("auto",true),true,"auto");
	if(auto) {
		console.log("onload auto is set ("+auto+")");
		// auto will cause onGotStreamGoOnline to be set below (for Android client only)

		console.log("### spinner on onload auto");
		spinnerStarting = true;
		setTimeout(function(oldWidth) {
			if(spinnerStarting) {
				divspinnerframe.style.display = "block";
			}
		},200,localVideoFrame.videoWidth);
	} else {
		gLog("onload auto is not set");
	}

	if(typeof Android !== "undefined" && Android !== null) {
		fullscreenLabel.style.display = "none";
		menuExitElement.style.display = "block";

		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			if(Android.getVersionName()>="1.1.0") {
				menuClearCacheElement.style.display = "block"; // calls clearcache()
			}
		}

		let element = document.getElementById("nativeMenu");
		if(element) element.style.display = "block";

		// change timur.mobi/webcall/ link to timur.mobi/webcall/update/
		element = document.getElementById("webcallhome");
		if(element) element.href = "https://timur.mobi/webcall/update/";
		// TODO ideally open 'webcallhome' url in an iframe
	} else {
		// pure browser mode (not in android)
		if(auto) {
			// auto can NOT be used in pure browser mode
			// bc we cannot play audio (ringtone) without user interaction first
			// to prevent this problem ("peerConnected2 ringtone error)
			//    play() failed because the user didn't interact with the document first"
			// we must make the user interact with the app (click the switch to go online)
			// this is why we clear auto
			console.log("onload clear auto in browser mode");
			let mySearch = window.location.search.replace('auto=1','').trim();
			history.replaceState("", document.title, window.location.pathname + mySearch);
			auto = false;
		}
	}

	let ua = navigator.userAgent;
	if(ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
		fullscreenLabel.style.display = "none";
	}

	try {
		minNewsDate = localStorage.getItem('newsdate');
	} catch(ex) {
		console.warn('access to localStorage failed',ex);
		minNewsDate=0
	}
	if(minNewsDate==null) minNewsDate=0;
	// we will show news from the server if the timestamp is newer than minNewsDate
	// when we show the news, we set localStorage.setItem('newsdate', Date.now()/1000) // ms since Jan 1, 1970
	// to only show the next news

	document.onkeydown = (evt) => onkeydownFunc(evt);

	localVideoFrame.onresize = showVideoResolutionLocal;
	remoteVideoFrame.onresize = showVideoResolutionRemote;

	isHiddenCheckbox.addEventListener('change', function() {
		if(this.checked) {
			gLog("hidden checked");
			autoanswerCheckbox.checked = false;
		}
		wsSend("calleeHidden|"+this.checked);
	});

	autoanswerCheckbox.addEventListener('change', function() {
		if(this.checked) {
			gLog("autoanswerCheckbox checked");
			isHiddenCheckbox.checked = false;
			wsSend("calleeHidden|false");
		}
	});

	// mute mode handler
	muteMicElement.addEventListener('change', function() {
		muteMic(this.checked);
	});

	// requestFullscreen and exitFullscreen are not supported in iOS (will abort JS without err-msg)
	if(fullscreenCheckbox && fullscreenLabel.style.display!="none") {
		fullscreenCheckbox.addEventListener('change', function() {
			if(this.checked) {
				// user is requesting fullscreen mode
				if(!document.fullscreenElement) {
					// not yet in fullscreen-mode
					if(mainElement.requestFullscreen) {
						// switch to fullscreen mode
						mainElement.requestFullscreen();
					}
				}
			} else {
				// user is requesting fullscreen exit
				document.exitFullscreen().catch(err => {
					console.log('fullscreenCheckbox exitFullscreen err='+err.message);
				});
			}
		});
		document.addEventListener('fullscreenchange', (event) => {
			if(document.fullscreenElement) {
				fullscreenCheckbox.checked = true;
			} else {
				fullscreenCheckbox.checked = false;
			}
		});
	}

	checkServerMode(function(mode) {
		if(mode==0 || mode==1) {
			// normal mode
			gLog("onload load audio files more="+mode);

			calleeID = calleeID.toLowerCase();
			gLog('onload calleeID lowercase '+calleeID);
			if(mode==1 || mode==3 || wsSecret!="") {
				gLog('onload pw-entry not required with cookie/wsSecret '+mode);
				// we have a cockie, so no manual pw-entry is needed
				// turn automatic online off, user needs to interact before we can answer calls
				onGotStreamGoOnline = false;
				if(auto) {
					// if loaded by android client, setting onGotStreamGoOnline will cause
					// prepareCallee() to be called when the mic stream becomes available
					// and the client to start auto-connect
					console.log("onload checkServerMode auto -> onGotStreamGoOnline=true");
					onGotStreamGoOnline = true;
				}
				start();
				return;
			}

			console.log('onload pw-entry is needed '+mode);
			spinnerStarting = false;
			divspinnerframe.style.display = "none";

			onGotStreamGoOnline = true;
			enablePasswordForm();
			return;
		}

		divspinnerframe.style.display = "none";

		if(mode==2) {
			// mode==2: server is in maintenance mode
			let mainParent = containerElement.parentNode;
			mainParent.removeChild(containerElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML = "<div>WebCall server is currently in maintenance mode.<br>Please try again a little later.</div>";
			mainParent.appendChild(msgElement);
		}

		if(mode==3) {
			// mode==3: login is not possible
			let mainParent = containerElement.parentNode;
			mainParent.removeChild(containerElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:12%; padding:4%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML = "<div>cannot login "+calleeID+"<br>stop other session and clear the login-cookie<br><br><a onclick='clearcookie2()'>clear login-cookie</a><br><br>you can run a 2nd callee session in a separate browser, or in incognito mode / private window</div>";
			mainParent.appendChild(msgElement);
		}
		return;
	});
}

function videoOn() {
	// open local video-frame (it is not yet streaming, but locally visible)
	gLog("videoOn");
	constraintString = defaultConstraintString;
	setVideoConstraintsGiven();
	localVideoShow();

	// enable local video
	if(peerCon && peerCon.iceConnectionState!="closed" &&
			rtcConnect && addLocalVideoEnabled && localStream.getTracks().length>=2 && !addedVideoTrack) {
		if(localCandidateType=="relay" || remoteCandidateType=="relay") {
			gLog('videoOn no addTrack video on relayed con '+localCandidateType+' '+remoteCandidateType);
		} else {
			gLog('videoOn addTrack vid '+localStream.getTracks()[1]);
			addedVideoTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
		}
	}

	localVideoFrame.volume = 0; // avoid audio feedback / listening to own mic
	localVideoFrame.muted = 1;

	// start localVideoFrame playback, setup the localVideo pane buttons
	vmonitor();

	// switch avSelect.selectedIndex to 1st video option
	getStream(false,"videoOn").then(() => navigator.mediaDevices.enumerateDevices())
	.then((deviceInfos) => {
		gotDevices(deviceInfos);

		if(videoEnabled) {
			// switch to the 1st video option
			let optionElements = Array.from(avSelect);
			if(optionElements.length>0) {
				gLog("videoOn avSelect.selectedIndex count "+optionElements.length);
				for(let i=0; i<optionElements.length; i++) {
					if(optionElements[i].text.startsWith("Video")) {
						gLog("videoOn avSelect.selectedIndex set "+i);
						avSelect.selectedIndex = i;
						getStream(optionElements[i],"videoOn2");
						break;
					}
				}
			}

			if(videoEnabled && mediaConnect && !addLocalVideoEnabled && vsendButton) {
				gLog('videoOn mediaConnect, blink vsendButton');
				vsendButton.classList.add('blink_me');
				setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
			}
		}
	});
}

function videoOff() {
	// hide/close localVideoFrame (not needed anymore)
	gLog("videoOff");
	myUserMediaDeviceId = null;
	localVideoHide();
	if(localStream) {
		connectLocalVideo(true);
	}

	if(!rtcConnect) {
		if(localStream) {
			if(peerCon && peerCon.iceConnectionState!="closed" && addedAudioTrack) {
				gLog("videoOff !rtcConnect peerCon.removeTrack(addedAudioTrack)");
				peerCon.removeTrack(addedAudioTrack);
				addedAudioTrack = null;
			}

			gLog("videoOff !rtcConnect localStream stop");
			localStream.getTracks().forEach(track => { track.stop(); });
			localStream = null;
		}
		gLog("videoOff !rtcConnect shut localVideo");
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;

		gLog("videoOff !rtcConnect shut remoteVideo");
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;

		if(isDataChlOpen()) {
			gLog("videoOff !rtcConnect dataChannel still set "+dataChannel.readyState);
		}
	}

	// getStream() triggers a new cmd=='missedCalls' but we don't want a beep

	// switch to the 1st audio option
	let optionElements = Array.from(avSelect);
	if(optionElements.length>0) {
		gLog("videoOff avSelect len "+optionElements.length);
		for(let i=0; i<optionElements.length; i++) {
			if(optionElements[i].text.startsWith("Audio")) {
				gLog("videoOff avSelect idx "+i);
				avSelect.selectedIndex = i;
				getStream(optionElements[i],"videoOff");
				break;
			}
		}
		if(rtcConnect) {
			// activate selected device
			gLog("videoOff rtcConnect getStream()");
			getStream(false,"videoOff2");
		}
	}
}

function checkServerMode(callback) {
	if(typeof Android !== "undefined" && Android !== null) {
		// in android mode if already connected return mode==1
		if(Android.isConnected()>0) {
			callback(1);
			return;
		}
	}
	
	let api = apiPath+"/mode?id="+calleeID;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		gLog('mode='+xhr.responseText);
		if(xhr.responseText.startsWith("maintenance")) {
			// maintenance mode
			callback(2);
			return;
		}
		if(xhr.responseText.startsWith("normal")) {
			// normal mode
			if(xhr.responseText.indexOf("|ok")>0) {
				// normal mode, cookie + pw are known
				callback(1);
				return;
			}
			// normal mode, cookie or pw are NOT know
			callback(0);
			return;
		}
		callback(3);
	}, function(errString,errcode) {
		console.log("# xhr error "+errString+" "+errcode);
		callback(3);
	});
}

function showPw() {
	if(formPw.type=="password") {
		formPw.type="text";
	} else {
		formPw.type="password";
	}
}

function enablePasswordForm() {
	gLog('enter password for calleeID='+calleeID);
	showStatus("Login "+calleeID+" ...",-1);
	document.getElementById("current-password").value = "";
	form.style.display = "block";
	// disable switch + icons (re-enable from login())
	buttonRowElement.style.display = "none";
	document.getElementById("username").focus();
	//gLog("form username "+document.getElementById("username").value);
	missedCallsTitleElement.style.display = "none";
	missedCallsElement.style.display = "none";
	setTimeout(function() {
		formPw.focus();
		var usernameForm = document.getElementById("username");
		if(usernameForm) {
			usernameForm.value = calleeID;
		}
	},800);
}

function clearForm() {
	document.getElementById("current-password").value = "";
	formPw.focus();
}

function submitFormDone(idx) {
	console.log("submitFormDone() idx="+idx);
	if(idx==1) {
		var valuePw = cleanStringParameter(document.getElementById("current-password").value,true,"pw");
		if(valuePw.length < 6) {
			formPw.focus();
			showStatus("Password must be six or more characters long",-1,true);
			return;
		}
		wsSecret = valuePw;
		// onGotStreamGoOnline will make gotStream2() call prepareCallee() -> login()
		onGotStreamGoOnline = true;
		//console.log("callee submitFormDone: enable goonline");
		start();
		// -> getStream() -> getUserMedia(constraints) -> gotStream() -> prepareCallee() -> login()
	} else if(idx==2) {
		// textchat msg to send to caller via dataChannel
		if(isDataChlOpen()) {
			let text = cleanStringParameter(enterTextElement.value,false);
			console.log("submitText text="+text);
			dataChannel.send("msg|"+text);
			// add text to msgbox
			let msg = "> " + text;
			if(msgbox.value!="") { msg = newline + msg; }
			msgbox.value += msg;
			//console.log("msgbox "+msgbox.scrollTop+" "+msgbox.scrollHeight);
			msgbox.scrollTop = msgbox.scrollHeight-1;
			enterTextElement.value = "";
		} else {
			console.log("# no datachannel");
		}
	}
}

function goOnlineSwitchChange(comment) {
// called when we go from offline to online or reverse (goOnlineSwitch or tile has been switched)
// will update url-param auto=, call prepareCallee

	console.log("goOnlineSwitchChange state="+goOnlineSwitch.checked+" "+comment);
	if(goOnlineSwitch.checked) {
		// goOnline
		console.log("goOnlineSwitchChange goOnline, wsConn="+(wsConn!=null));
		if(comment=="connectToWsServer" || comment=="user button" || comment=="service") {
			// we need to add to window.location: "?auto=1" if it does not yet exist
			let mySearch = window.location.search;
			if(mySearch.indexOf("auto=1")<0) {
				// add auto=1 to mySearch
				if(mySearch.indexOf("?")<0) {
					mySearch = mySearch + "?auto=1";
				} else {
					mySearch = mySearch + "&auto=1";
				}
				console.log('goOnlineSwitch ON set url location='+window.location.pathname + mySearch);
				history.replaceState("", document.title, window.location.pathname + mySearch);
			}
		}
		// TODO when we are called from wakeGoOnlineNoInit() we don't need to send init
		prepareCallee(true,comment);

	} else {
		// goOffline
		console.log("goOnlineSwitchChange goOffline calleeID="+calleeID);

		// abort a possibly running automatic/delayed reconnect process
		wsAutoReconnecting = false;

		// render offline mode
		showVisualOffline("goOnlineSwitchChange: "+comment);

		if(comment=="connectToWsServer" || comment=="user button" || comment=="service") {
			//goOnlineWanted = false;
			// we need to remove from window.location: "?auto=1"
			let mySearch = window.location.search;
			if(mySearch.indexOf("auto=1")>=0) {
				// remove auto=1 from mySearch
				mySearch = mySearch.replace('auto=1','').trim();
			}
			console.log("goOnlineSwitch OFF, set url location="+window.location.pathname + mySearch);
			// NOTE: doing replaceState() removes #, so we remeber it first
			let givenHash = location.hash;
			history.replaceState("", document.title, window.location.pathname + mySearch);
			location.hash = givenHash;
		}

		stopAllAudioEffects("goOffline");
		waitingCallerSlice = null;

		isHiddenlabel.style.display = "none";
		autoanswerlabel.style.display = "none";
		var waitingCallersLine = document.getElementById('waitingCallers');
		if(waitingCallersLine) {
			waitingCallersLine.innerHTML = "";
		}
		var waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallersTitleElement) {
			waitingCallersTitleElement.style.display = "none";
		}
		missedCallsTitleElement.style.display = "none";
		missedCallsElement.style.display = "none";

		// callee going offline
		if(wsConn!=null) {
			if(typeof Android !== "undefined" && Android !== null) {
				console.log("goOffline wsClose");
				// clear connectToServerIsWanted in service
				Android.wsClose(); // -> disconnectHost(true) -> statusMessage("Server disconnected")
			} else {
				console.log("goOffline wsConn.close()");
				wsConn.close();
				showStatus("WebCall server disconnected",0,true);
			}
			wsConn=null;
		}

		iconContactsElement.style.display = "none";
		//console.log("### spinner off goOnlineSwitchChange");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";
	}
}

function goOnline(initDummy,comment) {
	// called by ws engine wsOnOpen() and by our Android service
	// the new implementation makes sure that calling goOnline() does 100% the same as clicking the switch on
	console.log("goOnline "+comment);
	goOnlineSwitch.checked = true;
	goOnlineSwitchChange(comment);
}

function goOffline(comment) {
	// called by ws engine ??? and by our Android service
	// the new implementation makes sure that calling goOffline() does 100% the same as clicking the switch off
	console.log("goOffline "+comment);
	goOnlineSwitch.checked = false;
	goOnlineSwitchChange(comment);
}

function start() {
	// setup buttons, get audio input stream, then login
	console.log("start calleeID="+calleeID+" conn="+(wsConn!=null));

	goOnlineSwitch.onchange = function(ev) {
		ev.stopPropagation();
		lastUserActionDate = Date.now();
		goOnlineSwitchChange("user button");
	}

	isHiddenlabel.onchange = function(ev) {
		ev.stopPropagation();
		console.log("isHidden click");
		showOnlineReadyMsg();
	}

	autoanswerlabel.onchange = function(ev) {
		ev.stopPropagation();
		console.log("autoanswer click");
		showOnlineReadyMsg();
	}

	// if isRinging(): callee.js was started with a call already waiting
	// to be quicker, lets skip getStream() and jump straight to processWebRtcMessages
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.isRinging !== "undefined" && Android.isRinging !== null) {
			if(Android.isRinging()) {
				console.log("start isRinging skip getStream()");
				startedWithRinging = true; // will be evaluated in showOnlineReadyMsg()
				return;
			}
		}
	}

	try {
		getStream(false,"start").then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
		//getStream() -> getUserMedia(constraints) -> gotStream2() -> prepareCallee()
		// if wsSecret is set from prepareCallee(), it will call login()
	} catch(ex) {
		console.log("# ex while searching for audio devices "+ex.message);
		//console.log("### spinner off start");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";
	}
}

function login(retryFlag,comment) {
	// try to xhr login using wsSecret from submitFormDone() or cookie
	console.log("login retry="+retryFlag+" ID="+calleeID+" comment="+comment+" secretLen="+wsSecret.length);
	let api = apiPath+"/login?id="+calleeID;
	// mid-parameter will make server send a msg to caller (mastodon user with id = tmpkeyMastodonCallerMap[mid])
	if(mid!="") {
		api += "&mid="+mid;
	}
	api = api + "&ver="+clientVersion;
	console.log("login api="+api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		// processData
		let loginStatus = xhr.responseText;
		console.log("login xhr loginStatus ("+loginStatus+")");

		//console.log("### spinner off login");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";

		var parts = loginStatus.split("|");
		if(parts[0].indexOf("wsid=")>=0) {
			wsAddr = parts[0];
			// we're now a logged-in callee-user
			gLog('login wsAddr='+wsAddr);

			// hide the form
			form.style.display = "none";

			if(parts.length>=2) {
				talkSecs = parseInt(parts[1], 10);
			}
			if(parts.length>=3) {
				outboundIP = parts[2];
			}
			if(parts.length>=4) {
				serviceSecs = parseInt(parts[3], 10);
			}
			console.log('login success outboundIP='+outboundIP);
			/*
			if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
				console.log('login document.cookie='+document.cookie);
				let cookieName = document.cookie.substring(10);
				let idxAmpasent = cookieName.indexOf("&");
				if(idxAmpasent>0) {
					cookieName = cookieName.substring(0,idxAmpasent);
				}
				cookieName = cleanStringParameter(cookieName,true);
				console.log('login cookieName='+cookieName);
			}
			*/

			getSettings();
			/*
			if(!pushRegistration) {
				// we retrieve the pushRegistration here under /callee/(calleeID),
				// so that the pushRegistration.scope will also be /callee/(calleeID)
				// so that settings.js will later make use of the correct pushRegistration
				gLog("serviceWorker.register...");
				navigator.serviceWorker.register('service-worker.js');
				// get access to the registration (and registration.pushManager) object
				navigator.serviceWorker.ready.then(function(registration) {
					pushRegistration = registration;
					gLog("serviceWorker.ready "+pushRegistration);
				}).catch(err => {
					// this means that push events won't work
					// no need to abort login process
					console.log("serviceWorker.ready err",err.message);
				});
			}
			*/
			if(parts.length>=5 && parts[4]=="true") {
				isHiddenCheckbox.checked = true;
				autoanswerCheckbox.checked = false;
			}
			gLog('isHiddenCheckbox.checked '+isHiddenCheckbox.checked);
			if(parts.length>=6) {
				gLog('dialsounds muted parts[5]='+parts[5]);
				if(parts[5]=="true") {
					// dialSounds muted
					playDialSounds = false;
				} else if(parts[5]=="false") {
					// dialSounds not muted
					playDialSounds = true;
				}
			}
			//gLog('playDialSounds='+playDialSounds);

			// re-enable switch + icons
			buttonRowElement.style.display = "grid";

			// login success -> send "init|"
			sendInit("xhr login success");
			gLog('login sendInit done');
			return;
		}

		// if running on android bring activity to front
		if(typeof Android !== "undefined" && Android !== null) {
			if(typeof Android.activityToFront !== "undefined" && Android.activityToFront !== null) {
				Android.activityToFront();
			}
		}

		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/calle");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx); //+ "/webcall";
		}
		/*
		if(parts[0]=="noservice") {
			wsSecret = "";
			showStatus("service error<br><a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		} else
		*/
		if(parts[0]=="notregistered") {
			wsSecret = "";
			showStatus( "Unknown callee ID "+calleeID+"<br>"+
						"<a href='/callee/register'>Register a new ID</a>",0,true);

			form.style.display = "none";
			goOffline("login notregistered");

			// clear cookie
			console.log('clear cookie');
			if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
				let cookieName = document.cookie.substring(10);
				let idxAmpasent = cookieName.indexOf("&");
				if(idxAmpasent>0) {
					cookieName = cookieName.substring(0,idxAmpasent);
				}
				cookieName = cleanStringParameter(cookieName,true);
				console.log('clear cookieName',cookieName);
				if(cookieName!="") {
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
				}
			}
		} else if(parts[0]=="busy") {
			showStatus("User is busy",-1,true);
			form.style.display = "none";
		} else if(parts[0]=="errorWrongCookie") {
			showStatus("Error: "+parts[0].substring(5),-1,true);
		} else if(parts[0]=="error") {
			// parts[0] "error" = "wrong pw", "pw has less than 6 chars" or "empty pw"
			// offer pw entry again
			console.log('login error - try again');
			enablePasswordForm();
		} else if(parts[0]=="") {
			showStatus("No response from server",-1);
			form.style.display = "none";
		} else if(parts[0]=="fatal") {
			// loginStatus "fatal" = "already logged in" or "db.GetX err"
			// no use offering pw entry again at this point
			goOffline("error login fatal");

			// make sure our showStatus() comes after the one ("WebCall server disconnected") from disconnectHost()
			setTimeout(function() {
				if(parts.length>=2) {
					showStatus("Login "+parts[1]+" fail. Logged in from another device?",-1,true);
				} else {
					showStatus("Login fail, logged in from another device?",-1,true);
				}
			},300);
			form.style.display = "none";
		} else {
			goOffline("error login "+parts[0]);

			// loginStatus may be: "java.net.ConnectException: failed to connect to timur.mobi/66.228.46.43 (port 8443) from /:: (port 0): connect failed: ENETUNREACH (Network is unreachable)"
			if(loginStatus!="") {
				// make sure our showStatus() comes after the one ("WebCall server disconnected") from disconnectHost()
				setTimeout(function() {
					showStatus("Status: "+loginStatus,3000);
				},300);
			}
			form.style.display = "none";
		}

	}, function(errString,err) {
		// errorFkt
		console.log("# login xhr error "+errString+" "+err);
		if(err==502 || errString.startsWith("fetch")) {
			showStatus("No response from server",-1);
//		} if(errString=="timeout") {
//			showStatus("xhr error timeout",3000);
		} else {
			showStatus("xhr error "+err,3000);
		}

		//console.log("### spinner off login error");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";

		waitingCallerSlice = null;
		missedCallsSlice = null;
		var waitingCallersElement = document.getElementById('waitingCallers');
		if(waitingCallersElement) {
			waitingCallersElement.innerHTML = "";
		}
		var waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallersTitleElement) {
			waitingCallersTitleElement.style.display = "none";
		}
		if(retryFlag && goOnlineSwitch.checked) {
			setTimeout(function() {
				if(goOnlineSwitch.checked) {
					let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
					console.log('reconnecting in '+delay);
					showStatus("Reconnecting...",-1);
					missedCallsTitleElement.style.display = "none";
					missedCallsElement.style.display = "none";
					delayedWsAutoReconnect(delay);
				}
			},2000);
		} else {
			console.log('login error, not reconnecting');
			talkSecs=0;
			serviceSecs=0;
			goOffline("login error");
		}
	}, "pw="+wsSecret);
}

function getSettings() {
	// xhr /getsettings for calleeName (nickname), mastodonID; /getmapping for altIdArray
	// then call getSettingDone() to display "You receive calls made by this link"

	// we add calleeID as url arg, so that can compare it vs the webcall cookie it finds
	let api = apiPath+"/getsettings?id="+calleeID;
	console.log('getsettings api '+api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("# /getsettings error("+xhr.responseText+")");
			showStatus("Error: "+xhr.responseText.substring(5),-1);
			return;
		}
		if(xhr.responseText!="") {
			let serverSettings = "";
			try {
				serverSettings = JSON.parse(xhr.responseText);
			} catch(ex) {
				console.log("# getSettings JSON.parse err "+ex);
				return;
			}
//			if(typeof serverSettings.nickname!=="undefined") {
//				calleeName = serverSettings.nickname;
//				gLog("getsettings calleeName "+calleeName);
//			}

			if(typeof serverSettings.mastodonID!=="undefined") {
				mastodonID = serverSettings.mastodonID;
				gLog("getsettings mastodonID "+mastodonID);
			}

			if(typeof serverSettings.mainLinkDeactive!=="undefined") {
				console.log('serverSettings.mainLinkDeactive',serverSettings.mainLinkDeactive);
				if(serverSettings.mainLinkDeactive=="true") {
					mainLinkDeactive = true;
				} else {
					mainLinkDeactive = false;
				}
			}

			if(typeof serverSettings.mastodonLinkDeactive!=="undefined") {
				console.log('serverSettings.mastodonLinkDeactive',serverSettings.mastodonLinkDeactive);
				if(serverSettings.mastodonLinkDeactive=="true") {
					mastodonLinkDeactive = true;
				} else {
					mastodonLinkDeactive = false;
				}
			}
		}

		// fetch mappings
		api = apiPath+"/getmapping?id="+calleeID;
		if(!gentle) console.log('request getmapping api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			if(xhr.responseText.startsWith("error")) {
				console.log("# /getmapping error("+xhr.responseText+")");
				showStatus("Error: "+xhr.responseText.substring(5),-1);
				return;
			}
			let altIDs = xhr.responseText;
			mappingFetched = true;
			altIdArray = [];
			altIdActive = [];
//			altLabel = [];
			//console.log("getsettings /getmapping altIDs="+altIDs);
			if(altIDs!="") {
				// parse altIDs, format: id,true,assign|id,true,assign|...
				let tok = altIDs.split("|");
				let count = tok.length;
				for(var i=0; i<tok.length; i++) {
					////console.log("tok["+i+"]="+tok[i]);
					if(tok[i]!="") {
						let tok2 = tok[i].split(",");
						let id = tok2[0].trim();
						if(id.indexOf(" ")>=0) {
							id = id.replace(" ","");
						}
						if(id.length>16) {
							id = id.substring(0,11);
						}
						let active = false;
						if(typeof tok2[1] !== "undefined" && tok2[1] !== null) {
							active = tok2[1].trim();
						}
						let label = "";
						if(typeof tok2[2] !== "undefined" && tok2[2] !== null) {
							label = tok2[2].trim();
						}
						//console.log("tok2 id="+id+" active="+active);
						altIdArray.push(id);
						altIdActive.push(active);
//						altLabel.push(label);
						//console.log("getsettings altIdArray.length="+altIdArray.length);
					}
				}
			}
			getSettingDone();

		}, function(errString,errcode) {
			console.log("# getmapping xhr err "+errString+" "+errcode);
			getSettingDone();
		});
	}, function(errString,errcode) {
		// NOTE: errString=='timeout' may occur when the devive wakes from sleep
		// this is why it uses gLog() instead of console.log()
		console.log("# getsettings xhr error "+errString+" "+errcode);
		getSettingDone();
	});
}

function getSettingDone() {
	console.log("getSettingDone wsConn="+(wsConn!=null));
	if(wsConn) {
		// show "Your Webcall ID's"
		let calleeLink = window.location.href;
		let userLink = "";
		//console.log("getSettingDone calleeLink="+calleeLink);
		if(calleeLink.indexOf("callee/")>0) {
			userLink = calleeLink.replace("callee/","user/");
			//console.log("getSettingDone a userLink="+userLink);
		}
		let idxParameter = userLink.indexOf("?");
		if(idxParameter>=0) {
			userLink = userLink.substring(0,idxParameter);
		}
		idxParameter = userLink.indexOf("#");
		if(idxParameter>=0) {
			userLink = userLink.substring(0,idxParameter);
		}

		let links = "";
		links += "<div style='line-height:1.6em;white-space:nowrap;'>";
		//if(typeof Android !== "undefined" && Android !== null) {
		if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
			links += "<div><span class='callListTitle'>Your Webcall ID's:</span> <span style='font-size:0.9em;'>(long-tap to share)</span></div>";
		} else {
			links += "<div><span class='callListTitle'>Your Webcall ID's:</span> <span style='font-size:0.9em;'>(right-click to copy)</span></div>";
		}

		if(mainLinkDeactive) {
			links += "<input type='checkbox' id='mainlink' class='checkbox' style='margin-top:8px;margin-left:2px;margin-right:10px;' onclick='mainlinkCheckboxClick(this);' />";
		} else {
			links += "<input type='checkbox' id='mainlink' class='checkbox' style='margin-top:8px;margin-left:2px;margin-right:10px;' onclick='mainlinkCheckboxClick(this);' checked />";
		}
		let showUserLink = userLink;
		let idx = showUserLink.indexOf("/user/");
		if(idx>=0) {
			showUserLink = showUserLink.substring(idx+6);
		}
		showUserLink = showUserLink + " (main)";
		//links += "<a target='_blank' href='"+userLink+"'>"+showUserLink+"</a><br>";
		links += "<a href='"+userLink+"' onclick='openDialUrlx(\""+userLink+"\",event)'>"+showUserLink+"</a><br>";


		if(mastodonID!="" && mastodonID!=calleeID) {
			if(mastodonLinkDeactive) {
				links += "<input type='checkbox' id='mastodonlink' class='checkbox' style='margin-top:8px;margin-left:2px;margin-right:10px;' onclick='mainlinkCheckboxClick(this);' />";
			} else {
				links += "<input type='checkbox' id='mastodonlink' class='checkbox' style='margin-top:8px;margin-left:2px;margin-right:10px;' onclick='mainlinkCheckboxClick(this);' checked />";
			}
			let userLinkAlt = userLink.replace("/user/"+calleeID,"/user/"+mastodonID);
			let showUserLinkAlt = mastodonID;
			//links += "<a target='_blank' href='"+userLinkAlt+"'>"+showUserLinkAlt+"</a><br>";
			links += "<a href='"+userLinkAlt+"' onclick='openDialUrlx(\""+userLinkAlt+"\",event)'>"+
					 showUserLinkAlt+"</a><br>";
		}


		// add active mapping entries
		//console.log("getSettingDone altIdArray.length",altIdArray.length);
		if(altIdArray.length>0) {
			for(let i = 0; i < altIdArray.length; i++) {
				//console.log("i="+i+" altIdActive[i]="+altIdActive[i]+" "+altIdArray[i]);
				if(altIdActive[i]!="true") {
					// alt-id deactivated
					links += "<input type='checkbox' id='"+altIdArray[i]+"' class='checkbox' style='margin-top:8px;margin-left:2px;margin-right:10px;' onclick='mappingCheckboxClick(this);' />";
				} else {
					// alt-id is active
					links += "<input type='checkbox' id='"+altIdArray[i]+"' class='checkbox' style='margin-top:8px;margin-left:2px;margin-right:10px;' onclick='mappingCheckboxClick(this);' checked />";
				}
				// altIdArray[i] delivered as garbage may be caused by the nginx rate limiter
				let userLinkMap = userLink.replace("/user/"+calleeID,"/user/"+altIdArray[i]);
				let showUserLinkMap = altIdArray[i];
//				if(altLabel[i]=="") {
					//links += "<a target='_blank' href='"+userLinkMap+"'>"+showUserLinkMap+"</a><br>";
					links += "<a href='"+userLinkMap+"' onclick='openDialUrlx(\""+userLinkMap+"\",event)'>"+
							 showUserLinkMap+"</a><br>";
//				} else {
//					//links += "<a target='_blank' href='"+userLinkMap+"'>"+showUserLinkMap+"</a> ("+altLabel[i]+")<br>";
//					links += "<a href='"+userLinkMap+"' onclick='openDialUrlx(\""+userLinkMap+"\",event)'>"+
//							 showUserLinkMap+"</a> ("+altLabel[i]+")<br>";
//				}
			}
		}
		links += "</div>";
		ownlinkElement.style.display = "block";
		ownlinkElement.innerHTML = links;
	}
}

// checkboxes for mappings
function mappingCheckboxClick(cb) {
	console.log("checkboxClick="+cb.checked+" id="+cb.id);

	// construct altIDs string from: altIdArray, altIdActive, altLabel
	let altIDs = "";
	for(var i=0; i<altIdArray.length; i++) {
		if(altIDs!="") {
			altIDs += "|";
		}
		if(altIdArray[i]==cb.id) {
			// the clicked checkbox receives a changed active value
			if(cb.checked) {
				altIdActive[i]="true";
			} else {
				altIdActive[i]="false";
			}
		}
//		altIDs += altIdArray[i]+","+altIdActive[i]+","+altLabel[i];
		altIDs += altIdArray[i]+","+altIdActive[i]+",";
	}

	let api = apiPath+"/setmapping?id="+calleeID;
	gLog("/setmapping api="+api+" altIDs="+altIDs);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log('# /setmapping err='+xhr.responseText);
		} else {
			// all is well
		}
	}, function(errString,errcode) {
		console.log("/setmapping errString="+errString+" errcode="+errcode);
		// TODO reset checkbox checked value
	}, altIDs);
}

function mainlinkCheckboxClick(cb) {
	// cb.id is "mainlink" or "mastodonlink"
	// cb.checked==false -> LinkDeactive = true
	var newSettings = '{"mainLinkDeactive":"'+(!cb.checked)+'"}';
	if(cb.id=="mastodonLink") {
		newSettings = '{"mastodonLinkDeactive":"'+(!cb.checked)+'"}';
	}
	console.log('mainlinkCheckboxClick newSettings',newSettings);

	let api = apiPath+"/setsettings?id="+calleeID;
	if(!gentle) console.log('request setsettings api='+api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		if(!gentle) console.log('data posted',newSettings);
	}, function(errString,err) {
		console.log("mainlinkCheckboxClick errString="+errString+" errcode="+errcode);
		// TODO reset checkbox checked value
	}, newSettings);
}

function offlineAction() {
	// service calls this when "giving up reconnector"
	// we want to switch to offline mode
	goOffline("offlineAction");
}

function showVisualOffline(comment) {
	// here we accept that we are now offline, by rendering the visual changes
	// we got disconnected from the server, make OnlineSwitch reflect offline state
	console.log("showVisualOffline "+comment);

	// NOOOO!! God forbid! we will reconnect as soon as possible, so the switch remains in online position
	//goOffline("offlineAction");

	//must turn off the goOnlineSwitch dot
	document.head.appendChild(document.createElement("style")).innerHTML =
		"input:checked + .slider::before {background: #ccc;}";

	// hide missedCalls
	missedCallsTitleElement.style.display = "none";
	missedCallsElement.style.display = "none";

	iconContactsElement.style.display = "none";

	// if p2p connection is also gone, hide ownlinks
	if(!mediaConnect) {
		ownlinkElement.style.display = "none";
		ownlinkElement.innerHTML = "";
	}

	buttonBlinking=false; // abort blinkButtonFunc()
}


function gotStream2() {
	// we got the mic
	// NOTE: this 'if' used to be located after the Android check
	if(pickupAfterLocalStream) { // set by pickup()
		// we got the mic while we are in the process of picking up an incoming call
		console.log("gotStream2 -> pickup2() wsConn="+(wsConn!=null)+" switch="+goOnlineSwitch.checked)
		pickupAfterLocalStream = false;
		pickup2();
		return;
	}

	//console.log("### spinner off gotStream2");
	spinnerStarting = false;
	divspinnerframe.style.display = "none";

	// we got the mic while we are getting ready to wait for incoming calls
	console.log("gotStream2 goOnlineSwitch.checked=="+goOnlineSwitch.checked);
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.calleeReady !== "undefined" && Android.calleeReady !== null) {
			// service v1.1.5
			// when service starts activity/callee.js for answering a waiting call, then...
			// 1. we don't do showVisualOffline()
			// 2. we need to trigger service processWebRtcMessages()
			console.log("gotStream2 -> Android.calleeReady()");
			if(Android.calleeReady()) {
				// processWebRtcMessages() now active (don't mute mic; don't change online/offline buttons)
				// TODO: but what about calling pickup2() if pickupAfterLocalStream is set
				console.log("gotStream2 -> Android.calleeReady() -> abort gotStream2");
				return;
			}
		}
	}

	if(localStream && !videoEnabled && !rtcConnect) {
		// mute (disable) mic until a call
		console.log('gotStream2 mute mic (localStream) standby');
		localStream.getTracks().forEach(track => { track.stop(); });
		const audioTracks = localStream.getAudioTracks();
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}

// TODO what does rtcConnect have to do with this?
	if(onGotStreamGoOnline /*&& !rtcConnect*/) {
		// we start prepareCallee() bc auto=1 has set onGotStreamGoOnline in onLoad
		// NOTE this works only for Android clients (and will not be enabled for pure browsing mode)
		onGotStreamGoOnline = false;

		if(wsConn==null) {
			// not yet connected: we turn goOnlineSwitch.checked on automatically
			// goOnlineSwitchChange() will call prepareCallee() so we don't have to
			console.log("gotStream2 onGotStreamGoOnline wsConn==null -> goOnlineSwitch->AUTO ON + goOnlineSwitchChange");
			goOnlineSwitch.checked = true;
			goOnlineSwitchChange("gotStream2 onGotStreamGoOnline");
		} else {
			console.log("gotStream2 onGotStreamGoOnline wsConn!=null -> prepareCallee()");
			// if wsSecret is not set, in android mode Android.jsGoOnline() will be call
			// if wsSecret is set, prepareCallee() will call login()
			prepareCallee(true,"gotStream2");
		}
	} else {
		//console.log("gotStream2 onGotStreamGoOnline="+onGotStreamGoOnline+" rtcConnect="+rtcConnect);
		if(wsConn==null) {
			// we are offline, this usually occurs onload in pure browser mode
			// we turn the switch off bc in pure browser mode the user needs to click to start
			console.log("gotStream2 wsConn==null, goOnlineSwitch OFF, no sendInit");
			showStatus("WebCall server disconnected",-1,true);
			goOnlineSwitch.checked = false;
		} else {
			console.log("gotStream2 wsConn!=null, goOnlineSwitch -> ON, sendInit");
			// we are connected to server already
			goOnlineSwitch.checked = true;
			goOnlineSwitchChange("gotStream2 onGotStreamGoOnline");
		}
	}
}

// wsAutoReconnecting is a flag that describes wheter reconnect is currently active
// it can also be used to abort the reconnect process
var wsAutoReconnecting = false;
function delayedWsAutoReconnect(reconPauseSecs) {
	// first we do a pause; if after that a userAction is detected or if wsAutoReconnecting is false, we abort
	// otherwise we try to login to the server
	// delayedWsAutoReconnect can only succeed if a previous login attempt was successful (if there is a valid cookie)
	console.log("delayedWsAutoReconnect "+reconPauseSecs);
	wsAutoReconnecting = true;
	let startPauseDate = Date.now();
	setTimeout(function() {
		console.log("delayedWsAutoReconnect action");
		if(!showStatusCurrentHighPrio) {
			showStatus("",-1);
		}
		// don't proceed if the user has clicked on anything; in particular goOnline
		if(startPauseDate < lastUserActionDate) {
			// lastUserActionDate set by goOnlineSwitch.onchange()
			// is newer (happened later) than startPauseDate
			// user has invoked goOnlineSwitch or goOffline, so we stop AutoReconnect
			wsAutoReconnecting = false;
			// but if we have a connection now, we don't kill it
			if(!wsConn) {
				console.log("! delayedWsAutoReconnect aborted on user action "+ startPauseDate+" "+lastUserActionDate);
			}
		} else if(!wsAutoReconnecting) {
			console.log("! delayedWsAutoReconnect aborted by !wsAutoReconnecting");
		} else {
			console.log("delayedWsAutoReconnect login...");
			login(true,"delayedWsAutoReconnect"); // -> connectToWsServer("init|")
		}
	},reconPauseSecs*1000);
}

function showOnlineReadyMsg() {
	if(!wsConn) {
		console.log("# showOnlineReadyMsg not online");
		return;
	}
	if(typeof wsConn.readyState !== "undefined" && wsConn.readyState!=1) {
		console.log("# showOnlineReadyMsg not online 2");
		return;
	}
/*
	// delay 'ready to receive calls' msg, so that prev msg can be read by user
	setTimeout(function(oldWidth) {
		if(!wsConn) {
			console.log("# showOnlineReadyMsg not online 3");
			return;
		}
		if(typeof wsConn.readyState !== "undefined" && wsConn.readyState!=1) {
			console.log("# showOnlineReadyMsg not online 4");
			return;
		}
*/
		console.log("showOnlineReadyMsg");

		let readyMessage = "Ready to receive calls";
		if(mediaConnect) {
			readyMessage = "Call in progress";
		}
/*
		if(isHiddenCheckbox.checked) {
			readyMessage += " (Online status hidden)";
		} else if(autoanswerCheckbox.checked) {
			readyMessage += " (Auto-Answer)";
		}
*/
		if(typeof Android !== "undefined" && Android !== null) {
			if(typeof Android.calleeConnected !== "undefined" && Android.calleeConnected !== null) {
				// be very careful calling calleeConnected(), bc it does:
				// 1. calleeIsConnectedFlag = true
				// 2. postStatus("state","connected");
				// 3. statusMessage(readyToReceiveCallsString,-1,true,false);
				Android.calleeConnected();

				if(startedWithRinging) {
					startedWithRinging = false;
					Android.calleeReady();
					readyMessage = "Incoming call...";
				}
			}
		}

		if(mediaConnect) {
			// do not show "Call in progress"
		} else {
			showStatus(readyMessage,-1,true);
		}

		//must turn on the goOnlineSwitch dot
		document.head.appendChild(document.createElement("style")).innerHTML =
			"input:checked + .slider::before {background: #4cf;}";
			// should be same as .checkbox:checked background-color

		//console.log("### spinner off showOnlineReadyMsg");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";
/*
	},300);
*/
}

let tryingToOpenWebSocket = false;
let wsSendMessage = "";
function connectToWsServer(message,comment) {
	// main purpose of connectToWsServer() is to establish a ws-connection with webcall server
	//   or get wsConn from Android service (in which case wsAddr=="" is no problem)

	// but first, if a peerCon object was not yet created, create one
	// A peerCon object is required to receive calls and it does not make sense to connect to webcall server
	// if we then don't have one and cannot receive calls due to a local issue

	console.log("connectToWsServer '"+comment+"' '"+message+"' wsAddr="+wsAddr);
	var wsUrl = wsAddr;
	tryingToOpenWebSocket = true;
	// wsSendMessage will be sent as soon as we are connected
	wsSendMessage = message;

	// create a new webrtc peerCon, if it does not exist yet, this is the last opportunity
	if(peerCon==null || peerCon.signalingState=="closed") {
	    console.log("connectToWsServer: no peerCon or peerCon closed -> newPeerCon()");
		if(newPeerCon("connectToWsServer")) {
			// fail
		    console.warn("# connectToWsServer: newPeerCon() failed - abort");
			return;
		}
	}

	if(typeof Android !== "undefined" && Android !== null) {
		// wsUrl will only be used if service:wsClient==null
		// but on server triggered reconnect, service:wsClient will be set (and wsUrl will not be used)
		wsConn = Android.wsOpen(wsUrl);
		// if service is NOT yet connected:
		//  service -> wsCli=connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null) -> wsSendMessage("init|!")
		// if service IS already connected:
		//  service -> if activityWasDiscarded -> wakeGoOnlineNoInit()

	} else {
		if(!window["WebSocket"]) {
			console.error('connectSig: no WebSocket support');
			showStatus("Error: Your platform does not offer websocket support",0,true);
			return;
		}

		if(wsAddr=="") {
			// NOTE: Android.wsOpen() only needs wsAddr if it is not yet connected
			console.warn("# connectToWsServer '"+comment+"' '"+message+"' wsAddr missing");
			return;
		}

	    console.log('connectToWsServer: open ws connection... '+calleeID+' '+wsUrl);

		// get ready for a new websocket connection with webcall server
		wsConn = new WebSocket(wsUrl);
		wsConn.onopen = wsOnOpen;
		wsConn.onerror = wsOnError;
		wsConn.onclose = wsOnClose;
		wsConn.onmessage = wsOnMessage;
	}

	if(wsConn!=null) {
		if(!goOnlineSwitch.checked) {
			// this is the situation when activity is started on a running service
			console.log("connectToWsServer got wsConn, goOnlineSwitch off");
			goOnline(false,"connectToWsServer");

/* tmtmtm
// in browser mode, immediately after login (where getSettings() was called just now but no response yet)
// login -> getSettings() -> sendInit() -> wsSend("init|") 
//       -> connectToWsServer() -> connectToWsServer got wsConn -> goOnline()
// but goOnline() can start a forever loop
// if(altIdArray.length<=0) is not enough

		} else if(altIdArray.length<=0) {
			// probably never called getSettings() yet
			// this can happen after Android clear cache
			// (so even though connectToWsServer() may have been called by service -> wakeGoOnlineNoInit,
			//  we are now in foreground and xhr is no problem)
			// go full online to turn on the switch
			goOnline(false,"connectToWsServer");
*/
		} else {
			// we are fully connected
			// just show ownlinks again; do not call prepareCalle (no init); do not call getSettings() (no xhr!)

			// getSettings() xhr may not be executed if JS/webview in background or if android is in deep sleep
			// otherwise we may get "# getsettings xhr error timeout 25000"
			var mustFetchMapping = false;
			if(!mappingFetched) {
				mustFetchMapping = true;
			}
			if(mustFetchMapping) {
				// don't do it if android is in sleep mode or webview not in front
				if(typeof Android !== "undefined" && Android !== null) {
					// is activityVisible?
					if(typeof Android.isActivityInteractive !== "undefined" && Android.isActivityInteractive !== null) {
						if(Android.isActivityInteractive()) {
							// it is OK to have mustFetchMapping==true
						} else {
							console.log("! connectToWsServer got wsConn, goOnlineSwitch on, !activityVisible");
							mustFetchMapping = false;
						}
					}
				}
			}
			if(mustFetchMapping) {
				console.log("connectToWsServer got wsConn, goOnlineSwitch on -> getSettings()");
				getSettings();
			} else {
				console.log("connectToWsServer got wsConn, goOnlineSwitch on -> getSettingDone()");
				getSettingDone();
			}
			showMissedCalls();

			//must turn on the goOnlineSwitch dot
			document.head.appendChild(document.createElement("style")).innerHTML =
				"input:checked + .slider::before {background: #4cf;}";
				// same color as .checkbox:checked background-color
			iconContactsElement.style.display = "block";
		}
	} else {
		console.log("! connectToWsServer no wsConn");
	}
}

function wsOnOpen() {
	// called by websocket engine for wsConn.onopen
	// called by service connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null)
	// when this is called, we should have a valid wsConn
	console.log("wsOnOpen calleeID="+calleeID+" connected="+(wsConn!=null));
	tryingToOpenWebSocket = false;
	// abort a possibly automatic/delayed reconnect process
	wsAutoReconnecting = false;
	
	// we got a server connection; this should only take place if goOnlineSwitch was turned on before
	// so it should be no harm to call goOnlne() and turn it on once more
	// however, bc wsConn!=null the call to goOnlineSwitchChange() will be aborted
	// so prepareCallee() will NOT be called
	//goOnline(false,"wsOnOpen");
	/*
	window.addEventListener("beforeunload", function () {
		// prevent "try reconnect in..." after "wsConn close" on unload
		// by turning our online-indication off
		console.log("callee beforeunload: enable goonline");
		// NOTE: this occurs when callee starts dialing a remote user from missedcalls
		// then both buttons are enabled - not good
	});
	*/
	if(wsSendMessage!="" && wsConn!=null) {
		gLog("wsOnOpen wsSend("+wsSendMessage+")");
		wsSend(wsSendMessage);
		wsSendMessage = "";
	}
	isHiddenlabel.style.display = "block";
	autoanswerlabel.style.display = "block";
	menuSettingsElement.style.display = "block";
	iconContactsElement.style.display = "block";
	idMappingElement.style.display = "block";
}

function wsOnError(evt) {
	console.log("# wsOnError ",evt);
	wsOnError2(evt.data,evt.code);
}

function wsOnError2(str,code) {
	console.log("# wsOnError2 "+str+" code="+code);
	if(typeof str!=="undefined" && str!="" && str!="undefined") {
		showStatus("wsError "+str+" "+code,-1);
	} else if(typeof code!=="undefined" && code!=0) {
		showStatus("wsError code="+code,-1);
	} else {
		//showStatus("wsError unknown",-1);
	}

	// for ff wake-from-sleep error (wss interrupted), code is not given here (but in wsOnClose())
// TODO explain why the following is needed (and whether it is always true to assume wsConn=null on wsOnError()
	wsConn=null;
	iconContactsElement.style.display = "none";
}

// What is the difference btw wsOnClose(), wsOnClose2() and showVisualOffline() ?
// wsOnClose()           called on server disconnect, calls wsOnClose2(), manages auto-reconnect
// wsOnClose2()          called by wsOnClose and by the Android service; sets wsConn=null, calls showVisualOffline()
// showVisualOffline()   hide ownlinks, hide missedCalls, hide contacts icon

function wsOnClose(evt) {
	// on disconnect from server, called by wsConn.onclose
	// evt.code = 1000 (indicates a normal closure, when we goOffline, or server forced disconnect - no reconnect)
	// evt.code = 1001 (manual reload FF - no reconnect)
	// evt.code = 1002 (an endpoint is terminating the connection due to a protocol error)
	// evt.code = 1005 (No Status Received)
	// evt.code = 1006 (unusual clientside error - must reload)
	let errCode = 0;
	if(typeof evt!=="undefined" && evt!=null && evt!="undefined") {
		errCode = evt.code;
	}
	console.log("wsOnClose ID="+calleeID+" code="+errCode, evt);
	if(errCode==1000) {
		console.log("wsOnClose with code 1000 'normal closure' (we do nothing)");
		wsOnClose2();	// wsConn=null; showVisualOffline();
		//goOnlineSwitch.checked = false;
		if(!showStatusCurrentHighPrio) {
			showStatus("",0); // "Offline" ?
		}
	} else if(errCode==1001) {
		// if disconnect from server was caused by manual reload, we do nothing
		console.log("wsOnClose with code 1001 'manual reload' (we do nothing)");
		wsOnClose2();	// wsConn=null; showVisualOffline();
		// TODO goOnlineSwitch.checked = false like for 1006?
	} else {
		if(tryingToOpenWebSocket) {
			// onclose occured while we were trying to establish a ws-connection (but before getting connected)
			console.log('wsOnClose failed to open');
			if(!mediaConnect) {
				showStatus("Server disconnected (access problem)",-1,true);
			}
		} else {
			// onclose occured while were ws-connected
			console.log('wsOnClose while being connected (we got disconected)');
			if(!mediaConnect) {
				showStatus("WebCall server disconnected",-1,true);
			}
		}

		wsOnClose2();	// wsConn=null; showVisualOffline();

		if(!tryingToOpenWebSocket && goOnlineSwitch.checked /*&& errCode==1006*/) {
			// we got disconnected (were connected already), we want to be connected and we got a 1006
			// this offline was not user-triggered or intended; we need to get back online
			// (callee on chrome needs the following for reconnect after wake-from-sleep)
			// delayedWsAutoReconnect() will call login() to get us connected again, after (half random) delay secs
			let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
			console.log("wsOnClose, will try to reconnect to signaling server in "+delay+" secs");
			showStatus("Reconnecting...",-1);
			delayedWsAutoReconnect(delay);
			return;
		}
		// we accept that there is a problem and will try to reconnect; we stay offline
		console.log("wsOnClose code="+errCode+" shutting down, was tryingToOpenWebSocket="+tryingToOpenWebSocket);
		goOffline("wsOnClose");
	}
}

function wsOnClose2() {
	// called by wsOnClose() and by our android service
	// we set wsConn==null and call showVisualOffline()
	// we accept that we are (for now) disconnected from webcall server
	// but we DO NOT change goOnlineSwitch.checked (or Android connectToServerIsWanted)
	// if goOnlineSwitch.checked stays true, a reconnect may take place shortly
	console.log("wsOnClose2 "+calleeID);
	wsConn=null;
	showVisualOffline("wsOnClose2");
	stopAllAudioEffects("wsOnClose");

	//console.log("### spinner off wsOnClose2");
	spinnerStarting = false;
	divspinnerframe.style.display = "none";
}

function wsOnMessage(evt) {
	// ws engine calls this to push msgs from WebCall server to signalingCommand() to be processed in JS
	signalingCommand(evt.data,"wsOnMessage");
}

function wsOnMessage2(str, comment) {
	// Android service calls this to push msgs from WebCall server to signalingCommand() to be processed in JS
	// either live msgs (from onMessage()) or queued msgs (from processWebRtcMessages())
	//console.log("wsOnMessage2( "+str+" comment="+comment);
	signalingCommand(str, comment);
}

var startIncomingCall = 0;
var signalingCommandCount = 0;
function signalingCommand(message, comment) {
	// either called by wsOnMessage() (ws engine) or by wsOnMessage2() (Android service)
	// to push msgs from WebCall server to be processed in JS
	// OUTCOMMENT THIS LINE TO LOG ALL callerCandidates
	signalingCommandCount++;
	if(!rtcConnect) {
		//console.log("signalingCommand "+message+" comment="+comment+" xcount="+signalingCommandCount);
	}
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}
	//console.log("---signaling cmd="+cmd+" payload="+payload);
	//gLog('signaling payload '+payload);

	if(cmd=="init") {

	} else if(cmd=="dummy") {
		gLog('dummy '+payload);

	} else if(cmd=="callerOffer" || cmd=="callerOfferUpd") {
		if(peerCon==null || peerCon.signalingState=="closed") {
			console.warn('callerOffer but no peerCon');
			return;
		}
		if(!rtcConnect) {
			listOfClientIps = "";
			callerID = "";
			callerName = "";
		}
		if(cmd=="callerOffer") {
			console.log('callerOffer (incoming call)');
			connectionstatechangeCounter=0;
			onIceCandidates = 0;
			startIncomingCall = Date.now();
		} else {
			console.log('callerOfferUpd (in-call)');
		}

		callerDescription = JSON.parse(payload);
		console.log('callerOffer setRemoteDescription '+callerDescription);
		peerCon.setRemoteDescription(callerDescription).then(() => {
			console.log('callerOffer createAnswer');
			peerCon.createAnswer().then((desc) => {
				localDescription = desc;
				console.log('callerOffer in, calleeAnswer out');
				localDescription.sdp =
					maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
				localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
					'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
				peerCon.setLocalDescription(localDescription).then(() => {
					if(isDataChlOpen()) {
						console.log("calleeAnswer localDescription set -> signal via dataChl");
						dataChannel.send("cmd|calleeAnswer|"+JSON.stringify(localDescription));
					} else {
						console.log("calleeAnswer localDescription set -> signal via wsSend");
						wsSend("calleeAnswer|"+JSON.stringify(localDescription));
					}
				}, err => console.error(`# Failed to set local descr: ${err.toString()}`));
			}, err => {
				console.warn("# failed to createAnswer "+err.message)
				showStatus("Error: Failed to create WebRTC answer",8000,true);
			});
		}, err => {
			console.warn('callerOffer failed to set RemoteDescription',err.message,callerDescription)
			showStatus("Error: Failed to set WebRTC remoteDescription",8000,true);
		});

	} else if(cmd=="callerAnswer") {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log("# callerAnswer abort no peerCon");
			return;
		}
		callerDescription = JSON.parse(payload);

		console.log("callerAnswer setLocalDescription");
		peerCon.setLocalDescription(localDescription).then(() => {
			console.log('callerAnswer setRemoteDescription');
			peerCon.setRemoteDescription(callerDescription).then(() => {
				console.log('callerAnswer setRemoteDescription done, mediaConnect='+mediaConnect);
				if(!mediaConnect) {
					pickup4("cmd=callerAnswer");
				}
			}, err => {
				console.warn(`# callerAnswer Failed to set RemoteDescription`,err.message)
				showStatus("Error: Failed to set WebRTC remoteDescr "+err.message,0,true);
			});
		}, err => {
			console.warn("# callerAnswer setLocalDescription fail",err.message)
			showStatus("Error: Failed to set WebRTC localDescr"+err.message,0,true);
		});

	} else if(cmd=="callerInfo") {
		console.log("cmd callerInfo payload=("+payload+")");
		callerMsg = "";
		let idxSeparator = payload.indexOf("\t");
		if(idxSeparator<0) {
			// for backward compatibility only
			idxSeparator = payload.indexOf(":");
		}
		if(idxSeparator>=0) {
			callerID = payload.substring(0,idxSeparator);
			// callerID may have host attached: callerID@host
			// callerID apparently only used for getStatsCandidateTypes()
			callerName = payload.substring(idxSeparator+1);
			idxSeparator = callerName.indexOf("\t");
			if(idxSeparator>=0) {
				callerMsg = callerName.substring(idxSeparator+1);
				callerName = callerName.substring(0,idxSeparator);
			}
			console.log('cmd callerInfo ('+callerID+') ('+callerName+') ('+callerMsg+')');
			// callerID + callerName will be displayed via getStatsCandidateTypes()
		} else {
			console.log('cmd callerInfo payload=(%s)',payload);
		}

	} else if(cmd=="callerCandidate") {
		if(peerCon==null || peerCon.signalingState=="closed") {
			console.warn('# callerCandidate but no peerCon');
			return;
		}
		var callerCandidate = JSON.parse(payload);
		if(callerCandidate.candidate=="") {
			gLog('skip empty callerCandidate');
			return;
		}

		// peerCon.addIceCandidate(callerCandidate)
		callerCandidate.usernameFragment = null;
		var addIceCallerCandidate = function(callerCandidate,loop) {
			if(!peerCon || peerCon.iceConnectionState=="closed") {
				console.log("# cmd callerCandidate abort no peerCon");
				// TODO shall we not move stopAllAudioEffects() into endWebRtcSession() ?
				stopAllAudioEffects("iceCon closed");
				// end the p2p connection and re-init out server connection based on stat of goOnlineSwitch.checked
				endWebRtcSession(true,goOnlineSwitch.checked,
					"callerCandidate no peercon / ice closed"); // -> peerConCloseFunc
				return;
			}
			if(!peerCon.remoteDescription) {
				if(loop<6) {
					//console.log("! cmd callerCandidate !peerCon.remoteDescription "+loop);
					setTimeout(addIceCallerCandidate,100,callerCandidate,loop+1);
				} else {
					console.warn("# abort cmd callerCandidate !peerCon.remoteDescription");
				}
				return;
			}
			let tok = callerCandidate.candidate.split(' ');
			if(tok.length<5) {
				console.warn("# cmd callerCandidate format err",payload);
				return;
			}
			let address = tok[4];
			if(tok.length>=10 && tok[8]=="raddr" && tok[9]!="0.0.0.0") {
				address = tok[9];
			}
			if(address==null) {
				console.log("# cmd callerCandidate skip address = null");
				return;
			}
			if(address=="") {
				console.log("# cmd callerCandidate skip empty address");
				return;
			}

// peerCon.addIceCandidate accept address 192.168.3.209...
// candidate:169636353 1 udp 2122260223 192.168.3.209 40205 typ host generation 0 ufrag /RrR network-id 1
// candidate:1151307505 1 tcp 1518280447 192.168.3.209 9 typ host tcptype active generation 0 ufrag /RrR network-id 1
// candidate:2337567925 1 udp 1686052607 37.201.195.49 47218 typ srflx raddr 192.168.3.209 rport 19890 generation 0 ufrag /RrR network-id 1 L1451
// candidate:240334351 1 udp 41885439 66.228.46.43 50178 typ relay raddr 37.201.195.49 rport 47218 generation 0 ufrag /RrR network-id 1
			//console.log("peerCon.addIceCandidate "+loop+" address="+address+" "+callerCandidate.candidate);
			//console.log("callerCandidate "+loop+" "+address);

			if(address.indexOf(":")>=0
					|| address==outboundIP
					|| address.endsWith(".local")
					|| address.indexOf("10.1.")>=0) {
				// do not add to listOfClientIps
			} else {
				if(listOfClientIps.indexOf(address)<0) {
					if(listOfClientIps!="") {
						listOfClientIps += " ";
					}
					listOfClientIps += address;
				}
			}
			peerCon.addIceCandidate(callerCandidate).catch(e => {
				console.error("# addIce callerCandidate",e.message,payload);
				showStatus("Error RTC "+e.message,0,true);
			});
		}
		addIceCallerCandidate(callerCandidate,1);

	} else if(cmd=="cancel") {
		// this is a remote cancel (from server or from peer)
		// can for instance occur when the server aborts ringing after 120s
		// also: turnauth (...) session outdated

		/*
		// this is not sufficient: if payload not "c", we only do stopAllAudioEffects()
		stopAllAudioEffects("cmd cancel");
		divspinnerframe.style.display = "none";
		if(payload=="c") {
			if(mediaConnect) {
				// TODO if callerID and/or callerName are avail we would rather show them
				// instead of listOfClientIps
				//showStatus("Caller canceled call ("+
				//	listOfClientIps+" "+localCandidateType+"/"+remoteCandidateType+")",8000);
				//busySignalSound.play().catch(function(error) { });
				//setTimeout(function() {
				//	busySignalSound.pause();
				//	busySignalSound.currentTime = 0;
				//},1000);
			} else {
				// caller canceled call before connect
				//showStatus("canceled");
			}
		} else {
			// TODO no endWebRtcSession ? android service will not know that ringing has ended
		}
		*/

		console.log("cmd cancel payload=("+payload+") -> endWebRtcSession");

		// end the p2p connection and re-init our server connection based on stat of goOnlineSwitch.checked
		endWebRtcSession(false,goOnlineSwitch.checked,"cmd cancel"); // -> peerConCloseFunc

	} else if(cmd=="clearcache") {
		console.log("# cmd=='clearcache' (ignored)");
		//clearcache();

	} else if(cmd=="status") {
		// this is currently used to make Android users aware of new releases and Websocket communication issues
		if(typeof Android !== "undefined" && Android !== null) {
			if(payload!="") {
				console.log("cmd=='status' payload=("+payload+")");
				setTimeout(function() {
					showStatus(payload,-1,true);
				},1000);
			} else {
				console.log("# cmd=='clearcache' ignored (no payload)");
			}
		} else {
			console.log("# cmd=='clearcache' ignored (Android only) payload=("+payload+")");
		}

	} else if(cmd=="sessionId") {
		// callee has checked in
		// payload is server version
		console.log("cmd=='sessionId' -> showOnlineReadyMsg()");
		showOnlineReadyMsg();

	} else if(cmd=="sessionDuration") { // in call
		if(isP2pCon()) {
			// do not show the timer
		} else if(mediaConnect) {
			var sessionDuration = parseInt(payload,10); // maxTalkSecsIfNoP2p
			if(sessionDuration>0 && !timerStartDate) {
				gLog('sessionDuration '+sessionDuration);
				startTimer(sessionDuration);
			}
		}

	} else if(cmd=="serviceData") { // post call
		//gLog('serviceData (%s) tok.length=%d',messages[i],tok.length);
		if(tok.length>=2) {
			talkSecs = parseInt(tok[1], 10);
			if(tok.length>=3) {
				serviceSecs = parseInt(tok[2], 10);
			}
		}

	} else if(cmd=="waitingCallers") {
		waitingCallerSlice = null;
		if(payload.length>0) {
			waitingCallerSlice = JSON.parse(payload);
			//gLog('showWaitingCallers msg',waitingCallerSlice.length);
			if(waitingCallerSlice && waitingCallerSlice.length>0) {
				// would be nice to use a different sound here?
				if(notificationSound) {
					notificationSound.play().catch(function(error) { });
				}
			}
		}
		showWaitingCallers();

	} else if(cmd=="missedCalls") {
		console.log("cmd missedCalls len="+payload.length+" comment="+comment+" wsConn="+(wsConn!=null));
		let oldMissedCallsSliceLen = 0;
		if(missedCallsSlice!=null) {
			oldMissedCallsSliceLen = missedCallsSlice.length;
		}

		missedCallsSlice = null;
		if(payload.length>0) {
			missedCallsSlice = JSON.parse(payload);
			if(missedCallsSlice==null) {
				console.log('cmd missedCalls slice empty list');
			} else {
				console.log('cmd missedCalls slice elements='+missedCallsSlice.length+" "+newestMissedCallBingClock);
				// beep when there is a new missedCall entry
				if(missedCallsSlice!=null && missedCallsSlice.length>0) {
					// OK, there is at least one entry
					if(newestMissedCallBingClock==0) {
						// the first time (right after start, when newestMissedCallBingClock==0) we do not beep
						// we only take the time of the newest missedCall entry
						newestMissedCallBingClock = missedCallsSlice[missedCallsSlice.length-1].CallTime;
						// from now we will check if the newest entry is newer than newestMissedCallBingClock
						console.log("cmd missedCalls newestMissedCallBingClock="+ newestMissedCallBingClock);
					} else {
						//console.log("cmd missedCalls new="+ missedCallsSlice[missedCallsSlice.length-1].CallTime +
						//	" last="+newestMissedCallBingClock);
						if(missedCallsSlice[missedCallsSlice.length-1].CallTime > newestMissedCallBingClock) {
							newestMissedCallBingClock = missedCallsSlice[missedCallsSlice.length-1].CallTime;
							console.log("beep newestMissedCallBingClock="+newestMissedCallBingClock);
							soundBeep();
						}
					}
				}
			}
		}
		showMissedCalls();

	} else if(cmd=="ua") {
		otherUA = payload;
		gLog("otherUA",otherUA);

	} else if(cmd=="textmode") {
		if(payload=="true") {
			textmode = true;
			console.log("cmd==textmode set");
			if(muteMicElement.checked==false) {
				muteMicElement.checked = true;
				// if we change the state of the muteMic checkbox here, we need to auto-change it back on hangup
				// only then do we ever auto-change the state of this checkbox
				muteMicModified = true;
				console.log("cmd==textmode set, muteMicElement.checked");
			}
		} else {
			textmode = false;
			//console.log("cmd==textmode not set "+textmode);
		}

	} else if(cmd=="rtcNegotiate") {
		// remote video track added by caller
		console.log("cmd==rtcNegotiate");
		if(isDataChlOpen()) {
			pickupAfterLocalStream = true;
			// getStream() -> gotStream() -> gotStream2() -> pickup2() -> "calleeDescriptionUpd"
			getStream(false,"rtcNegotiate");
		}

	} else if(cmd=="rtcVideoOff") {
		// remote video track removed by other side (hide remoteVideoFrame so that audio can still be received)
		gLog("rtcVideoOff");
		remoteVideoHide();

	} else if(cmd=="stopCamDelivery") {
		gLog("stopCamDelivery");
		connectLocalVideo(true);

	} else if(cmd=="news") {
		let newsDate = payload;
		let newsUrl = tok[2];
		let newsDateInt = parseInt(newsDate);
		if(newsDateInt >= minNewsDate) {
			gLog("news="+newsDate+"("+newsDateInt+">"+minNewsDate+")|"+newsUrl);
			if(exclamationElement!=null) {
				exclamationElement.style.display = "block";
				exclamationElement.style.opacity = 1;

				exclamationElement.onclick = function(ev) {
					ev.stopPropagation();
					if(typeof Android !== "undefined" && Android !== null) {
						openNews(newsUrl);
					} else {
						window.open(newsUrl, "_blank");
					}

					minNewsDate = Math.floor(Date.now()/1000);
					localStorage.setItem('newsdate', minNewsDate);

					exclamationElement.style.opacity = 0;
					setTimeout(function() {
						exclamationElement.style.display = "none";
					},1000);
				};
			} else {
				gLog("exclamationElement not defined");
			}
			minNewsDate = newsDateInt;
		} else {
			//gLog("news is old");
		}

	} else {
		console.log('# ignore cmd='+cmd+' payload='+payload);
	}
}

function showWaitingCallers() {
	let waitingCallersElement = document.getElementById('waitingCallers');
	if(waitingCallersElement) {
		let waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallerSlice==null || waitingCallerSlice.length<=0) {
			waitingCallersTitleElement.style.display = "none";
			waitingCallersElement.style.display = "none";
			waitingCallersElement.innerHTML = "";
			if(waitingCallersTitleElement) {
				waitingCallersTitleElement.style.display = "none";
			}
			return;
		}

		waitingCallersTitleElement.style.display = "block";
		waitingCallersElement.style.display = "block";
		gLog('showWaitingCallers fkt waitingCallerSlice.length',waitingCallerSlice.length);
		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let str = "<table style='width:100%; border-collapse:separate; border-spacing:2px 2px; line-height:1.5em;'>"
		for(let i=0; i<waitingCallerSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - waitingCallerSlice[i].CallTime;
			let waitingTimeString = ""+waitingSecs+"s";
			if(waitingSecs>50) {
				waitingTimeString = ""+Math.floor((waitingSecs+10)/60)+"m"
			}
			let callerName = waitingCallerSlice[i].CallerName;
			let callerNameShow = callerName;
			//gLog('waitingCallerSlice[i].Msg',waitingCallerSlice[i].Msg);
			if(waitingCallerSlice[i].Msg!="") {
				callerNameShow =
					"<a onclick='showMsg(\""+waitingCallerSlice[i].Msg+"\");return false;'>"+callerName+"</a>";
			}

			let myDomain = location.host;
			let callerID = waitingCallerSlice[i].CallerID;
			if(callerID.endsWith("@"+myDomain)) {
				let idx = callerID.indexOf("@"+myDomain);
				if(idx>=0) {
					callerID = callerID.substring(0,idx);
				}
				if(callerID.endsWith("@")) {
					callerID = callerID.substring(0,callerID.length-1);
				}
			}

			if(window.innerWidth>500) {
				str += "<td>" + callerNameShow + "</td><td>"+
					callerID + "</td>"+
					"<td style='text-align:right;'> "+
					waitingTimeString + "</td>"+
					"<td style='text-align:right;'>"+
						"<a onclick='pickupWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
					"accept</a></td>"+
					"<td style='text-align:right;'>"+
						"<a onclick='rejectWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
					"reject</a></td>"+
					"</tr>";
			} else {
				str += "<td>" + callerNameShow + "<br>"+
					callerID + "</td>"+
					"<td style='text-align:right;'> "+
					waitingTimeString + "</td>"+
					"<td style='text-align:right;'>"+
						"<a onclick='pickupWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
					"accept</a></td>"+
					"<td style='text-align:right;'>"+
						"<a onclick='rejectWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
					"reject</a></td>"+
					"</tr>";
			}
		}
		str += "</table>";
		waitingCallersElement.innerHTML = str;
		if(waitingCallersTitleElement) {
			waitingCallersTitleElement.style.display = "block";
		}

		setTimeout(function() {
			showWaitingCallers();
		},10000);
	}
}

function pickupWaitingCaller(addrPort) {
	console.log('pickupWaitingCaller',addrPort);

	// hangup current call
	if(mediaConnect) {
		hangup(true,false,"pickupWaitingCaller");
// TODO tmtmtm do we need to delay wsSend("pickupWaitingCaller") ???
	}

	wsSend("pickupWaitingCaller|"+addrPort);
}

function rejectWaitingCaller(addrPort) {
	console.log('rejectWaitingCaller',addrPort);
// TODO
	wsSend("rejectWaitingCaller|"+addrPort);
}

var showCallsWhileInAbsenceCallingItself = false;
function showMissedCalls() {
	let nextDrawDelay = 30000;
	let skipRender = false;

	if(wsConn==null) {
		// don't execute if client is disconnected
		if(!goOnlineSwitch.checked) {
			console.log('showMissedCalls abort goOnlineSwitch.checked OFF');
			return;
		}
		console.log('! showMissedCalls skip: wsConn==null');
		nextDrawDelay = 10000;
		skipRender = true;
	}
	if(!skipRender) {
		if(missedCallsSlice==null || missedCallsSlice.length<=0) {
			console.log("showMissedCalls empty skip");
			missedCallsTitleElement.style.display = "none";
			missedCallsElement.style.display = "none";
			missedCallsElement.innerHTML = "";
			skipRender = true;
		}
	}

	if(!skipRender) {
		// if activity is paused, skip to setTimeout
		if(typeof Android !== "undefined" && Android !== null) {
			if(typeof Android.isActivityInteractive !== "undefined" && Android.isActivityInteractive !== null) {
				if(Android.isActivityInteractive()) {
					//console.log("showMissedCalls activity is interactive");
				} else {
					skipRender = true;
					console.log("! showMissedCalls skip: activity not interactive");
				}
			} else {
				//console.log("showMissedCalls activity isActivityInteractive unavailable");
			}
		}
	}

	if(!skipRender) {
		//console.log("showMissedCalls len="+missedCallsSlice.length);
		// make remoteCallerIdMaxChar depend on window.innerWidth
		// for window.innerWidth = 360, remoteCallerIdMaxChar=21 is perfect
//		let remoteCallerIdMaxChar = 13;
//		if(window.innerWidth>360) {
//			remoteCallerIdMaxChar += Math.floor((window.innerWidth-360)/22);
//		}
		//console.log("window.innerWidth="+window.innerWidth+" remoteCallerIdMaxChar="+remoteCallerIdMaxChar);

		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/callee");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx) + "/user/";
		}
		let str = "<table style='width:100%; border-collapse:separate; line-height:1.4em; margin-left:-4px;'>"
/*
		str += "<tr style='font-size:0.7em;line-height:1.1em;'><td>Nickname</td>"+
			"<td>Caller ID</td>"+
			"<td>Dial ID</td>"+
			"<td align='right'></td></tr>";
*/
		for(var i=0; i<missedCallsSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - missedCallsSlice[i].CallTime;
			if(waitingSecs<0) {
				waitingSecs = 0;
			}
			// split waitingTimeString by days, hours, min
			let waitingTimeString = ""+waitingSecs+"s";
			if(waitingSecs>50) {
				let waitingMins = Math.floor((waitingSecs+10)/60);
				if(waitingMins>=60) {
					let waitingHours = Math.floor(waitingMins/60);
					waitingMins -= waitingHours*60;
					if(waitingHours>=24) {
						let waitingDays = Math.floor(waitingHours/24);
						waitingHours -= waitingDays*24;
						waitingTimeString = ""+waitingDays+"d";
					} else {
						waitingTimeString = ""+waitingHours+"h";
					}
				} else {
					waitingTimeString = ""+waitingMins+"m";
				}
			}
			let callerIp = missedCallsSlice[i].AddrPort;
			let callerIpIdxPort = callerIp.indexOf(":");
			if(callerIpIdxPort>0) {
				callerIp = callerIp.substring(0,callerIpIdxPort);
			}
			let callerID = missedCallsSlice[i].CallerID;
			// .CallerName may look like this "id (Finchen)"
			let callerName = missedCallsSlice[i].CallerName;
			if(callerName=="null") {
				callerName="";
			}
			let idx = callerName.indexOf(" (");
			if(idx>0) {
				callerName = callerName.substring(0,idx);
			}
			if(callerName=="") {
				if(callerID==calleeID) {
					callerName="self";
				} else {
					callerName="n/a";
				}
			}
			// TODO if callerName=="" || callerName=="unknown" -> check contacts?

			let dialID = missedCallsSlice[i].DialID;
			if(dialID=="") {
				dialID = "main";
			}
			if(window.innerWidth<480) {
				dialID = dialID.substring(0,6);
				if(window.innerWidth<380) {
					dialID = dialID.substring(0,4);
				}
				callerName = callerName.substring(0,10);
				if(window.innerWidth<380) {
					callerName = callerName.substring(0,8);
				}
			}

			let callerMsg = missedCallsSlice[i].Msg;
			let comboName = callerName;
			if(callerMsg!="") {
				let tmp = "<div title='"+callerMsg+"' class='tooltip'>" + comboName + "</div>";
				comboName = "<a onclick='showMsg(\""+callerMsg+"\");return false;'"+
								" style='display:inline-block'>"+tmp+"</a>";
			}

			let remoteCaller = false;
			let remoteAddr = "";
			let callerIdNoHost = callerID;
			var parts = callerID.split("@");
			if(parts.length>=3) {
				remoteCaller = true;
				callerIdNoHost = parts[0];
				if(parts[1]!="") {
					callerIdNoHost += "@"+parts[1];
				}
				remoteAddr = parts[2];
				if(remoteAddr==location.host) {
					remoteCaller = false;
					callerID = callerIdNoHost;
				}
			}

			// TODO here we could check if callerID is (still) a valid calleeID (but better do this on server)

			let noLink = false;
			if(callerID=="") {
				// local user without ID (cannot be called back)
				noLink = true;
				if(callerIp=="")
					callerIdNoHost = "unknown";
				else
					callerIdNoHost = halfShowIpAddr(callerIp);
				callerID = callerIdNoHost;
			} else if(callerIdNoHost=="") {
				// remote user without ID (cannot be called back)
				noLink = true;
				if(callerIp=="")
					callerIdNoHost = "unknown";
				else
					callerIdNoHost = halfShowIpAddr(callerIp);
				callerID = callerIdNoHost + callerID;
			}

			let callerLink = "";
			if(!remoteCaller) {
				// the original caller is hosted on THIS server
				callerLink += mainLink + callerIdNoHost;
				// do NOT send callerId + callerName to callee on local server
				//callerLink += "?callerId="+calleeID + "&callerName="+calleeName;
				//if(!playDialSounds) callerLink += "&ds=false";
				//if(!playDialSounds) callerLink += "?ds=false";
				//console.log("local ("+callerIdNoHost+") ("+callerLink+")");

				if(window.innerWidth<440) {
					callerIdNoHost = callerIdNoHost.substring(0,11);
					//if(window.innerWidth<400) {
					//	callerIdNoHost = callerIdNoHost.substring(0,8);
					//}
				}
				if(noLink) {
					callerLink = callerIdNoHost;
				} else {
					callerLink = "<a href='"+callerLink+"' onclick='openDialUrlx(\""+callerLink+"\",event)'>"+
								 callerIdNoHost+"</a>";
				}

			} else {
				// the original caller is hosted on a REMOTE server
				callerLink += mainLink + callerIdNoHost + "?callerId=select&targetHost="+remoteAddr +
					"&callerName="+calleeName + "&callerHost="+location.host;
				if(!playDialSounds) callerLink += "&ds=false";
				//console.log("remote ("+callerID+") ("+callerLink+")");

				let callerIdDisplay = callerID;
				//gLog("id="+id+" callerIdDisplay="+callerIdDisplay+" callerHost="+callerHost+
				//	" location.host="+location.host);
//				if(callerIdDisplay.length > remoteCallerIdMaxChar+2) {
//					callerIdDisplay = callerIdDisplay.substring(0,remoteCallerIdMaxChar)+"..";
//					//gLog("callerIdDisplay="+callerIdDisplay+" "+callerIdDisplay.length);
//				}

				if(window.innerWidth<440) {
					callerIdDisplay = callerIdDisplay.substring(0,11);
					//if(window.innerWidth<400) {
					//	callerIdDisplay = callerIdDisplay.substring(0,9);
				}
				if(noLink) {
					callerLink = callerIdDisplay;
				} else {
					callerLink = "<a href='"+callerLink+"' onclick='openDialRemotex(\""+callerLink+"\",event)'>"+
								 callerIdDisplay+"</a>";
				}
			}

			// three columns: nickname, callerID with link, delete X
			str += "<td>" + comboName +"</td>"+
				"<td>"+	callerLink + "</td>"+
				"<td>"+	dialID + "</td>"+
				"<td align='right'><a onclick='deleteMissedCall(\""+
					missedCallsSlice[i].AddrPort+"_"+missedCallsSlice[i].CallTime+"\","+
					"\""+callerName+"\","+
					"\""+callerID+"\")'>"+
				waitingTimeString + "</a></td>";
		}
		str += "</table>"
		missedCallsTitleElement.style.display = "block";
		missedCallsElement.innerHTML = str;
		missedCallsElement.style.display = "block";
	}

	if(showCallsWhileInAbsenceCallingItself) {
		// already updating itself
	} else {
		showCallsWhileInAbsenceCallingItself = true;

		setTimeout(function() {
			showCallsWhileInAbsenceCallingItself = false;
			showMissedCalls();
		},nextDrawDelay);
	}
}


function showMsg(msg) {
	document.getElementById("showMsgInner").innerHTML = msg;
	menuDialogOpen(document.getElementById("showMsg"),1);
}


function halfShowIpAddr(ipAddr) {
	let idxFirstDot = ipAddr.indexOf(".");
	if(idxFirstDot>=0) {
		let idxSecondDot = ipAddr.substring(idxFirstDot+1).indexOf(".")
		if(idxSecondDot>=0) {
			return ipAddr.substring(0,idxFirstDot+1+idxSecondDot+1)+"x.x";
		}
	}
	return ipAddr
}

var myCallerAddrPortPlusCallTime = 0;
function deleteMissedCall(callerAddrPortPlusCallTime,name,id) {
	gLog("deleteMissedCall "+callerAddrPortPlusCallTime+" "+name+" "+id);
	myCallerAddrPortPlusCallTime = callerAddrPortPlusCallTime;

	let yesNoInner = "";
	if(wsConn!=null) {
		yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.6em; border-radius:3px; cursor:pointer;'><div style='font-weight:600'>Delete missed call?</div><br>"+
		"Name:&nbsp;"+name+"<br>ID:&nbsp;"+id+"<br><br>"+
	"<a onclick='deleteMissedCallDo();history.back();'>Delete!</a> &nbsp; &nbsp; <a onclick='history.back();'>Cancel</a></div>";
	} else {
		// if we have no network (no wsConn = service in reconnect mode)
		// we need to tell the user that the entry cannot be deleted currently
		yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.6em; border-radius:3px; cursor:pointer;'><div style='font-weight:600'>Entries can not be deleted right now.</div><br> <a onclick='history.back();'>Cancel</a></div>";
	}
	menuDialogOpen(dynDialog,1,yesNoInner);
}

function deleteMissedCallDo() {
	// will be called by deleteMissedCall()
	gLog('deleteMissedCallDo '+myCallerAddrPortPlusCallTime);
	wsSend("deleteMissedCall|"+myCallerAddrPortPlusCallTime);
}

function wsSend(message) {
	if(typeof Android !== "undefined" && Android !== null) {
		if(wsConn==null) {
			if(wsAddr=="") {
				// we can't call connectToWsServer() without having ever done a login()
				console.log("! wsSend with empty wsAddr -> abort");
			} else {
				// currently not connected to webcall server
				console.log('wsSend with wsConn==null -> connectToWsServer');
				connectToWsServer(message,"andr wsConn==null");
				// service -> connectHost(wsUrl) -> onOpen() -> wsSendMessage(message)
			}
		} else {
			Android.wsSend(message);
		}
		return;
	}

	if(wsConn==null || wsConn.readyState!=1) {
		// currently not connected to webcall server, so we need to connect
		if(wsConn) {
			// we have a wsConn in a funny state: fix that
			if(wsConn.readyState==0) {
				console.log('wsSend (state 0 = connecting) '+message);
				wsConn.close();
				wsConn=null;
				showVisualOffline("wsSend readyState==0");
			} else if(wsConn.readyState==2) {
				console.log('wsSend (state 2 = closing)');
				wsConn=null;
				showVisualOffline("wsSend readyState==2");
			} else if(wsConn.readyState==3) {
				console.log('wsSend (state 3 = closed)');
				wsConn=null;
				showVisualOffline("wsSend readyState==3");
			} else {
				console.log('wsSend ws state',wsConn.readyState);
			}
		}
		console.log("wsSend -> connectToWsServer()",message);
		connectToWsServer(message,"js wsSend not con");
	} else {
		wsConn.send(message);
	}
}

function sendInit(comment) {
	console.log("sendInit() from: "+comment);
	signalingCommandCount = 0;
	wsSend("init|"+comment); // -> connectToWsServer()
	// server will respond to this with "sessionId|(serverVersion)"
	// when we receive "sessionId|", we call showOnlineReadyMsg() and Android.calleeConnected()
}

function hangup(mustDisconnect,dummy2,message) {
	// hide answerButtons, close msgbox, stop buttonBlinking, hide remoteVideo, stopAllAudioEffects(
	// close the peer connection (the incomming call) via endWebRtcSession()
	console.log("hangup: '"+message+"' goOnlineSwitch="+goOnlineSwitch.checked);
	// NOTE: not all message strings are suited for users
	showStatus(message,-1);
	// expected followup-message "ready to receive calls" from showOnlineReadyMsg()
	// showOnlineReadyMsg() is called in response to us calling sendInit() and the server responding with "sessionId|"
	// hangup() -> endWebRtcSession() -> prepareCallee() -> sendInit() ... server "sessionId|" -> showOnlineReadyMsg()

	//console.log("### spinner off hangup");
	spinnerStarting = false;
	divspinnerframe.style.display = "none";
	callScreen.style.display = "none";
	msgboxdiv.style.display = "none";
	msgbox.value = "";
	textbox.style.display = "none";
	textbox.value = "";

	buttonBlinking = false;
	textmode = false;
	textchatOKfromOtherSide = false;

	if(muteMicModified) {
		muteMicElement.checked = false;
		muteMic(false);
		muteMicModified = false;
	}

	remoteVideoFrame.srcObject = null;
	remoteVideoHide();
	pickupAfterLocalStream = false;

	// if mediaConnect -> play short busy tone
	if(!mediaConnect) {
		stopAllAudioEffects("hangup no mediaConnect");
	} else if(!playDialSounds) {
		stopAllAudioEffects("hangup no playDialSounds");
	} else if(!busySignalSound) {
		console.log('# hangup no busySignalSound');
	} else {
		console.log("hangup short busy sound");
		busySignalSound.volume = 0.5;
		busySignalSound.currentTime = 0;
		busySignalSound.play().catch(error => {
			console.log("hangup short busy sound",error.message);
		});

		setTimeout(function() {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
			stopAllAudioEffects("hangup short busy sound paused");
		},1200);
	}

	connectLocalVideo(true); // force disconnect
	endWebRtcSession(mustDisconnect, goOnlineSwitch.checked, "hangup "+message);
	vsendButton.classList.remove('blink_me')
}


function prepareCallee(sendInitFlag,comment) {
	// called by goOnlineSwitch        when we activate goOnlineSwitch
	//           gotStream2()          on load with auto=
	//           endWebRtcSession()    after a call to get ready for the next incoming call
	//           wakeGoOnline()        --currently not used--
	//           wakeGoOnlineNoInit()  when service has loaded the mainpage and is already connected
	// 1. load ringtone and notification sounds
	// 2. if wsSecret is empty and service is not yet connected, start reconnector via Android.jsGoOnline()
	//                              using existing cookie
	//    if wsSecret is given (from basepage form) and we are not yet connected, try login()
	//    else if sendInitFlag is set, call sendInit
	//    finally call getSettings()
	console.log("prepareCallee "+comment+" wsConn=="+(wsConn!=null));
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	addedAudioTrack = null;
	addedVideoTrack = null;

	if(!ringtoneSound) {
		console.log('prepareCallee lazy load ringtoneSound');
		ringtoneSound = new Audio('1980-phone-ringing.ogg');
		if(ringtoneSound) {
			ringtoneSound.onplaying = function() {
				ringtoneIsPlaying = true;
			};
			ringtoneSound.onpause = function() {
				ringtoneIsPlaying = false;
			};
		} else {
			console.warn("# prepareCallee problem with ringtoneSound");
		}
	}

	if(!busySignalSound) {
		console.log('prepareCallee lazy load busySignalSound');
		busySignalSound = new Audio('busy-signal.ogg');
	}

	if(!notificationSound) {
		console.log('prepareCallee lazy load notificationSound');
		notificationSound = new Audio("notification.mp3");
	}

	if(wsSecret=="") {
		// in android mode, we want to do the same as tile does
		//   and this is to call: webCallServiceBinder.goOnline() to start the reconnector
		// this is what Android.jsGoOnline() allows us to do
		// TODO not sure what happens service needs to login and fails ???
		// most likely the switch will go off, yes?
		if(typeof Android !== "undefined" && Android !== null) {
			// note: Android.isConnected() returns: 0=offline, 1=reconnector busy, 2=connected (wsClient!=null)
			console.log("prepareCallee isConnected()="+Android.isConnected()+" (1=reconnectBusy, 2=connected)");
			if(Android.isConnected()==2) {
				if(sendInitFlag) {
					sendInit("prepareCallee <- "+comment);
				}
// TODO don't do xhr when in the bg
				getSettings(); // display ownID links
				return;

			} else if(Android.isConnected()==0) {
				// we are offline and (so far) not connecting
				console.log("### spinner on prepareCallee Android.isConnected()<=0");
				spinnerStarting = true;
				setTimeout(function(oldWidth) {
					if(spinnerStarting) {
						divspinnerframe.style.display = "block";
					}
				},200,localVideoFrame.videoWidth);

				if(typeof Android.jsGoOnline !== "undefined" && Android.jsGoOnline !== null) {
					console.log("prepareCallee not connected/connecting -> call Android.jsGoOnline()");
					Android.jsGoOnline();	// -> startReconnecter()
					// will end up in wakeGoOnline or wakeGoOnlineNoInit and will call prepareCallee again
					return;
				}
				console.log("! prepareCallee Android.jsGoOnline() not supported, fall through");
				// fall through
			} else {
				console.log("! prepareCallee no action while connecting...");
			}
		} else {
			// no Android service,fall through
			console.log("prepareCallee no Android service, fall through");
/*
			//console.log("### spinner on prepareCallee brpwser mode");
			spinnerStarting = true;
			setTimeout(function(oldWidth) {
				if(spinnerStarting) {
					divspinnerframe.style.display = "block";
				}
			},200,localVideoFrame.videoWidth);
*/
		}
	}

	if(wsConn==null || (wsConn.readyState!=1 && typeof wsConn.readyState !=="undefined")) {
		// this basically says: if prepareCallee() is called when we are NOT connected to the server,
		// try to login now using cookie or wsSecret (from login form)
		if(!mediaConnect) {
			// only show server activity if we are not peer connected
			showStatus("Connecting...",-1);
		}

		let wsConnReadyState = -1;
		if(wsConn!=null) {
			// 0=connecting, 1=ready, 2=closing, 3=closed
			wsConnReadyState = wsConn.readyState;
		}
		console.log("prepareCallee wsConn=="+(wsConn!=null)+" state="+wsConnReadyState+" -> login()");
		// login on success will call getSettings()
		login(false,"prepareCallee");
		return;
	}

	console.log('prepareCallee have wsConn');
	if(sendInitFlag) {
		// will cause sessionId
		sendInit("prepareCallee <- "+comment);
	}
	getSettings(); // -> getSettingsDone() to display ownID links

	//console.log("### spinner off prepareCallee");
	spinnerStarting = false;
	divspinnerframe.style.display = "none";
}

function newPeerCon(comment) {
	//console.log("newPeerCon()");
	try {
		peerCon = new RTCPeerConnection(ICE_config);
		console.log("newPeerCon("+comment+") new RTCPeerConnection ready");
	} catch(ex) {
		console.error("# newPeerCon("+comment+") RTCPeerConnection "+ex.message);
		//console.log("### spinner off newPeerCon ex");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";

		// wrong: we need to make callee go offline, bc without a peerCon, it makes no sense to stay online
		//   showVisualOffline("err on newPeerCon() "+ex.message);
		// right: we need to make callee aware that without a peerCon ready, it makes no sense to stay online
		var statusMsg = "Error: Your device cannot receive p2p calls. RTCPeerConnection "+ex.message;
		if(typeof Android !== "undefined" && Android !== null) {
			statusMsg += " <a href='https://timur.mobi/webcall/android/#webview'>More info</a>";
		}
		showStatus(statusMsg,0,true);
		return true;
	};

	peerCon.onicecandidate = e => onIceCandidate(e,"calleeCandidate");
	peerCon.onicecandidateerror = function(e) {
		if(e.errorCode==701) {
			// don't warn on 701 (chrome "701 STUN allocate request timed out")
			//console.log("# peerCon onicecandidateerror " + e.errorCode+" "+e.errorText+" "+e.url,-1);
		} else if(e.errorCode==400) {
			// don't warn on 400 = bad request
			//console.log("# peerCon onicecandidateerror " + e.errorCode+" "+e.errorText+" "+e.url,-1);
		} else {
			console.log("# peerCon onicecandidateerror " + e.errorCode+" "+e.errorText,-1);
		}
	}
	peerCon.ontrack = ({track, streams}) => peerConOntrack(track, streams);
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		console.log("peerCon onicegatheringstatechange "+connection.iceGatheringState);
	}
	peerCon.onnegotiationneeded = async () => {
		// triggered when media is first added to the connection (during the initial setup of the connection)
		// as well as any time a change to the communication environment requires reconfiguring the connection
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log('! peerCon onnegotiationneeded deny: no peerCon');
			return;
		}
		if(!rtcConnect) {
			console.log('! peerCon onnegotiationneeded deny: no rtcConnect');
			return;
		}

		try {
			// this will trigger g and send hostCandidate's to the client
			console.log("peerCon onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
			peerCon.setLocalDescription(localDescription).then(() => {
				if(isDataChlOpen()) {
					console.log('peerCon onnegotiationneeded localDescription -> signal (dataChl)');
					dataChannel.send("cmd|calleeOffer|"+JSON.stringify(localDescription));
				} else {
					console.log('peerCon onnegotiationneeded localDescription -> signal');
					wsSend("calleeOffer|"+JSON.stringify(localDescription));
				}
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("peerCon onnegotiationneeded err",err.message);
		}
	};
	peerCon.onsignalingstatechange = event => {
		console.log("peerCon signalingstatechange "+peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		console.log("peerCon oniceconnectionstatechange", peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		connectionstatechangeCounter++;
		console.log("peerCon connectionstatechange "+peerCon.connectionState);
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			hangup(true,false,"No peer connection");
			return;
		}
		if(peerCon.connectionState=="disconnected") {
			console.log("# peerCon disconnected "+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects("peerCon disconnected");
			endWebRtcSession(true,goOnlineSwitch.checked,"disconnected by peer"); // -> peerConCloseFunc

		} else if(peerCon.connectionState=="failed") {
			// "failed" could be an early caller hangup
			// this may come with a red "WebRTC: ICE failed, see about:webrtc for more details"
			// in which case the callee webrtc stack seems to be hosed, until the callee is reloaded
			// or until offline/online
			console.log("# peerCon failed "+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects("peerCon failed");
			endWebRtcSession(true,goOnlineSwitch.checked,"peer connection failed"); // -> peerConCloseFunc
/*
			if(wsConn==null) {
				console.log('peerCon failed and wsConn==null -> login()');
				login(false,"onconnectionstatechange="+peerCon.iceConnectionState);
			} else {
				// init already sent by endWebRtcSession() above
				//gLog('peerCon failed but have wsConn -> send init');
				//sendInit("after peerCon failed");
			}
*/
		} else if(peerCon.connectionState=="connected") {
			if(!rtcConnect) {
				console.log("peerCon connectionState connected -> peerConnected()");
				peerConnected();
			} else {
				// only ff calls this twice
				console.log("peerCon connectionState connected (with rtcConnect ignore)");
			}
		}
	}

	dataChannel = null;
	peerCon.ondatachannel = event => {
		dataChannel = event.channel;
		console.log('createDataChannel got channel...');
		dataChannel.onopen = event => {
			console.log("dataChannel.onopen");
			// tell other side that we support textchat
			textchatOKfromOtherSide = false;
			dataChannel.send("textchatOK");
		};
		dataChannel.onclose = event => dataChannelOnclose(event);
		dataChannel.onerror = event => dataChannelOnerror(event);
		dataChannel.onmessage = event => dataChannelOnmessage(event);
	};
	return false;
}

var startWaitConnect;
function peerConnected() {
	// set rtcConnect=true and cont with peerConnected3() to wait for dataChl
	// called when peerCon.connectionState=="connected"
	if(rtcConnect) {
		console.log("# peerConnected already rtcConnect abort");
		return;
	}
	console.log("peerConnected rtcConnect --------------------");
	rtcConnectStartDate = Date.now(); // used in getStatsPostCall()
	mediaConnectStartDate = 0;
	rtcConnect = true;
	wsSend("rtcConnect|")
	startWaitConnect = Date.now();
	peerConnected3();
}

function peerConnected3() {
	// wait here for up to 1500ms while dataChannel==null (abort if peerCon is lost or closed)
	// then show answerButtons, play ringtone and blink answer button

	if(!peerCon || peerCon.iceConnectionState=="closed") {
		// caller early abort
		console.log("! peerConnected3: caller early abort");
		hangup(true,false,"Caller early abort");
		return;
	}

	// before we can continue enabling answerButton, we need to wait for datachannel
	let sinceStartWaitConnect = Date.now() - startWaitConnect;
	if(!isDataChlOpen()) {
		if(sinceStartWaitConnect < 1500) {
			console.log("peerConnected3: waiting for datachannel... "+
				sinceStartWaitConnect+" "+(Date.now() - startIncomingCall));
			setTimeout(function() {
				peerConnected3();
			},100);
			return;
		}

		// this should never happen
		console.warn("# peerConnected3: NO DATACHANNEL - ABORT RING");
		hangup(true,false,"Caller early abort");
		return;
	}

	// success: data channel is available
	// callScreen
	console.log("peerConnected3: got data channel after "+sinceStartWaitConnect);
	// scroll to top
	window.scrollTo({ top: 0, behavior: 'smooth' });
	// show Answer + Reject buttons (handlers below)
	callScreen.style.display = "block";
	callScreenType.innerHTML = "Incoming call";
	answerButton.disabled = false;
	rejectButton.disabled = false;

	// rejectButton default look
	rejectButton.style.background = "#0000"; // .mainbutton background-color
	rejectButton.style.border = "1.2px solid #ccc";

//	answerButtons.style.gridTemplateColumns = "5fr 5fr";
	chatButton.style.display = "none";
	fileselectLabel.style.display = "none";

	// in showPeerUserData() we display peerUserData in the callScreen
	// instead of listOfClientIps (???)
	//gLog('peerConnected3 accept incoming call?',listOfClientIps,dataChannel);
	if(!showStatusCurrentHighPrio) {
		showStatus("",0);
	}
	peerCon.getStats(null).then((results) => getStatsCandidateTypes(results,"Incoming", ""),
		err => console.log(err.message)); // -> wsSend("log|callee Incoming p2p/p2p")

	// only show msgbox if not empty
	if(msgbox.value!="" && !calleeID.startsWith("answie")) {
		msgboxdiv.style.display = "block";
	}

	// play ringtone and blink answer button
	let skipRinging = false;
	if(typeof Android !== "undefined" && Android !== null) {
		// if autoPickup was set by 3-button call notification, rtcConnect() may call pickup() and return true
		// this means that we don't need to ring or blink in JS
		skipRinging = Android.rtcConnect();
	}
	if(skipRinging) {
		console.log("peerConnected3 waiting for auto pickup..."+(Date.now() - startIncomingCall));
	} else {
		let doneRing = false;
		if(typeof Android !== "undefined" && Android !== null &&
		   typeof Android.ringStart !== "undefined" && Android.ringStart !== null) {
			// making sure the ringtone volume is the same in Android and JS
			console.log('peerConnected3 Android.ringStart()');
			doneRing = Android.ringStart();
		}

		if(!doneRing && ringtoneSound) {
			// browser must play ringtone
			console.log("peerConnected3 playRingtoneSound vol="+ringtoneSound.volume);
			allAudioEffectsStopped = false;
			var playRingtoneSound = function() {
				if(allAudioEffectsStopped) {
					if(!ringtoneSound.paused && ringtoneIsPlaying) {
						console.log('peerConnected3 playRingtoneSound paused');
						ringtoneSound.pause();
						ringtoneSound.currentTime = 0;
					} else {
						console.log("peerConnected3 playRingtoneSound not paused",
							ringtoneSound.paused, ringtoneIsPlaying);
					}
					return;
				}
				ringtoneSound.onended = playRingtoneSound;

				if(ringtoneSound.paused && !ringtoneIsPlaying) {
					gLog('peerConnected3 ringtone play...');
					ringtoneSound.play().catch(error => {
						console.warn("# peerConnected3 ringtone play error",error.message);
					});
				} else {
					console.log("! peerConnected3 ringtone play NOT started",
						ringtoneSound.paused,ringtoneIsPlaying);
				}
			}
			playRingtoneSound();
		}

		// blinking answer button
		buttonBlinking = true;
		let buttonBgHighlighted = false;
		let blinkButtonFunc = function() {
			if(!buttonBgHighlighted && buttonBlinking) {
				// blink on
				//answerButton.style.background = "#b82a68";
				//answerButton.style.background = "#c13";
				answerButton.style.background = "#0a1";
				answerButton.style.border = "1.2px solid #0a1";
				answerButton.style.color = "#fff";

				buttonBgHighlighted = true;
				setTimeout(blinkButtonFunc, 500);
			} else {
				if(!buttonBlinking || wsConn==null) {
					console.log("peerConnected3 !buttonBlinking or !wsConn -> abort blinking");
					//answerButton.style.background = "#04c";
					return;
				}
				// blink off
				//answerButton.style.background = "#04c";
				answerButton.style.background = "#0000"; // .mainbutton background-color
				answerButton.style.border = "1.2px solid #ccc";
				answerButton.style.color = "#eee";
				buttonBgHighlighted = false;
				gLog("peerConnected3 buttonBlinking...",dataChannel);
				setTimeout(blinkButtonFunc, 500);
			}
		}
		answerButton.textContent = "Answer";
		blinkButtonFunc();

		if(autoanswerCheckbox.checked) {
			var pickupFunc = function() {
				// may have received "onmessage disconnect (caller)" and/or "cmd cancel (server)" in the meantime
				if(!buttonBlinking) {
					return;
				}
				// only auto-pickup if iframeWindow (caller widget) is NOT active
				if(iframeWindowOpenFlag) {
					setTimeout(pickupFunc,1000);
					return;
				}
				console.log("peerConnected3 auto-answer call");
				pickup();
			}
			setTimeout(pickupFunc,3000);
		}

		console.log("peerConnected3 waiting for manual pickup/reject....."+(Date.now() - startIncomingCall));
	}

	// wait for the user to click one of the two buttons
	answerButton.onclick = function(ev) {
		ev.stopPropagation();
		console.log("answer button -> pickup()");
		pickup();
	}
	rejectButton.onclick = function(ev) {
		ev.stopPropagation();
		console.log("hangup button");
		if(mediaConnect) {
			hangup(true,false,"Hangup button ending call");
		} else {
			hangup(true,false,"Hangup button rejecting call");
		}
	}
}

var startPickup;
function pickup() {
	// to pickup the incoming call, user has clicked the answer button, or the 3-button Notification dialog
	// we call getStream() to get localStream, once avail pickup2() is called
	if(mediaConnect) {
		return;
	}

	startPickup = Date.now();
	console.log("pickup -> open mic, startPickup="+startPickup);

	// stop blinking, disable answer button
	buttonBlinking = false;
	answerButton.style.background = "#0000"; // .mainbutton background-color
	answerButton.style.border = "1.2px solid #ccc";
	answerButton.disabled = true;

	// rejectButton red high-lite
	rejectButton.style.background = "#a01";
	rejectButton.style.border = "1.2px solid #a01";
	callScreenType.innerHTML = "In call";

	// stop ringing
	stopAllAudioEffects("pickup");

	console.log("### spinner on pickup");
	divspinnerframe.style.display = "block";

	pickupAfterLocalStream = true; // getStream() -> gotStream() -> gotStream2() -> pickup2()
	getStream(false,"pickup");

	// pickup timer: in case getStream does NOT call pickup2() within a max duration -> hangup()
	// TODO not sure about this timeout duration
	// if user must be asked for mic permission, that could take much longer
	let startWaitPickup = Date.now();
	console.log("pickup waiting for pickup2... "+startWaitPickup+" "+startPickup+" dataChl="+isDataChlOpen());
	setTimeout(function() {
		// if gotStream2() was called, pickupAfterLocalStream would be cleared
		// if endWebRtcSession() was called rtcConnect would be false
		// if pickup4() was called, mediaConnect would be set
		// if pickup() was called again, startPickup would be > startWaitPickup (our old copy)

		// NOTE pickupAfterLocalStream is cleared by gotStream2() when it calls pickup2()
		// mediaConnect may still fail (pickup4 never called)
		if(/*pickupAfterLocalStream &&*/ rtcConnect && !mediaConnect && startWaitPickup>=startPickup) {
			// gotStream() -> gotStream2() -> pickup2() didn't happen
			console.log("# pickup timeout (no gotstream) "+startWaitPickup+" "+startPickup);
			//console.log("### spinner off pickup");
			spinnerStarting = false;
			divspinnerframe.style.display = "none";

			hangup(true,false,"pickup timeout (no microphone)");
			return;
		}
		// all is well, no action needed
		console.log("pickup post timer looks OK "+
			pickupAfterLocalStream+" "+rtcConnect+" "+mediaConnect+" "+startWaitPickup+" "+startPickup);
	},3500);
}

function pickup2() {
	// we got the mic localStream (after user has Accepted the incoming call before)
	// here we add remoteStream, which should trigger onnegotiationneeded, createOffer, callerAnswer and pickup4()
	if(!localStream) {
		console.warn("# pickup2 no localStream");

		//console.log("### spinner off pickup2 no localStrean");
		spinnerStarting = false;
		divspinnerframe.style.display = "none";
		stopAllAudioEffects("pickup2 no localStream");
		return;
	}

	console.log("pickup2 gotStream "+(Date.now() - startPickup)+"ms "+
		" wsConn="+(wsConn!=null)+" goOnlineSwitch="+goOnlineSwitch.checked+" dataChl="+isDataChlOpen());

	if(typeof Android !== "undefined" && Android !== null) {
		Android.callPickedUp(); // audioToSpeakerSet() + callPickedUpFlag=true (needed for callInProgress())
	}

	if(remoteStream) {
		console.log('pickup2 peerCon start remoteVideoFrame');
		remoteVideoFrame.srcObject = remoteStream;
		remoteVideoFrame.play().catch(function(error) {	});
	} else {
		// TODO is this really an error? I don't think so
		console.log("! pickup2 no remoteStream");
	}

	// pickup4 should be called via cmd=="callerAnswer"
	// TODO: if pickup4 is not called, callee will keep on spinning and caller will keep on saying "Ringing..."
	// the timer in pickup() is supposed to resolve this
	console.log("pickup2 waiting for pickup4...");

/*
	// timer: if pickup4() is NOT called within a max duration -> hangup()
	let startWaitPickup4 = Date.now();
	setTimeout(function() {
		if(!mediaConnect && rtcConnect && startWaitPickup4>startPickup) {
			// abort waiting for pickup4
			console.log("# pickup timout (no mediaConnect) "+startWaitPickup4);
			hangup(true,false,"pickup timeout (no mediaConnect)");
			return;
		}
		// all is well, no action needed
	},3500);
*/
}

function pickup4(comment) {
	// user has picked up incoming call, we got the mic stream and now we transiton to mediaConnect
	if(mediaConnect) {
		console.log("# pickup4 called when mediaConnect was already set "+comment);
		return;
	}

	// cmd=="callerAnswer" -> pickup4() can come WAY too early
	// this is why we need to wait for localStream
	let sinceStartPickup = Date.now() - startPickup;
	if(localStream==null) {
		// before we can continue enabling answerButton, we need to wait for datachannel
		if(sinceStartPickup<3500 && rtcConnect) {
			console.log("! pickup4: waiting for localStream... "+
				sinceStartPickup+" "+(Date.now() - startIncomingCall));
			setTimeout(function() {
				pickup4(comment); //+" (retry)");
			},100);
			return;
		}

		// this should never happen
		console.warn("# pickup4: NO LOCALSTREAM - ABORT PICKUP "+sinceStartPickup);
		//stopAllAudioEffects("NO LOCALSTREAM ABORT PICKUP");
		let mustGoOnlineAfter = goOnlineSwitch.checked;
		endWebRtcSession(true,mustGoOnlineAfter,"NO LOCALSTREAM ABORT PICKUP"); // -> peerConCloseFunc
		return;
	}

	console.log("pickup4: got localStream after "+sinceStartPickup+"ms dataChl="+isDataChlOpen());

	// full connect
	mediaConnect = true;
	console.log("pickup4 - mediaConnect ---------- "+comment+" "+(Date.now() - startPickup)+
		" wsConn="+(wsConn!=null)+" switch="+goOnlineSwitch.checked);
	// desktop browser does this in 80-160ms
	// android webview does this in 800-900ms

	// end busy bee
	//console.log("### spinner off pickup4");
	spinnerStarting = false;
	divspinnerframe.style.display = "none";

	// this will make the caller unmute our mic on their side
	// TODO could also use datachannel?
	wsSend("pickup|!");

	// hide clear cookie (while peer connected) - will be re-enabled from endWebRtcSession(
	menuClearCookieElement.style.display = "none";

	// hide clear cache on android (while peer connected) - will be re-enabled from endWebRtcSession()
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			if(Android.getVersionName()>="1.1.0") {
				menuClearCacheElement.style.display = "none";
			}
		}
	}

	if(vsendButton) {
		vsendButton.style.display = "inline-block";
	}

	if(muteMicElement.checked) {
		muteMic(true); // mute mic
		// we auto-open the textbox bc the local mic is muted
		console.log("pickup4 muteMicElement.checked -> enableDisableTextchat open");
		enableDisableTextchat(true);
		// open textchat and mute on the caller side
		wsSend("textmode|true");
	} else {
		muteMic(false); // don't mute mic
	}

	if(textmode) {
		// we auto-open the textbox bc the caller requested textmode
		console.log("pickup4 textmode -> enableDisableTextchat open");
		enableDisableTextchat(true);
		muteMic(true); // mute mic
	}

	mediaConnectStartDate = Date.now();
	if(typeof Android !== "undefined" && Android !== null) {
		Android.peerConnect();
	}

	showStatus("",0,false);

	setTimeout(function() {
		if(videoEnabled && !addLocalVideoEnabled) {
			console.log("pickup4 full mediaConnect, blink vsendButton");
			vsendButton.classList.add('blink_me');
			setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
		}

		if(!peerCon) {
			console.warn("# pickup4 no peerCon");
		} else if(!mediaConnect) {
			console.warn("# pickup4 no mediaConnect");
		} else {
			// send "log|connected" to server
			console.log("pickup4 send log|connected");
			peerCon.getStats(null)
			.then((results) => getStatsCandidateTypes(results,"Connected","e2ee"),
				err => console.log(err.message));

			chatButton.onclick = function() {
				if(textchatOKfromOtherSide) {
					console.log("chatButton.onclick -> enableDisableTextchat toggle");
					enableDisableTextchat(false);
				} else {
					if(mediaConnect) {
						showStatus("Peer does not support TextChat",2000);
					} else {
						showStatus("Cannot open TextChat",2000);
					}
				}
			}
		}
	},200);
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
	let msg = getStatsCandidateTypesEx(results,eventString1)
	// result: "Connected p2p/p2p"
	console.log("getStats msg=("+msg+") callerName=("+callerName+") callerID=("+callerID+") callerMsg=("+callerMsg+")");
	// the original string from getStatsCandidateTypesEx() is sent as log to the server
	wsSend("log|callee "+msg); // shows up in server log as: serveWss peer callee "Incoming p2p/p2p"

	if(eventString1=="Connected") {
		// chatButton + fileselectLabel buttons are still hidden
		if(!isDataChlOpen()) {
			// should never happen
			console.log("# getStatsCandidateTypes no datachl - no textChat, no fileselect");
		} else if(!isP2pCon()) {
			// we don't allow file transfer over relayed link
			console.log("# getStatsCandidateTypes no P2p - no textChat, no fileselect");
		} else {
			gLog("pickup4 enable chatButton + fileselectLabel");
			chatButton.style.display = "block";
			fileselectLabel.style.display = "block";
		}
	}

	// now we create the string for showStatus
	// remove eventString1 (Incoming, Connected) from msg
	msg = msg.replace(eventString1,"");
	// result: "p2p/p2p"

	if(eventString2!="") {
		msg = msg + " "+eventString2;
		// result: "p2p/p2p e2ee"
	}

	if(textmode) {
		msg = msg + " TextMode";
		// result: "p2p/p2p e2ee TextMode"
	}

	// we rather show callerID and/or callerName if they are avail, instead of listOfClientIps
	if(callerName!="" || callerID!="") {
		if(callerName=="" || callerName.toLowerCase()==callerID.toLowerCase()) {
			msg = callerID +" "+ msg;
			// result: "nnnnnnnnnnn p2p/p2p e2ee TextMode"
		} else {
			msg = callerName +" "+ callerID +" "+ msg;
			// result: "Nickname nnnnnnnnnnn p2p/p2p e2ee TextMode"
		}
	} else if(listOfClientIps!="") {
		msg = listOfClientIps+" "+msg;
	}

	if(callerMsg!="") {
		msg += "<br>\""+callerMsg+"\""; // greeting msg
		// result: greeting msg added as 2nd line
	}

	let showMsg = msg;
	if(otherUA!="") {
		showMsg += "<div style='font-size:0.8em;margin-top:8px;color:#ccc;'>"+otherUA+"</div>";
		// result: callers UA added with smaller font
	}

	showPeerUserData(showMsg);
}

function showPeerUserData(peerUserData) {
	console.log("showPeerUserData="+peerUserData);
//	showStatus(peerUserData,-1);
	// we display peerUserData in the callScreen
	callScreenPeerData.innerHTML = peerUserData;
}

function dataChannelOnmessage(event) {
	if(typeof event.data === "string") {
		//console.log("dataChannel.onmessage "+event.data);
		if(event.data) {
			if(event.data.startsWith("disconnect")) {
				console.log("dataChannel.onmessage '"+event.data+"'");
				if(dataChannel!=null) {
					console.log("dataChannel.onmessage '"+event.data+" dataChannel.close");
					dataChannel.close();
					dataChannel = null;
				}
				hangupWithBusySound(true,"disconnect by peer via datachl");
			} else if(event.data.startsWith("textchatOK")) {
				textchatOKfromOtherSide = true;
			} else if(event.data.startsWith("msg|")) {
				// textchat msg from caller via dataChannel
				// sanitize incoming data
				//let cleanString = event.data.substring(4).replace(/<(?:.|\n)*?>/gm, "...");
				let cleanString = cleanStringParameter(event.data.substring(4),false);
				if(cleanString!="") {
					//gLog("dataChannel.onmessage msg",cleanString);
					msgboxdiv.style.display = "block";
					msgbox.readOnly = true;
					msgbox.placeholder = "";
					textbox.style.display = "block"; // -> submitForm()
					let msg = "< " + cleanString;
					if(msgbox.value!="") { msg = newline + msg; }
					msgbox.value += msg;
					//console.log("msgbox "+msgbox.scrollTop+" "+msgbox.scrollHeight);
					msgbox.scrollTop = msgbox.scrollHeight-1;
					soundKeyboard();
				}

			} else if(event.data.startsWith("cmd|")) {
				let subCmd = event.data.substring(4);
				//console.log("dataChannel.onmessage fw to signalingCommand() "+subCmd);
				signalingCommand(subCmd,"dataChl");

			} else if(event.data.startsWith("file|")) {
				var fileDescr = event.data.substring(5);

				if(fileDescr=="end-send") {
					console.log("file transmit aborted by sender");
					progressRcvElement.style.display = "none";
					if(fileReceivedSize < fileSize) {
						showStatus("File transmit aborted by sender",-1);
					}
					fileReceivedSize = 0;
					fileReceiveBuffer = [];
					return;
				}
				if(fileDescr=="end-rcv") {
					console.log("file send aborted by receiver");
					showStatus("File send aborted by receiver",-1);
					fileSendAbort = true;
					progressSendElement.style.display = "none";
					if(fileselectLabel && mediaConnect && isDataChlOpen() && isP2pCon()) {
						fileselectLabel.style.display = "block";
					}
					return;
				}

				if(!showStatusCurrentHighPrio) {
					showStatus("",-1);
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

			let randId = ""+Math.floor(Math.random()*100000000);
			var aDivElement = document.createElement("div");
			aDivElement.id = randId;
			downloadList.appendChild(aDivElement);
			downloadList.style.display = "block";

			var aElement = document.createElement("a");
			aElement.href = URL.createObjectURL(receivedBlob);
			aElement.download = fileName;
			let kbytes = Math.floor(fileReceivedSize/1000);
			aElement.textContent = `received '${fileName.substring(0,25)}' ${kbytes} KB`;
			aDivElement.appendChild(aElement);

			var aDeleteElement = document.createElement("a");
			aDeleteElement.style = "margin-left:10px;";
			aDeleteElement.onclick = function(ev){
				ev.stopPropagation();
				downloadList.removeChild(aDivElement);
				if(downloadList.innerHTML=="") {
					downloadList.style.display = "none";
				}
			}
			aDeleteElement.textContent = `[x]`;
			aDivElement.appendChild(aDeleteElement);
		}
	}
}

var allAudioEffectsStopped = false;
function stopAllAudioEffects(comment) {
	if(typeof comment!=="undefined" && comment!="") {
		console.log("stopAllAudioEffects ("+comment+")");
	}
	allAudioEffectsStopped = true;
	if(typeof Android !== "undefined" && Android !== null &&
	   typeof Android.ringStop !== "undefined" && Android.ringStop !== null) {
		if(Android.ringStop()) {
			// returns true if Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
			//return;
		}
	}
	try {
		if(ringtoneSound!=null && !ringtoneSound.paused && ringtoneIsPlaying) {
			gLog('stopAllAudioEffects ringtoneSound.pause');
			ringtoneSound.pause();
			ringtoneSound.currentTime = 0;
		}

		if(playDialSounds && busySignalSound) {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
		}
	} catch(ex) {
		console.log('# ex stopAllAudioEffects '+ex.message);
	}
}

var endWebRtcPending = false;
function endWebRtcSession(disconnectCaller,goOnlineAfter,comment) {
	// NOTE comment may be undefined
	if(endWebRtcPending) {
		console.log("! endWebRtcSession endWebRtcPending abort ("+comment+")");
		return;
	}

	endWebRtcPending = true;
	console.log("endWebRtcSession discCaller="+disconnectCaller+
				" onlAfter="+goOnlineAfter+" goOnlineSwitch="+goOnlineSwitch.checked+" ("+comment+")");
	stopAllAudioEffects("endWebRtcSession");

	pickupAfterLocalStream = false;
	if(remoteVideoFrame) {
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;
	}
	buttonBlinking = false;
	callScreen.style.display = "none";
	chatButton.style.display = "none";
	fileselectLabel.style.display = "none";

	//console.log("### spinner off endWebRtcSession");
	spinnerStarting = false;
	divspinnerframe.style.display = "none";

	if(wsConn==null) {
		showStatus("WebCall server disconnected",-1,true);
	}

	msgboxdiv.style.display = "none";
	msgbox.value = "";
	textbox.style.display = "none";
	textbox.value = "";

	stopTimer();
	if(autoPlaybackAudioSource) {
		autoPlaybackAudioSource.disconnect();
		if(autoPlaybackAudioSourceStarted) {
			console.log("endWebRtcSession autoPlayback stop "+autoPlaybackFile);
			autoPlaybackAudioSource.stop();
			autoPlaybackAudioSourceStarted = false;
		}
		autoPlaybackAudioSource = null;
	}

	if(peerCon && peerCon.iceConnectionState!="closed") {
		let peerConCloseFunc = function() {
			// rtcConnect && peerCon may be cleared by now
			if(disconnectCaller) {
				gLog('endWebRtcSession disconnectCaller');
				if(isDataChlOpen()) {
					// caller is still peerConnected: let the caller know we will now disconnect
					console.log('endWebRtcSession dataChannel.send(disconnect)');
					dataChannel.send("disconnect");
				} else {
					// caller is NOT peerConnected anymore: tell server the peer-session is over
					console.log('endWebRtcSession dataChannel already closed');
				}

				if(wsConn) {
					// also tell the server about it
					console.log('endWebRtcSession wsSend(cancel|'+comment+')');
					wsSend("cancel|"+comment); // very important (if caller is not ws-disconnected)
				}
			}
			if(dataChannel) {
				console.log('endWebRtcSession dataChannel.close');
				dataChannel.close();
				dataChannel = null;
			}
			if(peerCon && peerCon.iceConnectionState!="closed") {
				gLog('endWebRtcSession peerConCloseFunc remove sender tracks');
				const senders = peerCon.getSenders();
				if(senders) {
					try {
						senders.forEach((sender) => { peerCon.removeTrack(sender); })
					} catch(ex) {
						console.warn('endWebRtcSession removeTrack',ex.message);
					}
				}
				gLog('endWebRtcSession peerCon.close');
				peerCon.close();
				gLog('endWebRtcSession peerCon cleared');
			}

			if(goOnlineAfter) {
				console.log('endWebRtcSession newPeerCon');
				if(newPeerCon("endWebRtcSession")) {
					// fail
					console.warn("# endWebRtcSession newPeerCon fail");
					return;
				}
			}
		};

		if(rtcConnect /*&& peerCon && peerCon.iceConnectionState!="closed"*/) {
			gLog('endWebRtcSession getStatsPostCall');
			peerCon.getStats(null).then((results) => {
				getStatsPostCall(results);
				peerConCloseFunc();
			}, err => {
				console.log(err.message);
				peerConCloseFunc();
			});
		} else /*if(peerCon && peerCon.iceConnectionState!="closed")*/ {
			peerConCloseFunc();
		}
	}

	if(localStream && !videoEnabled) {
		console.log('endWebRtcSession close localStream');
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = false; // mute mic
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}

	rtcConnect = false;
	mediaConnect = false;
	if(vsendButton) {
		vsendButton.style.display = "none";
	}

	if(typeof Android !== "undefined" && Android !== null) {
		Android.peerDisConnect();
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			// show clearCache on android (after peer disconnect)
			if(Android.getVersionName()>="1.1.0") {
				menuClearCacheElement.style.display = "block";
			}
		}
	}

	// show clearCookie on android (after peer disconnect)
	menuClearCookieElement.style.display = "block";
	fileselectLabel.style.display = "none";
	progressSendElement.style.display = "none";
	progressRcvElement.style.display = "none";
	msgboxdiv.style.display = "none";
	msgbox.innerHTML = "";

	console.log("endWebRtcSession wsConn="+(wsConn!=null)+" dataChl="+isDataChlOpen());
	if(wsConn==null || !goOnlineAfter) {
		//showStatus("WebCall server disconnected");	// already done above
		// also hide ownlink
		showVisualOffline("endWebRtcSession wsConn==null or no goOnlineAfter");
	} else {
		// status: 'Ready to receive calls'
		// we must do this here bc we receive no cmd==sessionId -> showOnlineReadyMsg()
		// BS! with goOnlineAfter we will get cmd==sessionId after prepareCallee(init=true)
		// showOnlineReadyMsg();
	}

	if(!goOnlineAfter) {
		// a hostConnection after peerDisconnect is not requested
		// this occurs if the serverconnection was closed before also the peerConnection was ended
		console.log("endWebRtcSession done, no goOnlineAfter");
	} else {
		// we want to keep callee online after peer connection is gone
		// we just keep our wsConn alive, so no new login is needed
		// (no new ws-hub will be created on the server side)
		console.log("endWebRtcSession prepareCallee() wsConn="+(wsConn!=null));
		// get peerCon ready for the next incoming call
		// bc we are most likely still connected, prepareCallee() will just send "init"
		prepareCallee(true,"endWebRtcSession");
	}

	// why is this delay needed in goOnlineAfter?
	// it was implemented as a measure against multiple, concurrent calls to endWebRtcSession()
	// this way the 2nd and more calls will be chopped by endWebRtcPending
	setTimeout(function() {
		//console.log("callee endWebRtcSession auto prepareCallee(): enable goonline");
		// get peerCon ready for the next incoming call
		// bc we are most likely still connected, prepareCallee() will just send "init"
		console.log('endWebRtcSession done');
		endWebRtcPending = false;
	},200);
}

function getCookieSupport() {
	// returns: null = no cookies; false = only session cookies; true = all cookies allowed
    var persist= true;
    do {
        var c= 'gCStest='+Math.floor(Math.random()*100000000);
        document.cookie= persist? c+';SameSite=Strict;Secure;expires=Tue, 01-Jan-2030 00:00:00 GMT' : c;
        if(document.cookie.indexOf(c)!==-1) {
            document.cookie= c+';SameSite=Strict;Secure;expires=Sat, 01-Jan-2000 00:00:00 GMT';
            return persist;
        }
    } while(!(persist= !persist));
    return null;
}

function openNews(newsUrl) {
	// also called directly from WebCall for Android service
	// here we set horiCenterBound=true
	// we also set dontIframeOnload=true so that height:100% determines the iframe height
	// also: dontIframeOnload=true may be required if newsUrl points to a different domain
	// to avoid DOMException in iframeOnload()
	let randId = ""+Math.floor(Math.random()*100000000);
	if(newsUrl.indexOf("?")>=0)
		newsUrl += "&i="+randId;
	else
		newsUrl += "?i="+randId;
	console.log("openNews "+newsUrl);
	iframeWindowOpen(newsUrl,true,"max-width:99vw;",true);
}

var counter=0;
function openContacts() {
	let url = "/callee/contacts/?id="+calleeID+"&ds="+playDialSounds;
	gLog("openContacts "+url);
//	iframeWindowOpen(url,false,"height:97vh;",true);
//	iframeWindowOpen(url,false,"max-width:99vw;",true);

	if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
		iframeWindowOpen(url,false,"left:0px;top:0px;width:100vw;max-width:100vw;height:100vh;",true);
	} else {
		iframeWindowOpen(url,true,"height:97vh;width:97vw;max-width:1200px;",true);
	}
}

var slideOpen = false;
function slideTransitioned() {
	//console.log("slideTransitioned="+slideRevealElement.style.height);
	if(slideRevealElement.style.height != "0px") {
		slideRevealElement.style.height = "auto";
		slideOpen = true;
	} else {
		slideOpen = false;
		//slideRevealElement.style.visibility = "none";
	}
	slideRevealElement.removeEventListener('transitionend',slideTransitioned);
}

var slideRevealDivHeight = 123;
if(typeof Android !== "undefined" && Android !== null) {
	slideRevealDivHeight = 72;
}
function openSlide() {
	if(!slideOpen) {
		// close->-open
		console.log("openSlide close-to-open, wsConn="+(wsConn!=null)+" "+slideRevealDivHeight);
//		if(wsConn) {
			slideRevealElement.style.height = ""+slideRevealDivHeight+"px";
			slideRevealElement.addEventListener('transitionend', slideTransitioned) // when done: set height=auto
			//slideRevealElement.style.visibility = "visible";
//		} else {
//			console.log("! openSlide close-to-open, wsConn="+(wsConn!=null)+" not");
//		}
	} else {
		// open->-close
		//console.log("openSlide open-to-close, wsConn="+(wsConn!=null));
		slideRevealDivHeight = parseFloat(getComputedStyle(slideRevealElement).height);
		slideRevealElement.style.height = ""+slideRevealDivHeight+"px"; // from auto to fixed height
		slideRevealElement.addEventListener('transitionend', slideTransitioned)
		setTimeout(function() { // wait for fixed height; then set 0
			slideRevealElement.style.height = "0";
		},100);
	}
}

function openDialId(userId) {
	let url = "/user/";
	if(userId) {
		url = "/user/"+userId;
	}
	gLog('openDialId url='+url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
//	iframeWindowOpen(url,false,"height:95%;max-height:780px;",true);
//	iframeWindowOpen(url,false,"",true);
	if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
		iframeWindowOpen(url,false,"left:0px;top:0px;width:100vw;max-width:100vw;height:100vh;",true);
	} else {
		iframeWindowOpen(url,false,"height:97vh;width:97vw;max-width:1200px;",true);
	}
}

function openDialRemote(url) {
	gLog('openDialUrl',url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
//	iframeWindowOpen(url,false,"height:95%;max-height:780px;",true);
	iframeWindowOpen(url,false,"",true);
}
function openDialRemotex(url,evt) {
	gLog('openDialUrl',url);
	evt.preventDefault();
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
//	iframeWindowOpen(url,false,"height:95%;max-height:780px;",true);
	iframeWindowOpen(url,false,"",true);
}

function openDialUrl(url) {
	gLog('openDialUrl',url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
//	iframeWindowOpen(url,false,"height:95%;max-height:780px;",true);
//	iframeWindowOpen(url,false,"height:97vh;",true);
	iframeWindowOpen(url,false,"max-width:99vw;",true);
}
function openDialUrlx(url,evt) {
	gLog('openDialUrl',url);
	evt.preventDefault();
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
//	let height = containerElement.clientHeight * 0.9;
//	let height = window.screen.height * 0.86;
//	iframeWindowOpen(url,false,"_height:95%;height:"+height+"px;_min-height:450px;_max-height:780px;",true);
//	iframeWindowOpen(url,false,"height:97vh;",true);
// tmtmtm
//	iframeWindowOpen(url,false,"max-width:99vw;",true);
	if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
		iframeWindowOpen(url,false,"left:0px;top:0px;width:100vw;max-width:100vw;height:100vh;",true);
	} else {
		iframeWindowOpen(url,false,"height:97vh;width:97vw;max-width:1200px;",true);
	}
}


function openIdMapping() {
	let url = "/callee/mapping/?id="+calleeID;
	console.log('openIdMapping',url);
	// id manager needs 500px height
//	iframeWindowOpen(url,false,"height:460px;max-width:420px;",true);
	iframeWindowOpen(url,true,"top:25px;height:420px;max-width:460px;",true);
}

function openSettings() {
	let url = "/callee/settings/?id="+calleeID+"&ver="+clientVersion;
	gLog('openSettings='+url);
//	iframeWindowOpen(url,false,"max-width:460px;");
	iframeWindowOpen(url,true,"top:15px;max-width:460px;");
	// when iframe closes, client.js:iframeWindowClose() will call getSettings()
}

function clearcache() {
	if(typeof Android !== "undefined" && Android !== null) {
		if(Android.getVersionName()>="1.1.0") {
			let wasConnected = goOnlineSwitch.checked;
			if(typeof Android.wsClosex !== "undefined" && Android.wsClosex !== null) {
				Android.wsClosex();
			} else if(typeof Android.wsClose !== "undefined" && Android.wsClose !== null) {
				Android.wsClose();
			} else {
				console.log("clearcache android wsClosex + wsClose undefined");
			}
			if(typeof Android.wsClearCache !== "undefined" && Android.wsClearCache !== null) {
				setTimeout(function() {
					Android.wsClearCache(true, wasConnected); // autoreload, autoreconnect
				},250);
			} else {
				console.log("clearcache android wsClearCache undefined");
			}
		}
	}
}

function exit() {
	console.log("exit");
	if(typeof Android !== "undefined" && Android !== null) {
		history.back();
		// wait for pulldown menu to close
		setTimeout(function() {
			// ask yes/no (OK/Cancel)
			let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.4em; border-radius:3px; cursor:pointer; min-width:240px; top:30px; left:50%; transform:translate(-50%,0%);'><div style='font-weight:600;'>Exit?</div><br>"+
			"WebCall will shut down completely. All memory will be freed. Your password cookie remains in place.<br><br>"+
			"<a onclick='Android.wsExit();history.back();'>OK</a> &nbsp; &nbsp; &nbsp; "+
				"<a onclick='history.back();'>Cancel</a></div>";

			menuDialogOpen(dynDialog,0,yesNoInner);
		},300);
	} else {
		// this is not used: exit() is currently only available in Android mode
		history.back();
	}
}

function wakeGoOnline() {
	// currently not used? maybe only by older apks
	console.log("wakeGoOnline start");
	connectToWsServer('','wakeGoOnline'); // get wsConn
	wsOnOpen();
	//prepareCallee(true,"wakeGoOnline");   // wsSend("init|!")

	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.isTextmode !== "undefined" && Android.isTextmode !== null) {
			textmode = Android.isTextmode();
			console.log("wakeGoOnline isTextmode="+textmode);
		}
	}

	//console.log("### spinner off wakeGoOnline");
	//spinnerStarting = false;
	//divspinnerframe.style.display = "none";
	gLog("wakeGoOnline done");
}

function wakeGoOnlineNoInit() {
	// service is telling us that it is connected (and also has send init already)
	// we only need to get wsConn, load audio files, stop spinner
	// TODO do we need to call Android.calleeConnected() -> calleeIsConnected() ?
	console.log("wakeGoOnlineNoInit start");
	// TODO prepareCallee() will send init, which is not needed
	// TODO we are likely in the bg or in deep sleep: prepareCallee() should not call getsettings() (avoid xhr!)
	connectToWsServer('','wakeGoOnlineNoInit'); // get wsConn -> call goOnlne() -> prepareCallee()
	wsOnOpen();
	//prepareCallee(false,"wakeGoOnlineNoInit");  // do NOT wsSend("init|!")

	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.isTextmode !== "undefined" && Android.isTextmode !== null) {
			textmode = Android.isTextmode();
			console.log("wakeGoOnlineNoInit isTextmode="+textmode);
		}
		// if Android version < 1.4.8 -> showOnlineReadyMsg() (otherwise "Connecting..." may stick)
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			if(Android.getVersionName() < "1.4.8") {
				showOnlineReadyMsg();
			}
		}
	}

	//console.log("### spinner off wakeGoOnlineNoInit");
	//spinnerStarting = false;
	//divspinnerframe.style.display = "none";
	gLog("wakeGoOnlineNoInit done");
}

function clearcookie2() {
	console.log("clearcookie2 id=("+calleeID+") clear goOnlineSwitch");
	containerElement.style.filter = "blur(0.8px) brightness(60%)";

// TODO: is this really needed?
	goOnlineSwitch.checked = false;
	goOnlineSwitchChange("clearcookie2");

	if(iframeWindowOpenFlag) {
		console.log("clearcookie2 history.back");
		history.back();
	}
	clearcookie();
}

function clrMissedCalls() {
	console.log("clrMissedCalls");
	let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.4em; border-radius:3px; cursor:pointer; min-width:280px; top:30px; left:50%; transform:translate(-50%,0%);'>"+
	"<div style='font-weight:600;'>Clear Missed calls?</div><br>"+
	"Do you want to remove all of your Missed calls?<br><br>"+
	"<a onclick='clrMissedCalls2();history.back();'>Clear</a> &nbsp; &nbsp; &nbsp; "+
		"<a onclick='history.back();'>Cancel</a></div>";

	menuDialogOpen(dynDialog,0,yesNoInner);
}

function clrMissedCalls2() {
	console.log("clrMissedCalls2");
	wsSend("deleteMissedCall|all");
}

