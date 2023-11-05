// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// httpOnline() is called by callers via XHR "/rtcsig/online". 
// httpAvail() is called via XHR "/rtcsig/avail".
// httpNewId() is called via XHR "/rtcsig/newid".
// httpRegister() is called via XHR "/rtcsig/register".
//
// These methods provide the functionality for callees to 
// register new accounts. And for callers to call callees.

package main

import (
	"net/http"
	"strings"
	"time"
	"fmt"
	"io"
	"os"
	"bufio"
)

func httpOnline(w http.ResponseWriter, r *http.Request, urlID string, dialID string, remoteAddr string) {
	// a caller uses this to check if a callee is online and available
	// NOTE: here the variable naming is twisted
	// the caller (calleeID) is trying to find out if the specified callee (urlID) is online
	// if urlID is online, we return it's ws-address (the caller will connect there to call callee)
	ejectOn1stFound := true
	readConfigLock.RLock()
	if strings.Index(multiCallees, "|"+urlID+"|") >= 0 {
		// there may be multiple logins from urlID if listed under config.ini "multiCallees"
		ejectOn1stFound = false
	}
	readConfigLock.RUnlock()

	clientVersion := ""
	url_arg_array, ok := r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}

	// for remote callers, callerId should contain the @@hostaddress(:port)
	callerId := ""
	url_arg_array, ok = r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerId = url_arg_array[0]
	}

	wait := false
	url_arg_array, ok = r.URL.Query()["wait"]
	if ok && len(url_arg_array[0]) >= 1 {
		wait = true
	}

	// we look for urlID either in the local or in the global hubmap
	reportHiddenCallee := true
	reportBusyCallee := true
	if logWantedFor("online") {
		fmt.Printf("/online (%s) %s (%s) wait=%v v=%s\n", urlID, remoteAddr, callerId, wait, clientVersion)
	}

	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
		reportHiddenCallee, remoteAddr, "/online")
	if err != nil {
		// error
		fmt.Printf("# /online GetOnlineCallee(%s/%s) %s v=%s err=%v\n",
			urlID, glUrlID, remoteAddr, clientVersion, err)
		fmt.Fprintf(w, "error")
		return
	}

	if glUrlID == "" {
		// callee urlID is not online; try to find out for how long
		if logWantedFor("online") {
			fmt.Printf("/online (%s) glUrlID=empty locHub=%v globHub=%v\n",
				urlID, locHub!=nil, globHub!=nil)
		}
		var secsSinceLogoff int64 = 0
		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
		if err != nil {
			// callee urlID does not exist
			// do not log key not found
			if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("/online (%s) error (%v) (%s) %s v=%s ua=%s\n",
					urlID, err, callerId, remoteAddr, clientVersion, r.UserAgent())
			} else {
				// key not found: delay brute
				time.Sleep(1000 * time.Millisecond)
			}
			fmt.Fprintf(w, "error")
			return
		}
		//fmt.Printf("/online (%s) avail wsAddr=%s (%s) %s v=%s\n",
		//	urlID, wsAddr, callerId, remoteAddr, clientVersion)

		dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			fmt.Printf("# /online (%s) error db=%s bucket=%s get key=%v v=%s err=%v\n",
				urlID, dbMainName, dbUserBucket, dbUserKey, clientVersion, err)
		} else {
			// use dbUser.LastLogoffTime to see how long it has been offline
			secsSinceLogoff = time.Now().Unix() - dbUser.LastLogoffTime
		}
		if secsSinceLogoff>0 && secsSinceLogoff < 8*60 {
			// callee may come back very soon
			if(!wait) {
				if logWantedFor("online") {
					fmt.Printf("/online (%s) offline temp (for %d secs) %s v=%s ua=%s\n",
						urlID, secsSinceLogoff, remoteAddr, clientVersion, r.UserAgent())
				}
				// remoteAddr is now eligible to send xhr /missedCall
				missedCallAllowedMutex.Lock()
				missedCallAllowedMap[remoteAddr] = time.Now()
				missedCallAllowedMutex.Unlock()

				// caller.js will respond to "notavailtemp" by requesting /online with &wait=true
				// and it will wait up to (15min - secsSinceLogoff) for callee to come online
				// this &wait= request is handeled below, waiting for the caller to come online
				fmt.Fprintf(w, fmt.Sprintf("notavailtemp%d",secsSinceLogoff))
				return
			}

			// loop: wait for callee
			loopStartTime := time.Now()
			for {
				//if logWantedFor("online") {
				//	fmt.Printf("/online (%s) offline temp, caller waiting... %s\n",
				//		urlID, remoteAddr)
				//}
				time.Sleep(3 * time.Second)
				select {
				case <-r.Context().Done():
					// client gave up
					if logWantedFor("online") {
						fmt.Printf("/online (%s) offline temp, caller wait abort %s\n",
							urlID, remoteAddr)
					}
					// remoteAddr is now eligible to send xhr /missedCall
					missedCallAllowedMutex.Lock()
					missedCallAllowedMap[remoteAddr] = time.Now()
					missedCallAllowedMutex.Unlock()
					return
				default:
					glUrlID, locHub, globHub, err = GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
						reportHiddenCallee, remoteAddr, "/online")
					if err != nil {
						// error: something went wrong
						fmt.Printf("# /online GetOnlineCallee(%s/%s) %s v=%s err=%v\n",
							urlID, glUrlID, remoteAddr, clientVersion, err)
						// remoteAddr is now eligible to send xhr /missedCall
						missedCallAllowedMutex.Lock()
						missedCallAllowedMap[remoteAddr] = time.Now()
						missedCallAllowedMutex.Unlock()
						fmt.Fprintf(w, "error")
						return
					}
					//fmt.Printf("/online (%s) offline temp: glUrlID=(%s) %v %v\n",
					//	urlID, glUrlID, locHub!=nil, globHub!=nil)
				}
				if glUrlID != "" {
					// callee urlID is now online, continue below to return ws/wss url
					break
				}
				if time.Now().Sub(loopStartTime) > 15 * time.Minute {
					// callee still not online: give up waiting
					// remoteAddr is now eligible to send xhr /missedCall
					missedCallAllowedMutex.Lock()
					missedCallAllowedMap[remoteAddr] = time.Now()
					missedCallAllowedMutex.Unlock()
					fmt.Fprintf(w, "notavail")
					return
				}
			}

		} else {
			// callee is offline for more than 8 min
			if secsSinceLogoff>1651395074 { // offline for >=52 years (since 1970)
				if logWantedFor("online") {
					fmt.Printf("/online (%s) offline (was never online) %s v=%s ua=%s\n",
						urlID, remoteAddr, clientVersion, r.UserAgent())
				}
			} else {
				if logWantedFor("online") {
					fmt.Printf("/online (%s) offline (for %d secs) %s v=%s ua=%s\n",
						urlID, secsSinceLogoff, remoteAddr, clientVersion, r.UserAgent())
				}
			}
			// remoteAddr is now eligible to send xhr /missedCall
			missedCallAllowedMutex.Lock()
			missedCallAllowedMap[remoteAddr] = time.Now()
			missedCallAllowedMutex.Unlock()
			fmt.Fprintf(w, "notavail")
			return
		}
	}

	if locHub != nil {
		locHub.HubMutex.RLock()
		// callee is managed by this server
		if logWantedFor("online") {
			fmt.Printf("/online (%s/%s) locHub callerIp=%s Caller=%v hidden=%v\n",
				urlID, glUrlID, locHub.ConnectedCallerIp, locHub.CallerClient!=nil, locHub.IsCalleeHidden)
		}

		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
		if err != nil {
			// callee urlID does not exist
			locHub.HubMutex.RUnlock()
			// do not log key not found
			if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("/online (%s) error (%v) (%s) %s v=%s ua=%s\n",
					urlID, err, callerId, remoteAddr, clientVersion, r.UserAgent())
			} else {
				// key not found: delay brute
				time.Sleep(1000 * time.Millisecond)
			}
			fmt.Fprintf(w, "error")
			return
		}
		//fmt.Printf("/online (%s) avail wsAddr=%s (%s) %s v=%s\n",
		//	urlID, wsAddr, callerId, remoteAddr, clientVersion)

		dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			locHub.HubMutex.RUnlock()
			fmt.Printf("# /online (%s) error db=%s bucket=%s get key=%v v=%s err=%v\n",
				urlID, dbMainName, dbUserBucket, dbUserKey, clientVersion, err)
			fmt.Fprintf(w, "error")
			return
		}

		idDisabled := false
		ringMutedMutex.RLock()
		_,ok = ringMuted[dialID]
		ringMutedMutex.RUnlock()
		if ok {
			// altID is called, but is deactivated
			//fmt.Printf("/canbenotified (%s) ID deactivated <- %s\n", dialID, remoteAddr)
			idDisabled = true
		} else
		// check if dialID is mainlink and is ringMuted/deactivated
		if dialID==urlID && dbUser.Int2&8==8 {
			// mainlink is called, but is deactivated
			//fmt.Printf("/canbenotified (%s) main ID deactivated <- %s\n", dialID, remoteAddr)
			idDisabled = true
		} else
		// check if dialID is mastodonlink, but is ringMuted/deactivated
		if dialID==dbUser.MastodonID && dbUser.Int2&16==16 {
			// mastodonlink is called, but it is deactivated
			//fmt.Printf("/canbenotified (%s) mastodon ID deactivated <- %s\n", dialID, remoteAddr)
			idDisabled = true
		}
		if idDisabled {
			locHub.HubMutex.RUnlock()
			fmt.Printf("/online (%s) ID deactivated <- %s v=%s\n", dialID, remoteAddr, clientVersion)
			// remoteAddr is now eligible to send xhr /missedCall
			missedCallAllowedMutex.Lock()
			missedCallAllowedMap[remoteAddr] = time.Now()
			missedCallAllowedMutex.Unlock()
			fmt.Fprintf(w, "notavail")
			return
		}

		wsClientID := locHub.WsClientID // set by wsClient serve()
		if wsClientID == 0 {
			// this seems to happen when urlID has not logged in or is just now logging in but not finished
			// just act as if (urlID) is not curretly online
			locHub.HubMutex.RUnlock()
			fmt.Printf("/online (%s) notavail ws=0 %s v=%s\n", urlID, remoteAddr, clientVersion)
			// remoteAddr is now eligible to send xhr /missedCall
			missedCallAllowedMutex.Lock()
			missedCallAllowedMap[remoteAddr] = time.Now()
			missedCallAllowedMutex.Unlock()
			fmt.Fprintf(w, "notavail")
			return
		}

		if locHub.ConnectedCallerIp != "" {
			// this callee (urlID/glUrlID) is online but currently busy
			fmt.Printf("/online (%s) busy callerIp=%s <- %s v=%s\n",
				urlID, locHub.ConnectedCallerIp, remoteAddr, clientVersion)
			locHub.HubMutex.RUnlock()
			// remoteAddr is now eligible to send xhr /missedCall
			missedCallAllowedMutex.Lock()
			missedCallAllowedMap[remoteAddr] = time.Now()
			missedCallAllowedMutex.Unlock()
			fmt.Fprintf(w, "busy")
			return
		}

		if locHub.IsCalleeHidden && locHub.IsUnHiddenForCallerAddr != remoteAddr {
			fmt.Printf("/online (%s) notavail (hidden onl) %s v=%s ua=%s\n",
				urlID, remoteAddr, clientVersion, r.UserAgent())
			locHub.HubMutex.RUnlock()
			// remoteAddr is now eligible to send xhr /missedCall
			missedCallAllowedMutex.Lock()
			missedCallAllowedMap[remoteAddr] = time.Now()
			missedCallAllowedMutex.Unlock()
			fmt.Fprintf(w, "notavail")
			return
		}

		if dbUser.MastodonID!="" {
			if dialID==dbUser.MastodonID && dbUser.Int2&16==16 {
				// mastodonlink deactivated
				locHub.HubMutex.RUnlock()
				fmt.Printf("/online (%s) mastodonlink deactivated <- %s v=%s\n", dialID, remoteAddr, clientVersion)
				// remoteAddr is now eligible to send xhr /missedCall
				missedCallAllowedMutex.Lock()
				missedCallAllowedMap[remoteAddr] = time.Now()
				missedCallAllowedMutex.Unlock()
				fmt.Fprintf(w, "notavail")
				return
			}
		}

		// always store the original dialID in wsClientMap[wsClientID].dialID
		wsClientMutex.Lock()
		wsClientData,ok := wsClientMap[wsClientID]
		if ok {
			wsClientData.dialID = dialID
			wsClientMap[wsClientID] = wsClientData
		}
		wsClientMutex.Unlock()

		wsAddr := fmt.Sprintf("ws://%s:%d/ws", hostname, wsPort)
		readConfigLock.RLock()
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			if wssUrl != "" {
				wsAddr = wssUrl
			} else {
				wsAddr = fmt.Sprintf("wss://%s:%d/ws", hostname, wssPort)
			}
		} else {
			if wsUrl != "" {
				wsAddr = wsUrl
			}
		}
		readConfigLock.RUnlock()
		wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)
		if !strings.HasPrefix(glUrlID,"answie") && !strings.HasPrefix(glUrlID,"talkback") {
			if logWantedFor("online") {
				fmt.Printf("/online (%s) avail wsAddr=%s %s <- %s (%s) v=%s ua=%s\n",
					glUrlID, wsAddr, locHub.CalleeClient.RemoteAddr,
					remoteAddr, callerId, clientVersion, r.UserAgent())
			}
		}
		locHub.HubMutex.RUnlock()
		fmt.Fprintf(w, wsAddr)
		return
	}

	if globHub != nil {
		// callee is managed by a remote server
		if globHub.ConnectedCallerIp != "" {
			// this callee (urlID/glUrlID) is online but currently busy
			fmt.Printf("/online (%s/%s) busy callerIp=(%s) %s v=%s ua=%s\n",
				urlID, glUrlID, globHub.ConnectedCallerIp, remoteAddr, clientVersion, r.UserAgent())
			fmt.Fprintf(w, "busy")
			return
		}

		wsClientID := globHub.WsClientID
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online (%s/%s) glob ws=0 %s v=%s\n",
				urlID, glUrlID, remoteAddr, clientVersion)
			// clear global ConnectedCallerIp
			err := StoreCallerIpInHubMap(glUrlID, "", false)
			if err!=nil {
				fmt.Printf("# /online (%s/%s) rkv.StoreCallerIpInHubMap err=%v\n", urlID, glUrlID, err)
			}
			fmt.Fprintf(w, "error")
			return
		}

		wsAddr = globHub.WsUrl
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			wsAddr = globHub.WssUrl
		}
		wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)
		if logWantedFor("online") {
			if !strings.HasPrefix(glUrlID,"answie") && !strings.HasPrefix(glUrlID,"talkback") {
				fmt.Printf("/online (%s) avail wsAddr=%s (%s) %s v=%s ua=%s\n",
					glUrlID, wsAddr, callerId, remoteAddr, clientVersion, r.UserAgent())
			}
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	// something has gone wrong - callee not found anywhere
	fmt.Printf("# /online (%s/%s) not found (%s) %s v=%s\n",
		urlID, glUrlID, callerId, remoteAddr, clientVersion)

	// clear ConnectedCallerIp
	StoreCallerIpInHubMap(glUrlID, "", false)
	fmt.Fprintf(w, "error")
	return
}

