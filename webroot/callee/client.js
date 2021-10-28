// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';
const fileSelectElement = document.getElementById("fileselect");

if(fileSelectElement!=null) {
	fileSelectElement.addEventListener('change', (event) => {
		if(!gentle) console.log("fileSelect event");
		historyBack();
		const files = fileSelectElement.files;
		const file = files.item(0);
		if(file==null) {
			console.log("fileSelect file==nulll");
			return;
		}
		if(file.name=="") {
			console.log("fileSelect file.name is empty");
			return;
		}
		if(file.size<=0) {
			console.log("fileSelect file.size <= 0");
			return;
		}
		if(dataChannel==null || dataChannel.readyState!="open") {
			console.log("fileSelect no dataChannel");
			return;
		}
		console.log("fileSelect: "+file.name, file.size, file.type, file.lastModified);
		dataChannel.send("file|"+file.name+","+file.size+","+file.type+","+file.lastModified);
		fileselectLabel.style.display = "none";
		showStatus("",-1);

		const chunkSize = 16*1024;
		let fileReader = new FileReader();
		let offset = 0;
		let fileSendStartDate = Date.now();
		let fileSendLastSinceStartSecs = 0;
		fileSendAbort = false;
		progressSendBar.max = file.size;
		progressSendElement.style.display = "block";
		progressSendLabel.innerHTML = "Sending: "+file.name.substring(0,25);
		fileReader.addEventListener('error', error => console.error('Error reading file:', error));
		fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
		fileReader.addEventListener('load', e => {
			if(fileSendAbort) {
				console.log('file send user abort');
				fileReader.abort();
				return;
			}
			if(dataChannel==null || dataChannel.readyState!="open") {
				console.log('file send no dataChannel');
				fileReader.abort();
				return;
			}
			dataChannel.send(e.target.result);
			offset += e.target.result.byteLength;
			//if(!gentle) console.log('file send', offset, file.size, dataChannel.bufferedAmount);
			progressSendBar.value = offset;
			let sinceStartSecs = Math.floor((Date.now() - fileSendStartDate + 500)/1000);
			if(sinceStartSecs!=fileSendLastSinceStartSecs && sinceStartSecs!=0) {
				let kbytesPerSec = Math.floor(offset/1000/sinceStartSecs);
				progressSendLabel.innerHTML = "sending '"+file.name.substring(0,22)+"' "+kbytesPerSec+" KB/s";
				fileSendLastSinceStartSecs = sinceStartSecs;
			}
			if (offset < file.size) {
				readSlice(offset);
			} else {
				let sendComplete = function() {
					if(dataChannel!=null && dataChannel.bufferedAmount > 0) {
						console.log('file send flushing buffered...');
						setTimeout(sendComplete,200);
						return;
					}
					console.log('file send complete', file.size);
					offset = 0;
					progressSendElement.style.display = "none";
					showStatus("sent '"+file.name.substring(0,25)+"' "+Math.floor(file.size/1000)+" KB",-1);
					if(mediaConnect && dataChannel!=null && dataChannel.readyState=="open") {
						if(localCandidateType!="relay" && remoteCandidateType!="relay") {
							fileselectLabel.style.display = "inline-block";
						}
					}
				};
				sendComplete();
			}
		});
		const readSlice = o => {
			if(fileSendAbort) {
				console.log('file send user abort');
				fileReader.abort();
				return;
			}
			if(dataChannel==null || dataChannel.readyState!="open") {
				console.log('file send abort on dataChannel');
				return;
			}
			if(dataChannel.bufferedAmount > 10*chunkSize) {
				// file send delay
				setTimeout(function() {
					readSlice(o);
				},50);
				return;
			}
			const slice = file.slice(offset, o + chunkSize);
			fileReader.readAsArrayBuffer(slice);
		};
		readSlice(0);
	});
}

var xhrTimeout = 30000;
function ajaxFetch(xhr, type, api, processData, errorFkt, postData) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
	xhr.timeout = xhrTimeout;
	xhr.ontimeout = function () {
		errorFkt("timeout",0);
	}
	xhr.onerror= function(e) {
		errorFkt("fetching",xhr.status);
	};
	if(!gentle) console.log('xhr send',api);
	xhr.open(type, api, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	if(postData) {
		xhr.send(postData);
	} else {
		xhr.send();
	}
}

