// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const goOnlineSwitch = document.querySelector('input#onlineSwitch');
const answerButtons = document.getElementById('answerButtons');
const answerButton = document.querySelector('button#answerButton');
const rejectButton = document.querySelector('button#rejectButton');
const onlineIndicator = document.querySelector('img#onlineIndicator');
const isHiddenCheckbox = document.querySelector('input#isHidden');
const isHiddenlabel = document.querySelector('label#isHiddenlabel');
const autoanswerCheckbox = document.querySelector('input#autoanswer');
const autoanswerlabel = document.querySelector('label#autoanswerlabel');
const statusLine = document.getElementById('status');
const divspinnerframe = document.querySelector('div#spinnerframe');
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
//const checkboxesElement = document.getElementById("checkboxes");

var ringtoneSound = null;
var ringtoneIsPlaying = false;
var busySignalSound = null;
var notificationSound = null;
var wsAddr = "";
var talkSecs = 0;
var outboundIP = "";
var serviceSecs = 0;
var remainingTalkSecs = 0;
var remainingServiceSecs = 0;
var wsConn = null;
var lastWsConn = null;
var goOnlineWanted = false;
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
var altLabel = [];
var newline = String.fromCharCode(13, 10);
var textmode="";
var	muteMicModified = false;
var textchatOKfromOtherSide = false;
var missedCallAffectingUserActionMs = 0;

window.onload = function() {
	console.log("callee.js onload...");
	
	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		offlineAction("onload mediaDevices not found");
		showStatus("MediaDevices not found",-1);
		return;
	}

	fileSelectInit();
	window.onhashchange = hashchange;

	let dbg = getUrlParams("dbg");
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

		showStatus("calleeID missing in URL",-1);
		return;
	}
	document.title = "Callee "+calleeID;

	// remote on start fragment/hash ('#') in URL
	if(location.hash.length > 0) {
		console.log("! location.hash.length="+location.hash.length);
		window.location.replace("/callee/"+calleeID);
		return;
	}

	menuClearCookieElement.style.display = "block";

	// if set will auto-login as callee
	let auto = cleanStringParameter(getUrlParams("auto"),true,"auto");
	if(auto) {
		console.log("onload auto is set ("+auto+")");
		if(divspinnerframe) divspinnerframe.style.display = "block";
		// auto will cause onGotStreamGoOnline to be set below
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
		// pure browser mode (not in android mode)
		if(auto) {
			// to prevent this error when we try to play the ringtone in pure browser mode
			//    "peerConnected2 ringtone error
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
			gLog("isHiddenCheckbox checked");
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

				if(!wsConn) {
					offlineAction("checkServerMode no wsConn");
				}
				if(auto) {
					// if loaded by android callee, set onGotStreamGoOnline=true to cause goOnline()
					console.log("checkServerMode auto onGotStreamGoOnline=true");
					onGotStreamGoOnline=true;
				}
				start();
				return;
			}

			gLog('onload pw-entry is needed '+mode);
			if(divspinnerframe) divspinnerframe.style.display = "none";

			onGotStreamGoOnline = true;	        // TODO ???
			enablePasswordForm();
			return;
		}

		if(divspinnerframe) divspinnerframe.style.display = "none";

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
	localVideoFrame.muted = 0;

	// start localVideoFrame playback, setup the localVideo pane buttons
	vmonitor();

	// switch avSelect.selectedIndex to 1st video option
	getStream().then(() => navigator.mediaDevices.enumerateDevices())
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
						getStream(optionElements[i]);
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

		if(dataChannel) {
			gLog("videoOff !rtcConnect dataChannel still set "+dataChannel.readyState);
		}
	}

	// getStream() triggers a new cmd=='missedCalls' but we don't want a beep
	missedCallAffectingUserActionMs = (new Date()).getTime();

	// switch to the 1st audio option
	let optionElements = Array.from(avSelect);
	if(optionElements.length>0) {
		gLog("videoOff avSelect len "+optionElements.length);
		for(let i=0; i<optionElements.length; i++) {
			if(optionElements[i].text.startsWith("Audio")) {
				gLog("videoOff avSelect idx "+i);
				avSelect.selectedIndex = i;
				getStream(optionElements[i]);
				break;
			}
		}
		if(rtcConnect) {
			// activate selected device
			gLog("videoOff rtcConnect getStream()");
			getStream();
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
//	muteMicDiv.style.display = "none";
	showStatus("Login "+calleeID+" ...",-1);
	document.getElementById("current-password").value = "";
	form.style.display = "block";
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
			showStatus("Password must be six or more characters long",-1);
			return;
		}
		wsSecret = valuePw;
		// onGotStreamGoOnline will make gotStream2() call prepareCallee() -> login()
		onGotStreamGoOnline = true;
		//console.log("callee submitFormDone: enable goonline");
		start();
		// -> getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
	} else if(idx==2) {
		// textchat msg to send to caller via dataChannel
		if(dataChannel) {
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

function start() {
	// setup buttons, get audio input stream, then login
	console.log("start calleeID="+calleeID+" conn="+(wsConn!=null));

	goOnlineSwitch.onclick = function(ev) {
		//console.log('goOnlineSwitch.onclick state='+this.checked);
		ev.stopPropagation();
		lastUserActionDate = Date.now();
		if(this.checked) {
			// going online
			if(wsConn==null) {
				console.log('goOnlineSwitch.onclick ->on (wsConn==null)');
				goOnline(true,"user button");
			} else {
				console.log('! goOnlineSwitch.onclick ->on but wsConn!=null');
			}
		} else {
			// going offline
			if(wsConn!=null) {
				console.log('goOnlineSwitch.onclick ->off (wsConn!=null)');
				/*
				// if mediaConnect: popup yes/no dialog
				if(peerCon!=null && mediaConnect) {
					// keep switch in connected-state for until yes/no
					goOnlineSwitch.checked = true;
					console.log("! goOnlineSwitch.onclick mediaConnect");
					let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:25px 25px; line-height:1.6em; border-radius:3px; cursor:pointer; min-width:300px; max-width:350px; top:40px; left:50%; transform:translate(-50%,0%);'><div style='font-weight:600;'>WARNING</div><br>"+
			"Disconnecting WebCall server while in call, will prevent Trickle-ICE from gradually improving your P2P connection.<br><br>"+
			"<a style='line-height:2.8em' onclick='history.back();'>Stay connected</a> &nbsp; &nbsp; "+
			"<a onclick='goOffline(\"user button\");history.back();'>Disconnect</a></div>";
					menuDialogOpen(dynDialog,0,yesNoInner);
				} else
				*/
				{
					goOffline("user button");
				}
			} else {
				console.log('! goOnlineSwitch.onclick ->off but wsConn==null');
			}
		}
	}

	try {
		getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
		//getStream() -> getUserMedia(constraints) -> gotStream2() -> prepareCallee()
		// if wsSecret is set in prepareCallee(), it will call login()
	} catch(ex) {
		console.log("# ex while searching for audio devices "+ex.message);
		if(divspinnerframe) divspinnerframe.style.display = "none";
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
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			api = api + "&ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			api = api + "_" + Android.webviewVersion() +"_"+ clientVersion;
		}
	} else {
		api = api + "&ver="+clientVersion;
	}
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		// processData
		let loginStatus = xhr.responseText;
		console.log("login xhr loginStatus "+loginStatus);

		var parts = loginStatus.split("|");
		if(parts[0].indexOf("wsid=")>=0) {
			wsAddr = parts[0];
			// we're now a logged-in callee-user
			gLog('login wsAddr='+wsAddr);

			// hide the form
			form.style.display = "none";

			// show muteMic checkbox
//			muteMicDiv.style.display = "block";

			if(parts.length>=2) {
				talkSecs = parseInt(parts[1], 10);
			}
			if(parts.length>=3) {
				outboundIP = parts[2];
			}
			if(parts.length>=4) {
				serviceSecs = parseInt(parts[3], 10);
			}
			console.log('login outboundIP '+outboundIP);

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

		if(divspinnerframe) divspinnerframe.style.display = "none";

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
						"<a href='/callee/register'>Register a new ID</a>",-1);

			// clear "You will receive calls made by this link"
			ownlinkElement.innerHTML = "";

			form.style.display = "none";
			offlineAction("login notregistered");

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
			showStatus("User is busy",-1);
			form.style.display = "none";
		} else if(parts[0]=="errorWrongCookie") {
			showStatus("Error: "+parts[0].substring(5),-1);
			// TODO is this correct ??? No.
			//window.location.reload();
		} else if(parts[0]=="error") {
			// parts[0] "error" = "wrong pw", "pw has less than 6 chars" or "empty pw"
			// offer pw entry again
			console.log('login error - try again');
			//goOnlineButton.disabled = true;	// TODO or offlineAction(comment)
			enablePasswordForm();
		} else if(parts[0]=="") {
			showStatus("No response from server",-1);
			// TODO switch goOnlineSwitch off? or offlineAction(comment)
			form.style.display = "none";
		} else if(parts[0]=="fatal") {
			// loginStatus "fatal" = "already logged in" or "db.GetX err"
			// no use offering pw entry again at this point
			goOffline(); // Android.wsClose() -> disconnectHost(true) -> statusMessage("Offline") -> runJS("showStatus()")
			// make sure our showStatus() comes after the one ("offline") from disconnectHost()
			setTimeout(function() {
				if(parts.length>=2) {
					showStatus("Login "+parts[1]+" fail. Logged in from another device?",-1);
				} else {
					showStatus("Login fail, logged in from another device?",-1);
				}
			},300);
			form.style.display = "none";
		} else {
			goOffline();
			// loginStatus may be: "java.net.ConnectException: failed to connect to timur.mobi/66.228.46.43 (port 8443) from /:: (port 0): connect failed: ENETUNREACH (Network is unreachable)"
			if(loginStatus!="") {
				// make sure our showStatus() comes after the one ("offline") from disconnectHost()
				setTimeout(function() {
					showStatus("Status: "+loginStatus,-1);
				},300);
			}
			form.style.display = "none";
		}

	}, function(errString,err) {
		// errorFkt
		console.log("# xhr error "+errString+" "+err);
		if(err==502 || errString.startsWith("fetch")) {
			showStatus("No response from server",-1);
		} else {
			showStatus("xhr error "+err,3000);
		}

		if(divspinnerframe) divspinnerframe.style.display = "none";

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
		if(retryFlag) {
			setTimeout(function() {
				let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
				gLog('reconnecting in '+delay);
				showStatus("Reconnecting...",-1);
				missedCallsTitleElement.style.display = "none";
				missedCallsElement.style.display = "none";
				delayedWsAutoReconnect(delay);
			},4000);
		} else {
			talkSecs=0;
			serviceSecs=0;
			remainingTalkSecs=0;
			remainingServiceSecs=0;
			offlineAction("login error");
		}
	}, "pw="+wsSecret);
}