func httpNewId(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, remoteAddr string) {
	// get a random ID that is not yet used in hubmap
	if !allowNewAccounts {
		fmt.Printf("! /newid !allowNewAccounts rip=%s\n",remoteAddr)
		return
	}

	{
		// check for unsupported remoteAddr
		// TODO get "ipblock.cvs" from config
		retcode := ipCheck("ipblock.cvs",remoteAddr,false)
		if retcode>0 {
			//fmt.Printf("! /newid ipCheck block rip=%s\n",remoteAddr)
			return
		}
		fmt.Printf("/newid ipCheck OK %s %d\n",remoteAddr,retcode)
	}

	tmpCalleeID,err := GetRandomCalleeID()
	if err!=nil {
		fmt.Printf("# /newid GetRandomCalleeID err=%v\n",err)
		return
	}
	// NOTE tmpCalleeID is currently free, but it is NOT reserved

	// make /newid expensive for remoteAddr
	clientRequestAdd(remoteAddr,3)

	clientVersion := ""
	url_arg_array, ok := r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}
	if logWantedFor("login") {
		fmt.Printf("/newid (%s) generated %s v=%s ua=%s\n",
			tmpCalleeID, remoteAddr, clientVersion, r.UserAgent())
	}
	time.Sleep(1 * time.Second)
	fmt.Fprintf(w, tmpCalleeID)
	return
}