let timerStartDate=0;
let timerIntervalID=0;
function startTimer(startDuration) {
	if(!timerStartDate && startDuration>0) {
		if(!gentle) console.log('startTimer',startDuration);
		timerElement.style.opacity = "0.5";
		timerStartDate = Date.now();
		updateClock(startDuration);
		timerIntervalID = setInterval(updateClock, 999, startDuration);
	}
}
function stopTimer() {
	timerStartDate = null
	if(timerIntervalID && timerIntervalID>0) {
		if(!gentle) console.log('stopTimer');
		clearInterval(timerIntervalID);
		timerIntervalID=0;
		timerElement.style.opacity = "0";
		return;
	}
}

function updateClock(startDuration) {
	let sinceStartSecs = Math.floor((Date.now() - timerStartDate + 500)/1000);
	let countDownSecs = startDuration - sinceStartSecs;
	if(countDownSecs<=0) {
		countDownSecs=0;
	}
	if(countDownSecs==60 || countDownSecs==30 || countDownSecs==15) {
		notificationSound.play().catch(function(error) { });
	}
	if(timerElement!=null) {
		let timerMin = Math.floor(countDownSecs/60);
		let timerSec = countDownSecs - timerMin*60;
		let timerSecStr = ""+timerSec;
		if(timerSec<10) {
			timerSecStr = "0"+timerSecStr;
		}
		timerElement.innerHTML = ""+timerMin+":"+timerSecStr;
	}
	if(countDownSecs<=0) {
		if(!gentle) console.log('updateClock countDownSecs<=0 stopTimer',countDownSecs);
		stopTimer();
	}
}

var statsPostCallString = "";
var statsPostCallDurationMS = 0;
function getStatsPostCall(results) {
	if(!gentle) console.log('statsPostCall start');
	// RTCInboundRTPAudioStream "inbound-rtp" https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats
	// RTCOutboundRTPAudioStream "outbound-rtp" https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats
	// RTCAudioReceiverStats "receiver" 
	let timeNowMs = Date.now(),
		durationRtcMS = timeNowMs - rtcConnectStartDate,
		bytesReceived = 0,
		bytesSent = 0,
		packetsReceived = 0,
		packetsSent = 0,
		packetsLost = 0,
		jitter = 0,
		jitterBufferDelay = 0,
		retransmittedPacketsSent = 0,
		roundTripTime = 0;

	statsPostCallDurationMS = timeNowMs - mediaConnectStartDate;
	if(mediaConnectStartDate==0) {
		statsPostCallDurationMS = 0;
	}
	if(rtcConnectStartDate==0) {
		if(!gentle) console.log('statsPostCall rtcConnectStartDate==0');
		durationRtcMS = 0;
	}
		
	results.forEach(res => {
		if(res.type=="inbound-rtp") {
			bytesReceived = res.bytesReceived;
			packetsReceived = res.packetsReceived;
			packetsLost = res.packetsLost;
			jitter = res.jitter;
			jitterBufferDelay = res.jitterBufferDelay; // FF: undefined
		} else if(res.type=="outbound-rtp") {
			bytesSent = res.bytesSent;
			packetsSent = res.packetsSent;
			retransmittedPacketsSent = res.retransmittedPacketsSent; // FF: undefined
		} else if(res.type=="remote-inbound-rtp") {
			roundTripTime = res.roundTripTime; // FF: undefined
		} else if(res.type=="remote-outbound-rtp") {
			//console.log("statsPostCall remote-outbound-rtp",res);
		} else {
			//console.log("statsPostCall type",res.type);
		}
	});
	let durationSecs = Math.floor((statsPostCallDurationMS+500)/1000);
	if(isNaN(durationSecs)) { durationSecs = 0; }
	let durationRtcSecs = Math.floor((durationRtcMS+500)/1000);

	let bitsReceivedPerSec = 0;
	if(statsPostCallDurationMS>0) {
		bitsReceivedPerSec = Math.floor(bytesReceived*8000/statsPostCallDurationMS);
	}
	if(isNaN(bitsReceivedPerSec)) { bitsReceivedPerSec = 0; }

	let bitsSentPerSec = 0;
	if(durationRtcMS>0) {
		bitsSentPerSec = Math.floor(bytesSent*8000/durationRtcMS);
	}

	statsPostCallString =
		"call duration: "+durationSecs+"s\n"+
		"sent bytes: "+bytesSent+"\n"+
		"sent bitrate: "+bitsSentPerSec+" bps\n"+
		"sent packets: "+packetsSent+"\n"+
		"packetsLost: "+packetsLost+"\n"+
		"jitter: "+jitter+"\n"+
		"jitterBufferDelay: "+jitterBufferDelay+"\n"+
		"received bytes: "+bytesReceived+"\n"+
		"received bitrate: "+bitsReceivedPerSec+" bps\n"+
		"received packets: "+packetsReceived+"\n"+
		"retransmittedPacketsSent: "+retransmittedPacketsSent+"\n"+
		"roundTripTime: "+roundTripTime+"\n"+
		"connection: "+rtcLink+"\n";
	if(!gentle) console.log("statsPostCall",statsPostCallString);
}

