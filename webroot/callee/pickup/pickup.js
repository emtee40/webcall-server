// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const registerButton = document.querySelector('button#register');
const statusLine = document.getElementById('status');
const idLine = document.getElementById('id');
const form = document.querySelector('form#password');
var calleeLink = "";
var mid = "";
var cookieName = "";
var mastodonUserID = "";
var isValidCalleeID = false;
var isOnlineCalleeID = false;
var mappedCalleeID = "";
var wsCliMastodonID = "";
var callerID = "";
var cmappedCalleeID = "";
var isOnlineCmappedCalleeID = false;

window.onload = function() {
	cookieName = "";
	mastodonUserID = "";
	isValidCalleeID = false;
	isOnlineCalleeID = false;
	mappedCalleeID = "";
	wsCliMastodonID = "";
	callerID = "";
	cmappedCalleeID = "";
	isOnlineCmappedCalleeID = false;

	// get callee-id from cookie
	if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
		cookieName = document.cookie.substring(10);
		let idxAmpasent = cookieName.indexOf("&");
		if(idxAmpasent>0) {
			cookieName = cookieName.substring(0,idxAmpasent);
		}
		cookieName = cleanStringParameter(cookieName,true);
	}

	// mid maps to mastodon user-id's of the caller and callee
	// -> calleeIdOnMastodon = tmpkeyMastodonCalleeMap[mid]
	// -> callerIdOnMastodon = tmpkeyMastodonCallerReplyMap[mid]
	mid = getUrlParams("mid");
	if(typeof mid=="undefined") {
		mid = "";
	}
	if(mid=="") {
		// no mid -> no mastodonUserID
		showStatus("Outdated event<br><br><br>", -1);
		return;
	}

	// mid is given
	// try to get mastodonUserID of callee, valid/registered user, currently online user
	let api = apiPath+"/getmiduser?mid="+mid;
	if(cookieName!="") {
		api += "&cid="+cookieName;
	}
	console.log('onload ajax',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		console.log('xhr.responseText',xhr.responseText);
		if(xhr.responseText=="") {
			// no Mastodon user-id exists for this mid
		} else {
			// Mastodon user-id exists for this mid
			let tok = xhr.responseText.split("|");
			if(tok.length>=1) {
				mastodonUserID = tok[0]; // this is always a mastodon-user-id, never a calleeID
				if(tok.length>=2) {
					if(tok[1]=="true") {
						isValidCalleeID = true;
					}
					if(tok.length>=3) {
						if(tok[2]=="true") {
							isOnlineCalleeID = true;
						}
						if(tok.length>=4) {
							mappedCalleeID = tok[3]
							if(tok.length>=5) {
								wsCliMastodonID = tok[4]
								if(tok.length>=6) {
									callerID = tok[5]
									if(tok.length>=7) {
										cmappedCalleeID = tok[6]
										if(tok.length>=8) {
											if(tok[7]=="true") {
												isOnlineCmappedCalleeID = true;
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
		onload2();
	}, function(errString,err) {
		console.warn('# xhr error',errString,err);
		onload2();
	});
}

function onload2() {
	// cookieName                                  = now or previously logged-in calleeID, or ""
	// mappedCalleeID                              = mastodonUserID or 11-digit ID or ""
	// wsCliMastodonID (midEntry.mastodonIdCallee) = mastodonUserID or ""
	console.log('onload2 mid cookie', mid, cookieName);
	console.log('onload2 mastodonUserID', mastodonUserID);
	console.log('onload2 flags', isValidCalleeID, isOnlineCalleeID);
	console.log('onload2 mappedCalleeID', mappedCalleeID);
	console.log('onload2 wsCliMastodonID', wsCliMastodonID);
	console.log('onload2 callerID', callerID);

	if(mastodonUserID=="") {
		showStatus("Outdated event<br><br><br>", -1);
		return;
	}

	let dispMsg = "";

	if(callerID!="") {
		dispMsg += "Incoming call ☎️ from "+callerID+"<br>";
	}

//	dispMsg += "<br>"; // visual vertical gap

	// offer multiple choice
	let choices = 0;
	dispMsg += "To answer, select your WebCall identity:<br><br>";

	if(cookieName!="") {
		if(cookieName==mappedCalleeID) {
			// don't offer
		} else {
			let dispCname = cookieName;
			if(cmappedCalleeID!="") {
				dispCname += " ("+cmappedCalleeID+")";
			}
			dispMsg += "➡️ <a onclick='startCallee("+cookieName+","+isOnlineCmappedCalleeID+"); return false;'>"+dispCname+"</a> (cookie)<br><br>";
			choices++;
		}
	}

	if(isOnlineCalleeID) {
		if(mappedCalleeID!="") {
			dispMsg += "➡️ <a onclick='startCallee(\""+mappedCalleeID+"\",true); return false;'>"+mappedCalleeID+"</a><br><br>";

		} else if(mastodonUserID!="") {
			dispMsg += "➡️ <a onclick='startCallee(\""+mastodonUserID+"\",true); return false;'>"+mappedCalleeID+"</a><br><br>";
		} else {
// TODO
		}

	} else if(isValidCalleeID) {
		if(mastodonUserID==cmappedCalleeID) {
			// skip
		} else {
			// mid-callee is NOT online but IS a valid webcall account
			console.log("onload2 "+mastodonUserID+" is a valid WebCall ID");
			if(mastodonUserID!="") {
				// mastodonUserID is NOT currently online/logged-in - offer a link to start it
				// once login is complete, server will send caller-link to mastodon-caller, etc.
				let replaceURL = "/callee/"+mastodonUserID;
				if(mid!="") {
					// handing over mid will cause httpLogin() to call mastodonMgr.sendCallerLink()
					replaceURL += "?mid="+mid;
				}
				if(mappedCalleeID!="" && mappedCalleeID!=mastodonUserID) {
					dispMsg += "➡️ <a href='"+replaceURL+"'>"+mastodonUserID+"</a> ("+mappedCalleeID+")<br><br>";
				} else {
					dispMsg += "➡️ <a href='"+replaceURL+"'>"+mastodonUserID+"</a> (offline)<br><br>";
				}
				choices++;
			} else if(mappedCalleeID!="") {
				// mappedCalleeID is NOT currently online/logged-in - offer a link to start it
				// once login is complete, server will send caller-link to mastodon-caller, etc.
				let replaceURL = "/callee/"+mappedCalleeID;
				if(mid!="") {
					// handing over mid will cause httpLogin() to call mastodonMgr.sendCallerLink()
					replaceURL += "?mid="+mid;
				}
				dispMsg += "➡️ <a href='"+replaceURL+"'>"+mappedCalleeID+"</a> (mapped ID)<br><br>";
				choices++;
			}
		}
	} else {
		// NOT isValidCalleeID (and NOT online also)
		// offer user to register mastodonUserID as calleeID
		// register new account tmpkeyMastodonCalleeMap[mid] as calleeID
		// we ONLY hand over (mid) to server (similar to /register, see: httpRegister() in httpOnline.go)
		// server knows that tmpkeyMastodonCalleeMap[mid] is the desired mastodon user-id

		// we do NOT offer this register link, 
		// if dbUser.MastodonID of cookieName (cmappedCalleeID) == mastodonUserID
		if(cookieName=="" || cmappedCalleeID=="" || cmappedCalleeID != mastodonUserID) {
			dispMsg += "➡️ <a onclick='pwForm(\""+mastodonUserID+"\"); return false;'>New: "+mastodonUserID+"</a><br><br>";
		}
		choices++;
	}

	let replaceURL = "/callee/register?mid="+mid;
	dispMsg += "➡️ <a onclick='exelink(\""+replaceURL+"\"); return false;'>New: 11-digit WebCall-ID</a><br><br>";

	// offer user to enter (via keyboard) a possibly existing calleeID for login
	// on submit: forward to callee-app (password will be entered there), hand over mid
	// on login, the server will use mid to send a mastodon msg to the caller, telling the call-url
	dispMsg += "➡️ <a onclick='loginForm(); return false;'>Enter previously created WebCall-ID</a><br><br>";
	choices++;

	dispMsg += "<br>"; // visual vertical gap

	// TODO if(choices==1) -> autostart the one link

/*
	if(cookieName!="") {
		// cookieName found! it can be an 11-digit ID or a mastodonUserID
		dispMsg += "Found WebCall-ID in cookie: "+cookieName+"<br>";
	}

	// DO NOT SHOW WARNING if wsCliMastodonID!="" && wsCliMastodonID==mastodonUserID
	if(wsCliMastodonID!="" && wsCliMastodonID==mastodonUserID) {
		// do not show warning (cookieName is already prepared to answer mastodonUserID
	} else
	if(mappedCalleeID!="" && cookieName!=mappedCalleeID) {
		// warn user "you may run into a cookie issue" ?
		dispMsg += "Warning: User-ID and WebCall-ID differ<br>";
	}
*/
/*
	if(cookieName!="") {
		console.log('cookieName is set',cookieName,mappedCalleeID);
		if(mappedCalleeID!="" && cookieName!=mappedCalleeID) {
			dispMsg += "Note: WebCall-ID in cookie differs from Mastodon-ID<br>";
		}
	}
*/
	if(!isValidCalleeID) {
		// mastodonUserID from mid (the true mastodonUserID) is NOT a valid calleeID
	}

	showStatus(dispMsg + "<br><br><br>", -1);
}

function isAlreadyOnline(idStr) {
	// the callee referenced by mid is currently online
	showStatus( "WebCall client ("+idStr+") is online.<br>"+
				"Switch to it to received incoming WebCalls.<br>"+
				"This tab can now be closed.<br>", -1);

	// callee for mid is online -> no new server-login will take place; server will NOT send caller-link
	// so we send the caller-link to mastodon-caller (and trigger all other steps) right here
	let api = apiPath+"/sendCallerLink?id="+idStr;
	if(mid!="") {
		api += "&mid="+mid;
	}
	console.log('isAlreadyOnline ajax',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		console.log('xhr.responseText',xhr.responseText);
	}, function(errString,err) {
		console.warn('# xhr error',errString,err);
	});
	return;
}

function loginForm(msg) {
	// note: bc we replace the status-div with the input field, the back button may not work as expected
	if(typeof msg == "undefined") {
		msg = "";
	}
	// user is trying to log-in as callee with an entered calleeID (but no cookie, so not yet logged in?)
	showStatus("<form action='javascript:;' onsubmit='submitForm(this)' _style='max-width:450px;' id='usernamef'>"+
		"<label for='username' style='display:inline-block; padding-bottom:4px;'>ID:&nbsp;</label>"+
		"<input type='text' autocomplete='username' id='usernamei' name='username' value='' style='display:none;'>"+
		"<input name='username' id='username' type='text' class='formtext' autofocus required>"+
		"<span onclick='clearForm()' style='margin-left:5px; user-select:none;'>X</span>"+
		"<br>"+
		"<input type='submit' name='Submit' id='submit' value='OK' style='width:100px; margin-top:16px;'>"+
	"</form><br><br>"+msg,-1);
	// continues with: submitForm()
}

function submitForm(theForm) {
	// user has keyboard-entered a calleeID, now send user to /callee-app for login
	// we assume the callee has to login now, so the server should trigger all this once callee online
	var valueUsername = document.getElementById("username").value;
	console.log('submitForm valueUsername',valueUsername);

	// we need to know if valueUsername (for instance cookieName) is online/valid
	// why? bc opening this callee can cause "already logged in" if it is already logged in
	// we need to do an ajax to find out.
	// to prevent this api from being misused, a valid mid needs to be handed over
	// do ajax to find out if valueUsername is online
	// we attach a valid mid, so the server can verify we are a valid client
// TODO not sure we need to hand over mid here
	let api = apiPath+"/getonline?id="+valueUsername+"&mid="+mid;
	console.log('submitForm ajax',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		console.log('submitForm xhr.responseText',xhr.responseText);
		startCallee(valueUsername,xhr.responseText=="true");
	});
}

function startCallee(valueUsername,isOnline) {
	console.log('startCallee valueUsername/online',valueUsername,isOnline);
	if(isOnline) {
		isAlreadyOnline(valueUsername,mid)
		return;
	}

	// handing over mid will cause httpLogin() (on login success) to call mastodonMgr.sendCallerLink()
	// sendCallerLink() will send the caller-ling
	// if valueUsername = 11-digit, sendCallerLink() will also: set dbUser.MastodonID <- midEntry.MastodonIdCallee
	let replaceURL = "/callee/"+valueUsername + "?mid="+mid+"&auto=1";
	console.log('startCallee2 replaceURL',replaceURL);
	exelink(replaceURL);

// TODO  how does this work if the user is using the android app?
}

function clearForm() {
	let userNameElement = document.getElementById("username");
	if(userNameElement) {
		userNameElement.value = "";
		userNameElement.focus();
	}
}

function pwForm(mastodonUserID) {
	// let user register their mastodonUserID as calleeID
	// show the mastodonUserID and ask for a password to register it as a new calleeID (via submitPw())
	showStatus("Username: "+mastodonUserID+"<br>"+
		"<form action='javascript:;' onsubmit='submitPw(this,\""+mastodonUserID+"\")' id='pwf'>"+
		"<label for='username' style='display:inline-block; padding-bottom:4px;'>Password:&nbsp;</label>"+
		"<input type='text' autocomplete='password' id='pwi' name='pw' value='' style='display:none;'>"+
		"<input name='username' id='pw' type='password' autocomplete='current-password' class='formtext' autofocus required>"+
		"<span onclick='clearForm()' style='margin-left:5px; user-select:none;'>X</span>"+
		"<br>"+
		"<input type='submit' name='Submit' id='submit' value='OK' style='width:100px; margin-top:16px;'>"+
	"</form>",-1);
}

function submitPw(theForm,mastodonUserID) {
	// cont. letting user register their mastodonUserID as calleeID
	// use the entered password (and the mastodon user-id via mid) to register a new calleeID
	// for this we ajax(post) /registermid/(mid)
	// /registermid will do: calleeIdOnMastodon = tmpkeyMastodonCalleeMap[mid]
	// and it will register calleeIdOnMastodon with valuePw
	var valuePw = document.getElementById("pw").value;
	console.log('submitForm valuePw',valuePw);

	let api = apiPath+"/registermid/"+mid;
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			api = api + "?ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			api = api + "_" + Android.webviewVersion();
		}
	} else {
		//api = api + "&ver="+clientVersion;
	}
	if(!gentle) console.log('submitPw ajax',api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		// only if we get back "OK" do we continue with:
		if(xhr.responseText=="OK") {
			// register success; we now offer the callee-link to the user
			calleeLink = window.location.href;
			// calleeLink may have ?i=906735 attached: cut it off
			let idxArg = calleeLink.indexOf("?");
			if(idxArg>=0) calleeLink = calleeLink.substring(0,idxArg);
			//if(!gentle) console.log('calleeLink1='+calleeLink);
			calleeLink = calleeLink.replace("pickup/","");
			//if(!gentle) console.log('calleeLink2='+calleeLink+" mastodonUserID="+mastodonUserID);
			calleeLink += mastodonUserID;

			calleeLink += "?auto=1";
			if(mid!="") {
				// add mid (so that caller can be notified)
				calleeLink += "&mid="+mid;
			}
			console.log("calleeLink="+calleeLink+" mid="+mid);

			// exelink() will use calleeLink
			showStatus( "Please keep ID and password in a secure place. "+
			//"We can not send you this data."+
			"<br><br>Your WebCall callee link is shown below. "+
			"It lets you receive calls and should work in any web browser. "+
			"Click to start:<br><br>"+
			"<a onclick='exelink(\""+calleeLink+"\"); return false;' href='"+calleeLink+"'>"+calleeLink+"</a>",-1);
		} else {
			// register fail
			console.log('response:',xhr.responseText);
			showStatus("Sorry, it is not possible to register your ID right now. Please try again later.",-1);
		}
	}, function(errString,err) {
		console.warn('# xhr error',errString,err);
		showStatus("Error "+errString+". Registration not possible at this time. Please try again later. Thank you.<br><br>",-1);
	}, "pw="+valuePw);
}

function exelink(url) {
	// exelink(url) is used so we can do window.location or window.open(new-tab)
	console.log("exelink parent", window.location, window.parent.location);
	if(window.location !== window.parent.location) {
		// running inside an iframe -> open in a new tab
		//console.log("exelink open",calleeLink);
		window.open(url, '_blank');
	} else {
		// not running inside an iframe -> continue in the same tab
		//console.log("exelink replace",calleeLink);
//		window.location.replace(url); // does not allow back button (TODO which is better?)
		window.location.href = url;   // allows back button
	}
}


/*
		if(cookieName.match(/^[0-9]*$/) != null && cookieName.length==11) {
			// cookieName is 11-digit
			console.log('cookieName is 11-digit');
			if(mastodonUserID!="") {
				// the request comes from a valid mastodonUserID
				if(mastodonUserID==wsCliMastodonID) {
					console.log('mastodonUserID==wsCliMastodonID');
					// server maps cookieName (11-digit) to requesting mastodonUserID
				} else {
					// server does NOT map 11-digit cookieName to requesting mastodonUserID
					// it makes no sense to switch to callee
					console.log('# abort! mastodonUserID!=wsCliMastodonID');
// BUT THIS COULD BE THE 1ST TIME (in which case it would be wrong to clear the cookie?)
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
// generate user-facing message
					return;
				}
			}
		} else {
			// cookieName is NOT 11-digit
			console.log('cookieName is NOT 11-digit');
			// if mastodonUserID!="" and cookieName not= mastodonUserID: abort
			if(mastodonUserID=="") {
				console.log('mastodonUserID is empty');
			} else {
				console.log('mastodonUserID is NOT empty');
				if(cookieName!=mastodonUserID) {
					// it makes no sense to switch to callee
					console.log('# abort! cookieName!=mastodonUserID');
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
// generate user-facing message
					return;
				}
				console.log('cookieName==mastodonUserID');
			}
		}
*/

/*
	var register = getUrlParams("register");
	if(typeof register!="undefined" && register!="") {
		console.log('arg register is set',register);

		let api = apiPath+"/getmiduser?mid="+mid;
		console.log('pwForm api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr.responseText',xhr.responseText);
			if(xhr.responseText=="") {
				// no Mastodon user-id exists for this mid
				console.warn('# xhr response empty for api='+api);
// give client visual feedback
			} else {
				// Mastodon user-id exists for this mid
				let tok = xhr.responseText.split("|");
				let mastodonUserID = "";
				let isValidCalleeID = false;
				let isOnlineCalleeID = false;
				if(tok.length>=1) {
					mastodonUserID = tok[0]; // always a mastodon-user-id, never a calleeID
					if(tok.length>=2) {
						if(tok[1]=="true") {
							isValidCalleeID = true;
						}
						if(tok.length>=3) {
							if(tok[2]=="true") {
								isOnlineCalleeID = true;
							}
						}
					}
					// what if isOnlineCalleeID==true? in that case isValidCalleeID should also be true
					if(isValidCalleeID) {
						// switch to /callee/(id) now
						// yes, ANYBODY can resolve mid to mastodonUserID; but they still need to login
						// adv of using mid= is that we can delete the mapping after a succesful callee-login
						console.info('calleeID does already exist',mastodonUserID);
						let replaceURL = "/callee/"+mastodonUserID+"?mid="+mid+"&auto=1";
						window.location.replace(replaceURL);
						return;
					}

					// calleeID does not yet exist: offer register
					document.title = "WebCall Register";
					let titleElement = document.getElementById('title');
					if(titleElement) {
						titleElement.innerHTML = "WebCall Register";
					}
					pwForm(mastodonUserID);
				}
			}
		}, function(errString,err) {
			console.warn('# xhr error',errString,err);
		});
		return;
	}
	console.log('arg register not set');
*/

/*
function replaceCurrentUrl(mastodonUserID) {
	// user is trying to log-in as callee with an existing mastodonUserID (but no cookie, so not yet logged in?)
	// we assume the callee has to login now, so the server should trigger all this once callee online
	console.log('replaceCurrentUrl',mastodonUserID,mid);
	let replaceURL = "/callee/"+mastodonUserID;
	if(mid!="") {
		// forward mid to the callee client
		replaceURL += "?mid="+mid;
	}

//	window.location.replace(replaceURL);
	exelink(replaceURL);
}
*/

