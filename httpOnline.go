// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"net/http"
	"strings"
	"time"
	"fmt"
	"io"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
)

func httpOnline(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string) {
	// a caller uses this to check if a callee is online and free
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

	// we look for urlID either in the local or in the global hubmap
	reportHiddenCallee := false
	occupy := false
	var globHub *rkv.Hub
	var locHub *Hub
	var globalID = ""
	var err error
	if logWantedFor("online") {
		fmt.Printf("/online urlID=%s rtcdb=%s rip=%s\n", urlID, rtcdb, remoteAddr)
	}
	if rtcdb == "" {
		// note: globalID in this case is of course NOT "global"
		globalID, locHub, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/online")
	} else {
		// if urlID lives on another server, globHub will contain that servers wsUrl/wssUrl
		// below we must distinguish between locHub and globHub as they are different structs
		globalID, globHub, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/online")
		if err != nil {
			// error
			fmt.Printf("# /online GetOnlineCallee(%s/%s) err=%v rip=%s\n", urlID, globalID, err, remoteAddr)
			fmt.Fprintf(w, "error")
			return
		}
	}
	if locHub == nil && globHub == nil {
		// error
		fmt.Printf("# /online GetOnlineCallee(%s/%s) no hub rip=%s\n", urlID, globalID, remoteAddr)
		fmt.Fprintf(w, "error")
		return
	}
	if globalID == "" {
		// callee urlID is currently NOT online (this is not an error)
		fmt.Printf("/online callee %s is cur NOT online rip=%s\n", urlID, remoteAddr)
		fmt.Fprintf(w, "notavail")
		return
	}

	if rtcdb == "" && locHub != nil {
		// callee is managed by this server
		locHub.HubMutex.RLock()
		wsClientID := locHub.WsClientID
		locHub.HubMutex.RUnlock()
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online loc wsClientID==0 id=(%s/%s) rip=%s\n",
				urlID, globalID, remoteAddr)
			// clear local ConnectedCallerIp
			locHub.HubMutex.Lock()
			locHub.ConnectedCallerIp = ""
			locHub.HubMutex.Unlock()
			fmt.Fprintf(w, "error")
			return
		}

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
		if logWantedFor("wsAddr") {
			fmt.Printf("/online id=%s onl/avail %s rip=%s\n", globalID, wsAddr, remoteAddr)
		} else {
			fmt.Printf("/online id=%s onl/avail rip=%s\n", globalID, remoteAddr)
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	if rtcdb != "" && globHub != nil {
		// callee is managed by a remote server
		if globHub.ConnectedCallerIp != "" {
			// this callee (urlID/globalID) is online but currently busy
			fmt.Printf("/online busy for (%s/%s) callerIp=(%s) rip=%s\n",
				urlID, globalID, globHub.ConnectedCallerIp, remoteAddr)
			fmt.Fprintf(w, "busy")
			return
		}

		wsClientID := globHub.WsClientID
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online glob [%s] wsClientID==0 (%s) for id=(%s/%s) rip=%s\n",
				rtcdb, globalID, urlID, globalID, remoteAddr)
			// clear global ConnectedCallerIp
			StoreCallerIpInHubMap(globalID, "", false)
			err := rkv.StoreCallerIpInHubMap(globalID, "", false)
			if err!=nil {
				fmt.Printf("# /online rkv.StoreCallerIpInHubMap err=%v\n", err)
			}
			fmt.Fprintf(w, "error")
			return
		}

		wsAddr = globHub.WsUrl
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			wsAddr = globHub.WssUrl
		}
		wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)

		if logWantedFor("wsAddr") {
			fmt.Printf("/online id=%s onl/avail wsAddr=%s rip=%s\n", globalID, wsAddr, remoteAddr)
		} else {
			fmt.Printf("/online id=%s onl/avail rip=%s\n", globalID, remoteAddr)
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	// something has gone wrong - callee not found anywhere
	fmt.Printf("# /online no hub found for id=(%s/%s) rip=%s\n", urlID, globalID, remoteAddr)

	// clear ConnectedCallerIp
	StoreCallerIpInHubMap(globalID, "", false)
	if rtcdb!="" {
		rkv.StoreCallerIpInHubMap(globalID, "", false)
		if err!=nil {
			fmt.Printf("# /online rkv.StoreCallerIpInHubMap err=%v\n", err)
		}
	}
	fmt.Fprintf(w, "error")
	return
}