function showStatsPostCall() {
	var myStatsPostCallString = statsPostCallString.replaceAll("\n","<br>");
	if(myStatsPostCallString=="") {
		myStatsPostCallString = "No call stats available";
	}
	return myStatsPostCallString;
}

function openPostCallStats() {
	let str = "string:<h2>Call Statistics</h2>"+showStatsPostCall();
	if(!gentle) console.log('openPostCallStats');
	iframeWindowOpen(str,"background:#33ad; color:#eee; padding:20px; max-width:400px; left:5.0%; top:3%; font-size:1.1em; line-height:1.4em;");
}

function stopProgressSend() {
	console.log("stopProgressSend");
	showStatus("file send aborted");
	fileSendAbort = true;
	progressSendElement.style.display = "none";
	if(dataChannel!=null && dataChannel.readyState=="open") {
		dataChannel.send("file|end-send");
		if(fileselectLabel!=null && mediaConnect) {
			if(localCandidateType!="relay" && remoteCandidateType!="relay") {
				fileselectLabel.style.display = "inline-block";
			}
		}
	}
}

function stopProgressRcv() {
	console.log("stopProgressRcv");
	showStatus("file receive aborted");
	fileReceiveAbort = true;
	progressRcvElement.style.display = "none";
	if(dataChannel!=null && dataChannel.readyState=="open") {
		dataChannel.send("file|end-rcv");
	}
}

var rtcLink = "";
var localCandidateType = "";
var remoteCandidateType = "";
function getStatsCandidateTypesEx(results,eventString1,eventString2) {
	if(!gentle) console.log('getStatsCandidateTypes start');
	rtcLink = "unknown";
	let localCandidateId = "";
	let remoteCandidateId = "";
	localCandidateType = "";
	remoteCandidateType = "";
	results.forEach(res => {
		if(res.type=="candidate-pair") {
			if(res.selected) {
				localCandidateId = res.localCandidateId;
				remoteCandidateId = res.remoteCandidateId;
				if(!gentle) console.log("getStatsCandidateTypes 1st", localCandidateId,remoteCandidateId);
			}
		}
	});
	if(!gentle) console.log("getStatsCandidateTypes candidateId's A", localCandidateId,remoteCandidateId);
	if(localCandidateId=="" || remoteCandidateId=="") {
		// for chrome
		results.forEach(res => {
			if(res.type=="transport" && res.selectedCandidatePairId!="") {
				let selectedCandidatePairId = res.selectedCandidatePairId;
				if(!gentle) console.log('getStatsCandidateTypes PairId',selectedCandidatePairId);
				results.forEach(res => {
					if(res.id==selectedCandidatePairId) {
						localCandidateId = res.localCandidateId;
						remoteCandidateId = res.remoteCandidateId
						if(!gentle) console.log("getStatsCandidateTypes 2nd",localCandidateId,remoteCandidateId);
					}
				});
			}
		});
	}

	if(!gentle) console.log("getStatsCandidateTypes candidateId's B",localCandidateId,remoteCandidateId);
	if(localCandidateId!="") {
		results.forEach(res => {
			if(res.id==localCandidateId) {
				Object.keys(res).forEach(k => {
					if(k=="candidateType") {
						localCandidateType = res[k];
					}
				});
			} else if(res.id==remoteCandidateId) {
				Object.keys(res).forEach(k => {
					if(k=="candidateType") {
						remoteCandidateType = res[k];
					}
				});
			}
		});
	}

	let localPeerConType = "";
	if(localCandidateType=="") {
		localPeerConType = "unknw";
	} else if(localCandidateType=="relay") {
		localPeerConType = "relay";
	} else {
		localPeerConType = "p2p";
	}
	let remotePeerConType = "";
	if(remoteCandidateType=="") {
		remotePeerConType = "unknw";
	} else if(remoteCandidateType=="relay") {
		remotePeerConType = "relay";
	} else {
		remotePeerConType = "p2p";
	}
	rtcLink = localPeerConType+"/"+remotePeerConType;

	if(!gentle) console.log('getStatsCandidateTypes',rtcLink,localCandidateType,remoteCandidateType);
	return eventString1+" "+rtcLink;
}

