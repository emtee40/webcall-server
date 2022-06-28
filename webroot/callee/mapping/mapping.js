// WebCall mapping client by timur.mobi
'use strict';
const databoxElement = document.getElementById('databox');

var callerID = "";
var callerName = "";
var dialsounds = "";
var formForNameOpen = false;
var formElement = null;

window.onload = function() {
	callerID = getUrlParams("callerId");
	console.log('mapping onload callerID='+callerID);

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
				console.log('mapping.js esc key (formForNameOpen)');
				let parentElement = formElement.parentNode;
				parentElement.removeChild(formElement);
				formElement = null;
				formForNameOpen = false;
			} else {
				console.log('mapping.js esc key -> exit');
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

function requestData() {
	let api = apiPath+"/getmapping?id="+callerID;
	if(!gentle) console.log('request getmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		processMapping(xhr.responseText);
	}, errorAction);
}

var altIDs = "";
var dataBoxContent="";
function processMapping(xhrresponse) {
	altIDs = xhrresponse;
	displayMapping();
}

function displayMapping() {
	if(!gentle) console.log("displayMapping("+altIDs+")");
	let mainLink = window.location.href;
	let idx = mainLink.indexOf("/callee/");
	if(idx>0) {
		mainLink = mainLink.substring(0,idx) + "/user/";
	}

	let count = 0;
	dataBoxContent="";
	if(altIDs!="") {
		dataBoxContent += "<table style='width:100%; border-collapse:separate; border-spacing:6px 2px; line-height:1.7em;'>"
		dataBoxContent += "<tr style='color:#7c0;font-weight:600;user-select:none;'><td>ID (copy)</td><td>assign (edit)</td></tr>";

		// parse altIDs, format: id,true,assign|id,true,assign|...
		let tok = altIDs.split("|");
		count = tok.length;
		for(var i=0; i<tok.length; i++) {
			console.log("tok["+i+"]="+tok[i]);
			if(tok[i]!="") {
				let tok2 = tok[i].split(",");
				let id = tok2[0].trim();
				let active = tok2[1].trim();
				let assign = tok2[2].trim();
				if(assign=="") {
					assign = "none";
				}
				console.log("assign=("+assign+")");

				dataBoxContent += "<tr><td><a href='" + mainLink + id + "' target='_blank'>"+id+"</a></td>"+
					"<td><a onclick='edit(this,event,\""+id+"\",\""+assign+"\")'>"+ assign +"</a></td>"+
					"<td><a onclick='remove("+i+","+id+")'>X</a></td></tr>";
			}
		}
		dataBoxContent += "</table>";

	}

	dataBoxContent += "<br>";
	if(count<10) {
		// no more than 10 tmpID's per callee
		dataBoxContent += "<a onclick='add()'>Add New-ID</a> &nbsp; ";
	}
	dataBoxContent += "<a onclick='exitPage()'>Close</a>";
	databoxElement.innerHTML = dataBoxContent;
}

function add() {
	// fetch and register a new/free id
	let api = apiPath+"/fetchid?id="+callerID;
	if(!gentle) console.log('request fetchid api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("# add error("+xhr.responseText+")");
		} else if(xhr.responseText=="") {
			console.log("# add empty response");
		} else {
			let newID = xhr.responseText;
			console.log("add newID="+newID);
			if(altIDs=="") {
				altIDs = newID+",true,";
			} else {
				altIDs += "|"+newID+",true,";
			}
			storeData();
		}
	}, errorAction);
}

function remove(idx,id) {
	console.log('remove',idx,id);
	let api = apiPath+"/deletemapping?id="+id;
	if(!gentle) console.log('request api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("/deletemapping err="+err);
		} else if(xhr.responseText!="ok") {
			console.log("/deletemapping response not 'ok' (%s)",xhr.responseText);
		} else {
			// xhr.responseText == "ok"
			let oldAltIDs = altIDs;
			console.log('remove old altIDs='+oldAltIDs);
			altIDs = "";
			let tok = oldAltIDs.split("|");
			let writeCount=0;
			for(var i=0; i<tok.length; i++) {
				if(i!=idx) {
					console.log("tok["+i+"]="+tok[i]);
					if(writeCount==0) {
						altIDs += tok[i];
					} else {
						altIDs += "|"+tok[i];
					}
					writeCount++;
				}
			}
			console.log('remove new altIDs='+altIDs);
			storeData();
		}
	}, errorAction);
}

