// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const databoxElement = document.getElementById('databox');
const calleeMode = false;

var calleeID = "";
var callerName = "";
var formForNameOpen = false; // label name
var formForCustomIDOpen = false;
var formElement = null;
var dataBoxContent="";

window.onload = function() {
	let urlId = "";
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		urlId = id;
		console.log('onload urlId='+urlId);
	}
	if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
		// cookie webcallid exists
		let cookieName = document.cookie.substring(10);
		let idxAmpasent = cookieName.indexOf("&");
		if(idxAmpasent>0) {
			cookieName = cookieName.substring(0,idxAmpasent);
		}
		console.log('onload cookieName='+cookieName);
		if(cookieName!="") {
			calleeID = cookieName
		}
	}
	if(calleeID=="") {
		console.log('onload no calleeID');
		abortOnError("Error: WebCall cookie missing");
		return;
	}
	if(urlId=="") {
		console.log('onload no urlId');
		abortOnError("Error: no ID");
		return;
	}
	if(calleeID!=urlId) {
		// urlId is our 'real' calleeID, but an external cookie change brought a new calleeID
		console.log('onload wrong cookie '+calleeID+' not '+urlId);
		abortOnError("Error: wrong cookie");
		return;
	}

	hashcounter = 1;
	window.onhashchange = hashchange;

	document.onkeydown = function(evt) {
		//console.log('mapping onload onkeydown event');
		evt = evt || window.event;
		var isEscape = false;
		if("key" in evt) {
			isEscape = (evt.key === "Escape" || evt.key === "Esc");
		} else {
			isEscape = (evt.keyCode === 27);
		}
		if(isEscape) {
			if(formForNameOpen) {
				if(!gentle) console.log('mapping.js esc key (formForNameOpen)');
				let parentElement = formElement.parentNode;
				parentElement.removeChild(formElement);
				formElement = null;
				formForNameOpen = false;
			} else if(formForCustomIDOpen) {
				if(!gentle) console.log('mapping.js esc key (formForCustomIDOpen)');
				displayMapping();
			} else {
				if(!gentle) console.log('mapping.js esc key -> exit');
				exitPage();
			}
		} else {
			//console.log('mapping.js no esc key');
		}
	};

	// XHR for current settings; server will use the cookie to authenticate us
	requestData();
}

function getUrlParams(param) {
	if(window.location.search!="") {
		// skip questionmark
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for (var i=0;i<parts.length;i++) {
			var seg = parts[i].split("=");
			if (seg[0] == param) {
				return seg[1];
			}
		}
	}
	return "";
}

var altIDs = "";
function requestData() {
	let api = apiPath+"/getmapping?id="+calleeID;
	if(!gentle) console.log('request getmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("# requestData error("+xhr.responseText+")");
			abortOnError("Error: "+xhr.responseText.substring(5));
			return;
		} else {
			altIDs = xhr.responseText;
			displayMapping();
		}
	}, function(errString,err) {
		console.log("# requestData xhr error "+errString+" "+err);
		abortOnError("Error xhr "+errString+" "+err);
	});
}

function displayMapping() {
	if(!gentle) console.log("displayMapping("+altIDs+")");
	formForCustomIDOpen = false;
	let mainLink = window.location.href;
	let idx = mainLink.indexOf("/callee/");
	if(idx>0) {
		mainLink = mainLink.substring(0,idx) + "/user/";
	}

	let count = 0;
	dataBoxContent="";

	if(altIDs!="") {
		dataBoxContent += "<table style='width:100%; border-collapse:separate; line-height:1.7em;'>"
		let idTitle = "ID (right-click to copy)";
		//if(typeof Android !== "undefined" && Android !== null) {
		if(navigator.userAgent.indexOf("Android")>=0 || navigator.userAgent.indexOf("Dalvik")>=0) {
			idTitle = "ID (long-tap share)";
		}
		dataBoxContent += "<tr style='color:#7c0;font-weight:600;font-size:0.9em;user-select:none;'><td>"+idTitle+"</td><td>Label</td></tr>";

		// main callee id
		dataBoxContent += "<tr><td><a href='/user/"+calleeID+"' onclick='clickID(\""+calleeID+"\");return false;'>"+calleeID+"</a></td>" + "<td>(Main-ID)</td></tr>";

		// parse altIDs, format: id,true,assign|id,true,assign|...
		let tok = altIDs.split("|");
		count = tok.length;
		for(var i=0; i<tok.length; i++) {
			//console.log("tok["+i+"]="+tok[i]);
			if(tok[i]!="") {
				let tok2 = tok[i].split(",");
				let id = tok2[0].trim();
				let active = tok2[1].trim();
				let assign = tok2[2].trim();
				if(assign=="") {
					assign = "none";
				}
				//console.log("assign=("+assign+")");

				// plausibility fixes
				// id and assign may not contain blanks
				// id and assign have a max length
				if(id.indexOf(" ")>=0) {
					id = id.replace(" ","");
				}
				if(id.length>16) {
					id = id.substring(0,16);
				}
				if(assign.indexOf(" ")>=0) {
					assign = assign.replace(" ","");
				}
				if(assign.length>10) {
					assign = assign.substring(0,10);
				}
				dataBoxContent += "<tr>"+
				    "<td><a href='" +mainLink +id + "' onclick='clickID(\""+id+"\");return false;'>"+id+"</a></td>"+
				    "<td><a onclick='edit(this,event,\""+id+"\",\""+assign+"\")'>"+ assign +"</a></td>"+
				    "<td align='right'><a onclick='remove("+i+",\""+id+"\")' style='font-weight:600;'>X</a></td></tr>";
			}
		}
		dataBoxContent += "</table>";
	}

	dataBoxContent += "<br>";
	dataBoxContent += "<div style='margin-top:18px; font-size:0.9em;'>";
	if(count<5) {
		dataBoxContent += "<span id='addbuttons'>";
		dataBoxContent += "<button onclick='add()'>+ Random</button> &nbsp;";
		dataBoxContent += "<button onclick='addCustom()'>+ Custom</button> &nbsp; ";
		dataBoxContent += "<button style='float:right;' onclick='exitPage()'>Close</button>";
		dataBoxContent += "</span>";
	}
	dataBoxContent += "</div>";

	databoxElement.innerHTML = dataBoxContent;
}