function sendInit(comment) {
	console.log("sendInit() from: "+comment);
	wsSend("init|"+comment); // -> connectSignaling()
	// server will respond to this with "sessionId|(serverVersion)"
	// when we receive "sessionId|", we call showOnlineReadyMsg() -> Android.calleeConnected()
}

function getSettings() {
	// xhr /getsettings for calleeName (nickname), mastodonID; /getmapping for altIdArray
	// then call getSettingDone() to display "You receive calls made by this link"

	// TODO why do we add arg id?
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
			if(typeof serverSettings.nickname!=="undefined") {
				calleeName = serverSettings.nickname;
				gLog("getsettings calleeName "+calleeName);
			}

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
			altIdArray = [];
			altIdActive = [];
			altLabel = [];
			if(xhr.responseText.startsWith("error")) {
				console.log("# /getmapping error("+xhr.responseText+")");
				showStatus("Error: "+xhr.responseText.substring(5),-1);
				return;
			}
			let altIDs = xhr.responseText;
			console.log("getsettings /getmapping altIDs="+altIDs);
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
						if(id.length>11) {
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
						altLabel.push(label);
						//console.log("getsettings altIdArray.length="+altIdArray.length);
					}
				}
			}
			getSettingDone();

		}, function(errString,errcode) {
			console.log("# getsettings xhr err "+errString+" "+errcode);
			getSettingDone();
		});
	}, function(errString,errcode) {
		// NOTE: errString=='timeout' may occur when the devive wakes from sleep
		// this is why it uses gLog() instead of console.log()
		gLog("# getsettings xhr error "+errString+" "+errcode);
		getSettingDone();
	});
}

function getSettingDone() {
	//console.log("getSettingDone",wsConn);
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
		if(typeof Android !== "undefined" && Android !== null) {
			links += "<div><span class='callListTitle'>Your Webcall ID's:</span> <span style='font-size:0.9em;'>(long-tap to share)</span></div>";
		} else {
			links += "<div><span class='callListTitle'>Your Webcall ID's:</span> <span style='font-size:0.9em;'>(right-click to copy link)</span></div>";
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
				// TODO is altIdArray[i] sometimes garbage?
				let userLinkMap = userLink.replace("/user/"+calleeID,"/user/"+altIdArray[i]);
				let showUserLinkMap = altIdArray[i];
				if(altLabel[i]=="") {
					//links += "<a target='_blank' href='"+userLinkMap+"'>"+showUserLinkMap+"</a><br>";
					links += "<a href='"+userLinkMap+"' onclick='openDialUrlx(\""+userLinkMap+"\",event)'>"+
							 showUserLinkMap+"</a><br>";
				} else {
					//links += "<a target='_blank' href='"+userLinkMap+"'>"+showUserLinkMap+"</a> ("+altLabel[i]+")<br>";
					links += "<a href='"+userLinkMap+"' onclick='openDialUrlx(\""+userLinkMap+"\",event)'>"+
							 showUserLinkMap+"</a> ("+altLabel[i]+")<br>";
				}
			}
		}
		links += "</div>";
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
		altIDs += altIdArray[i]+","+altIdActive[i]+","+altLabel[i];
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

function offlineAction(comment) {
	// we got disconnected from the server, make OnlineSwitch reflect offline state
	console.log("offlineAction "+comment);
	goOnlineSwitch.checked = false;
	// TODO also remove auto=1 ?

	if(divspinnerframe) divspinnerframe.style.display = "none";

	iconContactsElement.style.display = "none";
//	checkboxesElement.style.display = "none";

	// hide ownlink, but only if p2p connection is also gone
	if(!mediaConnect) {
		ownlinkElement.innerHTML = "";
	}

	// hide missedCalls
	missedCallsTitleElement.style.display = "none";
	missedCallsElement.style.display = "none";
}


function gotStream2() {
	// we got the mic
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.calleeReady !== "undefined" && Android.calleeReady !== null) {
			// service v1.1.5
			// when service starts activity/callee.js for answering a waiting call, then...
			// 1. we don't do offlineAction()
			// 2. we need to trigger service processWebRtcMessages()
			if(Android.calleeReady()) {
				// processWebRtcMessages() now active (don't mute mic; don't change online/offline buttons)
				return;
			}
		}
	}

	if(pickupAfterLocalStream) {
		pickupAfterLocalStream = false;
		console.log('gotStream2 -> auto pickup2()');
		pickup2();
	} else {
		if(localStream && !videoEnabled && !rtcConnect) {
			// mute (disable) mic until a call
			console.log('gotStream2 mute (disable) mic (localStream) standby');
			localStream.getTracks().forEach(track => { track.stop(); });
			const audioTracks = localStream.getAudioTracks();
			localStream.removeTrack(audioTracks[0]);
			localStream = null;
		}
		if(onGotStreamGoOnline && !rtcConnect) {
			console.log('gotStream2 onGotStreamGoOnline goOnline');
			onGotStreamGoOnline = false;
			//goOnline(true,"gotStream2");
			// if wsSecret is set, prepareCallee() will call login()
			prepareCallee(true,"gotStream2");
		} else {
			console.log("gotStream2 standby");

// questionable
//			console.log("gotStream2 set goOnlineSwitch "+(wsConn!=null));
//			goOnlineSwitch.checked = (wsConn!=null);
			if(wsConn==null) {
				// we are offline
			} else {
				// we are online
				// send init to request list of missedCalls
				sendInit("gotStream2 standby");
			}
		}
	}
}