var menuDialogOpenFlag = false;
function menuDialogOpen() {
	if(menuDialogOpenFlag) {
		if(!gentle) console.log('menuDialogOpen menuDialogOpenFlag');
		return;
	}
	if(!gentle) console.log('menuDialogOpen');
	menuDialogOpenFlag = true;

	hashcounter++;
	location.hash = hashcounter;

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		if(!gentle) console.log('fullScreenOverlay click');
		historyBack();
	}
	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	if(calleeLevel>0 && navigator.cookieEnabled && getCookieSupport()!=null) {
		// cookies avail, "Settings" and "Exit" allowed
		if(!gentle) console.log('menuSettingsElement on (cookies enabled)');
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "block";
		}
		if(menuExit) {
			menuExit.style.display = "block";
		}
	} else {
		if(!gentle) console.log('menuSettingsElement off (cookies disabled)');
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "none";
		}
		if(menuExit) {
			menuExit.style.display = "none";
		}
	}
	menuDialogElement.style.display = "block";
}

function historyBack() {
	history.back(); // will call closeResults()
}

function menuDialogClose() {
	//if(!gentle) console.log('menuDialogClose');
	menuDialogElement.style.display = "none";
	containerElement.style.filter = "";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	menuDialogOpenFlag = false;
}

var iframeWindowOpenFlag = false;
function iframeWindowOpen(url,addStyleString) {
	if(iframeWindowOpenFlag) {
		console.log('iframeWindowOpen iframeWindowOpenFlag');
		return;
	}
	if(menuDialogOpenFlag) {
		menuDialogClose();
	} else {
		hashcounter++;
		location.hash = hashcounter;
	}

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		historyBack();
	}

	containerElement.style.filter = "blur(0.8px) brightness(60%)";

	if(!gentle) console.log('iframeWindowOpen', url);
	iframeWindowOpenFlag = true;
	let styleString = "width:90%; max-width:440px; height:94%; position:absolute; left:3.5%; top:1%; padding:10px; z-index:200; _overflow-y:scroll;";
	if(addStyleString) {
		styleString += addStyleString;
	}
	if(url.startsWith("string:")) {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = url.substring(7);
	} else {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = "<iframe src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone' onload='this.contentWindow.focus()'></iframe>";
	}
}

function iframeWindowClose() {
	if(!gentle) console.log('iframeWindowClose');
	containerElement.style.filter="";
	iframeWindowElement.innerHTML = "";
	iframeWindowElement.style.display = "none";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	iframeWindowOpenFlag = false;
}

function getStream() {
	if(neverAudio) {
		if(dialAfterLocalStream) {
			dialAfterLocalStream=false;
			console.warn("getStream neverAudio + dialAfter");
			gotStream(); // pretend
		}
		return
	}

//	let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
//	if(!gentle) console.log('getStream supportedConstraints',supportedConstraints);

	var constraints = {
		audio: {
//			deviceId: avSelect.value ? {exact: avSelect.value} : undefined,
			noiseSuppression: true,  // true by default
			echoCancellation: true,  // true by default
			autoGainControl: false,
		}
		,video: {
//			deviceId: avSelect.value ? {exact: avSelect.value} : undefined,
			width: {
			  min: 480,
			  ideal: 1280,
			  max: 1920		// 4096
			},
			height: {
			  min: 360,
			  ideal: 720,
			  max: 1080		// 2160
			},
		}
	};
	if(!gentle) console.log('getStream getUserMedia',videoEnabled);
	if(!videoEnabled) {
		constraints.video = false;
	}

	if(!gentle) console.log('getStream getUserMedia constraints',avSelect.value,constraints);
	if(!neverAudio) {
		return navigator.mediaDevices.getUserMedia(constraints)
			.then(gotStream)
			.catch(function(err) {
				if(!videoEnabled) {
					console.error('audio input error', err);
					showStatus("audio input error<br>"+err,-1);
				} else {
					console.error('audio/video input error', err);
					showStatus("audio/video input error<br>"+err,-1);
				}
			});
	}
}