function clickID(id) {
	// prevent click-open id-link
	console.log('clickID='+id);
}

function add() {
	// fetch free new random id
	if(checkCookie()) return;

// TODO do not add more than max (5) entries
	let api = apiPath+"/fetchid?id="+calleeID;
	gLog('request fetchid api='+api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("# add error("+xhr.responseText+")");
			abortOnError("Error: "+xhr.responseText.substring(5));
		} else if(xhr.responseText=="") {
			console.log("# add empty response");
			abortOnError("Error: xhr empty response");
		} else {
			let newID = xhr.responseText;
			console.log("add new random ID="+newID);
			let oldAltIDs = altIDs;
			// ",true," = activated and without an assigned name
			if(altIDs=="") {
				altIDs = newID+",true,";
			} else {
				altIDs += "|"+newID+",true,";
			}
			storeData(function() {
				// success: re-render id-manager
				console.log("add storeData success");
				displayMapping();
			}, function(err) {
				// fail: stay in the form
				console.log("# add storeData fail "+err);
				altIDs = oldAltIDs;
				abortOnError("Error: "+err);
			});
		}
	}, errorAction); // will show an alert
}

let customID = "";
let customIdMsg = "3-16 lowercase letters + numbers";
function addCustom() {
	console.log("addCustom customID="+customID);
	if(checkCookie()) return;
	let addbuttonsElement = document.getElementById("addbuttons");
	addbuttonsElement.innerHTML = ""; // remove add-buttons
	let rect = addbuttonsElement.getBoundingClientRect();

	formElement = document.createElement("div");
	formElement.style = "position:absolute; left:"+rect.x+"px; top:"+(rect.y+window.scrollY)+"px; font-size:1.2em; z-index:100;";
	// pattern regex: \w matches any alphanumeric char from basic Latin alphabet, incl underscore; same as [A-Za-z0-9_]
	let formfield = "<table style='_width:100%; _border-collapse:separate;'>"+
		"<tr><td><form action='javascript:;' onsubmit='customSubmit(event)' id='customID'> <input type='text' id='formtext' class='formtext' pattern='\\w{3,16}' value='"+customID+"' size='16' maxlength='16' autofocus> <input type='submit' id='submit' value='Store'></form></td> <td align='right'><a onclick='displayMapping()' style='font-weight:600;margin-left:6px;'>X</a></td></tr>"+
		"<tr><td><label for='customID' id='customIdLabel' style='font-size:0.7em;'>"+customIdMsg+"</label></td></tr"+
		"></table>";
	formElement.innerHTML = formfield;
	addbuttonsElement.appendChild(formElement);
	formForCustomIDOpen = true;

	// set focus
	setTimeout(function() {
		//console.log("addCustom focus");
		let formtextElement = document.getElementById("formtext");
		if(formtextElement) {
			formtextElement.focus();
		}
	},300);
	return;
}