let wsAutoReconnecting = false;
function delayedWsAutoReconnect(reconPauseSecs) {
	// delayedWsAutoReconnect can only succeed if a previous login attemt was successful
	console.log("delayedWsAutoReconnect "+reconPauseSecs);
	if((remainingTalkSecs<0 || remainingServiceSecs<0) && !calleeID.startsWith("answie")) {
		wsAutoReconnecting = false;
		console.log("# give up reconnecting "+remainingTalkSecs+" "+remainingServiceSecs);
		let mainLink = window.location.href;
		let idx = mainLink.indexOf("user/callee");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx);
		}
		showStatus("Login failed<br><a href='"+mainLink+"'>Main page</a>",-1);
		return;
	}
	wsAutoReconnecting = true;
	let startPauseDate = Date.now();
	setTimeout(function() {
		console.log("delayedWsAutoReconnect action");
		showStatus("");
		// don't proceed if the user has clicked on anything; in particular goOnline
		if(startPauseDate < lastUserActionDate) {
			// lastUserActionDate set by goOnline() and goOffline() is newer (happened later) than startPauseDate
			// user has initiated goOnline or goOffline, so we stop AutoReconnect
			wsAutoReconnecting = false;
			// but if we have a connection now, we don't kill it
			if(!wsConn) {
				gLog('delayedWsAutoReconnect aborted on user action '+
					startPauseDate+' '+lastUserActionDate);
//				offlineAction("delayedWsAutoReconnect no wsConn");	// TODO
			}
		} else if(!wsAutoReconnecting) {
			gLog('delayedWsAutoReconnect aborted on !wsAutoReconnecting');
			wsAutoReconnecting = false;
			//offlineAction("delayedWsAutoReconnect 1");		// TODO
		} else if(remainingTalkSecs<0 && !calleeID.startsWith("answie")) {
			gLog('delayedWsAutoReconnect aborted on no talk time');
			wsAutoReconnecting = false;
//			offlineAction("delayedWsAutoReconnect 2");		// TODO
		} else if(remainingServiceSecs<0 && !calleeID.startsWith("answie")) {
			gLog('delayedWsAutoReconnect aborted on no service time');
			wsAutoReconnecting = false;
//			offlineAction("delayedWsAutoReconnect 3");		// TODO
		} else {
			gLog('delayedWsAutoReconnect login...');
			login(true,"delayedWsAutoReconnect"); // -> connectSignaling("init|")
		}
	},reconPauseSecs*1000);
}

function showOnlineReadyMsg() {
	if(!wsConn) {
		console.log("# showOnlineReadyMsg not online");
		return;
	}

	// delay 'ready to receive calls' msg, so that prev msg can be read by user
	setTimeout(function(oldWidth) {
		if(!mediaConnect) {
			console.log("showOnlineReadyMsg");
			if(typeof Android !== "undefined" && Android !== null) {
				if(typeof Android.calleeConnected !== "undefined" && Android.calleeConnected !== null) {
					Android.calleeConnected();
					// calleeConnected() does 2 things:
					// 1. Intent brintent = new Intent("webcall");
					//    brintent.putExtra("state", "connected");
					//    sendBroadcast(brintent);
					// 2. statusMessage(awaitingCalls,-1,true,false);
				}
			} else {
				//showStatus("connected to webcall server",1200);
				showStatus("Ready to receive calls",-1);
			}
		}

/*
		// TODO isHiddenCheckbox needs a different implementation
		if(isHiddenCheckbox.checked) {
			showStatus("Your online status is hidden",2500);
		}
*/
	},600);
}

let tryingToOpenWebSocket = false;
let wsSendMessage = "";
function connectSignaling(message,comment) {
	console.log("connect to signaling server '"+comment+"' '"+message+"'");
    var wsUrl = wsAddr;

	tryingToOpenWebSocket = true;
	wsSendMessage = message;

	if(typeof Android !== "undefined" && Android !== null) {
		// wsUrl will only be used if service:wsClient==null
		// but on server triggered reconnect, service:wsClient will be set (and wsUrl will not be used)
		wsConn = Android.wsOpen(wsUrl);
		// if service is NOT yet connected:
		//  service -> wsCli=connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null) -> wsSendMessage("init|!")
		// if service IS already connected:
		//  service -> if activityWasDiscarded -> wakeGoOnlineNoInit()
// TODO how do we get peerCon

	} else {
		if(!window["WebSocket"]) {
			console.error('connectSig: no WebSocket support');
			showStatus("No websocket support");
			return;
		}
	    console.log('connectSig: open ws connection... '+calleeID+' '+wsUrl);
/*
// odd:
		if(peerCon==null || peerCon.signalingState=="closed") {
		    console.log('connectSig: peercon is gone ----------------');
			newPeerCon();
		}
*/
		// get ready for a new peerConnection
		newPeerCon();

		// get ready for a new websocket connection with webcall server
		wsConn = new WebSocket(wsUrl);
		wsConn.onopen = wsOnOpen;
		wsConn.onerror = wsOnError;
		wsConn.onclose = wsOnClose;
		wsConn.onmessage = wsOnMessage;
	}

	iconContactsElement.style.display = "block";
//	checkboxesElement.style.display = "block";
}

function wsOnOpen() {
	// called by service connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null)
	gLog("wsOnOpen calleeID="+calleeID+" connected="+(wsConn!=null));
	tryingToOpenWebSocket = false;
	wsAutoReconnecting = false;
	//console.log("wsOnOpen goOnlineSwitch=true");
	goOnlineSwitch.checked = true;

	if(divspinnerframe) divspinnerframe.style.display = "none";
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
	missedCallAffectingUserActionMs = (new Date()).getTime();
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
		showStatus("wsError unknown",-1);
	}

	// for ff wake-from-sleep error (wss interrupted), code is not given here (but in wsOnClose())
// TODO explain why the following is needed (and whether it is always true to assume wsConn=null on wsOnError()
	wsConn=null;
	iconContactsElement.style.display = "none";
//	checkboxesElement.style.display = "none";
}

function wsOnClose(evt) {
	// called by wsConn.onclose
	// evt.code = 1001 (manual reload)
	// evt.code = 1005 (No Status Received)
	// evt.code = 1006 (unusual clientside error)
	let errCode = 0;
	if(typeof evt!=="undefined" && evt!=null && evt!="undefined") {
		errCode = evt.code;
	}
	console.log("wsOnClose ID="+calleeID+" code="+errCode, evt);
	if(errCode!=1001) {
		if(!mediaConnect) {
			showStatus("Offline",-1);
		}
		wsOnClose2();
		if(tryingToOpenWebSocket) {
			// onclose occured while trying to establish a ws-connection (before this could be finished)
			console.log('wsOnClose failed to open');
		} else {
			// onclose occured while being ws-connected
			console.log('wsOnClose while connected');
		}

		if(goOnlineWanted && errCode==1006 && !tryingToOpenWebSocket) {
			// callee on chrome needs this for reconnect after wake-from-sleep
			// this is not a user-intended offline; we should be online
			let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
			console.log('wsOnClose reconnecting to signaling server in sec '+delay);
			showStatus("Reconnecting...",-1);

			// if conditions are right after delay secs this will call login()
			delayedWsAutoReconnect(delay);
		} else {
			console.log("wsOnClose not reconnecting "+goOnlineWanted+" "+errCode+" "+tryingToOpenWebSocket);
			offlineAction("wsOnClose");
		}
	}
}

function wsOnClose2() {
	// webcall server connection lost
	// called by wsOnClose() or from android service
	// do not disable goOnlineSwitch, do not clear connectToServerIsWanted
	console.log("wsOnClose2 "+calleeID);
	wsConn=null;
	buttonBlinking=false; // abort blinkButtonFunc()
	stopAllAudioEffects("wsOnClose");
	goOnlineSwitch.disabled = false;
}

function wsOnMessage(evt) {
	signalingCommand(evt.data,"wsOnMessage");
}

function wsOnMessage2(str, comment) {
	// Webcall service calls this to push msgs from WebCall server to signalingCommand()
	// either live msgs (onMessage()) or queued msgs (processWebRtcMessages())
	//console.log("wsOnMessage2( "+str+" comment="+comment);
	signalingCommand(str, comment);
}