function gotDevices(deviceInfos) {
	// fill avSelect with the available audio/video input devices (mics and cams)
	if(!gentle) console.log('gotDevices',deviceInfos);
	var i, L = avSelect.options.length - 1;
	for(i = L; i >= 0; i--) {
		avSelect.remove(i);
	}
	for(const deviceInfo of deviceInfos) {
		const option = document.createElement('option');
		option.value = deviceInfo.deviceId;
		if(deviceInfo.kind === 'audioinput') {
			let deviceInfoLabel = deviceInfo.label;
			//if(!gentle) console.log('gotDevices audioinput label',deviceInfoLabel);
			if(deviceInfoLabel=="Default") {
				deviceInfoLabel="Audio Input Default";
			} else if(deviceInfoLabel) {
				deviceInfoLabel = "Audio "+deviceInfoLabel
			}
			option.text = deviceInfoLabel || `Audio ${avSelect.length + 1}`;
			var exists=false
			var length = avSelect.options.length;
			for(var i = length-1; i >= 0; i--) {
				if(avSelect.options[i].text == option.text) {
					exists=true; // don't add again
					break;
				}
			}
			if(!exists) {
				avSelect.appendChild(option);
			}
			//console.log('audioinput',option);
		} else if (deviceInfo.kind === 'videoinput') {
			if(videoEnabled) {
				let deviceInfoLabel = deviceInfo.label;
				//if(!gentle) console.log('gotDevices videoinput label',deviceInfoLabel);
				if(deviceInfoLabel=="Default") {
					deviceInfoLabel="Video Input Default";
				} else if(deviceInfoLabel) {
					deviceInfoLabel = "Video "+deviceInfoLabel
				}
				var exists=false
				option.text = deviceInfoLabel || `Video ${avSelect.length + 1}`;
				var length = avSelect.options.length;
				for(var i = length-1; i >= 0; i--) {
					if(avSelect.options[i].text == option.text) {
						exists=true; // don't add again
						break;
					}
				}
				if(!exists) {
					avSelect.appendChild(option);
				}
			}
		} else if (deviceInfo.kind === "audioouput") {
			// ignore
		}
	}
}

