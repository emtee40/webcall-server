// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// WebCall server will send push notifications to callees
// if they have specified such channels and if they are not online 
// at the time of a call (or are hidden).
//
// httpCanbenotified() is called via XHR "/rtcsig/canbenotified".
// This method checks if the specified callee has at least one 
// push channel configured. If this is the case, an "OK" string 
// is returned to the requesting client.
//
// httpNotifyCallee() is called via XHR "/rtcsig/notifyCallee".
// This method is used if the specified callee can be notified, 
// if the caller wants a push notification to be sent and is willing 
// to wait for the callee to come online. 
// httpNotifyCallee() will send the actual push message and will keep 
// the caller online until the callee picks up the call, or until the 
// caller disconnects.

package main

import (
	"net/http"
	"time"
	"strings"
	"strconv"
	"fmt"
	"io"
	//"encoding/json"
	//webpush "github.com/SherClockHolmes/webpush-go"
)

func httpNotifyCallee(w http.ResponseWriter, r *http.Request, urlID string, dialID string,
		remoteAddr string, remoteAddrWithPort string) {
	// called by caller.js /notifyCallee (via httpServer.go) if caller requests callee notification 
	// caller wants to wait for callee (urlID) to come online to answer call
	if urlID == "" {
		fmt.Printf("# /notifyCallee failed no urlID\n")
		// JS will tell caller: could not reach urlID
		return
	}

	//fmt.Printf("/notifyCallee (%s) r.URL.Query()=(%v)\n", urlID, r.URL.Query())

	// get callerId + callerName from url-args
	callerId := ""
	url_arg_array, ok := r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerId = url_arg_array[0]
	}

	callerName := ""
	url_arg_array, ok = r.URL.Query()["callerName"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerName = url_arg_array[0]
	}
	if callerName=="" {
		url_arg_array, ok = r.URL.Query()["name"]
		if ok && len(url_arg_array[0]) >= 1 {
			callerName = url_arg_array[0]
		}
	}

	callerMsg := "" // msgbox
	url_arg_array, ok = r.URL.Query()["msg"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerMsg = url_arg_array[0]
	}
	callerHost := ""
	url_arg_array, ok = r.URL.Query()["callerHost"]
	if ok && len(url_arg_array[0]) > 0 {
		callerHost = strings.ToLower(url_arg_array[0])
	}
	// add callerHost to callerId
	callerIdLong := callerId
	if callerHost!="" && callerHost!=hostname {
		if strings.Index(callerIdLong,"@")>=0 {
			callerIdLong += "@"+callerHost
		} else {
			callerIdLong += "@@"+callerHost
		}
	}

	textmode := false
	url_arg_array, ok = r.URL.Query()["text"]
	if ok && url_arg_array[0]=="true" {
		textmode = true
	}

	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
	if err != nil {
		fmt.Printf("/notifyCallee (%s) failed on dbRegisteredIDs\n", urlID)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# /notifyCallee (%s) failed on dbUserBucket\n", urlID)
		return
	}

	// check if remoteAddrWithPort is already listed in waitingCallerSlice
	remoteAddrAlreadyWaitingUser := false
	waitingCallerDbLock.RLock()
	var waitingCallerSlice []CallerInfo
	kvCalls.Get(dbWaitingCaller,urlID,&waitingCallerSlice)
	//fmt.Printf(".../canbenotified (%s) waitingCallerSlice.len=%d\n",urlID,len(waitingCallerSlice))
	for idx := range waitingCallerSlice {
		//fmt.Printf(".../canbenotified (%s) remoteAddrWithPort=%s waitingCallerAddr=%s\n",
		//	urlID, remoteAddrWithPort, waitingCallerSlice[idx].AddrPort)
		if waitingCallerSlice[idx].AddrPort == remoteAddrWithPort {
			remoteAddrAlreadyWaitingUser = true
			break
		}
	}
	waitingCallerDbLock.RUnlock()
	if remoteAddrAlreadyWaitingUser {
		fmt.Printf("# /notifyCallee (%s) failed on same address\n", urlID)
		return
	}

	logDialID := ""
	if dialID!=urlID {
		logDialID = "/"+dialID
	}

	callerMainID := ""
	if callerId!="" && callerId==callerIdLong {
		mappingMutex.RLock()
		mappingData,ok := mapping[callerId]
		mappingMutex.RUnlock()
		if ok {
			callerMainID = mappingData.CalleeId
			if callerMainID==callerId {
				callerMainID = ""
			} else {
				callerMainID = callerMainID + "/"
			}
		}
	}

	logTxtMsg := callerMsg
	if logTxtMsg!="" {
		// do not log actual msg
		logTxtMsg = "hidden"
	}
	fmt.Printf("/notifyCallee (%s) from callerId=(%s) name=(%s) msg=(%s) %s\n",
		urlID, callerIdLong, callerName, logTxtMsg, remoteAddr)
	if dbUser.StoreContacts && callerId!="" && callerIdLong!="" && callerName!="" {
		//addContact(urlID, callerIdLong, callerName, "/notifyCallee")
		if !setContact(urlID, callerIdLong, callerName, false, remoteAddr, "/notifyCallee") {
			// the entry could not be stored or an error has occured
		}
	}

	// check if callee is hidden online
	calleeIsHiddenOnline := false
	ejectOn1stFound := true
	reportHiddenCallee := true
	reportBusyCallee := true
	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
		reportHiddenCallee, remoteAddr, "/notifyCallee")
	if err != nil {
		fmt.Printf("# /notifyCallee (%s) GetOnlineCallee() err=%v\n", urlID, err)
		return
	}
	if glUrlID != "" {
		// callee is online
		if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
			// callee is online but hidden
			fmt.Printf("/notifyCallee (%s) isHiddenOnline\n", glUrlID)
			calleeIsHiddenOnline = true
		}
	}

	notificationSent := 0
	if glUrlID == "" {
		// callee (urlID) is offline - send push notification(s)
		msg := "Unknown caller"
		if callerName!="" {
			if callerIdLong!="" {
				msg = callerName + " ("+callerIdLong+")"
			} else {
				msg = callerName
			}
		} else if callerIdLong!="" {
			msg = callerIdLong
		}

		// space as 1st char is required
		msg += " incoming."
		if textmode {
			msg += " TextMode."
		}

		if callerMsg!="" {
			msg += " '"+callerMsg+"'"
		}

		// adding /callee link
		hostUrl := "https://"+hostname
		if httpsPort>0 {
			hostUrl += ":"+strconv.FormatInt(int64(httpsPort),10)
		}
		msg += " Answer: "+hostUrl+"/callee/"

		/*
		if dbUser.Str2 != "" {
			// web push device 1 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str2, msg, urlID)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent |= 1
			} else if statusCode == 410 {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 delete subscr\n", urlID)
				dbUser.Str2 = ""
			} else {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 status=%d\n",	urlID, statusCode)
			}
		}

		if dbUser.Str3 != "" {
			// web push device 2 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str3, msg, urlID)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent |= 2
			} else if statusCode == 410 {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 delete subscr\n", urlID)
				dbUser.Str3 = ""
			} else {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 status=%d\n",
					urlID, statusCode)
			}
		}
		*/

		if dbUser.MastodonID != "" {
			// if mastodon handle exists and MastodonSendTootOnCall==true:
			// notify dbUser.MastodonID via mastodon direct message

			if mastodonMgr == nil {
				// TODO log no mgr
			} else if dbUser.MastodonSendTootOnCall==false {
				// TODO log toot-calls not wanted
			} else {
				// send a msg to dbUser.MastodonID:
				sendmsg :=	"@"+dbUser.MastodonID+" "+msg
				// NOTE PostStatus() stalls until msg is sent (or not)
				// TODO do we always have enough threads?
				err := mastodonMgr.postMsgEx(sendmsg, dbUser.MastodonID, 0, func(err error) {
					if err!=nil {
						fmt.Printf("# /notifyCallee PostStatus (%s) err=%v\n",sendmsg,err)
						notificationSent &= ^4
					}
				})
				if err!=nil {
					// likely quota error
					fmt.Printf("# /notifyCallee PostStatus (%s) err=%v\n",sendmsg,err)
				} else {
					// we know now that there was no quota problem
					// we do not yet know if mastodon has accepted the msg
					notificationSent |= 4
					// if an async err occurs within 2s, the notificationSent bit will be cleared (above)
					// otherwise we act as if the msg was posted
					time.Sleep(2 * time.Second)
				}
			}
		}

		if notificationSent==0 {
			// we could not send any notifications (could be hidden online callee has just gone offline)
			// store call as missed call
			if(dbUser.StoreMissedCalls) {
				fmt.Printf("# /notifyCallee (%s%s) could not send notification: store as missed call\n", urlID, logDialID)
				addMissedCall(urlID,
					CallerInfo{remoteAddr, callerName, time.Now().Unix(), callerIdLong, dialID, callerMsg},
						"/notify-notavail")
			} else {
				fmt.Printf("# /notifyCallee (%s%s) could not send notification (no store notif)\n", urlID, logDialID)
			}
			return
		}
	}

	callerGaveUp := true
	// remoteAddr or remoteAddrWithPort for waitingCaller? waitingCaller needs the port for funtionality

	waitingCaller := CallerInfo{remoteAddrWithPort, callerName, time.Now().Unix(), callerIdLong, dialID, callerMsg}

	var calleeWsClient *WsClient = nil
	hubMapMutex.RLock()
	myhub := hubMap[urlID]
	if myhub!=nil {
		calleeWsClient = myhub.CalleeClient
	}
	hubMapMutex.RUnlock()

	callerGotConnected := false
	waitingCallerDbLock.Lock()
	//var waitingCallerSlice []CallerInfo
	err = kvCalls.Get(dbWaitingCaller, urlID, &waitingCallerSlice)

	// locHub.ConnectedCallerIp != "" means callee is in a call
	if notificationSent>0 || calleeIsHiddenOnline || (locHub!=nil && locHub.ConnectedCallerIp != "") {
		// we now "freeze" the caller's xhr until callee goes online and sends a value to the caller's chan
		// waitingCallerChanMap[urlID] <- 1 to signal it is picking up the call
		//fmt.Printf("/notifyCallee (%s) notification sent; freeze caller\n", urlID)
		chn := make(chan int)
		waitingCallerChanLock.Lock()
		waitingCallerChanMap[remoteAddrWithPort] = chn
		waitingCallerChanLock.Unlock()

		// send a waitingCaller json-update (containing remoteAddrWithPort + callerName) to hidden callee
		waitingCallerSlice = append(waitingCallerSlice, waitingCaller)
		err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
		if err != nil {
			fmt.Printf("# /notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
		}
		waitingCallerDbLock.Unlock()

		if calleeIsHiddenOnline || (locHub!=nil && locHub.ConnectedCallerIp != "") {
			if calleeWsClient != nil {
				calleeWsClient.hub.IsUnHiddenForCallerAddr = ""
				waitingCallerToCallee(urlID, waitingCallerSlice, nil, calleeWsClient)
			}
		}

		// let caller wait (let it's xhr stand) until callee picks up the call
		fmt.Printf("/notifyCallee (%s) waiting for callee to come online (%d) %s\n",
			urlID, notificationSent, remoteAddr)
		callerGaveUp = false
		callerGotConnected = false
		select {
		case chnVal,ok := <-chn:
			// chnVal==1 accept/connect
			// chnVal==2 reject/disconnect
			fmt.Printf("/notifyCallee (%s) chnVal=%v ok=%v\n", urlID, chnVal, ok)
			if chnVal==1 {
				// callee is accepting this caller to call
				// coming from callee.js: function pickupWaitingCaller(callerID)
				//             client.go: if cmd=="pickupWaitingCaller"

				// in the mean time callee may have gone offline (and is now back online)
				// so we assume calleeWsClient may be invalid and obtain it again
				calleeWsClient = nil
				glUrlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
					reportHiddenCallee, remoteAddr, "/notifyCallee")
				if err != nil {
					fmt.Printf("# /notifyCallee (%s) GetOnlineCallee() err=%v\n", urlID, err)
					// tell caller to not wait any longer
					fmt.Fprintf(w, "error")
				} else if glUrlID == "" {
					fmt.Printf("# /notifyCallee (%s/%s) callee wants caller (%s) to connect - but is not online\n",
						urlID, glUrlID, remoteAddr)
					// tell caller to not wait any longer
					fmt.Fprintf(w, "error")
				} else {
					// make the hidden callee "visible" for this particular caller
					fmt.Printf("/notifyCallee (%s/%s) callee wants caller (%s) to connect\n",
						urlID, glUrlID, remoteAddr)
					if err := SetUnHiddenForCaller(glUrlID, remoteAddr); err != nil {
						fmt.Printf("# /notifyCallee (%s) SetUnHiddenForCaller ip=%s err=%v\n",
							glUrlID, remoteAddr, err)
					} else {
						hubMapMutex.RLock()
						calleeWsClient = hubMap[glUrlID].CalleeClient
						hubMapMutex.RUnlock()

						// clear unHiddenForCaller after a while...
						go func() {
							time.Sleep(60 * time.Second)
							// in the mean time callee may have gone offline (and is now back online)
							// this is why we check if callee is online now
							glUrlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
								reportHiddenCallee, remoteAddr, "/notifyCallee")
							if err != nil {
								return
							}
							if glUrlID == "" {
								return
							}
							hubMapMutex.RLock()
							myhub := hubMap[glUrlID]
							hubMapMutex.RUnlock()
							if myhub!=nil {
								if myhub.IsUnHiddenForCallerAddr == remoteAddr {
									myhub.IsUnHiddenForCallerAddr = ""
									fmt.Printf("/notifyCallee (%s) clear HiddenForCallerAddr=%s\n",
										glUrlID, remoteAddr)
								}
							}
						}()
					}
					// caller receiving this "ok" will automatically attempt to make a call now
					fmt.Fprintf(w, "ok")
					callerGotConnected = true
				}
			} else {
				fmt.Printf("/notifyCallee (%s) waitingCaller canceled by callee\n", urlID)
				// tell caller to not wait any longer
				fmt.Fprintf(w, "error")
			}
			// fall through to remove waitingCaller
		case <-r.Context().Done():
			// caller has disconnected (before callee could wake this channel to answer the call)
			callerGaveUp = true
			// in the mean time callee may have gone offline (and is now back online)
			// so we consider calleeWsClient to be invalid and re-obtain it
			calleeWsClient = nil
			fmt.Printf("/notifyCallee (%s%s) <- caller disconnected callerId=(%s%s) %s\n",
				urlID, logDialID, callerMainID, callerIdLong, remoteAddr)
			glUrlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
				reportHiddenCallee, remoteAddr, "/notifyCallee")
			if err != nil {
				fmt.Printf("# /notifyCallee (%s/%s) GetOnlineCallee() err=%v\n", urlID, glUrlID, err)
			} else if glUrlID == "" {
				// urlID is not online
				fmt.Printf("/notifyCallee (%s/%s) GetOnlineCallee() is empty\n", urlID, glUrlID)
			} else {
				hubMapMutex.RLock()
				calleeWsClient = hubMap[glUrlID].CalleeClient
				hubMapMutex.RUnlock()
			}
		}

		if !callerGotConnected {
			fmt.Printf("/notifyCallee (%s%s) remove waitingCaller ipAddr %s\n", urlID, logDialID, remoteAddrWithPort)
			waitingCallerChanLock.Lock()
			delete(waitingCallerChanMap, remoteAddrWithPort)
			waitingCallerChanLock.Unlock()
		} else {
			fmt.Printf("/notifyCallee (%s%s) skip remove waitingCaller ipAddr %s\n", urlID, logDialID, remoteAddrWithPort)
		}

		waitingCallerDbLock.Lock()
		// remove this waitingCaller from waitingCallerSlice
		err = kvCalls.Get(dbWaitingCaller, urlID, &waitingCallerSlice)
		for idx := range waitingCallerSlice {
			if waitingCallerSlice[idx].AddrPort == remoteAddrWithPort {
				fmt.Printf("/notifyCallee (%s%s) delete from dbWaitingCaller %s\n",
					urlID, logDialID, remoteAddrWithPort)
				waitingCallerSlice = append(waitingCallerSlice[:idx], waitingCallerSlice[idx+1:]...)
				err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
				if err != nil {
					fmt.Printf("# /notifyCallee (%s%s) failed to delete from dbWaitingCaller %s\n",
						urlID, logDialID, remoteAddrWithPort)
				}
				break
			} else {
				fmt.Printf("/notifyCallee (%s%s) leaving waitingCaller %s in dbWaitingCaller for now\n",
					urlID, logDialID, remoteAddrWithPort)
			}
		}
		waitingCallerDbLock.Unlock()

		// waitingCallerSlice was modified, send it to callee
		waitingCallerToCallee(urlID, waitingCallerSlice, nil, calleeWsClient)

	} else {
		waitingCallerDbLock.Unlock()
	}

	if callerGaveUp {
		if dbUser.StoreMissedCalls {
			// store missed call for caller gave up
			fmt.Printf("/notifyCallee (%s%s) store missed call (waiting caller gave up) <- (%s%s) %s\n",
				urlID, logDialID, callerMainID, callerIdLong, remoteAddr)

			// waitingCaller contains remoteAddrWithPort. for display purposes we need to cut the port
			addrPort := waitingCaller.AddrPort
			portIdx := strings.Index(addrPort,":")
			if portIdx>=0 {
				addrNoPort := addrPort[:portIdx]
				waitingCaller.AddrPort = addrNoPort
			}
			var missedCallsSlice []CallerInfo
			_,missedCallsSlice = addMissedCall(urlID, waitingCaller, "/notify-callergaveup")
			waitingCallerToCallee(urlID, nil, missedCallsSlice, calleeWsClient)
		}
	} else if calleeWsClient==nil {
		// callee is still offline: don't send waitingCaller update
		fmt.Printf("/notifyCallee (%s/%s%s) callee still offline (no waitingCaller) <- (%s%s) %s\n",
			urlID, glUrlID, logDialID, callerMainID, callerIdLong, remoteAddr)
	} else if !callerGotConnected {
		// send updated waitingCallerSlice + missedCalls
		fmt.Printf("/notifyCallee (%s/%s%s) add waiting caller <- (%s%s) %s\n",
			urlID, glUrlID, logDialID, callerMainID, callerIdLong, remoteAddr)
		waitingCallerToCallee(urlID, waitingCallerSlice, nil, calleeWsClient)
	}
	return
}