function signalingCommand(message, comment) {
	gLog("signalingCommand "+message+" comment="+comment);
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}
	//gLog('signaling cmd '+cmd);
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
		} else {
			console.log('callerOfferUpd (in-call)');
		}

		callerDescription = JSON.parse(payload);
		console.log('callerOffer setRemoteDescription '+callerDescription);
		peerCon.setRemoteDescription(callerDescription).then(() => {
			gLog('callerOffer createAnswer');
			peerCon.createAnswer().then((desc) => {
				localDescription = desc;
				console.log('callerOffer in, calleeAnswer out');
				localDescription.sdp =
					maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
				localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
					'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
				peerCon.setLocalDescription(localDescription).then(() => {
					if(isDataChlOpen()) {
						console.log('calleeAnswer localDescription set -> signal via dataChl');
						dataChannel.send("cmd|calleeAnswer|"+JSON.stringify(localDescription));
					} else {
						console.log('calleeAnswer localDescription set -> signal via wsSend');
						wsSend("calleeAnswer|"+JSON.stringify(localDescription));
					}
				}, err => console.error(`# Failed to set local descr: ${err.toString()}`));
			}, err => {
				console.warn("# failed to createAnswer "+err.message)
				showStatus("Failed to create answer",8000);
			});
		}, err => {
			console.warn('callerOffer failed to set RemoteDescription',err.message,callerDescription)
			showStatus("Failed to set remoteDescription",8000);
		});

	} else if(cmd=="callerAnswer") {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log("# callerAnswer abort no peerCon");
			return;
		}
		callerDescription = JSON.parse(payload);

		gLog("callerAnswer setLocalDescription");
		peerCon.setLocalDescription(localDescription).then(() => {
			gLog('callerAnswer setRemoteDescription');
			peerCon.setRemoteDescription(callerDescription).then(() => {
				gLog('callerAnswer setRemoteDescription done');
			}, err => {
				console.warn(`callerAnswer Failed to set RemoteDescription`,err.message)
				showStatus("Cannot set remoteDescr "+err.message);
			});
		}, err => {
			console.warn("callerAnswer setLocalDescription fail",err.message)
			showStatus("Cannot set localDescr"+err.message);
		});

	} else if(cmd=="callerInfo") {
		//gLog('cmd callerInfo payload=(%s)',payload);
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
			gLog('cmd callerInfo ('+callerID+') ('+callerName+') ('+callerMsg+')');
			// callerID + callerName will be displayed via getStatsCandidateTypes()
		} else {
			gLog('cmd callerInfo payload=(%s)',payload);
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
		callerCandidate.usernameFragment = null;
		let addIceReloopCounter=0;
		var addIceCallerCandidate = function(callerCandidate) {
			if(!peerCon || peerCon.iceConnectionState=="closed") {
				console.log("# cmd callerCandidate abort no peerCon");
				stopAllAudioEffects();
				// TODO do we really need this?
				// TODO should the 2nd parm not depend on goOnlineSwitch.checked?
				endWebRtcSession(true,true,"callerCandidate no peercon / ice closed"); // -> peerConCloseFunc
				return;
			}
			if(!peerCon.remoteDescription) {
				addIceReloopCounter++;
				if(addIceReloopCounter<6) {
					console.warn("cmd callerCandidate !peerCon.remoteDescription "+addIceReloopCounter);
					setTimeout(addIceCallerCandidate,500,callerCandidate);
				} else {
					console.warn("abort cmd callerCandidate !peerCon.remoteDescription");
				}
				return;
			}
			let tok = callerCandidate.candidate.split(' ');
			if(tok.length<5) {
				console.warn("cmd callerCandidate format err",payload);
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
			gLog("peerCon.addIceCandidate accept address="+address+" "+callerCandidate.candidate);
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
				console.error("addIce callerCandidate",e.message,payload);
				showStatus("rtc error "+e.message);
			});
		}
		addIceCallerCandidate(callerCandidate);

	} else if(cmd=="cancel") {
		if(payload=="c") {
			// this is a remote cancel
			console.log('cmd cancel');
			stopAllAudioEffects("incoming cancel");
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
			//console.log('cmd cancel -> endWebRtcSession');
			// TODO should the 2nd parm not depend on goOnlineSwitch.checked?
			endWebRtcSession(false,true,"incoming cancel"); // -> peerConCloseFunc
		} else {
			stopAllAudioEffects("ignore cmd cancel");
			// TODO no endWebRtcSession ? android service will not know that ringing has ended
		}

	} else if(cmd=="clearcache") {
		clearcache();

	} else if(cmd=="status") {
		// this is currently used to make Android users aware of new releases and Websocket communication issues
		//gLog('status='+payload);
		if(typeof Android !== "undefined" && Android !== null) {
			if(payload!="") {
				setTimeout(function() {
					showStatus(payload,-1);
				},1000);
			}
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
		console.log('cmd missedCalls len='+payload.length);
		let oldMissedCallsSliceLen = 0;
		if(missedCallsSlice!=null) {
			oldMissedCallsSliceLen = missedCallsSlice.length;
		}
		missedCallsSlice = null;
		if(payload.length>0) {
			missedCallsSlice = JSON.parse(payload);
			console.log('cmd missedCallsSlice len='+missedCallsSlice.length);
			// beep when list changes
			if(missedCallsSlice!=null && missedCallsSlice.length != oldMissedCallsSliceLen) {
				let curSecs = (new Date()).getTime()
				let secsSinceLastdeleteMissedCallAction = curSecs - missedCallAffectingUserActionMs;
				console.log("cmd missedCallsSlice curSecs="+curSecs+" - "+missedCallAffectingUserActionMs+" = ms="+
					secsSinceLastdeleteMissedCallAction);
				if(secsSinceLastdeleteMissedCallAction <= 1500) {
					// a deleteMissedCallAction took place in the last 1500ms, skip beep
					console.log("skip beep due to recent deleteMissedCallAction "+secsSinceLastdeleteMissedCallAction);
				} else {
					console.log("beep, secsSinceLastdeleteMissedCallAction="+secsSinceLastdeleteMissedCallAction);
					soundBeep();
				}
			}
		}
		showMissedCalls();

	} else if(cmd=="ua") {
		otherUA = payload;
		gLog("otherUA",otherUA);

	} else if(cmd=="textmode") {
		textmode = payload;
		gLog("textmode",textmode);

		if(textmode=="true") {
			if(muteMicElement.checked==false) {
				muteMicElement.checked = true;
				// if we change the state of the muteMic checkbox here, we need to auto-change it back on hangup
				// only then do we ever auto-change the state of this checkbox
				muteMicModified = true;
			}
		}

	} else if(cmd=="rtcNegotiate") {
		// remote video track added by caller
		gLog("rtcNegotiate");
		if(isDataChlOpen()) {
			pickupAfterLocalStream = true;
			getStream(); // -> pickup2() -> "calleeDescriptionUpd"
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
			waitingCallersTitleElement.style,display = "none";
			waitingCallersElement.style,display = "none";
			waitingCallersElement.innerHTML = "";
			if(waitingCallersTitleElement) {
				waitingCallersTitleElement.style.display = "none";
			}
			return;
		}

		waitingCallersTitleElement.style,display = "block";
		waitingCallersElement.style,display = "block";
		gLog('showWaitingCallers fkt waitingCallerSlice.length',waitingCallerSlice.length);
		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let str = "<table style='width:100%; border-collapse:separate; border-spacing:6px 2px; line-height:1.5em;'>"
		for(let i=0; i<waitingCallerSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - waitingCallerSlice[i].CallTime;
			let waitingTimeString = ""+waitingSecs+" sec";
			if(waitingSecs>50) {
				waitingTimeString = ""+Math.floor((waitingSecs+10)/60)+" min"
			}
			let callerName = waitingCallerSlice[i].CallerName;
			let callerNameShow = callerName;
			//gLog('waitingCallerSlice[i].Msg',waitingCallerSlice[i].Msg);
			if(waitingCallerSlice[i].Msg!="") {
				callerNameShow =
					"<a onclick='showMsg(\""+waitingCallerSlice[i].Msg+"\");return false;'>"+callerName+"</a>";
			}
			str += "<td>" + callerNameShow + "</td><td>"+
			    waitingCallerSlice[i].CallerID + "</td>"+
				"<td style='text-align:right;'>since "+
				waitingTimeString + "</td><td>"+
				"<a onclick='pickupWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
				"accept</a></td></tr>";
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
	gLog('pickupWaitingCaller',addrPort);
	wsSend("pickupWaitingCaller|"+addrPort);
}

var showCallsWhileInAbsenceCallingItself = false;
function showMissedCalls() {
	let nextDrawDelay = 30000;
	let skipRender = false;

	if(wsConn==null) {
		// don't execute if client is disconnected
		if(!goOnlineWanted) {
			console.log('showMissedCalls abort !goOnlineWanted');
			return;
		}
		console.log('! showMissedCalls skip: wsConn==null');
		nextDrawDelay = 10000;
		skipRender = true;
	}
	if(missedCallsSlice==null || missedCallsSlice.length<=0) {
		console.log("! showMissedCalls skip: missedCallsSlice==null");
		missedCallsTitleElement.style.display = "none";
		missedCallsElement.style.display = "none";
		missedCallsElement.innerHTML = "";
		skipRender = true;
	}

	// if activity is paused, skip to setTimeout
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.isActivityInteractive !== "undefined" && Android.isActivityInteractive !== null) {
			if(Android.isActivityInteractive()) {
				//console.log("showMissedCalls activity is interactive");
			} else {
				skipRender = true;
				//console.log("! showMissedCalls skip: activity not interactive");
			}
		} else {
			//console.log("showMissedCalls activity isActivityInteractive unavailable");
		}
	}

	if(!skipRender) {
		//console.log("showMissedCalls len="+missedCallsSlice.length);
		// make remoteCallerIdMaxChar depend on window.innerWidth
		// for window.innerWidth = 360, remoteCallerIdMaxChar=21 is perfect
		let remoteCallerIdMaxChar = 13;
		if(window.innerWidth>360) {
			remoteCallerIdMaxChar += Math.floor((window.innerWidth-360)/22);
		}
		//console.log("window.innerWidth="+window.innerWidth+" remoteCallerIdMaxChar="+remoteCallerIdMaxChar);

		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/callee");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx) + "/user/";
		}
		let str = "<table style='width:100%; border-collapse:separate; line-height:1.4em; margin-left:-4px;'>"
		for(var i=0; i<missedCallsSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - missedCallsSlice[i].CallTime;

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

			let callerName = missedCallsSlice[i].CallerName;
			if(callerName=="null") {
				callerName="";
			}
			if(callerName=="") {
				if(callerID==calleeID) {
					callerName="self";
				} else {
					callerName="unknown";
				}
			}
			// TODO if callerName=="" || callerName=="unknown" -> check contacts?

			let callerNameMarkup = callerName;
			let callerMsg = missedCallsSlice[i].Msg;
			if(callerMsg!="") {
				//gLog('### callerMsg='+callerMsg+' '+waitingTimeString+' '+
				//	timeNowSecs+' '+missedCallsSlice[i].CallTime);
				callerNameMarkup = "<a onclick='showMsg(\""+callerMsg+"\");return false;'>"+callerName+"</a>";
				//console.log("callerNameMarkup("+callerNameMarkup+")");
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
				if(callerIdDisplay.length > remoteCallerIdMaxChar+2) {
					callerIdDisplay = callerIdDisplay.substring(0,remoteCallerIdMaxChar)+"..";
					//gLog("callerIdDisplay="+callerIdDisplay+" "+callerIdDisplay.length);
				}

				if(noLink) {
					callerLink = callerIdDisplay;
				} else {
					callerLink = "<a href='"+callerLink+"' onclick='openDialRemotex(\""+callerLink+"\",event)'>"+
								 callerIdDisplay+"</a>";
				}
			}

			str += "<td>" + callerNameMarkup + "</td>"+
				"<td>"+	callerLink + "</td>"+
				"<td align='right'>"+
				"<a onclick='deleteMissedCall(\""+
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
	missedCallAffectingUserActionMs = (new Date()).getTime();
	wsSend("deleteMissedCall|"+myCallerAddrPortPlusCallTime);
}

function wsSend(message) {
	if(typeof Android !== "undefined" && Android !== null) {
		if(wsConn==null) {
			// currently not connected to webcall server
			console.log('wsSend with wsConn==null -> connectSignaling');
			connectSignaling(message,"andr wsConn==null");
			// service -> connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null) -> wsSendMessage(message)
		} else {
			Android.wsSend(message);
		}
		return;
	}
	if(wsConn==null || wsConn.readyState!=1) {
		// currently not connected to webcall server
// TODO hier stimmt was nicht
		if(wsConn) {
			if(wsConn.readyState==0) {
				gLog('wsSend (state 0 = connecting) '+message);
				wsConn.close();
				wsConn=null;
//				offlineAction("wsSend readyState==0");		// TODO
			} else if(wsConn.readyState==2) {
				gLog('wsSend (state 2 = closing)');
				wsConn=null;
//				offlineAction("wsSend readyState==2");		// TODO
			} else if(wsConn.readyState==3) {
				gLog('wsSend (state 3 = closed)');
				wsConn=null;
//				offlineAction("wsSend readyState==3");		// TODO
			} else {
				gLog('wsSend ws state',wsConn.readyState);
			}
		}
		if(remainingTalkSecs>=0 || calleeID.startsWith("answie")) {
			gLog('wsSend connectSignaling',message);
			connectSignaling(message,"js wsSend not con");
		} else {
			if(!gentle) console.warn('wsSend no connectSignaling',
				message,calleeID,remainingServiceSecs,remainingTalkSecs);
			wsAutoReconnecting = false;
			offlineAction("wsSend no connectSignaling");
		}
	} else {
		wsConn.send(message);
	}
}

function pickup() {
	// user has picked up incoming call
	console.log('pickup -> open mic');
	answerButton.disabled = true;
	buttonBlinking = false;
	pickupAfterLocalStream = true;
	getStream(); // -> pickup2()
}

function pickup2() {
	// user has picked up incoming call and now we got the stream
	gLog('pickup2');
	stopAllAudioEffects("pickup2");

	if(!localStream) {
		console.warn('pickup2 no localStream');
		return;
	}

	if(typeof Android !== "undefined" && Android !== null) {
		Android.callPickedUp();
	}

	if(remoteStream) {
		gLog('pickup2 peerCon start remoteVideoFrame');
		remoteVideoFrame.srcObject = remoteStream;
		remoteVideoFrame.play().catch(function(error) {	});
	}

	// before we send "pickup|!" to caller allow some time for onnegotiation to take place
	setTimeout(function() {
		gLog('pickup2: after short delay send pickup to caller');
		wsSend("pickup|!"); // make caller unmute our mic on their side

		mediaConnect = true;
		onlineIndicator.src="red-gradient.svg";
		chatButton.style.display = "block";
		fileselectLabel.style.display = "block"

		// hide clear cookie (while peer connected) - will be re-enabled in endWebRtcSession(
		menuClearCookieElement.style.display = "none";

		// hide clear cache on android (while peer connected) - will be re-enabled in endWebRtcSession()
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
		if(localStream) {
			if(muteMicElement.checked==false) {
				muteMic(false); // don't mute
			} else {
				muteMic(true); // do mute
				// tmtmtm auto-open textchat (as if user clicks chatButton)
			}
		}

		mediaConnectStartDate = Date.now();
		if(typeof Android !== "undefined" && Android !== null) {
			Android.peerConnect();
		}

		if(!isDataChlOpen()) {
			gLog('do not enable fileselectLabel: !isDataChlOpen');
		} else if(!isP2pCon()) {
			gLog('do not enable fileselectLabel: !isP2pCon()');
		} else {
			gLog('enable fileselectLabel');
			fileselectLabel.style.display = "block";
		}

		setTimeout(function() {
			if(videoEnabled && !addLocalVideoEnabled) {
				gLog('full mediaConnect, blink vsendButton');
				vsendButton.classList.add('blink_me');
				setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
			}

			if(peerCon && mediaConnect) {
				// send "log|connected" to server
				peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,"Connected","e2ee"),
					err => console.log(err.message));

				chatButton.onclick = function() {
					if(textchatOKfromOtherSide) {
						console.log("chatButton.onclick -> enableDisableTextchat toggle");
						enableDisableTextchat(false);
					} else {
						//chatButton.style.display = "none";
						showStatus("Peer does not support textchat",2000);
					}
				}
				if(muteMicElement.checked) {
					// we auto-open the textbox bc the caller requested textmode
					console.log("muteMicElement.checked -> enableDisableTextchat open");
					enableDisableTextchat(true);
				}
			} else {
				console.warn("# either peerCon or mediaConnect not set");
			}
		},200);
	},400);
}