func ipCheck(dbFile string, ip string, verbose bool) int {
	file, err := os.Open(dbFile)
	if err != nil {
		//fmt.Printf("! ipCheck open %s err=%v\n",dbFile,err)
		return -1 // dbFile not found
	}
	defer file.Close()

	country := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line,"#") {
			if len(line)>1 {
				if verbose {
					fmt.Printf("ipCheck %s\n",line)
				}
				country = line[1:]
			}
			continue
		}

		toks := strings.Split(scanner.Text(), ",")
		if len(toks)>=2 {
			//fmt.Printf(" %s-%s\n",toks[0],toks[1])
			if ip>toks[0] && ip<toks[1] {
				fmt.Printf("! ipCheck %s found '%s' %s-%s\n",ip,country,toks[0],toks[1])
				return 1 // found
			}
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Println(err)
	}
	return -2 // not found
}

func httpRegister(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string, startRequestTime time.Time) {
	if !allowNewAccounts {
		fmt.Printf("! /register newAccounts not allowed urlPath=(%s) %s ua=%s\n",
			urlPath, remoteAddr, r.UserAgent())
		return
	}

	registerID := urlPath[10:]
	argIdx := strings.Index(registerID,"&")
	if argIdx>=0 {
		registerID = registerID[0:argIdx]
	}

	mid := ""
	url_arg_array, ok := r.URL.Query()["mid"]
	if ok && len(url_arg_array[0]) >= 1 {
		mid = url_arg_array[0]
	}

	clientVersion := ""
	url_arg_array, ok = r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}

	if registerID=="" {
		fmt.Printf("! /register fail no ID urlPath=(%s) mid=(%s) id=%s v=%s ua=%s\n",
			urlPath, mid, remoteAddr, clientVersion, r.UserAgent())
		return
	}

	fmt.Printf("/register (%s) %s v=%s ua=%s\n",
		registerID, remoteAddr, clientVersion, r.UserAgent())

	postBuf := make([]byte, 128)
	length,_ := io.ReadFull(r.Body, postBuf)
	if length>0 {
		pw := ""
		pwData := string(postBuf[:length])
		pwData = strings.ToLower(pwData)
		pwData = strings.TrimSpace(pwData)
		pwData = strings.TrimRight(pwData,"\r\n")
		pwData = strings.TrimRight(pwData,"\n")
		if strings.HasPrefix(pwData,"pw=") {
			pw = pwData[3:]
		}
		if len(pw)<6 {
			fmt.Printf("! /register (%s) fail pw too short\n",registerID)
			fmt.Fprintf(w, "too short")
			return
		}
		//fmt.Printf("register pw=%s(%d)\n",pw,len(pw))

		// can be a fake request: need to verify if registerID is in use
		var dbEntryRegistered DbEntry
		err := kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
		if err==nil {
			// registerID is already registered
			fmt.Printf("# /register (%s) fail db=%s bucket=%s get already registered\n",
				registerID, dbMainName, dbRegisteredIDs)
			fmt.Fprintf(w, "was already registered")
			return
		}

		unixTime := startRequestTime.Unix()
		dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
		dbUser := DbUser{Ip1:remoteAddr, UserAgent:r.UserAgent()}
		dbUser.StoreContacts = true
		dbUser.StoreMissedCalls = true
		err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			fmt.Printf("# /register (%s) error db=%s bucket=%s put err=%v\n",
				registerID, dbMainName, dbUserBucket, err)
			fmt.Fprintf(w,"cannot register user")
		} else {
			err = kvMain.Put(dbRegisteredIDs, registerID,
					DbEntry{unixTime, remoteAddr}, false)
			if err!=nil {
				fmt.Printf("# /register (%s) error db=%s bucket=%s put err=%v\n",
					registerID,dbMainName,dbRegisteredIDs,err)
				fmt.Fprintf(w,"cannot register user")
				// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
			} else {
				//fmt.Printf("/register (%s) db=%s bucket=%s stored OK\n",
				//	registerID, dbMainName, dbRegisteredIDs)
				// registerID is now available for use
				var pwIdCombo PwIdCombo
				err,cookieValue := createCookie(w, registerID, pw, &pwIdCombo, "/register")
				if err!=nil {
					// fatal
					fmt.Printf("# /register (%s) create cookie error cookie=%s err=%v\n",
						registerID, cookieValue, err)
					return
				}

				// preload contacts with 2 Answie accounts
				var idNameMap map[string]string // callerID -> name
				err = kvContacts.Get(dbContactsBucket, registerID, &idNameMap)
				if err!=nil {
					idNameMap = make(map[string]string)
				}
				idNameMap["answie"] = "Answie Spoken"
				idNameMap["answie7"] = "Answie Jazz"
				err = kvContacts.Put(dbContactsBucket, registerID, idNameMap, false)
				if err!=nil {
					fmt.Printf("# /register (%s) kvContacts.Put err=%v\n", registerID, err)
				}
				fmt.Fprintf(w, "OK")
			}
		}
	}
	return
}