function customSubmit(e) {
	console.log("customSubmit");
	let formtextElement = document.getElementById("formtext");
	if(checkCookie()) return;
	customID = formtextElement.value;
	if(customID==null || customID=="") {
		console.log("customSubmit cancel: no customID");
		customID = "";
		// prevent "Form submission canceled because the form is not connected"
		e.preventDefault();
		displayMapping();
		return;
	}

	customID = customID.toLowerCase();
	console.log("customSubmit customID="+customID);

	let formLabelElement = document.getElementById("customIdLabel");

	// customID regex: must be lowercase, only containing a-z + 0-9 + _ (may never contain @ or apostrophe)
	// TODO what about these: - . [ ] ( )
	if(customID != customID.match(/([0-9a-z_])/g).join("")) {
		console.log("customSubmit fail format");
		customIdMsg = "Fail: format"
		e.preventDefault();
		addCustom();
		return;
	}

	// TODO? must start with alphanumeric char (really?) otherwise collision with randomIDs possible
	//       if customID.charAt(0) != a-z -> abort

	// at least 3 and no longer than 16 chars
	let len = customID.length;
	if(len<3 || len>16) {
		console.log("customSubmit fail len="+len);
		addCustom();
		return;
	}

	// TODO do not add more than max (5) entries

	// customID is valid and can be stored (",true," = activated and without an assigned name)
	let oldAltIDs = altIDs;
	if(altIDs=="") {
		altIDs = customID+",true,";
	} else {
		altIDs += "|"+customID+",true,";
	}
	storeData(function() {
		// success: re-render id-manager
		console.log("customSubmit storeData success");
		customID = "";
		displayMapping();
	}, function(err) {
		// fail:
		console.log("# customSubmit storeData fail "+err);
		customIdMsg = "Fail: "+err;
		altIDs=oldAltIDs;
		addCustom();
	});
}

var removeIdx = 0;
var removeId = 0;
function remove(idx,id) {
	console.log("remove "+idx+" "+id);
	removeIdx = idx;
	removeId = id;
	if(checkCookie()) return;

	let yesNoInner = "<div style='position:absolute; left:-999em; top:0px; width:160px; z-index:110; background:#45dd; color:#fff; padding:20px 30px; line-height:2.5em; border-radius:3px; cursor:pointer;'>Delete this ID ?<br>"+id+"<br><a onclick='removeDo();history.back();'>Delete!</a> &nbsp; <a onclick='history.back();'>Cancel</a></div>";
	menuDialogOpen(dynDialog,true,yesNoInner);
}

function removeDo() {
	let api = apiPath+"/deletemapping?id="+calleeID+"&delid="+removeId;
	if(!gentle) console.log('request api',api);
	if(checkCookie()) return;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("# /deletemapping err="+xhr.responseText);
			abortOnError("Error: "+xhr.responseText.substring(5));
		} else if(xhr.responseText!="ok") {
			console.log("/deletemapping response not 'ok' (%s)",xhr.responseText);
			abortOnError("Error: "+xhr.responseText);
		} else {
			// xhr.responseText == "ok"
			let oldAltIDs = altIDs;
			//console.log("remove old altIDs="+oldAltIDs);
			altIDs = "";
			let tok = oldAltIDs.split("|");
			let writeCount=0;
			for(var i=0; i<tok.length; i++) {
				if(i!=removeIdx) {
					//console.log("tok["+i+"]="+tok[i]);
					if(writeCount==0) {
						altIDs += tok[i];
					} else {
						altIDs += "|"+tok[i];
					}
					writeCount++;
				}
			}
			//console.log('remove new altIDs='+altIDs);
			storeData(function() {
				// success: re-render id-manager
				console.log("removeDo storeData success");
				displayMapping();
			}, function(err) {
				// fail:
				console.log("# removeDo storeData fail "+err);
				abortOnError("Error: "+err);
			});
		}
	}, errorAction);
}

function storeData(successFkt,failFkt) {
	// store string 'altIDs' into db
	let api = apiPath+"/setmapping?id="+calleeID;
	if(!gentle) console.log('/setmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log('# /setmapping err='+xhr.responseText);
			failFkt(xhr.responseText.substring(5));
		} else {
			successFkt();
		}
	}, function(errString,err) {
		console.log("# storeData xhr error "+errString+" "+err);
		failFkt(errString+" "+err);
	},altIDs);
}

function checkCookie() {
	// if in trouble: returns true
	if(document.cookie=="") {
		abortOnError("Error: WebCall cookie missing");
		return true;
	}
	if(!document.cookie.startsWith("webcallid=")) {
		abortOnError("Error: Wrong cookie");
		return true;
	}
	// cookie webcallid exists
	let cookieName = document.cookie.substring(10);
	let idxAmpasent = cookieName.indexOf("&");
	if(idxAmpasent>0) {
		cookieName = cookieName.substring(0,idxAmpasent);
	}
	if(cookieName!=calleeID) {
		abortOnError("Error: Wrong cookie");
		return true;
	}
	return false;
}