function hangup(mustDisconnect,dummy2,message) {
	console.log("hangup: "+message);
	// TODO: NOTE: not all message strings are suited for users
	showStatus(message,2000);
	// expected followup-message "ready to receive calls" from showOnlineReadyMsg()
	// showOnlineReadyMsg() is called in response to us calling sendInit() and the server responding with "sessionId|"
	// hangup() -> endWebRtcSession() -> prepareCallee() -> sendInit() ... server "sessionId|" -> showOnlineReadyMsg()

	msgboxdiv.style.display = "none";
	msgbox.value = "";
	textbox.style.display = "none";
	textbox.value = "";

	buttonBlinking = false;
	if(textmode!="") {
		textmode = "";
	}
	if(muteMicModified) {
		muteMicElement.checked = false;
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
		gLog("hangup short busy sound");
		busySignalSound.play().catch(error => {
			console.log('# busySignal play',error.message);
		});

		setTimeout(function() {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
			stopAllAudioEffects("hangup mediaConnect busy");
		},1000);
	}

	connectLocalVideo(true); // force disconnect
	let mustReconnectServer = goOnlineSwitch.checked;
	endWebRtcSession(mustDisconnect,mustReconnectServer,"hangup "+message);
	vsendButton.classList.remove('blink_me')
}