func httpMissedCall(w http.ResponseWriter, r *http.Request, callerInfo string, remoteAddr string, remoteAddrWithPort string) {
	// remoteAddr must be a caller that has just tried to connect to a callee via /online?id="+calleeID+"&wait=true
	// others should NOT be accepted (prevent unauthorized users to fill this callee's missed call list)
	missedCallAllowedMutex.RLock()
	settime,ok := missedCallAllowedMap[remoteAddr]
	missedCallAllowedMutex.RUnlock()
	if ok && time.Now().Sub(settime) < 20 * time.Minute {
		//fmt.Printf("httpMissedCall (%s)\n",callerInfo)
		//fmt.Printf("httpMissedCall ip=(%s) is permitted to create /missedcall\n",remoteAddr)
		missedCallAllowedMutex.Lock()
		delete(missedCallAllowedMap,remoteAddr)
		missedCallAllowedMutex.Unlock()

		missedCall(callerInfo, remoteAddr, "/missedCall")
	} else {
		fmt.Printf("# httpMissedCall ip=(%s) is NOT permitted to create /missedcall\n",remoteAddr)
	}
	// never return an error
}

func missedCall(callerInfo string, remoteAddr string, cause string) {
	// called by httpMissedCall() or from wsClient.go
	// callerInfo is encoded: calleeId+"|"+callerName+"|"+callerId (plus optional: "|"+ageSecs) +(|msg)
	//   like so: "id|92929|92929658912|50" tok[0]=calleeID, tok[1]=callerName, tok[2]=callerID, tok[3]=ageSecs
	// TODO callerInfo cannot be trusted, make sure everything in it is validated as much as possible
	//fmt.Printf("missedCall (%s) rip=%s\n", callerInfo, remoteAddr)
	tok := strings.Split(callerInfo, "|")
	if len(tok) < 3 {
		fmt.Printf("! missedCall (%s) failed len(tok)=%d<3 rip=%s\n",callerInfo,len(tok),remoteAddr)
		return
	}
	if tok[0]=="" || tok[0]=="undefined" {
		fmt.Printf("! missedCall (%s) failed no calleeId rip=%s\n",callerInfo,remoteAddr)
		return
	}
	calleeId := tok[0]
	// TODO check calleeId for size and content
	dialID := calleeId

	// calleeId may be a tmp-id
	mappingMutex.RLock()
	mappingData,ok := mapping[calleeId]
	mappingMutex.RUnlock()
	if ok {
		//fmt.Printf("httpApi mapping urlID (%s) -> (%s,%s) (%s)\n",
		//	urlID, mappingData.CalleeId, mappingData.Assign, urlPath)
		calleeId = mappingData.CalleeId
	}
	logDialID := "";
	if calleeId != dialID {
		logDialID = "/"+dialID
	}

	// find current state of dbUser.StoreMissedCalls via calleeId
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeId,&dbEntry)
	if err!=nil {
		fmt.Printf("! missedCall (%s) failed on get dbRegisteredIDs %s err=%v\n",calleeId,remoteAddr,err)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeId, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("! missedCall (%s) failed on dbUserBucket %s err=%v\n",dbUserKey,remoteAddr,err)
		return
	}
	if(!dbUser.StoreMissedCalls) {
		fmt.Printf("missedCall (%s) no StoreMissedCalls rip=%s\n",dbUserKey,remoteAddr)
		return
	}

	var timeOfCall int64 = 1
	var ageOfCall int64 = 0
	if len(tok) >= 4 {
		// the age of the call is given in number of seconds; below we will substract this from the current time
		var err error
// TODO catch format error
		timeOfCall, err = strconv.ParseInt(tok[3], 10, 64)
		if err!=nil {
			//fmt.Printf("# missedCall (%s) ParseInt err=%v\n",calleeId,err)
			timeOfCall = 0
		} else if timeOfCall<0 {
			//fmt.Printf("# missedCall (%s) timeOfCall=%d < 0\n",calleeId,timeOfCall)
			timeOfCall = 0
		} else {
			//fmt.Printf("missedCall (%s) timeOfCall=%d\n",calleeId,timeOfCall)
			ageOfCall = time.Now().Unix() - timeOfCall
		}
	}

	callerName := tok[1]
	callerID := tok[2]
	msgtext := ""
	if len(tok) >= 5 {
		msgtext = tok[4]
		if len(tok) >= 6 {
			// ???
		}
	}
	fmt.Printf("missedCall (%s%s) <- (%s/%s) arrived %ds ago [%s]\n",
		calleeId, logDialID, callerID, callerName, ageOfCall, callerInfo)

	// TODO if callerName=="" get it from contacts via calleeId?

	// TODO check callerName, callerID, msgtext for size and content
	// the actual call occured ageSecs64 ago (may be a big number, if caller waits long before aborting the page)
	//ageSecs64 := time.Now().Unix() - timeOfCall
	err,missedCallsSlice := addMissedCall(calleeId,
		CallerInfo{remoteAddr, callerName, timeOfCall, callerID, dialID, msgtext}, cause)
	if err==nil {
		//fmt.Printf("missedCall (%s) noerr caller=%s rip=%s\n", calleeId, callerID, remoteAddr)
		var calleeWsClient *WsClient = nil
		hubMapMutex.RLock()
		myhub := hubMap[calleeId]
		hubMapMutex.RUnlock()
		if myhub!=nil {
			calleeWsClient = myhub.CalleeClient
		}
		if calleeWsClient != nil {
			waitingCallerToCallee(calleeId, nil, missedCallsSlice, calleeWsClient)

			// send updated waitingCallerSlice + missedCalls to callee (if (hidden) online)
			// check if callee is (hidden) online
			calleeIsHiddenOnline := false
			ejectOn1stFound := true
			reportHiddenCallee := true
			reportBusyCallee := false
			glCalleeId, locHub, globHub, err := GetOnlineCallee(calleeId, ejectOn1stFound, reportBusyCallee,
				reportHiddenCallee, remoteAddr, "missedCall")
			if err != nil {
				//fmt.Printf("# missedCall GetOnlineCallee() err=%v\n", err)
				return
			}
			if glCalleeId != "" {
				if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
					//fmt.Printf("missedCall (%s) isHiddenOnline\n", glCalleeId)
					calleeIsHiddenOnline = true
				}
			}
			if calleeIsHiddenOnline {
				waitingCallerDbLock.RLock()
				var waitingCallerSlice []CallerInfo
				err = kvCalls.Get(dbWaitingCaller, calleeId, &waitingCallerSlice)
				if err != nil {
					// we can ignore this
				}
				waitingCallerDbLock.RUnlock()
				waitingCallerToCallee(calleeId, waitingCallerSlice, nil, calleeWsClient)
			}
		}
	}
}