var audioSendTrack = null; // TODO naming: better audioTrackWasAdded
var videoSendTrack = null; // TODO naming: better videoTrackWasAdded
function gotStream(stream) {
	// add localStream audioTrack and (possibly) localStream videoTrack to peerCon using peerCon.addTrack()
	// then activate localVideoFrame with localStream
    if(!gentle) console.log("gotStream set localStream");
	if(localStream) {
		// stop all tracks on previous localStream
		const allTracks = localStream.getTracks();
		if(!gentle) console.log("gotStream previous localStream len",allTracks.length);
		allTracks.forEach(track => {
			if(!gentle) console.log('gotStream previous localStream track.stop()',track);
			track.stop(); 
		});
		if(peerCon && audioSendTrack) {
			if(!gentle) console.log("gotStream previous localStream peerCon.removeTrack(audioSendTrack)");
			peerCon.removeTrack(audioSendTrack);
		}
		audioSendTrack = null;
		if(peerCon && videoSendTrack) {
			if(!gentle) console.log("gotStream previous localStream peerCon.removeTrack(videoSendTrack)");
			peerCon.removeTrack(videoSendTrack);
		}
		videoSendTrack = null;
	}

	localStream = stream;

	if(!peerCon) {
		if(!gentle) console.log('gotStream no peerCon: no peerCon.addTrack');
	} else if(audioSendTrack) {
		if(!gentle) console.log('gotStream audioSendTrack already set: no peerCon.addTrack');
	} else {
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = true;
		console.log('peerCon addTrack local audio input',audioTracks[0]);
		audioSendTrack = peerCon.addTrack(audioTracks[0],localStream);
	}

	// now let's look at all the reasons why we would NOT add the localStream.videoTrack to peerCon
	if(!videoEnabled) {
		// disable all video tracks (do not show the video locally)
		if(!gentle) console.log("gotStream !videoEnabled -> stop video tracks");
		stream.getVideoTracks().forEach(function(track) {
//			if(typeof track.getSettings().aspectRatio!=="undefined") {
				// this is a video track: stop it
				if(!gentle) console.log("gotStream !videoEnabled stop video track",track);
				track.stop();
//			}
		})
	} else if(!addLocalVideoEnabled) {
		// video streaming has not been activated yet
		if(!gentle) console.log('gotStream videoEnabled but !addLocalVideoEnabled: no addTrack vid');
	} else if(!peerCon) {
		if(!gentle) console.log('# gotStream videoEnabled but !peerCon: no addTrack vid');
	} else if(localCandidateType=="relay" || remoteCandidateType=="relay") {
		if(!gentle) console.log('gotStream videoEnabled but relayed con: no addTrack vid (%s)(%s)',localCandidateType,remoteCandidateType);
	} else if(localStream.getTracks().length<2) {
		if(!gentle) console.log('# gotStream videoEnabled but getTracks().length<2: no addTrack vid',localStream.getTracks().length);
	} else {
		console.log('peerCon addTrack local video input',localStream.getTracks()[1]);
		videoSendTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
	}

	if(!gentle) console.log("gotStream set localVideoFrame");
	localVideoFrame.srcObject = localStream;
	localVideoFrame.volume = 0;
//	localVideoFrame.load();
	var isPlaying = localVideoFrame.currentTime > 0 && !localVideoFrame.paused && !localVideoFrame.ended && localVideoFrame.readyState > localVideoFrame.HAVE_CURRENT_DATA;
	if(!isPlaying) {
		localVideoFrame.play().catch(function(error) {
			if(!gentle) console.log("# localVideoFrame error",error);
			// error "The play() request was interrupted by a new load request"
			// https://www.mumets.com/host-https-stackoverflow.com/questions/36803176/how-to-prevent-the-play-request-was-interrupted-by-a-call-to-pause-error
			if(!gentle) console.log("# localVideoFrame",localVideoFrame.currentTime,localVideoFrame.paused,localVideoFrame.ended,localVideoFrame.readyState,localVideoFrame.HAVE_CURRENT_DATA);
		});
	}
	gotStream2();
}

function videoSwitch() {
	if(videoEnabled) {
		videoOff();
	} else {
		videoOn();
	}
}

var addLocalVideoEnabled = false; // was sendLocalStream
function connectLocalVideo(forceOff) {
//	localVideoLabel.classList.remove('blink_me');
	if(!addLocalVideoEnabled && !forceOff) {
		// we want to send localVideo stream to other peer
		if(dataChannel && dataChannel.readyState=="open") {
			if(!gentle) console.log("connectLocalVideo set");
			localVideoLabel.classList.remove('blink_me');
			addLocalVideoEnabled = true; // will cause: peerCon.addTrack(video)
			pickupAfterLocalStream = true; // will cause: pickup2()
			getStream(); // -> gotStream() -> gotStream2() -> pickup2() -> "calleeDescriptionUpd"

			// TODO do this when local video is actually streaming
			localVideoLabel.innerHTML = "local cam streaming";
			localVideoLabel.style.color = "#ff0";
		} else {
			if(!gentle) console.log("# connectLocalVideo no dataChannel");
		}
	} else {
		// stop streaming localVideo to other peer
		addLocalVideoEnabled = false;
		if(!videoSendTrack) {
			if(!gentle) console.log("connectLocalVideo disconnect !videoSendTrack !removeTrack",localStream.getTracks().length);
		} else if(!peerCon) {
			if(!gentle) console.log("connectLocalVideo disconnect !peerCon -> !removeTrack");
		} else  {
			if(!gentle) console.log("connectLocalVideo disconnect peerCon.removeTrack(videoSendTrack)");
			peerCon.removeTrack(videoSendTrack);
			videoSendTrack = null;
		}

		if(dataChannel && dataChannel.readyState=="open") {
			// make caller switch to "remote cam not streaming"
			if(!gentle) console.log("connectLocalVideo disconnect dataChannel.send(rtcVideoOff)");
			dataChannel.send("cmd|rtcVideoOff");
		}
		localVideoLabel.innerHTML = "local cam not streaming";
		localVideoLabel.style.color = "#fff";

// TODO may need to reactivate audio streaming (only on caller?)
	}
}