function goOnline(sendInitFlag,comment) {
// goOnline() is called when we go from offline to online (goOnlineSwitch or tile has been switched)
// -> set goOnlineWanted=true, update url-param auto=, call prepareCallee
	console.log('goOnline '+calleeID);

	goOnlineWanted = true;

	// we need to add to window.location: "?auto=1" if it does not yet exist
	let mySearch = window.location.search;
	if(mySearch.indexOf("auto=1")<0) {
		// add auto=1 to mySearch
		if(mySearch.indexOf("?")<0) {
			mySearch = mySearch + "?auto=1";
		} else {
			mySearch = mySearch + "&auto=1";
		}
		console.log('goOnline() set url location='+window.location.pathname + mySearch);
		history.replaceState("", document.title, window.location.pathname + mySearch);
	}

	prepareCallee(sendInitFlag,comment);
}

function prepareCallee(sendInitFlag,comment) {
	// called by goOnline()            when we activate goOnlineSwitch
	//           gotStream2()          on load with auto=
	//           endWebRtcSession()    after a call to get ready for the next one
	//           wakeGoOnline()        --currently not used--
	//           wakeGoOnlineNoInit()  when service has loaded the mainpage and is already connected
	// create a newPeerCon() -> new RTCPeerConnection() for the next incoming call
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	addedAudioTrack = null;
	addedVideoTrack = null;

	if(!ringtoneSound) {
		console.log('prepareCallee lazy load ringtoneSound');
		ringtoneSound = new Audio('1980-phone-ringing.mp3');
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
		busySignalSound = new Audio('busy-signal.mp3');
	}

	if(!notificationSound) {
		console.log('prepareCallee lazy load notificationSound');
		notificationSound = new Audio("notification.mp3");
	}

	// get ready to receive a peer connections
	newPeerCon();

	if(wsSecret=="") {
		// in androild mode, we want to do the same as tile does
		//   and this is to call: webCallServiceBinder.goOnline() to start the reconnector
		// this is what Android.jsGoOnline() allows us to do
		// TODO not sure what happens service needs to login and fails ???
		if(typeof Android !== "undefined" && Android !== null) {
			// note: Android.isConnected() returns: 0=offline, 1=reconnector busy, 2=connected (wsClient!=null)
			if(Android.isConnected()<=0) {
				// we are offline and not connecting
				if(typeof Android.jsGoOnline !== "undefined" && Android.jsGoOnline !== null) {
					console.log("prepareCallee not connected/connecting -> call Android.jsGoOnline()");
					Android.jsGoOnline();	// -> startReconnecter()
					return;
				}
				console.log("# prepareCallee Android.jsGoOnline() not supported");
			} else {
				console.log("prepareCallee isConnected()="+Android.isConnected()+" >0 (connected or connection)");
			}

			// if already connected do NOT show spinner (we are most likely called by wakeGoOnline())
		} else {
			gLog("prepareCallee spinner on");
			if(divspinnerframe) divspinnerframe.style.display = "block";
		}
	}

	if(wsConn==null /*|| wsConn.readyState!=1*/) {
		// this basically says: if prepareCallee() is called when we are NOT connected to the server,
		// try to login now using cookie or wsSecret (from login form)
		if(!mediaConnect) {
			showStatus("Connecting...",-1);  // unsinn!?
		}
		console.log("prepareCallee wsConn==null -> login()");
		login(false,"prepareCallee");
		return;
	}

	console.log('prepareCallee have wsConn');
	if(divspinnerframe) divspinnerframe.style.display = "none";

//	muteMicDiv.style.display = "block";		// TODO
	if(sendInitFlag) {
		gLog('prepareCallee have wsConn -> send init');
		sendInit("prepareCallee <- "+comment);
	}
	getSettings(); // display ID-links
}