func httpCanbenotified(w http.ResponseWriter, r *http.Request, urlID string, dialID string,
		remoteAddr string, remoteAddrWithPort string) {
	// checks if urlID can be notified (of incoming call)
	// usually called by caller.js after /online reports that callee (dialID) is offline
	if urlID=="" {
		fmt.Printf("! /canbenoti failed on empty urlID rip=%s\n",remoteAddr)
		fmt.Fprintf(w,"error")
		return
	}

	var dbEntry DbEntry
	var dbUser DbUser
	err := kvMain.Get(dbRegisteredIDs,urlID,&dbEntry)
	if err!=nil {
		// when caller cannot reach urlID (calleeID), it tries to find out if it can send it a notification
		// if urlID does not exist at all (typo), it ends up here - no need to log an error message
		//fmt.Printf("! /canbenoti (%s) failed on dbRegisteredIDs rip=%s\n",urlID,remoteAddr)
		fmt.Fprintf(w,"error")
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("! /canbenoti (%s) failed on dbUserBucket rip=%s\n",urlID,remoteAddr)
		fmt.Fprintf(w,"error")
		return
	}
	calleeName := dbUser.Name

	callerID := ""
	url_arg_array, ok := r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) > 0 {
		callerID = strings.ToLower(url_arg_array[0])
	}

	callerName := ""
	url_arg_array, ok = r.URL.Query()["callerName"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerName = url_arg_array[0]
	}
	if callerName=="" {
		url_arg_array, ok = r.URL.Query()["name"]
		if ok && len(url_arg_array[0]) >= 1 {
			callerName = url_arg_array[0]
		}
	}

	callerHost := ""
	url_arg_array, ok = r.URL.Query()["callerHost"]
	if ok && len(url_arg_array[0]) > 0 {
		callerHost = strings.ToLower(url_arg_array[0])
	}

	callerIdLong := callerID
	if callerHost!="" && callerHost!=hostname && callerID!="" {
		if strings.Index(callerIdLong,"@")>=0 {
			callerIdLong += "@"+callerHost
		} else {
			callerIdLong += "@@"+callerHost
		}
	}

	// get msgbox/greetingMsg from URL (for old clients)
	callerMsg := "" // msgbox
	url_arg_array, ok = r.URL.Query()["msg"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerMsg = url_arg_array[0]
	}
	// get msgbox/greetingMsg from r.Body (for new clients)
	if callerMsg=="" {
		postBuf := make([]byte, 4096)
		length,_ := io.ReadFull(r.Body, postBuf)
		if length>0 {
			callerMsg = string(postBuf[:length])
			//fmt.Printf("/canbenoti (%s) postMsg=(%s)\n", urlID, callerMsg)
		}
	}

	// check if callee is hidden online
	calleeIsHiddenOnline := false
	ejectOn1stFound := true
	reportHiddenCallee := true
	reportBusyCallee := true
	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
		reportHiddenCallee, remoteAddr, "/canbenoti")
	if logWantedFor("hub") {
		fmt.Printf("/canbenoti (%s/%s) locHub=%v isHiddenOnline=%v/%v\n", urlID, glUrlID, locHub!=nil,
			(locHub!=nil && locHub.IsCalleeHidden), (globHub!=nil && globHub.IsCalleeHidden))
	}
	if err==nil && glUrlID != "" {
		if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
			//fmt.Printf("/canbenoti (%s) isHiddenOnline\n", glUrlID)
			calleeIsHiddenOnline = true
		}
	}

	calleeHasPushChannel := false
	if !calleeIsHiddenOnline {
		if dbUser.MastodonID!="" {
			// has mastodon account
			if dbUser.MastodonSendTootOnCall==true {
				// does want to be notified
				calleeHasPushChannel = true
			}
		}
	}

	logDialID := "/"+dialID
	if urlID==dialID {
		logDialID = ""
	}

	// check if dialID is an altID and is ringMuted/deactivated
	ringMutedMutex.RLock()
	_,ok = ringMuted[dialID]
	ringMutedMutex.RUnlock()
	if ok {
		// altID is called, but is deactivated
		//fmt.Printf("/canbenoti (%s%s) altlink deactivated <- %s\n", urlID, logDialID, remoteAddr)
	} else
	// check if dialID is mainlink and is ringMuted/deactivated
	if dialID==urlID && dbUser.Int2&8==8 {
		// mainID is called, but is deactivated
		//fmt.Printf("/canbenoti (%s) mainlink deactivated <- %s\n", urlID, remoteAddr)
	} else
	// check if dialID is mastodonlink, but is ringMuted/deactivated
	if dialID==dbUser.MastodonID && dbUser.Int2&16==16 {
		// mastodonlink is called, but it is deactivated
		//fmt.Printf("/canbenoti (%s%s) mastodonlink deactivated <- %s\n", urlID, logDialID, remoteAddr)
	} else
	// dialID is NOT deactivated
	if calleeIsHiddenOnline || calleeHasPushChannel || (locHub!=nil && locHub.ConnectedCallerIp != "") {
		// yes, dialID can be notified

		// check if remoteAddrWithPort is already listed in waitingCallerSlice
		remoteAddrAlreadyWaitingUser := false
		waitingCallerDbLock.RLock()
		var waitingCallerSlice []CallerInfo
		kvCalls.Get(dbWaitingCaller,urlID,&waitingCallerSlice)
		//fmt.Printf(".../canbenoti (%s) waitingCallerSlice.len=%d\n",urlID,len(waitingCallerSlice))
		for idx := range waitingCallerSlice {
			//fmt.Printf(".../canbenoti (%s) remoteAddrWithPort=%s waitingCallerAddr=%s\n",
			//	urlID, remoteAddrWithPort, waitingCallerSlice[idx].AddrPort)
			if waitingCallerSlice[idx].AddrPort == remoteAddrWithPort {
				remoteAddrAlreadyWaitingUser = true
				break
			}
		}
		waitingCallerDbLock.RUnlock()

		if !remoteAddrAlreadyWaitingUser {
			fmt.Printf("/canbenoti (%s%s) yes onl=%v calleeName=%s <- %s (%s)\n",
				urlID, logDialID, calleeIsHiddenOnline, calleeName, remoteAddrWithPort, callerIdLong)
			if dbUser.AskCallerBeforeNotify==false {
				fmt.Fprintf(w,"direct|"+calleeName)
			} else {
				fmt.Fprintf(w,"ok|"+calleeName)
			}
			return
		}

		fmt.Printf("/canbenoti (%s) remoteAddr=%s already waitingCaller\n", urlID, remoteAddr)
	}

	// dialID can NOT be notified

	callerMainID := ""
	if callerID!="" && callerID==callerIdLong {
		mappingMutex.RLock()
		mappingData,ok := mapping[callerID]
		mappingMutex.RUnlock()
		if ok {
			callerMainID = mappingData.CalleeId
			if callerMainID==callerID {
				callerMainID = ""
			} else {
				callerMainID = callerMainID + "/"
			}
		}
	}
	fmt.Printf("/canbenoti (%s%s) can NOT be notified <- (%s%s) ip=%s\n",
		urlID, logDialID, callerMainID, callerIdLong, remoteAddr)

	if(dbUser.StoreMissedCalls) {
		err,missedCallsSlice := addMissedCall(urlID,
			CallerInfo{remoteAddr, callerName, time.Now().Unix(), callerIdLong, dialID, callerMsg}, "/canbenoti")
		if err==nil {
			var calleeWsClient *WsClient = nil
			hubMapMutex.RLock()
			myhub := hubMap[urlID]
			if myhub!=nil {
				calleeWsClient = myhub.CalleeClient
			}
			hubMapMutex.RUnlock()
			if calleeWsClient==nil {
				// callee is offline: don't send waitingCaller update
				//fmt.Printf("/canbenoti (%s/%s) callee offline (no send waitingCaller)\n", urlID, glUrlID)
			} else {
				// send updated waitingCallerSlice + missedCalls
				fmt.Printf("/canbenoti (%s%s) callee online, send missedCalls upd\n", urlID, logDialID)
				waitingCallerToCallee(urlID, nil, missedCallsSlice, calleeWsClient)
			}
		}
	}
	fmt.Fprintf(w,"offline")
	return
}