function onIceCandidate(event,myCandidateName) {
	if(event.candidate==null) {
		// ICE gathering has finished
		if(!gentle) console.log('onIce end of candidates');
	} else if(event.candidate.address==null) {
		//console.warn('onIce skip event.candidate.address==null');
	} else if(dataChannel && dataChannel.readyState=="open") {
		if(!gentle) console.log("onIce "+myCandidateName+" via dataChannel", event.candidate.address);
		dataChannel.send("cmd|"+myCandidateName+"|"+JSON.stringify(event.candidate));
	} else if(wsConn==null) {
		if(!gentle) console.log("onIce "+myCandidateName+": wsConn==null", event.candidate.address);
	} else if(wsConn.readyState!=1) {
		if(!gentle) console.log("onIce "+myCandidateName+": readyState!=1",	event.candidate.address, wsConn.readyState);
	} else {
		if(!gentle) console.log("onIce "+myCandidateName+" via wsSend", event.candidate.address);
// TODO support dataChannel delivery?
		// 300ms delay to prevent "cmd "+myCandidateName+" no peerCon.remoteDescription" on other side
		setTimeout(function() {
			wsSend(myCandidateName+"|"+JSON.stringify(event.candidate));
		},300);
	}
}

function peerConOntrack(track, streams) {
//		if(!gentle) console.log('peerCon.ontrack',track, streams);
// TODO tmtmtm
//		track.onunmute = () => {
//			if(remoteVideoFrame!=null && remoteVideoFrame.srcObject == streams[0]) {
//				if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
//				return;
//			}
		if(!gentle) console.log('peerCon.ontrack onunmute set remoteVideoFrame.srcObject',streams[0]);
		if(remoteStream) {
			if(!gentle) console.log('peerCon.ontrack onunmute have prev remoteStream');
			// TODO treat like localStream in gotStream() ? apparently not needed
		}
		remoteStream = streams[0];
//		};

	if(!track.enabled) {
		if(!gentle) console.log('peerCon.ontrack onunmute !track.enabled: not set remoteVideoFrame');
	} else {
		if(!gentle) console.log('peerCon.ontrack onunmute track.enabled: set remoteVideoFrame',track.kind);
		if(remoteVideoFrame.srcObject == remoteStream) {
			if(!gentle) console.log('peerCon.ontrack onunmute track.enabled: same remoteStream again');
		} else {
			if(!gentle) console.log('peerCon.ontrack onunmute track.enabled: new remoteStream');
			remoteVideoFrame.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'
//				remoteVideoFrame.load();
			var isPlaying = remoteVideoFrame.currentTime > 0 && !remoteVideoFrame.paused && !remoteVideoFrame.ended && remoteVideoFrame.readyState > remoteVideoFrame.HAVE_CURRENT_DATA;
			if(!isPlaying) {
				remoteVideoFrame.play().catch(function(error) {
					if(!gentle) console.log("# remoteVideoFrame error",error);
					if(!gentle) console.log("# remoteVideoFrame",remoteVideoFrame.currentTime,remoteVideoFrame.paused,remoteVideoFrame.ended,remoteVideoFrame.readyState,remoteVideoFrame.HAVE_CURRENT_DATA);
				});
			}
		}
		setTimeout(function() {
			let videoTracks = remoteStream.getVideoTracks();
			if(!gentle) console.log('peerCon.ontrack onunmute track.enabled: delayed v-tracks',videoTracks.length);
			if(videoTracks.length>0) {
				remoteVideoDiv.style.visibility = "visible";
				remoteVideoDiv.style.height = "";
				remoteVideoDiv.style.display = "block";
				remoteVideoLabel.innerHTML = "remote cam streaming";
				remoteVideoLabel.style.color = "#ff0";
			} else {
				remoteVideoDiv.style.visibility = "hidden";
				remoteVideoDiv.style.height = "0px";
				remoteVideoDiv.style.display = "block";
				remoteVideoLabel.innerHTML = "remote cam not streaming";
				remoteVideoLabel.style.color = "#fff";
			}
		},500);
	}
};