var myTableElement;
function edit(tableElement,ev,key,assign) {
	if(!gentle) console.log("edit key="+key+" assign="+assign);
	// edit assign string (see below on how)
	if(checkCookie()) return;
	let rect = tableElement.getBoundingClientRect();
	if(!gentle) console.log('edit',key,name,ev.pageX,ev.pageY);
	if(formForNameOpen) {
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
	}
	myTableElement = tableElement;
	// offer a form for the user to edit the name at pos rect.x / rect.y and rect.width
	formElement = document.createElement("div");
	formElement.style = "position:absolute; left:"+rect.x+"px; top:"+(rect.y+window.scrollY)+"px; z-index:100;";
	formElement.innerHTML = "<form action='javascript:;' onsubmit='editSubmit(this,\""+key+"\",\""+assign+"\")' id='user-comment'> <input type='text' id='formtext' value='"+assign+"' size='10' maxlength='10' autofocus> <input type='submit' id='submit' value='Store'> </form>";
	databoxElement.appendChild(formElement);
	formForNameOpen = true;
}

function editSubmit(formElement, id, assign) {
	if(!gentle) console.log("editSubmit id="+id+" assign="+assign);
	if(checkCookie()) return;

	let formtextElement = document.getElementById("formtext");
	let newAssign = formtextElement.value;
	if(!gentle) console.log('editSubmit value change',assign,newAssign);

	// remove formElement from DOM
	let parentElement = formElement.parentNode;
	parentElement.removeChild(formElement);
	formElement = null;
	formForNameOpen = false;

	if(newAssign=="") {
		//prevent nameless element by aborting edit form
		return;
	}

	if(newAssign!=assign) {
		// store assign string
		let api = apiPath+"/setassign?id="+calleeID+"&setid="+id+"&assign="+newAssign;
		if(!gentle) console.log('/setassign api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			if(xhr.responseText.startsWith("error")) {
				console.log('# /setassign err='+xhr.responseText);
				abortOnError("Error: "+xhr.responseText.substring(5));
			} else if(xhr.responseText!="ok") {
				console.log('# /setassign response not ok (%s)',xhr.responseText);
				abortOnError("Error: "+xhr.responseText);
			} else {
				// all is well
				//myTableElement.innerHTML = newAssign;

				// patch altIDs and call storeData() (will automatically call displayMapping())
				let newAltIDs = "";
				let tok = altIDs.split("|");
				for(var i=0; i<tok.length; i++) {
					if(!gentle) console.log("old tok["+i+"]="+tok[i]);
					if(tok[i]!="") {
						let tok2 = tok[i].split(",");
						let oldid = tok2[0].trim();
						let oldactive = tok2[1].trim();
						let oldassign = tok2[2].trim();
						if(oldid==id) {
							tok[i] = id+","+oldactive+","+newAssign;
						}
					}
					if(!gentle) console.log("new tok["+i+"]="+tok[i]);
					if(i==0) {
						newAltIDs += tok[i];
					} else {
						newAltIDs += "|"+tok[i];
					}
				}
				if(!gentle) console.log("newAltIDs="+newAltIDs);
				altIDs = newAltIDs;
				storeData(function() {
					// success: re-render id-manager
					console.log("editSubmit storeData success");
					displayMapping();
				}, function(err) {
					// fail:
					console.log("# editSubmit storeData fail "+err);
					abortOnError("Error: "+err);
				});
			}
		}, errorAction);
	}
}

var xhrTimeout = 8000;
function ajaxFetch(xhr, type, apiPath, processData, errorFkt, postData) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
	xhr.ontimeout = function () {
		errorFkt("timeout",0);
	}
	xhr.onerror= function(e) {
		errorFkt("fetching",xhr.status);
	};
	// cross-browser compatible approach to bypassing the cache
	if(apiPath.indexOf("?")>=0) {
		apiPath += "&_="+new Date().getTime();
	} else {
		apiPath += "?_="+new Date().getTime();
	}
	if(!gentle) console.log('xhr send',apiPath);
	xhr.open(type, apiPath, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	try {
		if(type=="POST" && postData) {
			if(!gentle) console.log('posting',postData);
			if(typeof Android !== "undefined" && Android !== null) {
				if(typeof Android.postRequestData !== "undefined" && Android.postRequestData !== null) {
					Android.postRequestData(postData);
				}
			}
			xhr.send(postData);
		} else {
			xhr.send();
		}
	} catch(ex) {
		console.log("# xhr send ex="+ex);
	}
}

function errorAction(errString,err) {
	console.log("# xhr error "+errString);
	abortOnError("xhr error "+errString+" "+err);
}

function abortOnError(errmsg) {
	dataBoxContent = errmsg+"<br>";
	dataBoxContent += "<button style='float:right;' onclick='exitPage()'>Close</button>";
	databoxElement.innerHTML = dataBoxContent;
}

function exitPage() {
	gLog('mapping exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		gLog('mapping parent.iframeWindowClose()');
		history.back();
	}
	gLog('mapping exitPage stop onkeydown handler');
}