func addMissedCall(urlID string, caller CallerInfo, cause string) (error, []CallerInfo) {
	// do we need to check StoreMissedCalls here? NO, it is always checked before this is called
	//fmt.Printf("addMissedCall (%s) (%v)\n", urlID, caller)
	var missedCallsSlice []CallerInfo
	err := kvCalls.Get(dbMissedCalls,urlID,&missedCallsSlice)
	if err!=nil && strings.Index(err.Error(),"key not found")<0 {
		fmt.Printf("# addMissedCall (%s) failed to read dbMissedCalls (%v) err=%v\n",
			urlID, caller, err)
	}

	callerMainID := ""
	if caller.CallerID!="" {
		mappingMutex.RLock()
		mappingData,ok := mapping[caller.CallerID]
		mappingMutex.RUnlock()
		if ok {
			callerMainID = mappingData.CalleeId
			if callerMainID==caller.CallerID {
				callerMainID = ""
			} else {
				callerMainID = callerMainID + "/"
			}
		}
	}

	if caller.DialID == caller.CallerID {
		// don't store missed call from same user
//tmtmtm maybe not log this?
		if urlID == caller.DialID {
			fmt.Printf("addMissedCall (%s) not storing missedCalls from same ID (%s%s)\n",
				urlID, callerMainID, caller.CallerID)
		} else {
			fmt.Printf("addMissedCall (%s/%s) not storing missedCalls from same ID (%s%s)\n",
				urlID, caller.DialID, callerMainID, caller.CallerID)
		}
		return err,missedCallsSlice
	}
	// make sure we never keep/show more than 10 missed calls
	maxMissedCalls := 10
	if len(missedCallsSlice) >= maxMissedCalls {
		missedCallsSlice = missedCallsSlice[len(missedCallsSlice)-(maxMissedCalls-1):]
	}

	missedCallsSlice = append(missedCallsSlice, caller)
	err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, true) // TODO: skipConfirm really?
	if err!=nil {
		fmt.Printf("# addMissedCall (%s) failed to store dbMissedCalls (%v) err=%v\n", urlID, caller, err)
		return err,nil
	}
	if logWantedFor("missedcall") {
		logTxtMsg := caller.Msg
		if logTxtMsg!="" {
			// do not log actual msg
			logTxtMsg = "hidden"
		}
		// caller.CallerID may contain @@callerHost
		if caller.DialID == urlID {
			fmt.Printf("addMissedCall (%s) <- (%s%s) ip=%s msg=(%s) cause=(%s)\n",
				urlID, callerMainID, caller.CallerID, caller.AddrPort, logTxtMsg, cause)
		} else {
			fmt.Printf("addMissedCall (%s/%s) <- (%s%s) ip=%s msg=(%s) cause=(%s)\n",
				urlID, caller.DialID, callerMainID, caller.CallerID, caller.AddrPort, logTxtMsg, cause)
		}
	}
	return err,missedCallsSlice
}