func httpAvail(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string) {
	checkID := urlPath[7:]
	if !allowNewAccounts {
		fmt.Printf("# /avail !allowNewAccounts id=%s for rip=%s\n",checkID,remoteAddr)
	} else {
		// checks if ID is free to be registered for a new calle
		// this is NOT the case if it is listed as registered or blocked
		fmt.Printf("/avail check id=%s for rip=%s\n",checkID,remoteAddr)
		var dbEntryBlocked skv.DbEntry
		// checkID is blocked in dbBlockedIDs
		err := kvMain.Get(dbBlockedIDs,checkID,&dbEntryBlocked)
		if err!=nil {
			// id is not listed in dbBlockedIDs
			fmt.Printf("/avail check id=%s not found in dbBlockedIDs\n",checkID)
			var dbEntryRegistered skv.DbEntry
			err := kvMain.Get(dbRegisteredIDs,checkID,&dbEntryRegistered)
			if err!=nil {
				// id is not listed in dbRegisteredIDs
				//fmt.Printf("avail check id=%s not found in dbRegisteredIDs\n",checkID)
				fmt.Printf("/avail check id=%s for rip=%s is positive\n",checkID,remoteAddr)
				fmt.Fprintf(w, "true")
				return
			}
			fmt.Printf("/avail check id=%s found in dbRegisteredIDs\n",checkID)
		}
		// id is listed in dbBlockedIDs
		// but if it is blocked by the same remoteAddr then we provide access of course
		if dbEntryBlocked.Ip==remoteAddr {
			fmt.Printf("/avail check id=%s with SAME rip=%s is positive\n",checkID,remoteAddr)
			fmt.Fprintf(w, "true")
			return
		}
		fmt.Printf("/avail check id=%s for rip=%s is negative\n",checkID,remoteAddr)
	}
	fmt.Fprintf(w, "false")
	return
}

func httpNewId(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, remoteAddr string) {
	// get a random ID that is not yet used in hubmap
	if !allowNewAccounts {
		fmt.Printf("# /newid !allowNewAccounts\n")
		return
	}
	tmpCalleeID := ""
	if rtcdb=="" {
		tmpCalleeID,_ = GetRandomCalleeID()
	} else {
		// NOTE only globalHubMap[] will be used to ensure uniqueness
		// however /register will run against dbRegisteredIDs and may find this id
		var err error
		tmpCalleeID,err = rkv.GetRandomCalleeID()
		if err!=nil {
			fmt.Printf("# /newid GetRandomCalleeID err=%v\n",err)
			return
		}
	}
	// NOTE tmpCalleeID is currently free, but it is NOT reserved
	fmt.Printf("/newid generated new id=%s for rip=%s\n",tmpCalleeID,remoteAddr)
	fmt.Fprintf(w, tmpCalleeID)
	return
}

func httpRegister(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string, startRequestTime time.Time) {
	if allowNewAccounts {
		// registerID should be tmpCalleeID from /newid
		registerID := urlPath[10:]
		fmt.Printf("/register id=%s\n",registerID)

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
			// deny if pw is too short or not valid
			if len(pw)<6 {
				fmt.Printf("/register fail pw too short\n")
				fmt.Fprintf(w, "too short")
				return
			}
			//fmt.Printf("register pw=%s(%d)\n",pw,len(pw))

			// this can be a fake request
			// we need to verify if registerID is in use
			var dbEntryRegistered skv.DbEntry
			err := kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
			if err==nil {
				// registerID is already registered
				fmt.Printf("/register fail db=%s bucket=%s get id=%s already registered\n",
					dbMainName, dbRegisteredIDs, registerID)
				fmt.Fprintf(w, "was already registered")
				return
			}

			unixTime := startRequestTime.Unix()
			dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
			dbUser := skv.DbUser{PremiumLevel:1, Ip1:remoteAddr, UserAgent:r.UserAgent()}
			err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
			if err!=nil {
				fmt.Printf("# /register error db=%s bucket=%s put key=%s err=%v\n",
					dbMainName, dbUserBucket, registerID, err)
				fmt.Fprintf(w,"cannot register user")
			} else {
				err = kvMain.Put(dbRegisteredIDs, registerID,
						skv.DbEntry{unixTime, /*freeAccountServiceSecs,*/ remoteAddr, pw}, false)
				if err!=nil {
					fmt.Printf("# /register error db=%s bucket=%s put key=%s err=%v\n",
						dbMainName,dbRegisteredIDs,registerID,err)
					fmt.Fprintf(w,"cannot register ID")
					// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
				} else {
					fmt.Printf("/register db=%s bucket=%s stored ID=%s OK\n",
						dbMainName, dbRegisteredIDs, registerID)
					// registerID is now available for use for 24h
					fmt.Fprintf(w, "OK")
				}
			}
		}
	}
	return
}