function newPeerCon() {
	console.log("newPeerCon()");
	try {
		peerCon = new RTCPeerConnection(ICE_config);
		console.log("newPeerCon() new RTCPeerConnection ready");
	} catch(ex) {
		console.error("# newPeerCon() RTCPeerConnection "+ex.message);
		var statusMsg = "RTCPeerConnection "+ex.message;
		if(typeof Android !== "undefined" && Android !== null) {
			statusMsg += " <a href='https://timur.mobi/webcall/android/#webview'>More info</a>";
		}
		showStatus(statusMsg);
		if(divspinnerframe) divspinnerframe.style.display = "none";
		offlineAction("err on newPeerCon() "+ex.message);
		return;
	};

	peerCon.onicecandidate = e => onIceCandidate(e,"calleeCandidate");
	peerCon.onicecandidateerror = function(e) {
		// don't warn on 701 (chrome "701 STUN allocate request timed out")
		// 400 = bad request
		if(e.errorCode==701) {
			console.log("# peerCon onicecandidateerror " + e.errorCode+" "+e.errorText+" "+e.url,-1);
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
			hangup(true,true,"No peer connection");
			return;
		}
		if(peerCon.connectionState=="disconnected") {
			console.log("# peerCon disconnected "+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects();
			// TODO should the 2nd parm not depend on goOnlineSwitch.checked?
			endWebRtcSession(true,true,"disconnected by peer"); // -> peerConCloseFunc

		} else if(peerCon.connectionState=="failed") {
			// "failed" could be an early caller hangup
			// this may come with a red "WebRTC: ICE failed, see about:webrtc for more details"
			// in which case the callee webrtc stack seems to be hosed, until the callee is reloaded
			// or until offline/online
			console.log("# peerCon failed "+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects();
			// TODO should the 2nd parm not depend on goOnlineSwitch.checked?
			endWebRtcSession(true,true,"peer connection failed"); // -> peerConCloseFunc

			newPeerCon();
			if(wsConn==null) {
				console.log('peerCon failed and wsConn==null -> login()');
				login(false,"onconnectionstatechange="+peerCon.iceConnectionState);
			} else {
				// init already sent by endWebRtcSession() above
				//gLog('peerCon failed but have wsConn -> send init');
				//sendInit("after peerCon failed");
			}
		} else if(peerCon.connectionState=="connected") {
			peerConnected2();
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
}

/*
function peerConCreateOffer() {
	if(!peerCon) {
		console.log('# peerConCreateOffer deny: no peerCon');
		return;
	}

	console.log("peerConCreateOffer ------------------------");
	(async() => {
		localDescription = await peerCon.createOffer();
		localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
		localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
			'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
		peerCon.setLocalDescription(localDescription).then(() => {
			console.log('peerConCreateOffer localDescription nofw '+JSON.stringify(localDescription));
		}, err => console.error(`Failed to set local descr: ${err.toString()}`));

		console.log("peerConCreateOffer done");
	})();
}
*/

var startWaitConnect;
function peerConnected2() {
	// called when peerCon.connectionState=="connected"
	if(rtcConnect) {
		console.log("peerConnected2 already rtcConnect abort");
		return;
	}

	console.log("peerConnected2 rtcConnect");
	rtcConnectStartDate = Date.now();
	mediaConnectStartDate = 0;
	rtcConnect = true;
	wsSend("rtcConnect|")

	// scroll to top
	window.scrollTo({ top: 0, behavior: 'smooth' });

	chatButton.style.display = "none";
	fileselectLabel.style.display = "none"
	answerButtons.style.display = "grid";

	let skipRinging = false;
	if(typeof Android !== "undefined" && Android !== null) {
		skipRinging = Android.rtcConnect(); // may call pickup()
	}

	if(!skipRinging) {
		let doneRing = false;
		if(typeof Android !== "undefined" && Android !== null &&
		   typeof Android.ringStart !== "undefined" && Android.ringStart !== null) {
			// making sure the ringtone volume is the same in Android and JS
			console.log('peerConnected2 Android.ringStart()');
			doneRing = Android.ringStart();
		}

		if(!doneRing && ringtoneSound) {
			// browser must play ringtone
			console.log("peerConnected2 playRingtoneSound vol="+ringtoneSound.volume);
			allAudioEffectsStopped = false;
			var playRingtoneSound = function() {
				if(allAudioEffectsStopped) {
					if(!ringtoneSound.paused && ringtoneIsPlaying) {
						console.log('peerConnected2 playRingtoneSound paused');
						ringtoneSound.pause();
						ringtoneSound.currentTime = 0;
					} else {
						console.log("peerConnected2 playRingtoneSound not paused",
							ringtoneSound.paused, ringtoneIsPlaying);
					}
					return;
				}
				ringtoneSound.onended = playRingtoneSound;

				if(ringtoneSound.paused && !ringtoneIsPlaying) {
					gLog('peerConnected2 ringtone play...');
					ringtoneSound.play().catch(error => {
						console.warn("# peerConnected2 ringtone play error",error.message);
					});
				} else {
					console.warn("# peerConnected2 ringtone play NOT started",
						ringtoneSound.paused,ringtoneIsPlaying);
				}
			}
			playRingtoneSound();
		}

		// blinking answer button
		buttonBlinking = true;
		let buttonBgHighlighted = false;
		let blinkButtonFunc = function() {
			if(!buttonBgHighlighted) {
				// blink on
				//answerButton.style.background = "#b82a68";
				answerButton.style.background = "#b03";
				answerButton.style.border = "1.2px solid #b03";

				buttonBgHighlighted = true;
				setTimeout(blinkButtonFunc, 500);
			} else {
				// blink off
				//answerButton.style.background = "#04c";
				answerButton.style.background = "#0000"; // .mainbutton background-color
				answerButton.style.border = "1.2px solid #ccc";
				buttonBgHighlighted = false;
				if(!buttonBlinking || wsConn==null) {
					//gLog("peerConnected2 buttonBlinking stop");
					//answerButton.style.background = "#04c";
					return;
				}
				gLog("peerConnected2 buttonBlinking...",dataChannel);
				setTimeout(blinkButtonFunc, 500);
			}
		}
		blinkButtonFunc();
	}

	// peerConnected3() will wait for a DATACHANNEL before enabling answerButton
	startWaitConnect = Date.now();
	peerConnected3();
}

function peerConnected3() {
	let sinceStartWaitConnect = Date.now() - startWaitConnect;
	//console.log("peerConnected3..."+sinceStartWaitConnect);

	if(!peerCon || peerCon.iceConnectionState=="closed") {
		// caller early abort
		console.log('peerConnected3: caller early abort');
		// TODO showStatus()
		//hangup(true,true,"Caller early abort");
		stopAllAudioEffects();
		// TODO should the 2nd parm not depend on goOnlineSwitch.checked?
		endWebRtcSession(true,true,"caller early disconnect"); // -> peerConCloseFunc
		return;
	}

	if(dataChannel==null) {
		// before we can continue enabling answerButton, we need to wait for datachannel
		if(sinceStartWaitConnect < 1500) {
			console.log("peerConnected3: waiting for datachannel... "+sinceStartWaitConnect);
			setTimeout(function() {
				peerConnected3();
			},100);
			return;
		}

		// this should never happen
		console.log("peerConnected3: NO DATACHANNEL - ABORT RING");
		// TODO showStatus()
		stopAllAudioEffects();
		// TODO should the 2nd parm not depend on goOnlineSwitch.checked?
		endWebRtcSession(true,true,"caller early abort"); // -> peerConCloseFunc
		return;
	}

	// instead of listOfClientIps
	gLog('peerConnected3 accept incoming call?',listOfClientIps,dataChannel);
	peerCon.getStats(null)
	.then((results) => getStatsCandidateTypes(results,"Incoming", ""),
		err => console.log(err.message)); // -> wsSend("log|callee Incoming p2p/p2p")

	answerButton.disabled = false;
	// only show msgbox if not empty
	if(msgbox.value!="" && !calleeID.startsWith("answie")) {
		msgboxdiv.style.display = "block";
	}

	// TODO disable goOnlineSwitch while peerconnected ?
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
		setTimeout(pickupFunc,1000);
	}

	answerButton.onclick = function(ev) {
		ev.stopPropagation();
		console.log("peerConnected3 answer button");
		pickup();
	}
	rejectButton.onclick = function(ev) {
		ev.stopPropagation();
		console.log("peerConnected3 hangup button");
		if(mediaConnect) {
			hangup(true,true,"Hangup button ended call");
		} else {
			hangup(true,true,"Hangup button rejected call");
		}
		chatButton.style.display = "none";
		fileselectLabel.style.display = "none"
	}
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
	let msg = getStatsCandidateTypesEx(results,eventString1)
	console.log("getStats msg=("+msg+") callerName=("+callerName+") callerID=("+callerID+") callerMsg=("+callerMsg+")");
	wsSend("log|callee "+msg); // shows up in server log as: serveWss peer callee Incoming p2p/p2p

	if(textmode=="true") {
		msg = msg + " TextMode";
	}

	// we rather show callerID and/or callerName if they are avail, instead of listOfClientIps
	if(callerName!="" || callerID!="") {
		if(callerName=="" || callerName.toLowerCase()==callerID.toLowerCase()) {
			msg = callerID +" "+ msg;
		} else {
			msg = callerName +" "+ callerID +" "+ msg;
		}
	} else if(listOfClientIps!="") {
		msg += " "+listOfClientIps;
	}

	if(callerMsg!="") {
		msg += "<br>\""+callerMsg+"\""; // greeting msg
	}

	let showMsg = msg;
	if(eventString2!="") {
		showMsg += " "+eventString2;
	}
	if(otherUA!="") {
		showMsg += "<div style='font-size:0.8em;margin-top:8px;color:#aac;'>"+otherUA+"</div>";
	}

	showStatus(showMsg,-1);
}

function dataChannelOnmessage(event) {
	if(typeof event.data === "string") {
		//console.log("dataChannel.onmessage "+event.data);
		if(event.data) {
			if(event.data.startsWith("disconnect")) {
				console.log("dataChannel.onmessage '"+event.data+"'");
				if(dataChannel!=null) {
					dataChannel.close();
					dataChannel = null;
				}
				hangupWithBusySound(true,"disconnected by peer");
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
				signalingCommand(subCmd,"dataChl");
			} else if(event.data.startsWith("file|")) {
				var fileDescr = event.data.substring(5);

				if(fileDescr=="end-send") {
					gLog("file transmit aborted by sender");
					progressRcvElement.style.display = "none";
					if(fileReceivedSize < fileSize) {
						showStatus("File transmit aborted by sender");
					}
					fileReceivedSize = 0;
					fileReceiveBuffer = [];
					return;
				}
				if(fileDescr=="end-rcv") {
					gLog("file send aborted by receiver");
					showStatus("File send aborted by receiver");
					fileSendAbort = true;
					progressSendElement.style.display = "none";
					if(fileselectLabel && mediaConnect && isDataChlOpen() && isP2pCon()) {
						fileselectLabel.style.display = "block";
					}
					return;
				}

				showStatus("",-1);
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
				fileReceivedSize = 0;
				fileReceiveBuffer = [];
				fileReceiveStartDate = Date.now();
				fileReceiveSinceStartSecs=0;
			}
		}
	} else {
		if(fileReceiveAbort) {
			gLog("file receive abort");
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
			gLog("file receive complete");
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
	if(typeof comment!=="undefined") {
		gLog("stopAllAudioEffects ("+comment+")");
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

var goOnlinePending = false;
function endWebRtcSession(disconnectCaller,goOnlineAfter,comment) {
	console.log("endWebRtcSession discCaller="+disconnectCaller+
				" onlAfter="+goOnlineAfter+" switch="+goOnlineSwitch.checked+" ("+comment+")");
	pickupAfterLocalStream = false;
	if(remoteVideoFrame) {
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;
	}
	buttonBlinking = false;
	answerButtons.style.display = "none";
	goOnlineSwitch.disabled = false;

	if(!wsConn) {
		showStatus("Offline",-1);
	}

	msgboxdiv.style.display = "none";
	msgbox.value = "";
	textbox.style.display = "none";
	textbox.value = "";

	stopTimer();
	if(autoPlaybackAudioSource) {
		autoPlaybackAudioSource.disconnect();
		if(autoPlaybackAudioSourceStarted) {
			gLog("endWebRtcSession autoPlayback stop "+autoPlaybackFile);
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
					console.log('endWebRtcSession wsSend(cancel|disconnectByCallee)');
					wsSend("cancel|disconnectByCallee"); // very important (if caller is not ws-disconnected)
				}
			}
			if(dataChannel) {
				gLog('endWebRtcSession dataChannel.close');
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
		};

		if(rtcConnect && peerCon && peerCon.iceConnectionState!="closed") {
			gLog('endWebRtcSession getStatsPostCall');
			peerCon.getStats(null).then((results) => {
				getStatsPostCall(results);
				peerConCloseFunc();
			}, err => {
				console.log(err.message);
				peerConCloseFunc();
			});
		} else if(peerCon && peerCon.iceConnectionState!="closed") {
			peerConCloseFunc();
		}
	}

	if(localStream && !videoEnabled) {
		gLog('endWebRtcSession clear localStream');
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = false; // mute mic
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}

	if(typeof Android !== "undefined" && Android !== null) {
		// if a peerConnection existed, this will do: statusMessage("peer disconnect")
		// if no peerConnection existed, this will do: updateNotification(awaitingCalls) ('ready to receive calls')
		// TODO: unfortunately this will NOT display our comment string ('hangup disconnected by peer')
		Android.peerDisConnect();
	}

	rtcConnect = false;
	mediaConnect = false;
	onlineIndicator.src="";
	if(vsendButton) {
		vsendButton.style.display = "none";
	}
	missedCallAffectingUserActionMs = (new Date()).getTime();

	// show clearCookie on android (after peer disconnect)
	menuClearCookieElement.style.display = "block";

	// show clearCache on android (after peer disconnect)
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			if(Android.getVersionName()>="1.1.0") {
				menuClearCacheElement.style.display = "block";
			}
		}
	}

	console.log("endWebRtcSession wsConn="+(wsConn!=null));
	fileselectLabel.style.display = "none";
	progressSendElement.style.display = "none";
	progressRcvElement.style.display = "none";
	msgboxdiv.style.display = "none";
	msgbox.innerHTML = "";

	if(!goOnlineAfter) {
		offlineAction("endWebRtcSession no goOnlineAfter");
	} else if(goOnlinePending) {
		//offlineAction("endWebRtcSession goOnlinePending");
		console.log("endWebRtcSession goOnlinePending");
	} else {
		// bc we keep our wsConn alive, no new login is needed
		// (no new ws-hub will be created on the server side)
		// goOnlinePending flag prevents secondary calls to goOnline

		goOnlinePending = true;
		console.log("endWebRtcSession auto goOnline() delayed...");
		// TODO why exactly is this delay needed in goOnlineAfter?
		setTimeout(function() {
			console.log('endWebRtcSession auto goOnline()');
			goOnlinePending = false;
			//console.log("callee endWebRtcSession auto goOnline(): enable goonline");
			// get peerCon ready for the next incoming call
			// bc we are most likely still connected, goOnline() will just send "init"
			prepareCallee(true,"endWebRtcSession");
		},500);
	}
}

function goOffline(comment) {
	console.log("goOffline "+calleeID+" "+comment);
	wsAutoReconnecting = false;		// TODO what is this vs goOnlineWanted
	offlineAction("goOffline");

//	if(peerCon && peerCon.iceConnectionState!="closed") {
	if(mediaConnect) {
  		// do not overwrites caller-info in status area
		console.log("goOffline skip showStatus()");
	} else {
		showStatus("Offline");
	}

	if(comment=="user button" || comment=="service") {
		goOnlineWanted = false;
		// we need to remove from window.location: "?auto=1"
		let mySearch = window.location.search;
		if(mySearch.indexOf("auto=1")>=0) {
			// remove auto=1 from mySearch
			mySearch = mySearch.replace('auto=1','').trim();
		}
		console.log('goOffline()='+window.location.pathname + mySearch);
		// NOTE: doing replaceState() removes #, so we remeber it first
		let givenHash = location.hash;
		history.replaceState("", document.title, window.location.pathname + mySearch);
		location.hash = givenHash;
	}

	if(!mediaConnect) {
		ownlinkElement.innerHTML = "";
	}
	stopAllAudioEffects("goOffline");
	waitingCallerSlice = null;
//	muteMicDiv.style.display = "none";		// TODO ???

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

	if(wsConn) {
		// callee going offline
		if(typeof Android !== "undefined" && Android !== null) {
			console.log("goOffline wsClose");
			Android.wsClose(); // -> disconnectHost(true) -> statusMessage("Offline")
		} else {
			console.log("goOffline wsConn.close()");
			wsConn.close();
		}
		wsConn=null;
	} else {
		if(typeof Android !== "undefined" && Android !== null) {
			console.log("goOffline wsClose()");
			Android.wsClose();
		}
	}

	iconContactsElement.style.display = "none";

	if(divspinnerframe) divspinnerframe.style.display = "none";
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
	iframeWindowOpen(newsUrl,true,"max-width:800px;height:100%;",true);
}

var counter=0;
function openContacts() {
	let url = "/callee/contacts/?id="+calleeID+"&ds="+playDialSounds;
	gLog("openContacts "+url);
	iframeWindowOpen(url,false,"height:95vh;",true);
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
	iframeWindowOpen(url,false,"height:95%;max-height:600px;max-width:500px;",true);
}

function openDialRemote(url) {
	gLog('openDialUrl',url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false,"height:460px;max-width:480px;",true);
}
function openDialRemotex(url,evt) {
	gLog('openDialUrl',url);
	evt.preventDefault();
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false,"height:460px;max-width:480px;",true);
}

function openDialUrl(url) {
	gLog('openDialUrl',url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false);
}
function openDialUrlx(url,evt) {
	gLog('openDialUrl',url);
	evt.preventDefault();
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false);
}


function openIdMapping() {
	let url = "/callee/mapping/?id="+calleeID;
	console.log('openIdMapping',url);
	// id manager needs 500px height
	iframeWindowOpen(url,false,"height:460px;max-width:500px;",true);
}

function openSettings() {
	let url = "/callee/settings/?id="+calleeID+"&ver="+clientVersion;
	gLog('openSettings='+url);
	iframeWindowOpen(url,false,"max-width:460px;");
	// when iframe closes, client.js:iframeWindowClose() will call getSettings()
}

function clearcache() {
	if(typeof Android !== "undefined" && Android !== null) {
		if(Android.getVersionName()>="1.1.0") {
			let wasConnected = true; //wsConn!=null;
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
			// ask yes/no
			let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.6em; border-radius:3px; cursor:pointer; min-width:240px; top:40px; left:50%; transform:translate(-50%,0%);'><div style='font-weight:600;'>Exit?</div><br>"+
			"WebCall will shut down. You will need to restart the app to receive calls.<br><br>"+
			"<a onclick='Android.wsExit();history.back();'>Exit!</a> &nbsp; &nbsp; <a onclick='history.back();'>Cancel</a></div>";
			menuDialogOpen(dynDialog,0,yesNoInner);
		},300);
	} else {
		// this is not used: exit() is currently only available in Android mode
		history.back();
	}
}

function wakeGoOnline() {
	console.log("wakeGoOnline start");
	connectSignaling('','wakeGoOnline'); // only get wsConn from service (from Android.wsOpen())
	wsOnOpen(); // green led
	prepareCallee(true,"wakeGoOnline");   // newPeerCon() + wsSend("init|!")
	gLog("wakeGoOnline done");
}

function wakeGoOnlineNoInit() {
	// TODO do we need to call Android.calleeConnected() -> calleeIsConnected() ?
	console.log("wakeGoOnlineNoInit start");
	connectSignaling('','wakeGoOnlineNoInit'); // only get wsConn from service (from Android.wsOpen())
	wsOnOpen(); // green led
	prepareCallee(false,"wakeGoOnlineNoInit");  // newPeerCon() but do NOT wsSend("init|!")
	gLog("wakeGoOnlineNoInit done");
}

function clearcookie2() {
	console.log("clearcookie2 id=("+calleeID+")");
	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	goOffline();
	if(iframeWindowOpenFlag) {
		console.log("clearcookie2 history.back");
		history.back();
	}
	clearcookie();
}