/* we now only use httpSettings.go setContact()
func addContact(calleeID string, callerID string, callerName string, cause string) error {
	if strings.HasPrefix(calleeID,"answie") {
		return nil
	}
	if calleeID == callerID {
		return nil
	}
	if callerID == "" {
		return nil
	}
	if strings.HasPrefix(calleeID,"!") {
		return nil
	}
	if strings.HasPrefix(callerID,"!") {
		return nil
	}

	idNameMap := make(map[string]string) // callerID -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&idNameMap)
	if err!=nil {
		//fmt.Printf("# addContact get key=%s err=%v (ignored)\n", calleeID, err)
		//can be ignored: return err // key not found (empty)
	}
	oldName,ok := idNameMap[callerID]
	if ok && oldName!="" {
		//fmt.Printf("# addContact store key=%s callerID=%s EXISTS(%s) newname=%s cause=%s\n",
		//	calleeID, callerID, oldName, callerName, cause)
		return nil
	}
	idNameMap[callerID] = callerName
	err = kvContacts.Put(dbContactsBucket, calleeID, idNameMap, true)
	if err!=nil {
		fmt.Printf("# addContact store key=%s err=%v\n", calleeID, err)
		return err
	}
	//fmt.Printf("addContact stored for id=%s callerID=%s name=%s cause=%s\n",
	//	calleeID, callerID, callerName, cause)
	return nil
}
*/

/*
func webpushSend(subscription string, msg string, urlID string) (error,int) {
	// Decode subscription
	s := &webpush.Subscription{}
	json.Unmarshal([]byte(subscription), s)
	//fmt.Printf("unmarshalled subscription (%v)\n",s)

	// Send Notification
	readConfigLock.RLock()
	httpResponse, err := webpush.SendNotification([]byte(msg), s, &webpush.Options{
		Subscriber:      adminEmail, // Do not use "mailto:"
		VAPIDPublicKey:  vapidPublicKey,
		VAPIDPrivateKey: vapidPrivateKey,
		TTL:             60,
	})
	readConfigLock.RUnlock()
	if err != nil {
		maxlen:=30; if len(subscription)<30 { maxlen=len(subscription) }
		fmt.Printf("# webpush.SendNotif err=%v (id=%s) (%s)\n",
			urlID, err, subscription[:maxlen])
		return err, 0
	}
	// httpResponse.StatusCode should be 201
	fmt.Printf("webpush.SendNotif OK id=%s (httpRespCode=%v) (%s)\n", urlID, httpResponse.StatusCode, subscription)
	httpResponse.Body.Close()
	return err, httpResponse.StatusCode
}
*/