function storeData() {
	let api = apiPath+"/setmapping?id="+callerID;
	if(!gentle) console.log('/setmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log('# /setmapping err='+xhr.responseText);
		} else {
			// all is well
			displayMapping();
		}
	}, errorAction, altIDs);
}

function edit(tableElement,ev,key,assign) {
	console.log("edit key="+key+" assign="+assign);
	// TODO edit assign string (see below on how)
// TODO need tmpID + assign
// TODO make sure assign string has a certain max len

/*
	// store assign string
	let api = apiPath+"/setassign?id="+tmpID+"&assign=";
	if(!gentle) console.log('request getmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log('# /setmapping err='+xhr.responseText);
		} else if(xhr.responseText=="") {
			console.log('# /setmapping empty response');
		} else {
			// all is well
			displayMapping();
		}
	}, errorAction, altIDs);
*/
}

/*
// edit is only needed to enter/modify usage string
var myTableElement;
function edit(tableElement,ev,key) {
	let name = obj[key];
	let rect = tableElement.getBoundingClientRect();
	console.log('edit',key,name,rect,ev.pageX,ev.pageY);
	if(formElement!=null) {
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
	}
	myTableElement = tableElement;
	// offer a form for the user to edit the name at pos rect.x / rect.y and rect.width
	formElement = document.createElement("div");
	formElement.style = "position:absolute; left:"+rect.x+"px; top:"+(rect.y+window.scrollY)+"px; z-index:100;";
	formElement.innerHTML = "<form action='javascript:;' onsubmit='editSubmit(this,\""+key+"\")' id='user-comment'> <input type='text' id='formtext' value='"+name+"' autofocus> <input type='submit' id='submit' value='Store'> </form>";
	databox.appendChild(formElement);
	formForNameOpen = true;
}

function editSubmit(formElement,id) {
	//console.log('editSubmit',id);
	let formtextElement = document.getElementById("formtext");
	let oldName = obj[id];
	let newName = formtextElement.value;
	console.log('editSubmit value',oldName,newName,id);

	if(newName=="") {
		//prevent nameless element by aborting edit form
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
		formForNameOpen = false;
		return;
	}

	if(newName.toLowerCase()=="delete" || newName=="...") {
		// special case
		let api = apiPath+"/deletecontact?id="+callerID+"&contactID="+id;
		if(!gentle) console.log('request api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr deletecontact OK',xhr.responseText);
			if(xhr.responseText=="ok") {
				// delete myTableElement <tr> 2nd parent of myTableElement
				let trElement = myTableElement.parentNode.parentNode;
				// remove trElement from DOM
				let parentElement = trElement.parentNode;
				parentElement.removeChild(trElement);
			}
		}, errorAction);

	} else if(newName!=oldName) {
		// name change
		// deliver newName change for id back to the server (/setcontact?id=callerID&contactID=id&name=newName)
		let api = apiPath+"/setcontact?id="+callerID+"&contactID="+id+"&name="+newName;
		if(!gentle) console.log('request api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr setcontact resp='+xhr.responseText);
			if(xhr.responseText=="") {
				obj[id] = newName;
				myTableElement.innerHTML = newName;
			}
		}, errorAction);
	}

	// remove formElement from DOM
	let parentElement = formElement.parentNode;
	parentElement.removeChild(formElement);
	formElement = null;
	formForNameOpen = false;
}
*/

//var xhrTimeout = 50000;
function ajaxFetch(xhr, type, apiPath, processData, errorFkt, postData) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
//	xhr.timeout = xhrTimeout;
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
	if(postData) {
		if(!gentle) console.log('xhr post='+postData);
		xhr.send(postData);
	} else {
		xhr.send();
	}
}

function errorAction(errString,err) {
	console.log('xhr error',errString);
	// let user know via alert
	alert("xhr error "+errString);
}

function exitPage() {
	if(!gentle) console.log('mapping exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		if(!gentle) console.log('mapping parent.iframeWindowClose()');
		history.back();
	}
	if(!gentle) console.log('mapping exitPage stop onkeydown handler');
}

